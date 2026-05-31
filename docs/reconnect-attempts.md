# Failed Reconnection Attempts for Dev Hot-Reload

This document records all the approaches tried to maintain game state across server hot-reloads during development. **None of these worked reliably.**

## Context

The goal was to improve developer experience by:
1. Preserving game state when the server restarts due to code changes
2. Allowing the player to continue playing without manual intervention
3. Avoiding the need to re-navigate through the game to reach a testable state

## Approach 1: Colyseus Built-in `devMode`

**What we tried:**
- Enabled `devMode: true` in the Colyseus Server options
- Implemented `onCacheRoom()` to serialize room state (Maps, Sets, phase, etc.)
- Implemented `onRestoreRoom(cachedData)` to deserialize the cached data

**Why it failed:**
- Colyseus `devMode` stores cached data in memory
- `tsx watch` performs a **full process restart**, which clears all in-memory state
- The `onRestoreRoom()` callback was called with `undefined` cached data
- Even when data was passed, the player entity in `state.players` was never restored

**Files modified:**
- `apps/server/src/index.ts` - Added `devMode: true`
- `apps/server/src/rooms/GameRoom.ts` - Added `onCacheRoom()` and `onRestoreRoom()`

---

## Approach 2: Colyseus `allowReconnection()` for Client Reconnection

**What we tried:**
- In `GameRoom.onLeave()`, called `this.allowReconnection(client, 60)` to keep the seat reserved for 60 seconds
- On the client, stored the reconnection token in `sessionStorage`
- In `onLeave` handler on client, attempted `client.reconnect(reconnectionToken)`

**Why it failed:**
- When the server restarts, all room and reservation state is lost
- The reconnection token becomes invalid after server restart
- Client received "seat reservation expired" errors repeatedly
- The `allowReconnection()` call was **blocking server shutdown** for 60 seconds

**Files modified:**
- `apps/server/src/rooms/GameRoom.ts` - Added `allowReconnection()` in `onLeave`
- `apps/client/src/app/initPhaser.ts` - Added token storage and reconnection logic
- `apps/client/src/game/GameScene.ts` - Stored reconnection token on `room_joined`

---

## Approach 3: File-Based State Persistence

**What we tried:**
- Created `apps/server/src/lib/dev-room-cache.ts` to save/load room state to `.dev-cache/rooms.json`
- Created `apps/server/src/lib/shutdown-state.ts` to track when server is shutting down
- In `GameRoom.onLeave()`, when shutting down, called `saveRoomToCache()` to persist state to disk
- In `GameRoom.onCreate()`, called `restoreFromDiskCache()` to load state from disk

**Why it failed:**
- Room state (Maps, Sets, etc.) was successfully cached and restored
- However, **the player entity itself was not restored** - only metadata like inventories, progressions
- When client rejoined, they got a new sessionId and were treated as a new player
- The old session-player mappings were useless because the session IDs changed
- Players could not move because they were effectively new players in a half-restored room

**Files created:**
- `apps/server/src/lib/dev-room-cache.ts`
- `apps/server/src/lib/shutdown-state.ts`

**Files modified:**
- `apps/server/src/index.ts` - Added shutdown state handling and manual cache calls
- `apps/server/src/rooms/GameRoom.ts` - Added `restoreFromDiskCache()` method
- `.gitignore` - Added `.dev-cache/`

---

## Approach 4: Auto-Refresh with Auto-Rejoin Flag

**What we tried:**
- In `initPhaser.ts`, when disconnect detected in dev mode:
  - Set `sessionStorage.setItem('dev_auto_rejoin', 'true')`
  - Called `window.location.reload()`
- In `page.tsx`, added a `useEffect` that:
  - Checks for the `dev_auto_rejoin` flag
  - Waits until `ctaDisabled` is false (authentication ready)
  - Automatically calls `handleStartGame()`

**Why it failed:**
- Page reload caused wallet connection state to be lost (`ACTIVE ACCOUNT undefined`)
- Authentication had to be re-established from scratch
- Even when auto-rejoin triggered, it created a completely new game session
- The restored server-side state was useless because the player was treated as new
- User was "kicked out" to the lobby/login screen

**Files modified:**
- `apps/client/src/app/initPhaser.ts` - Added auto-refresh with flag
- `apps/client/src/app/page.tsx` - Added useEffect for auto-rejoin

---

## Approach 5: Skip `allowReconnection` During Shutdown

**What we tried:**
- Created a global `isShuttingDown` flag
- In `GameRoom.onLeave()`, checked if shutting down and skipped `allowReconnection()` to prevent blocking
- This was supposed to allow proper room disposal and caching

**Why it failed:**
- Even with fast shutdown, the fundamental issue remained: session IDs change after restart
- The room was cached but the new room couldn't use the old session mappings
- This approach only fixed the shutdown blocking, not the reconnection problem

**Files created/modified:**
- `apps/server/src/lib/shutdown-state.ts`
- `apps/server/src/rooms/GameRoom.ts`
- `apps/server/src/index.ts`

---

## Root Causes of Failure

1. **`tsx watch` does full process restart** - Unlike true HMR, `tsx watch` kills and restarts the entire Node.js process, losing all in-memory state including Colyseus's devMode cache.

2. **Session IDs are ephemeral** - Colyseus assigns new session IDs on each connection. After server restart, all old session IDs are invalid.

3. **Player entities are session-bound** - The `state.players` MapSchema uses sessionId as the key. Even if we restore metadata, the player entity must be recreated with a new sessionId.

4. **Reconnection tokens expire with the server** - Colyseus reconnection tokens are tied to a specific server instance. When the server restarts, all tokens become invalid.

5. **Page reload loses client state** - Refreshing the page loses the React/Phaser game context, wallet connection state, and requires full re-authentication.

---

## Alternative Approaches (NOT TRIED)

These approaches might work but were not implemented:

1. **True HMR with Webpack/Vite** - Keep the server process alive and hot-swap only changed modules. Requires significant build system changes.

2. **Separate state server** - Use Redis or a separate process to store game state that survives server restarts. More complex architecture.

3. **Client-side state snapshot** - Have the client save a snapshot of visible game state and replay it after reconnecting. Would cause desync issues.

4. **Server process forking** - Fork a child process to handle requests while the main process restarts. Complex and may not work with WebSockets.

5. **Accept the restart** - Simply accept that dev restarts require starting a new game, and optimize the "time to testable state" instead (e.g., debug commands, quick-start options).

---

## Approach 6: Player ID-Based Reconnection with Map State Restoration

**What we tried:**
- Decoupled player identity from session IDs by using stable `playerId` (from auth) as the key for caching
- Modified `onCacheRoom()` to create player snapshots keyed by `playerId` instead of `sessionId`
- Stored player snapshots including position (x, y), stats, inventory, etc.
- In `onCreate()`, called `restoreFromDiskCache()` BEFORE generating new map to load cached data
- In `onJoin()`, checked for cached player snapshot by `playerId` and restored player state
- Created `migrateSessionData()` helper to transfer session-bound data from old `sessionId` to new `sessionId`
- Added client-side auto-rejoin logic that stores `roomId` in URL and `sessionStorage`
- Implemented global cache system (`getGlobalCachedRooms()`) to share cache across multiple room instances
- Attempted to restore map data: `chunkLayoutData`, `dungeonChunkLayoutData`, `dungeonEntityBlueprints`, `treePositions`, `seed`, `phase`, `currentFloor`, etc.

**What worked:**
- ✅ Player position restoration - players spawn at their previous location
- ✅ Player stats restoration - HP, mana, level, score, etc. are restored
- ✅ Player inventory restoration - items are restored
- ✅ Session data migration - inventories, progressions, kill streaks migrate from old session to new
- ✅ Client-side auto-rejoin - page refreshes and automatically rejoins game
- ✅ URL persistence - roomId persists in URL across refreshes
- ✅ Phase restoration - room phase is restored correctly

**What failed:**
- ❌ **Map/dungeon layout not restoring properly** - The dungeon chunks, entities, and map structure are not loading correctly when rejoining
- ❌ **Entities not appearing in state** - Even though `dungeonEntityBlueprints` are restored, calling `applyDungeonLayoutToState()` doesn't properly populate `state.entities`
- ❌ **MapGenerator recreation issues** - Recreating `mapGenerator` with restored seed doesn't match the original map generation
- ❌ **Timing issues** - Cache restoration happens but map generation logic conflicts with restoration, causing new rooms to fail to load maps
- ❌ **State synchronization** - Restored entities don't properly sync to client, map appears empty or incorrect

**Why it's failing:**
- The map generation process (`MapGenerator.generateEntities()`) is deterministic based on seed, but restoring pre-generated entities and trying to recreate the generator causes mismatches
- `applyDungeonLayoutToState()` clears and repopulates `state.entities`, but the client may have already received initial state before restoration completes
- The order of operations is critical: cache must be restored before ANY map generation, but this breaks normal room creation flow
- MapGenerator needs to be created synchronously but chunk sets loading is async, causing race conditions
- When cache is restored, we skip normal map generation but the entities aren't properly applied to the synchronized state schema

**Files modified:**
- `apps/server/src/lib/dev-room-cache.ts` - Added `getGlobalCachedRooms()`, `clearGlobalCache()` for shared cache
- `apps/server/src/rooms/GameRoom.ts` - Major changes:
  - Modified `onCacheRoom()` to create player snapshots by `playerId`
  - Modified `onCreate()` to restore cache BEFORE map generation
  - Modified `onJoin()` to restore player state from snapshots
  - Added `migrateSessionData()` helper
  - Added `restoreFromDiskCache()` to restore map data and metadata
  - Conditional map generation based on cache restoration
- `apps/client/src/app/initPhaser.ts` - Store `roomId` in URL and `sessionStorage` on disconnect
- `apps/client/src/app/page.tsx` - Auto-rejoin logic with URL persistence, skip metadata fetch in dev mode
- `apps/client/src/game/GameScene.ts` - Added retry logic for room creation

**Current state:**
- Player state restoration works perfectly
- Map/dungeon restoration is fundamentally broken
- New rooms sometimes fail to load maps due to conditional generation logic
- The approach is too complex and fragile - small changes break either restoration or new room creation

---

## Recommendation

Given the complexity and the fundamental limitations of `tsx watch` + Colyseus, the most pragmatic approach might be:

1. **Revert all reconnection code** to avoid complexity and bugs
2. **Add debug/dev commands** to quickly set up game state (spawn at specific phase, give items, etc.)
3. **Add a "quick start" option** that skips staging phase for dev testing
4. **Consider testing infrastructure** that can set up specific game scenarios programmatically

The reconnection approach is fundamentally incompatible with how `tsx watch` restarts the server process. **Player state restoration works, but map/dungeon restoration is too complex and breaks normal room creation.**










