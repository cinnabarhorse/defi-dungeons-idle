## Colyseus 0.16 migration plan for gotchiverse-live

### Overview

- **Goal**: Upgrade from `colyseus@^0.15` to `^0.16` and adopt new APIs safely.
- **Key changes in 0.16**:
  - **StateView** replaces `@filter()` / `@filterChildren()` for per-client filtered state.
  - **onAuth(context)** signature replaces previous `onAuth(..., request)`.
  - Support for setting `state`, `patchRate`, `autoDispose`, `maxClients` as class fields.
  - Experimental **WebTransport** with `client.sendUnreliable()` for client→server unreliable messaging.
  - Deprecation of schema-encoded messages (we already use plain JSON messages).
- **Reference**: [Colyseus 0.16 announcement](https://colyseus.io/blog/colyseus-016-is-here/).

### Current usage in this repo (what we saw)

- Root dependencies:
  - `colyseus@^0.15.0`, `@colyseus/schema@^2.0.0` in `package.json`.
- We use `@filter()` in server state schemas for fog-of-war visibility gating of `enemies`, `npcs`, and `projectiles`:

```151:166:apps/server/src/schemas/index.ts
@filter(function (
  this: GameRoomState,
  client: any,
  key: string,
  enemy: EnemySchema
) {
  if (!enemy) return false;
  if (!this._fogActiveForClients) return true;
  const set = this._visibleEnemyIds;
  if (set && enemy.id) {
    return set.has(enemy.id);
  }
  return true;
})
@type({ map: EnemySchema })
enemies = new MapSchema<EnemySchema>();
```

```183:198:apps/server/src/schemas/index.ts
@filter(function (
  this: GameRoomState,
  client: any,
  key: string,
  projectile: ProjectileSchema
) {
  if (!projectile) return false;
  if (!this._fogActiveForClients) return true;
  const set = this._visibleProjectileIds;
  if (set && projectile.id) {
    return set.has(projectile.id);
  }
  return true;
})
@type({ map: ProjectileSchema })
projectiles = new MapSchema<ProjectileSchema>();
```

- `GameRoom.onAuth` uses the old `request` parameter:

```649:656:apps/server/src/rooms/GameRoom.ts
// Authenticate websocket using session cookie from the HTTP upgrade request
async onAuth(client: Client, _options: any, request?: any) {
  try {
    const hdrs: any = (request as any)?.headers || {};
    const hasCookie =
      typeof hdrs.cookie === 'string' && hdrs.cookie.length > 0;
```

- `maxClients` is set dynamically during create (we can also set class defaults in 0.16):

```902:905:apps/server/src/rooms/GameRoom.ts
// Set max clients (clamp to server-enforced maximum)
const requestedMax = Number(options.maxPlayers);
this.maxClients = Number.isFinite(requestedMax)
```

- We rely on `client.send(...)` / `room.broadcast(...)` with plain JSON messages (compatible with 0.16). We do not use `client.getAvailableRooms()` nor `matchMaker.getRoomById()`.

## Required changes

### 1) Replace @filter() with StateView (breaking)

- **What to do**:
  - Remove all `@filter()` decorators and their imports from `apps/server/src/schemas/index.ts`.
  - Move transient visibility caches (`_fogActiveForClients`, `_visibleEnemyIds`, `_visibleNpcIds`, `_visibleProjectileIds`) out of the schema. Keep them as server-only runtime structures, ideally per-client, attached to the room/view layer.
  - Create a **per-client StateView** for each connected client:
    - On join: instantiate a view, add base visible entities by current fog/chunk visibility.
    - On visibility changes: batch add/remove entity keys (`enemies`, `npcs`, `projectiles`) from that client’s view.
    - On entity spawn/despawn: update views for all clients whose visibility includes/excludes the entity.
- **Design notes**:
  - Keep the canonical world state fully authoritative and complete in `GameRoomState`.
  - Treat visibility/LOD as a presentation layer per client via StateView.
  - Minimize churn: batch updates per tick/frame to avoid add/remove thrash for large crowds.

### 2) Update onAuth signature to use context

- **What to change**:
  - Update `onAuth` to `(client, options, context)` and use `context.headers`, `context.token`, and `context.ip` instead of `request`.
  - Remove any remaining `request` references.
- **Outcome**: authentication remains compatible across WebSocket and WebTransport.

### 3) Upgrade dependencies

- `colyseus` → `^0.16.x`.
- Ensure `@colyseus/schema` matches the version accompanying 0.16 (the one exposing StateView).
- Rebuild and type-check the server after the bump.

## Recommended improvements (optional but useful)

### 4) Declare Room fields on class

- Add explicit defaults on the `Room` class:
  - `state = new GameRoomState()` (then remove `setState(new GameRoomState())` calls).
  - `patchRate = 1000 / N` (choose target Hz consistent with current tick cadence).
  - `autoDispose` and a default `maxClients` value (still allow runtime overrides as we do today).
- Benefits: clearer configuration, aligns with 0.16 ergonomics.

### 5) Optional WebTransport/unreliable inputs

- For high-frequency client→server inputs (e.g., movement, ping), detect WebTransport and use `client.sendUnreliable()` on the client.
- Keep server broadcasts reliable initially; evaluate selective unreliable paths later.
- Roll out behind a feature flag; gather perf/packet-loss telemetry before broad enablement.

## Implementation plan (server-side)

### A. StateView integration

- **Join**: create a view for the client; populate with currently visible `enemies`, `npcs`, `projectiles` based on fog/chunks.
- **Tick/visibility changes**: track deltas and apply add/remove to each client’s view. Prefer batching per tick.
- **Spawn/despawn**: push deltas to affected clients’ views only.
- **Leave**: dispose client’s view.

### B. Schema cleanup

- Remove `@filter()` and any `_visible*` fields from `GameRoomState`.
- Keep runtime visibility caches in room-level maps keyed by client/session.

### C. Auth context

- Change the `onAuth` signature and update header/cookie/token parsing accordingly.

### D. Class field ergonomics

- Add `state`, `patchRate`, `autoDispose`, `maxClients` as fields; remove redundant `setState(new ...)` where applicable.

## Validation checklist

- **State filtering**: entities appear/disappear correctly when moving through fog and chunk boundaries.
- **Join/leave**: views are created/disposed without leaks.
- **Auth**: login works via `context` on both WS and WebTransport.
- **Patch/tick**: cadence unchanged or improved; no regression to CPU.
- **Messaging**: no schema-encoded messages remain; plain JSON continues to work.
- **Load test**: batch visibility updates avoid thrash; memory steady under many clients.

## Risk and mitigation

- **StateView performance**: Not optimized for very large datasets per 0.16 notes. Mitigate by batching deltas, limiting per-tick changes, and keeping the view minimal.
- **Auth changes**: Ensure robust handling of missing headers/tokens in `context`.
- **Rollout**: Upgrade server first in a staging environment; validate joins, movement, fog, and combat. Gate WebTransport behind a flag.

## Pointers to current code (for implementers)

- Fog filters in schema (to be removed/migrated):

```151:166:apps/server/src/schemas/index.ts
@filter(function (
  this: GameRoomState,
  client: any,
  key: string,
  enemy: EnemySchema
) {
  // ... visibility logic ...
})
@type({ map: EnemySchema })
enemies = new MapSchema<EnemySchema>();
```

```183:198:apps/server/src/schemas/index.ts
@filter(function (
  this: GameRoomState,
  client: any,
  key: string,
  projectile: ProjectileSchema
) {
  // ... visibility logic ...
})
@type({ map: ProjectileSchema })
projectiles = new MapSchema<ProjectileSchema>();
```

- Old `onAuth` signature:

```649:656:apps/server/src/rooms/GameRoom.ts
async onAuth(client: Client, _options: any, request?: any) {
  const hdrs: any = (request as any)?.headers || {};
  // ...
```

- Dynamic `maxClients` setup (keep, but add class defaults):

```902:905:apps/server/src/rooms/GameRoom.ts
const requestedMax = Number(options.maxPlayers);
this.maxClients = Number.isFinite(requestedMax)
```

## Next steps

- Implement sections A–D above behind a feature flag branch.
- Run integration tests on staging; verify the validation checklist.
- If metrics are healthy, enable WebTransport inputs for selected cohorts.
