### Generate Floor Tileset (floors.png) — Implementation Plan

#### Goals

- Programmatically produce a compact floor tileset image and a TypeScript mapping from the floor assets actually used by a chunk set (e.g., `data/chunks-dungeon.ts`).
- Output artifacts for Phaser Tilemaps:
  - `apps/client/public/sprites/tiles/floors.png` (atlas of 32×32 tiles)
  - `apps/client/src/data/floor-tileset.ts` (mapping `assetId -> tileIndex`, plus 2×2 metadata)

#### Non‑goals

- Switching rendering to Tilemaps immediately (this just prepares the assets/mapping).
- Packing non-floor assets.

### Script

- Path: `scripts/generate-floor-tileset.ts`
- Language: TypeScript (run via `tsx`)
- Library: `sharp` for image composition (devDependency at repo root)

### CLI

- Command examples:

```bash
pnpm dlx tsx scripts/generate-floor-tileset.ts --chunk-set dungeon
pnpm dlx tsx scripts/generate-floor-tileset.ts --chunk-set grass --tile-size 32 --max-width 2048 \
  --out-image apps/client/public/sprites/tiles/floors.png \
  --out-ts apps/client/src/data/floor-tileset.ts
```

- Flags (with defaults):
  - `--chunk-set`: `dungeon | grass | staging | cyberkawaii | custom:<path>` (default: `dungeon`)
  - `--tile-size`: `32` (base tile size in px)
  - `--max-width`: `2048` (atlas width cap; columns = floor(maxWidth / tileSize))
  - `--out-image`: `apps/client/public/sprites/tiles/floors.png`
  - `--out-ts`: `apps/client/src/data/floor-tileset.ts`

### Inputs and discovery

- Import `CHUNKS` from `data/chunks-<set>.ts` (or a custom path for `custom:<path>`).
- Collect unique floor assets: `asset.category === 'floors'`.
- Resolve sprite paths to files under `apps/client/public/sprites/env/${asset.sprite}`.
- Validate files exist; warn and skip missing ones.

### Tile normalization

- Supported sprite sizes:
  - 32×32 → one tile
  - 64×64 → split into four 32×32 tiles (order: top-left, top-right, bottom-left, bottom-right)
- Any size not divisible by 32 → fail or skip with error (configurable flag `--skip-invalid`).

### Atlas packing

- Deduplicate by source file path (avoid duplicating the same sprite referenced by multiple chunks).
- Sort deterministically (by `assetId`, then by file path) to stabilize tile indices across runs.
- Compute columns: `cols = Math.max(1, Math.floor(maxWidth / tileSize))`; rows derive from total tiles needed (64px generates 4 tiles).
- Use `sharp` composites to build a single RGBA atlas with tiles placed on a strict 32 px grid.

### Generated mapping (`floor-tileset.ts`)

- Header: AUTO-GENERATED comment with instructions to re-run the script.
- Exports:
  - `export const FLOOR_TILESET = { imageKey, imagePath, tileSize, tiles, multiTile }` where
    - `tiles: Record<string, number>` maps `assetId` (32×32) to `tileIndex`.
    - `multiTile: Record<string, { topLeft: number; topRight: number; bottomLeft: number; bottomRight: number }>` for 64×64.
  - Helper functions:
    - `getTileIndex(assetId: string): number | undefined`
    - `getMultiTileIndices(assetId: string)` → `{ tl, tr, bl, br } | undefined`

### Algorithm (step‑by‑step)

1. Parse flags; resolve `chunkSetPath`.
2. Load `CHUNKS` and scan all `assets` where `category === 'floors'`.
3. Resolve sprite file paths; load metadata via `sharp().metadata()`.
4. Normalize each asset into one or four 32×32 tiles; enqueue composites; build index map(s).
5. Compute atlas dimensions; create base `sharp` canvas; apply composites in order.
6. Write `floors.png` to `--out-image` path; ensure directory exists.
7. Emit `floor-tileset.ts` with stable indices and helper APIs.
8. Log summary (tile count, multi-tiles, skipped assets).

### Integration

- Add script to `package.json` (root):

```json
{
  "scripts": {
    "generate:floors": "tsx scripts/generate-floor-tileset.ts --chunk-set dungeon"
  }
}
```

- Keep separate from `generate:shared` initially; optionally chain later if desired.
- Asset loading: since `floors.png` is in `public`, Phaser can use `imageKey = 'floors'` with `imagePath` as `/sprites/tiles/floors.png`.

### Validation & tests

- Verify every `asset.category==='floors'` has a mapping entry; report missing.
- Ensure atlas dimensions obey `--max-width` and indices remain stable across runs.
- Spot-check 64×64 assets: their four indices tile correctly in a 2×2 block.

### Risks & mitigations

- Mismatched sprite sizes → enforce strict 32/64 px or configurable skip.
- Duplicate `assetId` pointing to different files → warn and pick first occurrence deterministically.
- Git churn due to reordering → deterministic sort by `assetId` and file path.

### Follow‑ups (optional)

- Add `--layout-json <path>` to generate an atlas from a specific chunk layout snapshot.
- Post-process atlas PNG with a lossless optimizer.
- Pool tilemaps: precompute per-chunk tile index arrays from `CHUNKS` alongside the mapping to avoid per-mount work.

### Acceptance criteria

- `floors.png` and `floor-tileset.ts` generated deterministically for a chosen chunk set.
- All used floor `assetId`s present in mapping; 64×64 handled as 2×2.
- Script logs a clear summary and fails with actionable messages on invalid inputs.
