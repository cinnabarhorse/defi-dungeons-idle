### Phaser Tilemap Floors — Implementation Spec

#### Assumptions

- `apps/client/public/sprites/tiles/floors.png` exists and contains a packed 32×32 floor tileset.
- `apps/client/src/data/floor-tileset.ts` exports `FLOOR_TILESET` with `imageKey`, `imagePath`, `tileSize`, `tiles`, `multiTile`, and helpers `getTileIndex`/`getMultiTileIndices`.
- Current floor virtualization (chunk window mount/unmount) in `EnvironmentSystem` is in place.

#### Goals

- Use Phaser Tilemaps for better batching, built-in culling, and simpler multi-tile support (blitters removed).
- Preserve existing chunk-based virtualization and world alignment.

#### Non-goals

- Converting non-floor entities to tilemaps.
- Changing server-side chunk format.

### Design

- Use one `StaticTilemapLayer` per visible chunk cell (best performance for static floors).
- Precompute per-chunk tile index grids at initialization to eliminate per-mount work.
- Maintain existing `visibleCells` window logic; on enter → create tilemap/layer; on exit → destroy.

### Loading

- Ensure the tileset image is loaded once with key `FLOOR_TILESET.imageKey` and path `FLOOR_TILESET.imagePath` in the scene preload (or early in `initPhaser`).
- Confirm `pixelArt: true` in Phaser config and optionally `roundPixels = true` on the main camera to avoid seams.

### EnvironmentSystem changes (`apps/client/src/game/systems/EnvironmentSystem.ts`)

- Config flag: `FLOOR_TILEMAPS_ENABLED` (default true after testing).
- New fields:
  - `preparedChunkGrids: Map<string, { wTiles: number; hTiles: number; data: Int32Array }>` where `data.length === wTiles * hTiles`, row-major.
  - `activeTilemaps: Map<string, { map: Phaser.Tilemaps.Tilemap; layer: Phaser.Tilemaps.StaticTilemapLayer }>` keyed by `cellKey`.

- Init (inside `renderChunkFloors`):
  1. Build `chunkMap` as today.
  2. For each chunk, compute `wTiles`, `hTiles` using 32 px base grid and allocate `Int32Array(wTiles * hTiles)` filled with `-1`.
  3. For every floor asset:
     - Resolve `assetId` to tile index using `FLOOR_TILESET`:
       - 32×32: `data[ty * wTiles + tx] = tileIndex`.
       - 64×64: write the 2×2 block using `multiTile` indices (`tl,tr,bl,br`) at `(tx,ty) .. (tx+1,ty+1)`.
     - Ignore out-of-bounds or missing mapping with a warning.
  4. Store `{ wTiles, hTiles, data }` in `preparedChunkGrids` with key `chunk.name`.

- Mount (inside `mountCellFloors`):
  - Lookup layout’s `chunkName` → `preparedChunkGrids.get(chunkName)`.
  - Create a tilemap: `const map = scene.make.tilemap({ tileWidth: 32, tileHeight: 32, width: wTiles, height: hTiles });`
  - Add tileset: `const tileset = map.addTilesetImage(FLOOR_TILESET.imageKey, undefined, 32, 32, 0, 0);`
  - Create blank layer: `const layer = map.createBlankLayer('floors', tileset, offsetX, offsetY).setDepth(1);`
  - Populate:
    - Either loop and call `layer.putTileAt(tileIndex, x, y)` where `tileIndex >= 0`.
    - Or build a `number[][]` matrix and call `layer.putTilesAt(matrix, 0, 0)` (slightly fewer calls, trade clarity vs perf).
  - Culling: `layer.setCullPadding(1, 1)` to reduce edge pop-in.
  - Cache in `activeTilemaps.set(cellKey, { map, layer })`.

- Unmount (inside `unmountCellFloors`):
  - Retrieve `activeTilemaps.get(cellKey)`; `layer.destroy()` then `map.destroy()`; delete entry.

- Update visible window (`updateVisibleFloors`):
  - Unchanged logic; mount/unmount tilemaps per window diff.

### GameScene changes (`apps/client/src/game/GameScene.ts`)

- Preload tileset image once per scene startup (if not preloaded globally):
  - `this.load.image(FLOOR_TILESET.imageKey, FLOOR_TILESET.imagePath);`
- Keep existing calls to `environmentSystem.renderChunkFloors` and `updateVisibleFloors`.

### Performance considerations

- Prefer `StaticTilemapLayer` for static floors (no per-tile updates); switch to `DynamicTilemapLayer` only if runtime edits are required.
- Optional pooling: maintain a small pool of `{ map, layer }` of the same `wTiles × hTiles` to reduce GC churn on rapid panning.
- Ensure integer world positions and consistent 32 px grid to avoid subpixel seams.

### Testing

- Visual correctness: edges between cells, multi-tile (64×64) assets align without gaps; verify with multiple zoom levels.
- Performance: monitor draw calls and FPS while sprinting across large maps.
- Memory: confirm mount/unmount frees tilemap resources; no leaks in `activeTilemaps`.

### Acceptance criteria

- Floors render via tilemaps; no blitter fallback.
- Only visible (padded) cells have live tilemap layers; mount/unmount behaves smoothly.
- No visible seams at chunk boundaries; multi-tile assets are placed correctly.
- No regressions in FPS on large maps; reduced draw overhead vs blitters.

### Risks & mitigations

- Sprite-to-tile mapping gaps → script and init warn loudly; skip unknowns.
- Seams/pop-in at edges → `roundPixels`, `setCullPadding(1,1)`, and ±1 cell window padding.
- Large mount spikes when entering new regions → optionally spread mounting across frames or pre-warm next window.
