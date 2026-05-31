### Fog-based Visibility Gating for Enemies/NPCs/Projectiles — Implementation Spec

#### Context

- Schema filters for `enemies`, `npcs`, and `projectiles` already exist and consult runtime visibility sets on `GameRoomState`.
- Server currently computes fog reveals but does not gate replication by visibility, increasing bandwidth and client work.

#### Goal

- Re-enable server-side visibility gating: each client only receives dynamic entities within their visible area (fog-aware AOI).

#### Non-goals

- Changing fog shape/logic or client fog rendering.
- Implementing AOI for static `entities` or chunk streaming (separate tasks).

### Current hooks (reference)

```125:172:apps/server/src/schemas/index.ts
@filter(function (this: GameRoomState, client: any, key: string, enemy: EnemySchema) { ... })
enemies = new MapSchema<EnemySchema>();
@filter(function (this: GameRoomState, client: any, key: string, npc: NPCSchema) { ... })
npcs = new MapSchema<NPCSchema>();
@filter(function (this: GameRoomState, client: any, key: string, projectile: ProjectileSchema) { ... })
projectiles = new MapSchema<ProjectileSchema>();
```

### Design

- Maintain per-client visibility sets (`visibleEnemyIds`, `visibleNpcIds`, `visibleProjectileIds`).
- On a throttled cadence (5–10 Hz) and when the player crosses a tile, recompute visibility:
  - Compute AOI window around the player: viewport size in pixels + buffer, or a radius in tiles.
  - Optionally intersect with fog discovered tiles (if fog is active) to restrict to discovered areas.
  - Populate the sets with IDs of entities that fall within AOI.
- Before Colyseus serializes state for a client, copy these sets into `state._visible*` runtime caches and set `state._fogActiveForClients = true`.

### Files to change

- `apps/server/src/rooms/GameRoom.ts`
  - Add per-client maps: `sessionId → { visibleEnemyIds, visibleNpcIds, visibleProjectileIds }`.
  - Implement `recomputeVisibilityForClient(sessionId)` and a scheduler to call it:
    - On player movement tile-crossing, on join/leave, spawn/despawn, and every 100–200 ms.
  - In `broadcastSnapshot()` (or just before each encode step), assign the per-client sets into `this.state._visible*` and toggle `_fogActiveForClients` for that specific client serialization.
  - Ensure fog disable path sets `_fogActiveForClients = false`.

### Algorithm details

- AOI window
  - Derive `radiusPx = k * tileSize`, where `k` ≈ (viewport tiles / 2) + padding.
  - Use axis-aligned bounding box check for quick inclusion; optional distance check for polish.
- Fog intersection (optional, default on)
  - If fog is active: only include enemies whose tile position `(floor(x/tile), floor(y/tile))` is in discovered set for that client (server-side fog can maintain per-room discovered tiles; team-shared vision assumed).
- Data
  - Enemy/NPC/Projectile positions are in world pixels; convert to tiles for fog checks.
  - Store sets as `Set<string>` of IDs; reuse objects to avoid allocations.

### Step-by-step

1. Add `private clientVisibility: Map<string, { enemy: Set<string>; npc: Set<string>; proj: Set<string> }>` to `GameRoom`.
2. Implement `recomputeVisibilityForClient(sessionId: string)`:
   - Read player position, compute AOI rect.
   - Iterate entities in `state.enemies`, `state.npcs`, `state.projectiles` and add IDs that intersect AOI (and pass fog check if enabled).
3. Hook recomputation:
   - On `onJoin`, `onLeave`, enemy/npc/proj add/remove, and on a throttled interval (100–200 ms).
   - On player tile-crossing inside `gameTick()`.
4. Before serialization for each client:
   - In the colyseus `onBeforePatch`/`onMessage` sending step or inside `broadcastSnapshot()` loop, set:
     - `state._fogActiveForClients = FOG_OF_WAR_ENABLED`.
     - `state._visibleEnemyIds = clientVisibility.get(sessionId)?.enemy` (and same for npc/proj).
   - After send, optionally clear references (or leave; they’re runtime caches).
5. Testing:
   - With fog on: spawn enemies around, verify that only discovered/nearby are received by the client (inspect messages / client lists).
   - With fog off: `_fogActiveForClients = false` should allow all entities through.
   - Load test with large maps, ensure bandwidth and CPU drop versus baseline.

### Acceptance criteria

- Clients only receive enemies/NPCs/projectiles within their AOI and discovered area when fog is enabled.
- No regressions in entity spawn/despawn or combat interactions.
- Significant reduction in per-client serialized state and bandwidth.

### Risks & mitigations

- Desync due to stale visibility → recompute on tile-crossing and throttle at ~5–10 Hz.
- Edge entities flicker at AOI boundary → add padding to AOI and/or hysteresis (enter at R+pad, leave at R).
- Multi-client shared vision nuances → confirm team-vision policy; for now, room-shared discovered set keeps it simple.
