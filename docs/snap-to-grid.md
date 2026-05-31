## Snap-to-grid for Map Editor (design)

### Goals

- **Snap ON (default)**: placement locked to the tile grid (current behavior).
- **Snap OFF**: allow free (pixel) placement for appropriate assets without breaking chunk system or gameplay logic.

### Editor behavior (page.tsx)

- **Toggle**: add `snapToGrid` boolean UI control (default true).
- **Placement**:
  - When `snapToGrid` is true, keep existing quantized tile placement.
  - When `snapToGrid` is false, support pixel placement for decorative/overlay assets (those with `allowOverlap === true` or `renderLayer === 'overlay'`).
  - For gameplay-critical assets (floors, obstacles requiring collision, enemies, spawn points), always snap to grid regardless of toggle. This preserves pathfinding, collisions, and chunk semantics.
- **Preview and draw**: if an asset has an offset, render at `x * cellSize + offsetX`, `y * cellSize + offsetY` using its actual pixel `width/height`.
- **Hit-testing**:
  - Grid assets: unchanged (cell-based).
  - Pixel-placed overlay assets: use pixel bounds for hit-testing when removing/selecting.
- **Fill/rotate/flip**: `Fill Map` remains grid-only. Rotation/flip apply on the sprite after offsets.

### Data model and JSON (backward compatible)

- Extend `PlacedAsset` and exported JSON with optional fields:
  - `positionMode`: `'grid' | 'pixel'` (omit or `'grid'` for today’s behavior)
  - `offsetX?: number` (0..cellSize-1)
  - `offsetY?: number` (0..cellSize-1)
- Keep existing `x`/`y` as tile anchors for chunking. Free placement becomes: `px = x*cellSize + offsetX`, `py = y*cellSize + offsetY`.
- Continue storing `width`/`height` in pixels (already present) and `allowOverlap`.

Example (exported asset entry):

```json
{
  "id": "special_firebowl_123",
  "assetId": "special:fire_bowl",
  "x": 10,
  "y": 7,
  "sprite": "special/FIRE_BOWL.png",
  "animated": true,
  "category": "special",
  "allowOverlap": true,
  "positionMode": "pixel",
  "offsetX": 6,
  "offsetY": 12,
  "width": 64,
  "height": 64
}
```

### Chunks compatibility

- Keeping `x`/`y` as tile anchors preserves chunk partitioning, streaming, and deterministic placement.
- Pixel offsets are purely visual for overlay/decor and do not impact collision/pathfinding.
- Floors/obstacles/enemies/spawns remain grid-aligned; no schema change required for those.

### Import/export in GameScene.ts

- **No redo needed.**
  - Dynamic sprite mapping is based on `assetId`/`sprite`; unchanged.
  - Chunk asset iteration remains the same.
  - Only the renderer that places environment sprites needs to apply `offsetX/offsetY` when present for overlay assets.
- Optional enhancement: if the environment system currently places all env sprites at `x*32, y*32`, add a small adjustment to read `offsetX/offsetY` for `allowOverlap === true` or `renderLayer === 'overlay'` assets.
- Collision and server-side logic stay tile-based; overlay offsets do not change gameplay.

### Implementation notes (editor)

- Add `snapToGrid` state + toggle UI.
- On pointer placement:
  - If grid or non-overlay asset: compute `x = floor(px/cellSize)`, `y = floor(py/cellSize)`, clear offsets.
  - If free and overlay: compute `x,y` as above, then set `offsetX = px - x*cellSize`, `offsetY = py - y*cellSize`, and set `positionMode = 'pixel'`.
- `drawCanvas`: add `+ offsetX/offsetY` when present; border/hitboxes use pixel bounds for offset assets.
- `exportMap`/`importMap`: pass through the optional `positionMode` and offsets; default to grid when absent.

### Guardrails

- Never allow non-overlay, collision-relevant assets to be exported with `positionMode = 'pixel'`.
- Keep `Fill Map` and floor painting strictly grid-based to prevent visual seams.

### Future options

- Add per-asset toggle to permit pixel placement even when global `snapToGrid` is on (for fine-tuning decor).
- Consider `offsetX/offsetY` range beyond a single tile if needed for larger sprites; today’s definition is sufficient for tile-anchored placement.
