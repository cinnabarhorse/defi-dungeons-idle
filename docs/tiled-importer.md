# Tiled Importer (TMX Slicer) — Implementation Plan

## Goal

Create a standalone page `/tiled-importer` that loads a Tiled `.tmx` (and tileset PNGs or a .zip containing them), slices only the used tiles into individual PNGs (scaled to our cell size), optionally concatenates animated frames into a horizontal strip, and downloads a ZIP with images plus a TS module exporting `AssetItem[]` and `PlacedAsset[]`. No changes to the existing map editor. Use TypeScript only [[memory:8517480]]. Add big warnings in generated TS files [[memory:8068561]]. Avoid workspace packages; inline types only [[memory:7369650]].

## Deliverables

- New page `apps/client/src/app/tiled-importer/page.tsx` (client component) with UI:
  - Inputs: TMX file, tileset images or a `.zip` with TMX+PNGs
  - Options: import name, target tile size (default 32), export-only-used tiles (on), CSV+Base64 support (CSV v1), layer→category mapping (heuristic + overrides)
  - Actions: Parse, Preview summary, Export ZIP
- Client-side ZIP containing:
  - `images/…/*.png` — per-tile 32×32 PNGs; animated tiles as `*_anim.png` strip
  - `assets.ts` — exports `AssetItem[]` referencing `images/…`
  - `placed.ts` — exports `PlacedAsset[]` with grid positions and z-index
  - `README.txt` — brief usage notes

## New files

- `apps/client/src/app/tiled-importer/page.tsx` — UI + orchestrator ("use client")
- `apps/client/src/lib/tiled/tmx.ts` — DOMParser-based TMX parsing helpers
- `apps/client/src/lib/tiled/slicer.ts` — offscreen-canvas slicing and animation strip builder
- `apps/client/src/lib/tiled/exporter.ts` — JSZip packaging + TS module emitters
- (Optional) `apps/client/src/lib/tiled/types.ts` — local helper types; reuse existing `AssetItem`/`PlacedAsset`

## Dependencies (client-side)

- JSZip for ZIP creation
- pako (optional) for base64+gzip layer decoding (phase 2)
- Use `DOMParser` for XML; no extra XML lib needed

## Minimal algorithm (v1)

1. Parse TMX

- Read TMX text via `FileReader` → `DOMParser` → document
- Extract map attrs: `tilewidth`, `tileheight`, `infinite`
- Build tileset index: for each `<tileset>` compute `{ firstgid, columns, tilecount, image src, tilewidth, tileheight, name }`
- Build animation map: `<tile id>` → ordered frames `{ tileId, duration }`

2. Collect used tiles (GIDs)

- For each `<layer>` (and `<chunk>` if `infinite="1"`):
  - Parse `<data>`: support `encoding="csv"` initially; split, parse ints
  - Decode flip flags: `H=0x80000000`, `V=0x40000000`, `D=0x20000000`; `gid0 = gid & 0x1fffffff`
  - Map `gid0` to `{ tileset, localTileId }` via `firstgid` ranges
  - Track used `{ tilesetKey, localTileId }` and record placements with `x,y,layerIndex` and flags (store only `flipX` initially)

3. Slice tiles

- Load each referenced tileset image from user input (file list or ZIP); create `ImageBitmap`/`HTMLImageElement`
- For each used local tile id:
  - Compute `sx = (id % columns) * tilewidth`, `sy = Math.floor(id / columns) * tileheight`
  - Draw `sx,sy,sw=tilewidth,sh=tileheight` to an offscreen canvas scaled to `targetTileSize` (default 32)
  - Export PNG via `canvas.toBlob()`
- For animated tiles:
  - Gather frames (unique rects); draw to a horizontal strip `width = frameCount * targetTileSize`, `height = targetTileSize`
  - Use uniform 150ms per frame v1 (ignore per-frame duration)

4. Emit assets and placements

- Asset id format: `tmx_<tilesetName>_<tileId>`
- Category mapping: heuristic by layer name (`floor|ground`→`floors`, `wall|barrier|rock`→`walls`, else `special`), with UI overrides
- `AssetItem`: `{ id, name:id, category, sprite: 'images/…png', frameCount? }`
- `PlacedAsset`: `{ id: uuid, assetId, x, y, category, zIndex: layerIdx, flipX? }` (ignore diagonal/vertical flips in v1)

5. Package ZIP

- Structure:
  - `/images/*.png` (static and `*_anim.png` strips)
  - `/assets.ts` — with header `// AUTO-GENERATED, DO NOT UPDATE` and TS-only exports [[memory:8517480]] [[memory:8068561]]
  - `/placed.ts` — same header; exports `PlacedAsset[]`
  - `/README.txt` — import instructions (copy `images/` to `apps/client/public/imports/<name>/`, place TS files under `apps/client/src/data/imports/<name>.ts`)

## UI flow (`/tiled-importer`)

- Dropzone or file inputs: `.tmx` and multiple `.png` or a single `.zip`
- Fields: import name, target tile size (32), CSV only toggle, layer→category mapping table
- Buttons: Parse → Summary (tilesets, used tiles, layers, animations) → Export ZIP
- Summary: counts of used tiles, animated tiles, total placements, missing images

## Edge cases & scope (v1)

- Encodings: CSV supported; base64(+gzip) handled next
- Flips: support `flipX` only; store on placements; ignore diagonal/vertical in v1
- Infinite maps: supported (flatten chunks)
- Multiple tilesets: supported via `firstgid` mapping
- Animations: uniform frame timing; no per-frame duration
- Missing tileset images: list and skip; export continues

## Validation steps

- Import `Dungeon1.tmx` + provided PNGs
- Verify counts match Tiled layer totals; export ZIP; extract to repo under `apps/client/public/imports/<name>/` and `apps/client/src/data/imports/<name>.ts`; manually add to palette for testing (no editor changes required in this task)

## Follow-ups (out of scope v1)

- Base64/gzip layer decoding, `flipY`/diagonal flips
- Per-frame animation durations
- Layer-based server meta (collision/port markers)
- Direct one-click integration into editor

## Notes

- All code TypeScript; no .js outputs in repo [[memory:8517480]].
- Generated TS files include the warning banner [[memory:8068561]].
- Do not import from workspace packages; inline types/utilities [[memory:7369650]].
