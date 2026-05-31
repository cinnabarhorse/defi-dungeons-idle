## Typed Colyseus Broadcast Refactor Plan

### Goals

- **Type safety**: Compile-time checking for server→client message names and payloads.
- **Discoverability**: IntelliSense for all events; safer refactors.
- **Single source of truth**: One typed message map on the server, replicated to the client (no shared workspace packages).
- **Low friction**: Thin functional wrapper around Colyseus `broadcast`/`send`.

### Approach (high-level)

- Define `ServerToClientMessages` on the server listing every event and its payload shape.
- Introduce a small factory, e.g., `createBroadcaster<TEvents>(room)` that provides typed `broadcast`, `broadcastExcept`, and `sendTo`.
- Migrate server code to use this helper instead of raw `room.broadcast` / `this.broadcast` / `client.send`.
- Generate a client copy of the message types via `scripts/generate-shared-files.ts` (server → client), then type `room.onMessage` handlers.

### Server files to update

- Core rooms/systems
  - `apps/server/src/rooms/GameRoom.ts` (many `this.broadcast` and `client.send`)
  - `apps/server/src/lib/actions/attack.ts`
  - `apps/server/src/lib/actions/throw-grenade.ts`
  - `apps/server/src/lib/systems/ProjectileSystem.ts`
  - `apps/server/src/lib/systems/EnemySystem.ts`
  - `apps/server/src/lib/systems/StatusSystem.ts`
  - `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - `apps/server/src/lib/systems/WorldTransitionSystem.ts`
  - `apps/server/src/lib/systems/PortalSystem.ts`
  - `apps/server/src/lib/systems/ResourceSystem.ts` (dynamic event names)
  - `apps/server/src/lib/ability-handlers.ts` (life steal)
  - `apps/server/src/lib/systems/VacuumSystem.ts` (client send)
  - `apps/server/src/lib/systems/NPCSystem.ts` (client send)
- Lobby
  - `apps/server/src/rooms/LobbyRoom.ts`

### Client files to update

- `apps/client/src/app/initPhaser.ts`
- `apps/client/src/game/GameScene.ts`
- Add `apps/client/src/types/messages.ts` (generated) and use to type `room.onMessage` handlers.

### Message catalog (server → client)

- Combat
  - **attack_started**: attackerId, targetId, timestamp, durationMs, hitOffsetMs, direction, weaponType, weaponAnimProfile? (melee) | from `attack.ts`
  - **attack_evaded**: attackerId, targetId, timestamp, weaponType | from `attack.ts`, `EnemySystem.ts`, `ProjectileSystem.ts`
  - **damage_applied**: attackerId, targetId, timestamp, damage, hp, maxHp, weaponType, isCrit?, killed? | from `attack.ts`
  - **enemy_damaged**: enemyId, damage, hp, maxHp, attackerId, weaponType, isCrit, attackerDir?, interval?, killed? | from `throw-grenade.ts`, `ProjectileSystem.ts`
  - **boss_special_state**: state ('powerup'|'charge_start'|'charge_end'|'recovery'|'ended'), enemyId, (timing fields) | from `lib/abilities/enemyAbilities.ts`
- Status
  - **status_applied**: targetId, type ('slow'|'stun'), amount?, durationMs? | from `attack.ts`, `EnemySystem.ts`, `ProjectileSystem.ts`, `throw-grenade.ts`
  - **status_removed**: targetId, type ('slow'|'stun') | from `StatusSystem.ts`
- Healing
  - **player_healed**: playerId, healAmount, currentHp?, maxHp?, source?, originPlayerId?, wearableSlug? | from `GameRoom.ts`, `throw-grenade.ts`
  - **life_steal_heal**: playerId, healAmount, currentHp, maxHp, source | from `ability-handlers.ts`
  - **life_steal_heal_enemy**: enemyId, healAmount, currentHp, maxHp, source | from `EnemySystem.ts`
- Grenades
  - **grenade_thrown**: grenadeId, ... | from `throw-grenade.ts`
  - **grenade_exploded**: grenadeId, playerId, wearableSlug, position, radius, timestamp, effect ('damage'|'healing'), enemies?, players?, heals? | from `throw-grenade.ts`
- Fog of war
  - **fog_state** (client.send): enabled, tileSize, mapWidth, mapHeight, radiusTiles, discovered? | from `GameRoom.ts`
  - **fog_reveal**: tiles: Array<{x,y}> | from `GameRoom.ts`
- Staging / run
  - **staging_countdown**: countdownEndsAt, startedByPlayerId | from `StagingRoom.ts`
  - **staging_run_started**: runStartedAt, lateJoinCutoffAt | from `StagingRoom.ts`
  - **staging_cancelled**: reason, refunded | from `StagingRoom.ts`
  - **late_join_closed**: roomId, closedAt | from `StagingRoom.ts`
  - **staging_auto_close**: autoCloseAt | from `GameRoom.ts`
- World / portals / transitions
  - **portals_opened**: message?, portalCount?, placements? | from `PortalSystem.ts`
  - **entered_treasure_room**: message | from `WorldTransitionSystem.ts`
  - **entered_boss_room**: message | from `WorldTransitionSystem.ts`
  - **entered_new_map**: message, difficultyTier | from `WorldTransitionSystem.ts`
  - **chunk_layout_update**: chunkLayout, difficultyTier | from `WorldTransitionSystem.ts`, `GameRoom.ts`
  - **portal_used**: portalType, portalKind | from `EnemyDeathSystem.ts`
  - **boss_room_cleared**: enemyId, enemyType | from `EnemyDeathSystem.ts`
- Social / UX
  - **player_emote**: playerId, emoteId, x, y | from `GameRoom.ts`
  - **chat_message**: playerId, playerName, text | from `GameRoom.ts`
  - **chest_opened**: chestId, playerId, ... | from `GameRoom.ts`
  - **player_died**: playerId, cause | from `GameRoom.ts`
  - **server_perf**: avgTickMs, p95TickMs, (maybe cpuPct, enemies, projectiles, activeEnemies) | from `GameRoom.ts`
- Inventory / progression / equipment
  - **inventory_updated** (client.send): inventory | from `GameRoom.ts`
  - **inventory_removed** (client.send): removed, inventory | from `GameRoom.ts`
  - **inventory_remove_error** (client.send): code, message | from `GameRoom.ts`
  - **progression:profile** (client.send): profile, source | from `GameRoom.ts`
  - **progression:xp_awarded** (client.send): amount, totalXp, levelProgress | from `GameRoom.ts`
  - **progression:level_lost**: payload exists on client; confirm/emit as needed
  - **kill_streak:profile** (client.send): units, archetypeId, ... | from `GameRoom.ts`
  - **kill_streak:updated** (client.send): units, deltaUnits | from `GameRoom.ts`
  - **kill_streak:reset** (client.send): reason | from `GameRoom.ts`
  - **equipment_updated** (client.send): equipment, overrides, version | from `GameRoom.ts`
  - **stats_updated** (client.send): derivedStats | from `GameRoom.ts`
- Resource harvest (dynamic via config)
  - **tree_chopped**, **tree_cut_down**, **stone_chopped**, **stone_mined** | from `ResourceSystem.ts` + `resource-config.ts`
- Lobby
  - **room_listings** (client.send), **room_listings_updated**, **room_created**, **join_room**, **room_creation_failed**, **join_room_failed** | from `LobbyRoom.ts`
- NPC
  - **npc_dialogue** (client.send) | from `NPCSystem.ts`
  - **npc_purchase_result** (client.send) | from `GameRoom.ts`
- Room/session
  - **room_joined** (client.send) | from `GameRoom.ts`
  - **weapon_switched** (client.send) | from `GameRoom.ts`
- Misc gameplay
  - **obstacle_action** (client.send) | from `GameRoom.ts`
  - **item_pickup** (client.send) | from `VacuumSystem.ts`
  - **pong** (client.send) | from `GameRoom.ts`
- Action system events
  - **player_action_animation**: sessionId, timestamp, direction, actionType, animation, targetId, interval, weaponType, characterId | from `lib/actions/interactive.ts`
  - **player_action_complete**: sessionId, timestamp, actionType | from `lib/actions/base.ts`

### Notable mismatches and edge cases

- **Stone destroy event mismatch**
  - Server emits `stone_mined` (via `destroyMessage`), client listens to `stone_broken`.
  - Recommendation: standardize on one (suggest `stone_broken` for clarity), update `RESOURCE_CONFIGS.stone.destroyMessage` and any client handlers.
- **Unused/missing event**
  - Client listens for `player_auto_healed`; no server emits it. Decide to either emit from regen or remove handler.
- **server_perf payload divergence**
  - Server only sends `avgTickMs`, `p95TickMs`; client reads `cpuPct`, `enemies`, `projectiles`, `activeEnemies` too. Either extend server or trim client.
- **fog_reveal payload shape**
  - Server sends `{ tiles }`; client accepts either object or array. Standardize on `{ tiles }`.
- **weapon_switched optionality**
  - Sometimes includes `activeIndex`, sometimes not. Standardize to always include `attackType` and `activeIndex`.
- **Healing message families**
  - We have `player_healed`, `life_steal_heal`, and `life_steal_heal_enemy`. Consider consolidating to `player_healed` and `enemy_healed` with `source`, or keep both groups but type them clearly.
- **Dynamic resource event names**
  - `ResourceSystem` reads message names from `ResourceConfig`. Type these as `keyof ServerToClientMessages` and ensure payloads have the expected id fields.
- **Two broadcast entry points**
  - Both `room.broadcast(...)` and `this.broadcast(...)` exist. The helper should support both (i.e., can accept a `Room` or `this`). Attach the broadcaster to `GameRoom` instance in `onCreate` for convenience.
- **Namespaced events**
  - Literal keys like `progression:*`, `kill_streak:*` must be included verbatim in the message map.

### Implementation steps

1. **Create server message type map**
   - Add `apps/server/src/types/messages.ts` with:
     - `export interface ServerToClientMessages { /* all events above */ }`
     - Start with accurate shapes; use optional fields only where variability exists. Tighten during migration.

2. **Add typed broadcaster helper**
   - Add `apps/server/src/lib/messaging.ts`:
     - `export function createBroadcaster<TEvents>(room) { broadcast<K extends keyof TEvents>(type: K, payload: TEvents[K]); broadcastExcept(...); sendTo(client, type, payload); }`
   - In `GameRoom.onCreate`, initialize `this.msg = createBroadcaster<ServerToClientMessages>(this)`.

3. **Migrate in phases (low → high risk)**
   - Phase A: Staging/world/lobby/fog/social/perf (`staging_*`, `portals_*`, `entered_*`, `chunk_layout_update`, `room_listings_*`, `fog_*`, `chat_message`, `player_emote`, `server_perf`).
   - Phase B: Inventory/progression/equipment/NPC (`inventory_*`, `progression:*`, `kill_streak:*`, `equipment_updated`, `stats_updated`, `npc_*`).
   - Phase C: Resource system dynamic events (`tree_*`, `stone_*`) and generator typing.
   - Phase D: Combat/status/grenades (`attack_*`, `damage_applied`, `enemy_damaged`, `status_*`, `grenade_*`, healing messages).

4. **Standardize payloads during migration**
   - Normalize `weapon_switched` to always include `activeIndex`.
   - Normalize `fog_reveal` to `{ tiles }` only; update client accordingly.
   - Decide on `server_perf` extra fields; add them server-side or stop reading them client-side.
   - Choose healing consolidation strategy and update both sides.

5. **Resolve mismatches**
   - Update `stone_mined` vs `stone_broken` to a single string across server/client.
   - Emit `player_auto_healed` from regen (or remove client listener).

6. **Type dynamic resource events**
   - Change `ResourceConfig.harvestMessage`/`destroyMessage` types to `keyof ServerToClientMessages`.
   - Ensure payloads include exact id field names (e.g., `treeId`, `woodId`, `stoneId`, etc.).

7. **Share types to client (no workspace packages)**
   - Extend `scripts/generate-shared-files.ts` with a copier that reads `apps/server/src/types/messages.ts` and writes to `apps/client/src/types/messages.ts` (similar to existing inventory types generator), per our “no shared packages” rule.
   - Update client `onMessage` registrations to import and use these types for each handler.

8. **Optional dev-time validation**
   - In `messaging.ts`, behind a dev flag, optionally validate payloads against Zod schemas keyed by message name for extra safety during development/tests.

9. **Testing & CI guards**
   - Add a unit test that enumerates message string literals used in server broadcasts and ensures they exist in `ServerToClientMessages` (forces migration completeness).
   - Manual QA checklist:
     - Attack (melee/ranged/grenades): start, evade, status, damage, crit, kill flag.
     - Healing flows (potions, life steal, grenade healing splash).
     - Staging lifecycle and late join closure.
     - Fog state/reveal after movement.
     - Portals open/use and world transitions.
     - Inventory remove/update, progression, kill streak updates.
     - Lobby room creation/join flows.

### Proposed helper and type examples (illustrative)

```ts
// apps/server/src/types/messages.ts
export interface ServerToClientMessages {
  attack_started: {
    attackerId: string;
    targetId: string;
    timestamp: number;
    durationMs: number;
    hitOffsetMs: number;
    direction: string;
    weaponType: 'melee' | 'ranged' | 'grenades';
    weaponAnimProfile?: {
      totalFrames: number;
      impactFrameIndex: number;
      frameRateBase?: number;
    };
  };
  attack_evaded: {
    attackerId: string;
    targetId: string;
    timestamp: number;
    weaponType: 'melee' | 'ranged' | 'grenades';
  };
  damage_applied: {
    attackerId: string;
    targetId: string;
    timestamp: number;
    damage: number;
    hp: number;
    maxHp: number;
    weaponType: 'melee' | 'ranged' | 'grenades';
    isCrit?: boolean;
    killed?: boolean;
  };
  enemy_damaged: {
    enemyId: string;
    damage: number;
    hp: number;
    maxHp: number;
    attackerId: string;
    weaponType: 'melee' | 'ranged' | 'grenades';
    isCrit?: boolean;
    attackerDir?: 'up' | 'down' | 'left' | 'right';
    interval?: number;
    killed?: boolean;
  };
  status_applied: {
    targetId: string;
    type: 'slow' | 'stun';
    amount?: number;
    durationMs?: number;
  };
  status_removed: { targetId: string; type: 'slow' | 'stun' };
  player_healed: {
    playerId: string;
    healAmount: number;
    currentHp?: number;
    maxHp?: number;
    source?: string;
    originPlayerId?: string;
    wearableSlug?: string;
  };
  life_steal_heal: {
    playerId: string;
    healAmount: number;
    currentHp: number;
    maxHp: number;
    source: string;
  };
  life_steal_heal_enemy: {
    enemyId: string;
    healAmount: number;
    currentHp: number;
    maxHp: number;
    source: string;
  };
  grenade_thrown: { grenadeId: string /* ... */ };
  grenade_exploded: {
    grenadeId: string;
    playerId: string;
    wearableSlug?: string;
    position: { x: number; y: number };
    radius: number;
    timestamp: number;
    effect: 'damage' | 'healing';
    enemies?: Array<any>;
    players?: Array<any>;
    heals?: Array<any>;
  };
  fog_reveal: { tiles: Array<{ x: number; y: number }> };
  staging_countdown: {
    countdownEndsAt: number;
    startedByPlayerId: string | null;
  };
  staging_run_started: { runStartedAt: number; lateJoinCutoffAt?: number };
  staging_cancelled: { reason: string; refunded?: boolean };
  late_join_closed: { roomId: string; closedAt: number };
  staging_auto_close: { autoCloseAt: number };
  portals_opened: { message?: string; portalCount?: number };
  entered_treasure_room: { message: string };
  entered_boss_room: { message: string };
  entered_new_map: { message: string; difficultyTier: string | number };
  chunk_layout_update: { chunkLayout: any; difficultyTier: any };
  portal_used: { portalType: string; portalKind: string };
  player_emote: {
    playerId: string;
    emoteId: string | number;
    x: number;
    y: number;
  };
  chat_message: { playerId: string; playerName: string; text: string };
  chest_opened: { chestId: string; playerId: string /* ... */ };
  player_died: { playerId: string; cause: string };
  server_perf: {
    avgTickMs: number;
    p95TickMs: number;
    cpuPct?: number;
    enemies?: number;
    projectiles?: number;
    activeEnemies?: number;
  };
  inventory_updated: { inventory: any };
  inventory_removed: { removed: any; inventory: any };
  inventory_remove_error: { code: string; message: string };
  'progression:profile': { profile: any; source: string };
  'progression:xp_awarded': {
    amount: number;
    totalXp: number;
    levelProgress: any;
  };
  'progression:level_lost': {
    /* if used, define */
  };
  'kill_streak:profile': { units: number; archetypeId: string };
  'kill_streak:updated': { units: number; deltaUnits: number };
  'kill_streak:reset': { reason: string };
  equipment_updated: { equipment: any; overrides: any; version: number };
  stats_updated: { derivedStats: any };
  tree_chopped: { treeId: string; health: number; maxHealth: number };
  tree_cut_down: { treeId: string; woodId: string; choppedBy: string };
  stone_chopped: { stoneId: string; health: number; maxHealth: number };
  stone_mined: { stoneId: string; stoneDropId: string; brokenBy: string };
  room_listings: Array<any>;
  room_listings_updated: Array<any>;
  room_created: { roomId: string; roomCode?: string };
  join_room: { reservation: any };
  room_creation_failed: { error: string };
  join_room_failed: { error: string };
  npc_dialogue: {
    npcId: string;
    npcName: string;
    npcCharacterId: string;
    dialogueId: string;
  };
  npc_purchase_result: { ok?: boolean; reason?: string; dialogueKey?: string };
  room_joined: { playerId: string; roomId: string /* ... */ };
  weapon_switched: {
    attackType: 'melee' | 'ranged' | 'grenades';
    activeIndex?: number;
  };
  obstacle_action: { obstacleX: number; obstacleY: number /* ... */ };
  item_pickup: { itemId: string; item: any };
  pong: { timestamp: number };
  player_action_animation: {
    sessionId: string;
    timestamp: number;
    direction: 'up' | 'down' | 'left' | 'right';
    actionType: string;
    animation: string;
    targetId: string;
    interval: number;
    weaponType: string;
    characterId: string;
  };
  player_action_complete: {
    sessionId: string;
    timestamp: number;
    actionType: string;
  };
}
```

```ts
// apps/server/src/lib/messaging.ts
import type { Room, Client } from 'colyseus';

export function createBroadcaster<TEvents extends Record<string, unknown>>(
  room: Room
) {
  function broadcast<K extends keyof TEvents>(type: K, payload: TEvents[K]) {
    room.broadcast(String(type), payload as any);
  }
  function broadcastExcept<K extends keyof TEvents>(
    type: K,
    payload: TEvents[K],
    except: Client
  ) {
    room.broadcast(String(type), payload as any, { except });
  }
  function sendTo<K extends keyof TEvents>(
    client: Client,
    type: K,
    payload: TEvents[K]
  ) {
    client.send(String(type), payload as any);
  }
  return { broadcast, broadcastExcept, sendTo };
}
```

### Generator changes (server → client types)

- Extend `scripts/generate-shared-files.ts` to copy `apps/server/src/types/messages.ts` to `apps/client/src/types/messages.ts` with the standard AUTO-GENERATED header. We already have a precedent (`generateServerInventoryTypes`).
- Ensure we do not import server code at runtime on the client; only copy the TypeScript interface.

### Risks

- Initial typing may surface shape discrepancies; plan the migration with feature flags if needed.
- Dynamic messages (resources) require careful typing; the helper’s generic ensures compile-time checks once wired.
- Refactors touching combat/status are high-volume; migrate last and test thoroughly.

### Rollout and verification

- Land in phases; after each phase:
  - Build server and client; ensure no TS errors.
  - Sanity run: smoke test affected features.
  - Adjust types to reduce optional fields as we standardize payloads.

### Quick win fixes to include during migration

- Align stone destroy event (`stone_mined` ↔ `stone_broken`).
- Decide and implement `player_auto_healed` (emit or remove).
- Normalize `weapon_switched` (always include `activeIndex`).
- Normalize `fog_reveal` payload to `{ tiles }`.
- Reconcile `server_perf` fields across server/client.
