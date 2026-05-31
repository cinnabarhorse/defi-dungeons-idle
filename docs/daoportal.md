### DAO Portal (ground overlay with collision)

Goal

- **Render above floor tiles** but **below all y-sorted entities** (players, trees, enemies, specials, UI), while retaining server-authoritative collisions.
- Allow other world elements to stack on top visually (no occlusion issues from the portal art).

Constraints we must respect

- Client currently renders floors in `EnvironmentSystem` on `floorLayer` with depth 1.
- Entities (trees, stones, specials, players, enemies, portals) are generally y-sorted using `setDepth(entity.y)`.
- Server-side collision checks use `getObstacleConfig(assetId)` from `/data/obstacles.ts` and run in `MapCollisionSystem.checkObstacleCollision`.
- Chunk assets with category `floors` are not emitted as entities (client renders them directly). Other chunk assets become `EntityKind.OBSTACLE` with a `state` payload in `MapGenerator.placeChunkAt`.

Proposed approach: config‑driven "ground overlay" render layer

1. Source of truth = `/data/obstacles.ts`
   - Extend `ObstacleConfig` with optional fields:
     - `renderLayer?: 'floor' | 'overlay' | 'entity'`
     - `hasCollision?: boolean` (defaults to true for things that should block)
     - `depthHint?: number` (optional constant depth for non-y-sorted sprites)
   - Configure `daoportal` there:
     - `width: 512`, `height: 320`, `collisionRadius: 160–192` (tune after test)
     - `renderLayer: 'overlay'`, `hasCollision: true`, `depthHint: 2`
   - This file already syncs to both apps via `generate:shared`, so no duplication.

2. Server: generic mapping (no hardcoded asset checks)
   - In `MapGenerator.placeChunkAt`, after building `state` for non-floor assets, read config:
     - `const cfg = OBSTACLE_CONFIGS[asset.assetId]` (import from `apps/server/src/data/obstacles`).
     - If present, set: `state.hasCollision = cfg.hasCollision ?? state.hasCollision`, `state.renderLayer = cfg.renderLayer`, and keep `state.assetId = asset.assetId`.
     - Keep `state.type` logic (tree/stone/etc.) as-is. No `if (assetId === 'daoportal')` branches.
   - `MapCollisionSystem` already respects `hasCollision` and uses `getObstacleConfig(state.assetId)`, so no further changes.
   - Ensure `/data/obstacles.ts` is updated, then run `pnpm run generate:shared`.

3. Client rendering change (specials only, generic)
   - In `renderSpecialSprite` read `renderLayer` and optional `depthHint` from `entity.state`:
     - If `renderLayer === 'overlay'`, set constant depth `specialSprite.setDepth(depthHint ?? 2)`.
     - Else, keep `specialSprite.setDepth(entity.y)`.
   - No asset-specific code; any future overlay asset works by config.

4. Map editor UX (config-aware preview)
   - Import `OBSTACLE_CONFIGS` (client copy) and, inside `getAssetZIndex`, if `OBSTACLE_CONFIGS[asset.assetId]?.renderLayer === 'overlay'`, return `1` to preview above floors.
   - Optional: keep support for explicit `asset.zIndex` if provided. No new category required.

5. Collision details
   - Server pathfinding and collision already use `getObstacleConfig(state.assetId)` in `MapCollisionSystem`. Marking `hasCollision: true` on the server state makes it eligible for collision checks.
   - Initial values (from actual PNG): 512x320. Suggested starting `collisionRadius`: 160–192 (not the full half-width 256) to better match the base footprint and avoid an overly large circular blocker.

6. Testing checklist
   - Add a tiny test chunk that places `daoportal` under a tree and a player path; verify visually: floor (1) < daoportal (2) < tree/player (y-sorted).
   - Confirm the player cannot traverse the base area (collision true) but can stand visually in front of its top due to depth ordering.
   - Verify editor preview ordering and export/import keep `renderLayer` and `zIndex`.

Implementation tasks

- Data: extend `ObstacleConfig` with `renderLayer?`, `hasCollision?`, `depthHint?`; add config for `daoportal`.
- Server: in `MapGenerator.placeChunkAt`, read `OBSTACLE_CONFIGS[asset.assetId]` to set `state.renderLayer` and `state.hasCollision` (generic, no ID checks).
- Client: in `renderSpecialSprite`, honor `state.renderLayer === 'overlay'` and `state.depthHint` for constant low depth.
- Editor: update `getAssetZIndex` to prefer overlay assets via `OBSTACLE_CONFIGS` lookup; keep existing defaults otherwise.

Open questions

1. Collision footprint
   - Should the portal block movement across its full width, or only the base ring? If the latter, what approximate radius should we use (e.g., 160 / 180 / 192 px)?
2. Interaction
   - Should `daoportal` be clickable (e.g., future travel/teleport)? If so, should it be interactable from any overlap or only near the base?
3. Editor placement
   - Do we want to lock it to 32px grid or allow free placement? It’s 512x320; grid alignment is visually cleaner, but free placement may be useful.
4. Variants
   - Will there be other overlay sprites with the same rules? If yes, we should keep the generic `renderLayer: 'overlay'` path and avoid hardcoding on `daoportal`.
5. Parallax/animation
   - Any plan for animated glow/swirl above players? If you want a "top layer" glow, we can add a companion non-colliding VFX entity that renders at high depth.

Rollout plan

- Implement the minimal config changes in `/data/obstacles.ts`, wire generic server/client reads, then test in a sample chunk.
- Iterate on collision radius after playtest, and only then consider VFX.

Chunk serialization notes

- No special flags are required in chunk assets. The server infers `renderLayer` and `hasCollision` from `OBSTACLE_CONFIGS[assetId]`.
- Optional future override: if we ever need per-instance behavior, we can add `renderLayer?: 'floor' | 'overlay' | 'entity'` to `PlacedAsset`. When present, it would override the config; when absent, config remains the single source of truth.
