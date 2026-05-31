# Reconnection Solutions Analysis

Based on the failures documented in `reconnect-attempts.md`, here are viable approaches to implement reconnection correctly.

## Core Problem Summary

The fundamental issue is that **Colyseus session IDs are ephemeral** - they change on every connection. When the server restarts:
- Old session IDs become invalid
- `state.players` MapSchema uses sessionId as the key
- Player entities are tied to session IDs
- Reconnection tokens expire with the server instance

## Solution Approaches

### Approach 1: Player ID-Based Reconnection (RECOMMENDED)

**Concept**: Use stable `playerId` (from database) as the bridge between old and new sessions.

#### How It Works:

1. **On Server Shutdown**:
   - Cache room state with a mapping: `playerId -> { sessionId, playerEntitySnapshot }`
   - Store player positions, stats, inventories keyed by `playerId` instead of `sessionId`

2. **On Server Restart**:
   - Restore room state from disk
   - Create a "ghost" mapping: `oldSessionId -> playerId` for each cached player

3. **On Client Rejoin**:
   - Client sends `playerId` in join options (from auth)
   - Server checks if `playerId` exists in cached state
   - If found:
     - Create new Player entity with **new sessionId**
     - Restore all player data (position, stats, inventory) from cache
     - Map `newSessionId -> playerId` in `sessionPlayerIds`
     - Remove old session mappings
   - Client receives room state with their player entity already present

#### Implementation Details:

```typescript
// In onCacheRoom():
const playerIdToSessionMap = new Map<string, string>();
const playerSnapshots = new Map<string, any>();

this.state.players.forEach((player, oldSessionId) => {
  const playerId = this.getPlayerIdForSession(oldSessionId);
  if (playerId) {
    playerIdToSessionMap.set(playerId, oldSessionId);
    // Snapshot player entity state (position, stats, etc.)
    playerSnapshots.set(playerId, {
      x: player.x,
      y: player.y,
      hp: player.hp,
      maxHp: player.maxHp,
      level: player.level,
      characterId: player.characterId,
      // ... all other player properties
    });
  }
});

return {
  // ... existing cache data
  playerIdToSessionMap: Array.from(playerIdToSessionMap.entries()),
  playerSnapshots: Array.from(playerSnapshots.entries()),
};
```

```typescript
// In onJoin(), after creating new player entity:
const playerId = authData.playerId;
const cachedPlayerData = this.restoredPlayerSnapshots?.get(playerId);

if (cachedPlayerData && this.phase === 'in_game') {
  // Restore player state from cache
  player.x = cachedPlayerData.x;
  player.y = cachedPlayerData.y;
  player.hp = cachedPlayerData.hp;
  player.maxHp = cachedPlayerData.maxHp;
  player.level = cachedPlayerData.level;
  player.characterId = cachedPlayerData.characterId;
  // ... restore all other properties
  
  // Restore session-based maps using new sessionId
  const oldSessionId = this.restoredPlayerIdToSession?.get(playerId);
  if (oldSessionId) {
    // Migrate data from old sessionId to new sessionId
    if (this.playerInventories.has(oldSessionId)) {
      this.playerInventories.set(client.sessionId, 
        this.playerInventories.get(oldSessionId)!
      );
    }
    // ... migrate all other session-based maps
  }
}
```

#### Pros:
- ✅ Works with full process restart
- ✅ Preserves player state (position, stats, inventory)
- ✅ Uses stable `playerId` as the bridge
- ✅ No need for reconnection tokens
- ✅ Client just needs to rejoin normally

#### Cons:
- ⚠️ Requires careful migration of session-based maps
- ⚠️ Need to handle edge cases (player not in cache, multiple players with same playerId)

---

### Approach 2: Client-Side State Preservation + Smart Rejoin

**Concept**: Client preserves minimal state, server recognizes returning player and restores their position.

#### How It Works:

1. **On Client Disconnect**:
   - Store in `sessionStorage`: `playerId`, `roomId`, `lastKnownPosition`, `timestamp`
   - Don't store full game state (too complex)

2. **On Server Restart**:
   - Server restores room state with player snapshots keyed by `playerId` (same as Approach 1)

3. **On Page Load**:
   - Check `sessionStorage` for `dev_rejoin_data`
   - If found and recent (< 60 seconds), automatically rejoin
   - Pass `playerId` in join options

4. **On Server onJoin**:
   - Check if `playerId` exists in restored cache
   - If yes, restore player entity at cached position
   - If no, spawn at default position

#### Implementation:

```typescript
// Client: In onLeave handler (initPhaser.ts)
if (isDev && code === 4000) { // Server restart code
  const playerId = this.room.state.players.get(this.room.sessionId)?.wallet;
  const roomId = this.room.id;
  const player = this.room.state.players.get(this.room.sessionId);
  
  if (playerId && roomId && player) {
    sessionStorage.setItem('dev_rejoin_data', JSON.stringify({
      playerId,
      roomId,
      x: player.x,
      y: player.y,
      timestamp: Date.now(),
    }));
  }
}

// Client: On page load (page.tsx or initPhaser.ts)
const rejoinData = sessionStorage.getItem('dev_rejoin_data');
if (rejoinData && isDev) {
  const data = JSON.parse(rejoinData);
  const age = Date.now() - data.timestamp;
  
  if (age < 60000) { // Less than 60 seconds
    // Auto-join with playerId
    await handleStartGame({ 
      joinRoomId: data.roomId,
      playerId: data.playerId 
    });
    sessionStorage.removeItem('dev_rejoin_data');
  }
}
```

#### Pros:
- ✅ Simpler than full reconnection
- ✅ Works with page refresh
- ✅ Server-side restoration handles the heavy lifting

#### Cons:
- ⚠️ Still requires server-side player restoration (Approach 1)
- ⚠️ Wallet connection state may be lost on refresh

---

### Approach 3: Hybrid Approach - Reconnection Token + Player ID Fallback

**Concept**: Try Colyseus reconnection first (for network issues), fall back to player ID-based rejoin (for server restarts).

#### How It Works:

1. **Normal Network Disconnect** (code 1006):
   - Use Colyseus `allowReconnection()` and `client.reconnect(token)`
   - Works for brief network interruptions

2. **Server Restart** (code 4000+):
   - Skip reconnection token attempt
   - Use player ID-based rejoin (Approach 1)
   - Client stores `playerId` and `roomId` in sessionStorage
   - Auto-rejoin on next connection

#### Implementation:

```typescript
// Server: In onLeave()
if (isDev && !consented && !serverShuttingDown) {
  // Only allow reconnection for network issues, not server restarts
  if (code === 1006) {
    await this.allowReconnection(client, 30);
  }
  // For server restarts, cache state and let client rejoin normally
}

// Client: In onLeave handler
if (code === 1006 && reconnectionToken) {
  // Network issue - try Colyseus reconnection
  await this.client.reconnect(reconnectionToken);
} else if (code >= 4000) {
  // Server restart - prepare for rejoin
  const playerId = this.getPlayerId();
  sessionStorage.setItem('dev_rejoin', JSON.stringify({
    playerId,
    roomId: this.room.id,
    timestamp: Date.now(),
  }));
}
```

#### Pros:
- ✅ Handles both network issues and server restarts
- ✅ Uses appropriate method for each scenario
- ✅ Best user experience

#### Cons:
- ⚠️ More complex implementation
- ⚠️ Requires both reconnection and rejoin logic

---

## Recommended Implementation Plan

### Phase 1: Server-Side Player Restoration (Foundation)

1. **Modify `onCacheRoom()`**:
   - Add `playerIdToSessionMap` and `playerSnapshots` to cache
   - Key player data by `playerId` instead of `sessionId`

2. **Modify `restoreFromDiskCache()`**:
   - Restore `playerSnapshots` Map keyed by `playerId`
   - Store in `this.restoredPlayerSnapshots` for use in `onJoin()`

3. **Modify `onJoin()`**:
   - Check if `playerId` exists in `restoredPlayerSnapshots`
   - If yes, restore player entity state from snapshot
   - Migrate session-based maps from old sessionId to new sessionId

### Phase 2: Client-Side Auto-Rejoin

1. **Modify `onLeave` handler**:
   - Detect server restart (code >= 4000)
   - Store `playerId`, `roomId`, `timestamp` in sessionStorage

2. **Modify join flow**:
   - Check for `dev_rejoin` data on initialization
   - Auto-join if data exists and is recent
   - Pass `playerId` in join options

### Phase 3: Session Map Migration

1. **Create migration helper**:
   ```typescript
   migrateSessionData(oldSessionId: string, newSessionId: string, playerId: string) {
     // Migrate all session-based maps
     if (this.playerInventories.has(oldSessionId)) {
       this.playerInventories.set(newSessionId, 
         this.playerInventories.get(oldSessionId)!
       );
       this.playerInventories.delete(oldSessionId);
     }
     // ... repeat for all session-based maps
   }
   ```

2. **Call migration in `onJoin()`** when restoring cached player

## Key Implementation Considerations

### 1. Session Map Migration

All maps keyed by `sessionId` need migration:
- `playerInventories`
- `playerProgression`
- `killStreakBySession`
- `gamePlayerStats`
- `latestInputByClientId`
- `entryFeeLedger`
- `playerScoreStateByPlayerId`
- `pendingScoreDeltas`
- `npcPurchaseCooldowns`

### 2. Player Entity Restoration

When restoring a player entity:
- Must use **new sessionId** as the key in `state.players`
- Restore all properties from snapshot
- Ensure position is valid (not out of bounds)
- Restore HP, level, equipment, etc.

### 3. Client State Sync

After rejoin:
- Client receives `room_joined` message with restored state
- Client's `onAdd` handler for `state.players` will fire
- Client should recognize their own player entity
- May need to update camera position to restored player position

### 4. Edge Cases

- **Multiple players with same playerId**: Shouldn't happen, but add check
- **Player not in cache**: Treat as new player, spawn at default position
- **Cache too old**: Clear cache if > 5 minutes old
- **Room phase changed**: If phase changed during restart, handle appropriately

## Testing Strategy

1. **Unit Tests**:
   - Test `onCacheRoom()` includes player snapshots
   - Test `restoreFromDiskCache()` restores snapshots correctly
   - Test `onJoin()` restores player from snapshot

2. **Integration Tests**:
   - Start server, join room, trigger restart, verify player restored
   - Test with multiple players
   - Test with different phases (staging, in_game, ended)

3. **Manual Testing**:
   - Join game, move around, trigger server restart
   - Verify player position/state preserved
   - Verify can continue playing normally

## Alternative: Accept Restart, Optimize Recovery

If reconnection proves too complex, consider:

1. **Quick-start commands**: Debug commands to spawn at specific phase/position
2. **State snapshots**: Save/load game state for testing
3. **Test fixtures**: Pre-configured game states for common scenarios
4. **Faster auth flow**: Optimize wallet connection and authentication

This might be more pragmatic than complex reconnection logic.



