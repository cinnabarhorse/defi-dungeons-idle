### Floor Chunk Virtualization (Client) — Implementation Spec

#### Context

- Floor tiles are rendered via Phaser Tilemaps using precomputed per‑chunk grids.
- Only visible chunk cells are mounted to minimize draw overhead and memory.

#### Goal

- Render floor tiles only for chunk cells within or near the camera’s frustum.
- Mount/unmount tilemap layers as chunk cells enter/exit view to cap draw calls and memory.

#### Non‑goals (this change)

- Changing server chunk generation or layout format.

### Approach

- Keep existing `chunks` and `chunkLayout` inputs.
- Compute chunk cell dimensions in pixels from the first chunk (32 px grid alignment maintained).
- Maintain a visibility window in chunk space based on camera view plus a 1‑cell padding.
- For each visible cell: create a Tilemap and a single floor layer populated from the prepared grid.
- When a cell leaves the window, destroy its layer and associated Tilemap.

### Data structures

- `chunkMap: Map<string, Chunk>`: chunkName → chunk definition.
- `cellSizePx: { w: number; h: number }`: derived from first chunk (width×32, height×32) or explicit effective floor dims.
- `visibleCells: Set<string>`: currently visible chunk cell keys (`"cx,cy"`).
- `activeTilemaps: Map<string, { map: Tilemap; layer: TilemapLayer }>`: keyed by `cellKey`.

### API changes

- EnvironmentSystem
  - `renderChunkFloors(chunks, chunkLayout)` initializes chunk state and precomputes per‑chunk tile grids.
  - `updateVisibleFloors(camera)` computes camera window and mounts/unmounts tilemap layers.
  - `destroyFloors()` cleans up active tilemaps on scene change.
- GameScene
  - After receiving chunks/layout, call `environmentSystem.renderChunkFloors(...)` once.
  - Call `environmentSystem.updateVisibleFloors(this.cameras.main)` on camera updates (tile/chunk crossing) or throttled in `update()`.

### Computation details

- Derive cell size:
  - `cellW = firstChunk.width * 32`, `cellH = firstChunk.height * 32`.
  - If using effective halved dimension (as current floors do), apply the same factor consistently.
- Camera → chunk window:
  - `cx0 = clamp(0, floor(view.x / cellW))`, `cy0 = clamp(0, floor(view.y / cellH))`
  - `cx1 = clamp(maxX, floor((view.right - 1) / cellW))`, `cy1 = clamp(maxY, floor((view.bottom - 1) / cellH))`
  - Expand by ±1 cell padding.
- Mounting per cell:
  - Lookup source chunk by `layout.chunkName`.
  - Use precomputed grid to fill a `StaticTilemapLayer` at the cell’s world offset.
- Unmounting per cell:
  - Destroy the layer and Tilemap; delete key from `activeTilemaps`.

### Files to change

- `apps/client/src/game/systems/EnvironmentSystem.ts`
  - Tilemap‑only implementation; no blitters.
  - `chunkMap`, `cellSizePx`, `visibleCells`, `activeTilemaps`, `preparedChunkGrids` fields.
  - Ensure integer positioning and 32 px grid alignment.
- `apps/client/src/game/GameScene.ts`
  - After data arrives, call `environmentSystem.renderChunkFloors(...)`.
  - On camera movement (via `cameraupdate` or in `update()`), call `updateVisibleFloors` when chunk window changes; throttle to ≤10 Hz.
- `apps/client/src/app/initPhaser.ts`
  - Leave current calls to `renderChunkFloors` as initialization; add/update camera wiring if not present in `GameScene`.

### Step‑by‑step

1. EnvironmentSystem: store input (`chunks`, `layout`), build `chunkMap`, compute `cellSizePx`.
2. Implement `updateVisibleFloors(camera)` to compute desired chunk window and diff against `visibleCells`.
3. Mount newly visible cells: create tilemaps/layers and populate from grid.
4. Unmount cells that left view: destroy layers/maps and clean caches.
5. Wire `GameScene` camera updates to call `updateVisibleFloors` on chunk‑crossing.
6. Test on large maps and adjust padding, throttling, and asset filters.

### Acceptance criteria

- Only visible (and padded) chunk cells have floor tilemap layers alive at any time.
- Panning across large maps does not accumulate tilemaps; memory remains stable.
- No visible gaps or misalignment at cell boundaries; tiles remain grid‑aligned at various zooms.
- Frame time remains stable during traversal; mounting/unmounting is amortized and throttled.

### Risks & mitigations

- Pop‑in at cell edges → add ±1 cell padding and/or fade-in (optional later).
- Asset overdraw or seams → integer positions and 1 px tolerance where needed.
- Large first frame when entering a new area → optionally spread mounting over a few frames.
