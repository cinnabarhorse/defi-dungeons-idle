## Server-only collision mask for invisible tiles

### Goal

Add invisible "collision tiles" that block movement and pathfinding without rendering anything on the client. Prioritize performance, server-authority, and single source of truth.

### Principles

- **Server-authoritative collisions**: All collision truth lives on the server; clients render only visuals and receive corrections when needed [[memory:7467760]].
- **Single source of truth**: One collision mask powers both collision checks and pathfinding; avoid duplicating logic or data [[memory:8263733]].
- **No workspace package coupling**: Keep types/utilities local to `apps/server/` (do not import from workspace packages) [[memory:7369650]].
- **Minimal network footprint**: Do not replicate collision-only data via `room.state.entities`.

### Data model (server)

- **Tile bitmask**: 1 bit per tile for `MAP_WIDTH * MAP_HEIGHT` (fast O(1) queries, compact memory). Store in memory on the room instance.
  - Backing store: `Uint8Array` (bit-packed) or `Uint8Array` as boolean grid if simplicity preferred.
  - Helpers:
    - `isTileBlocked(tileX, tileY): boolean`
    - `setTileBlocked(tileX, tileY, value: boolean): void`
    - `fillRect(x, y, w, h, value: boolean): void`
    - Optional: `forEachBlocked(callback)` for debug/export.
- **Ownership**: Attach to `GameRoom` (e.g., `room._collisionMask`) and expose minimal helper methods on a private API shape (`GameRoomApi`).

### Authoring invisible collisions (chunks + editor)

- Introduce an explicit, renderless authoring channel in chunk assets:
  - Option A (recommended): `asset.category === 'collision'`.
  - Option B: a flag `asset.isCollisionOnly === true` on any asset.
- Asset semantics for invisible collisions:
  - Use grid coordinates (`asset.x`, `asset.y`) in tiles.
  - Allow rectangular regions with optional `width`, `height` (in tiles). Default to `1x1` if omitted.
  - Optional shape variants: `shape: 'rect' | 'poly'` (start with `rect`).

### Population (server MapGenerator)

- During chunk placement (`MapGenerator.placeChunkAt`), for any asset where `category === 'collision'` or `isCollisionOnly === true`:
  - Compute world tile coordinates from chunk offset and asset position (tile size = `32`).
  - Rasterize the region into the mask via `fillRect` (skip entity creation entirely).
- Keep existing entity-based colliders (`hasCollision`) for visible obstacles unchanged.
- Also bake fixed world borders into the mask at map creation time (ensures both collision and pathfinding agree on boundaries).

### Integration points (server)

- `MapCollisionSystem.checkObstacleCollision(...)`:
  - First, early-out using the tile mask at the player's center tile (and up to N neighboring tiles based on radius). Only if clear, fall back to existing entity proximity checks for circular/offset collisions around trees/stones.
  - This reduces per-tick iteration over entities in the common case.
- `PathfindingSystem.buildObstacleSet(...)` / `findPath(...)`:
  - Union the mask with entity-derived tile obstacles. Easiest path:
    - Provide `isTileBlocked` to the pathfinder so it consults the mask directly for each neighbor test.
    - If a `Set<string>` of blocked tiles is required, lazily wrap it: queries check either `set.has(key)` or `mask.isTileBlocked(x,y)` without fully materializing tiles.
- `isSpawnPositionSafe(...)`:
  - Consult the mask first (cheap). Keep player/enemy distance checks as-is.

### Client (no rendering)

- Do not render any collision-only tiles. The server remains authoritative.
- Optional dev overlay: a debug toggle that requests a compressed snapshot of blocked tiles and overlays a translucent grid for diagnostics (behind an environment flag and admin UI).

### Map editor UX

- Add a new layer/tool named `Collision` in the map editor:
  - Tools: **rect brush** (drag to place/remove rectangles), **tile brush** (single tile), **eraser**.
  - Visuals: draw semi-transparent red overlay in the editor only; do not export any sprite or entity.
  - Export: for each collision region, emit a chunk asset with `{ category: 'collision', x, y, width, height }` (tile units). Avoid sprite fields.
  - Import: load existing collision assets and render the overlay for edits.

### Networking

- Collision mask is server-only runtime data. Do not include collision-only assets in `room.state.entities`.
- No protocol changes required for clients; existing reconciliation handles corrections when client attempts to move into blocked tiles.

### Performance profile

- Memory: `MAP_WIDTH * MAP_HEIGHT` bits. For `120 x 100` → `12,000` bits ≈ 1.5 KB (plus overhead if using bytes).
- Queries: O(1) for `isTileBlocked`, negligible on hot paths.
- Pathfinding: per-node neighbor checks consult mask; overall cost dominated by algorithm, not by collision checks.
- CPU: One-time rasterization during map generation; incremental flips for dynamic elements (if added later).

### API surface (server-only)

- Minimal methods exposed via `GameRoomApi` (private):
  - `mask.isTileBlocked(tileX, tileY)`
  - `mask.setTileBlocked(tileX, tileY, value)`
  - `mask.fillRect(x, y, w, h, value)`

### Migration plan (small, incremental)

1. Server: Implement mask structure and helpers under `apps/server/src/lib/systems/` (e.g., `CollisionMask.ts`). Keep types local to server.
2. GameRoom: Instantiate mask on room creation; bake borders.
3. MapGenerator: During `placeChunkAt`, consume `collision` assets and rasterize into the mask; do not create entities for them.
4. MapCollisionSystem: Early-out collision checks using the mask; keep entity-based fallback for non-tile-perfect shapes.
5. Pathfinding: Consult `isTileBlocked` during neighbor expansion (or lazy union wrapper around the obstacle set).
6. Editor: Add `Collision` layer/tools; export/import `{ category: 'collision', x, y, width, height }` assets into chunk data.
7. Data: Start by marking a few narrow corridors or barriers using the editor; verify movement and auto-walk pathfinding reflect the new blocks.
8. Optional: Add dev-only debug overlay to visualize mask while connected to a room.

### Testing

- Unit: mask set/get, rectangle fill, borders baked correctly.
- Integration:
  - Pathfinding: ensure routes avoid masked regions; validate `isTargetReachable` behavior.
  - Movement: attempts to enter masked tiles are rejected server-side; clients receive state correction.
  - Spawn safety: positions inside masked tiles are rejected.

### Future extensions

- Dynamic doors/switches: flip rectangles at runtime and invalidate local pathfinding caches.
- Shapes: add polygon rasterization only if needed (start with rectangles).
- Streaming: if world scales up, page the mask per chunk and query by page index.
