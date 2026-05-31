## Author Templates — Map Editor Integration

### Goal

- Enable visual authoring and direct editing of template sources used by the generator while preserving the generated chunks workflow. Author in the map editor; write to TS sources; click Preview to regenerate and validate.

### Scope

- Bodies: `data/maps/bodies/room-base.ts`, `data/maps/bodies/connector-base.ts`
- Stamps (oriented only): `data/maps/stamps/port-stamps.ts`
- Blueprints: `data/maps/blueprints/room-blueprints.ts`, `data/maps/blueprints/connector-blueprints.ts`
- Generator (Preview): `scripts/generate-chunks-from-blueprints.ts` → `data/maps/chunks-dungeon.ts`

### UX in map editor (`apps/client/src/app/map-editor/page.tsx`)

- Add an “Author Templates” panel with three tabs:
  - Bodies
  - Stamps
  - Blueprints
- Include a Preview (Regenerate) button to run the generator and refresh the chunk list in-editor.

### Bodies authoring (room-base, connector H/V)

- Source of truth: `BodyRecipe` with `size`, `floors`, `details`, `perimeterWalls`.
- Actions in UI:
  - Load Body → pre-fill the canvas from an existing file.
  - Save as Body → pick `room-base-40`, `connector-horizontal-40`, `connector-vertical-40`.
  - Perimeter inference → compute four edge lines from the canvas walls (reuse the logic in `extract-authoring-from-map` style).
- Server write: PUT `/api/authoring/file` with a validated serialized TS module for the target file.

### Stamps authoring (oriented-only)

- Source of truth: `PortStamp` with `oriented: { N|S|E|W → { localAssets, footprint } }` (no autorotation).
- Actions in UI:
  - Choose Stamp ID (start with `cyberkawaii-port`).
  - Per-orientation canvases (N, S, E, W); set footprint per side.
  - Save Oriented Stamp → enforce all 4 sides present.
- Server write: PUT `/api/authoring/stamp` performs structured AST-safe update of `oriented` for the given stamp ID.

### Blueprints authoring

- Source of truth: `ChunkBlueprint[]` with variant ports and optional `bodyByOrientation`.
- Actions in UI:
  - Edit room variants (ports list, `stampPolicy`, `meta.role`).
  - Edit connector family `bodyByOrientation` (H/V).
  - Optional: room `bodyByOrientation` if oriented room bodies are added later.
- Server write: PUT `/api/authoring/file` to rewrite `room-blueprints.ts` (and `connector-blueprints.ts` if changed) with validation.

### Preview (Regenerate)

- API POST `/api/authoring/generate` executes the generator and returns a status payload (elapsed time, file size, chunk count). On success, the editor refreshes the chunk summaries for `data/maps/chunks-dungeon.ts`.

### API surface (Next.js App Router, server-side)

- GET `/api/authoring/files`: list supported files and last-modified timestamps.
- GET `/api/authoring/file?key=room-base|connector-base|room-blueprints|connector-blueprints|port-stamps`: return current TS text.
- PUT `/api/authoring/file`: write a full TS file for bodies/blueprints.
  - Input: `{ key, contents }` where `key ∈ { 'room-base', 'connector-base', 'room-blueprints', 'connector-blueprints' }`.
  - Behavior: validate; create a timestamped backup; write atomically.
- PUT `/api/authoring/stamp`: structured oriented stamp update for `port-stamps.ts`.
  - Input: `{ id, oriented: { N, S, E, W } }` with footprints and assets.
  - Behavior: validate presence of all sides; update only the selected stamp’s `oriented` block.
- POST `/api/authoring/generate`: spawn the generator (`tsx`/`ts-node` or a pnpm script) and return success/errors.

### Validation & safety

- Bodies: `size` matches canvas, `perimeterWalls` present, `floors` non-empty.
- Stamps: `oriented` has N/S/E/W; footprints positive; assets have `category` and `sprite`.
- Blueprints: each variant has ports with valid `side` and numeric `centerOffsetTiles`; optional `bodyByOrientation` keys limited to `h`/`v`.
- Backups: prior to every write, create `data/maps/.backups/<file>.<YYYYMMDD-HHMMSS>.ts`.

### File map (allowed file keys → path)

- room-base → `data/maps/bodies/room-base.ts`
- connector-base → `data/maps/bodies/connector-base.ts`
- port-stamps → `data/maps/stamps/port-stamps.ts`
- room-blueprints → `data/maps/blueprints/room-blueprints.ts`
- connector-blueprints → `data/maps/blueprints/connector-blueprints.ts`

### Implementation steps (checklist)

- [x] Create API route: `apps/client/src/app/api/authoring/files/route.ts`
  - [x] Return static map of allowed keys with last-modified timestamps (fs.stat).
- [x] Create API route: `apps/client/src/app/api/authoring/file/route.ts`
  - [x] Validate `key` against allowed set and map to absolute path.
  - [x] GET: return file contents.
  - [x] PUT: validate payload; write backup; write TS atomically; return success.
- [x] Create API route: `apps/client/src/app/api/authoring/stamp/route.ts`
  - [x] Parse payload; validate N/S/E/W present with footprints.
  - [x] Update `port-stamps.ts` using AST-safe editing (e.g., ts-morph) to replace `oriented[id]`.
  - [x] Write backup; write updated file.
- [x] Create API route: `apps/client/src/app/api/authoring/generate/route.ts`
  - [x] Spawn generator (prefer `pnpm exec tsx scripts/generate-chunks-from-blueprints.ts`).
  - [x] Return elapsed time, changed file size, and chunk count.
- [x] Extend map editor UI (`page.tsx`)
  - [x] Add “Author Templates” panel with tabs: Bodies, Stamps, Blueprints.
  - [x] Bodies tab: Load Body (GET file), Save as Body (PUT file), Preview.
  - [x] Stamps tab: per-side canvases, footprints, Save Oriented Stamp (PUT stamp), Preview.
  - [x] Blueprints tab: room variants editor, connector mapping editor, Save (PUT file), Preview.
  - [x] After Preview, refresh chunk list via existing `/api/maps` endpoints.
- [x] Add backups directory: `data/maps/.backups/` (git-ignored) and ensure creator on first write.
- [x] Add pnpm script(s) at repo root
  - [x] `"generate:chunks": "tsx scripts/generate-chunks-from-blueprints.ts"` (or `ts-node` alternative).
- [ ] Smoke test flow
  - [ ] Edit stamp (N/E/S/W) → Save → Preview → verify chunk visuals/seams.
  - [ ] Edit connector body H/V → Save → Preview → verify connectors.
  - [ ] Edit room blueprint variants → Save → Preview → verify ports and walls.
- [x] Validation & error surfacing in UI (inline toasts/messages).

### Notes

- Oriented stamps are required. The generator consumes oriented assets directly (no autorotation), and uses `bodyByOrientation` for connectors/rooms when provided.
- The preview step regenerates `data/maps/chunks-dungeon.ts` which continues to be the single source consumed by client/server at runtime.
