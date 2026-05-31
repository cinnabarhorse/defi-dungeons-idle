### Goal

- Add a file selector in `apps/client/src/app/map-editor/page.tsx` that lists all files in `data/maps/`.
- Upon selecting a file, list all chunks from that file; clicking a chunk loads it into the editor.
- The existing Export flow gains a “Save to file” action that writes the edited chunk back into the selected file.
- Update code references that previously imported `@chunks.ts` and other chunk files to the new `maps/[chunk_name]` organization.

### High-level approach

- Introduce server endpoints (Next.js App Router API routes) to:
  - Enumerate files under `data/maps/`.
  - Read and parse chunks from a specific file.
  - Persist an updated chunk back to a file (replace by `name`, add if missing).
- Extend the Map Editor UI with a Maps pane (file select + chunk list) and wire it to the API.
- Reuse tolerant parsers to handle TS-ish data files (comments, trailing commas, exports) similarly to current editor’s import logic.
- Migrate old imports to the new structure with minimal churn; prefer a small loader utility over sprinkling `fs` or direct imports across the codebase.

### Server API (Next.js App Router)

- Base: `apps/client/src/app/api/maps/`
  - GET `/api/maps` → list files
    - Returns `{ files: Array<{ file: string; title: string; chunkCount?: number }> }` (fast path returns only file names; chunkCount is optional and may be deferred).
  - GET `/api/maps/[file]` → list chunks in file
    - Returns `{ file: string; varName?: string; chunks: Array<{ name: string; width: number; height: number; type?: string }> }` (metadata only; no full assets by default).
    - Optional `?full=1` returns full chunks to avoid a second call when loading.
  - GET `/api/maps/[file]/chunk` (query `name`)
    - Returns `{ chunk: MapCluster }` for a single chunk by `name`.
  - PUT `/api/maps/[file]/chunk` (body `{ chunk: MapCluster }`)
    - Replaces (by `chunk.name`) or appends in the array; writes back to TS file.
    - Response: `{ ok: true, updated: boolean }`.

Notes:

- The API reads/writes absolute path: `${WORKSPACE_ROOT}/data/maps` to avoid CWD ambiguity.
- Write operations re-serialize to a consistent TS module form: `export const CHUNKS_<FILENAME> = [ ... ];` with 2-space indentation, preserving array order by chunk `name`.
- If the original file’s export identifier is detectable, we preserve it; otherwise we default to `export const CHUNKS = [...]`.

### Parsing/writing details (server-side)

- Parsing:
  - Reuse a tolerant parser akin to the editor’s `stripJsLikeWrapper` + `parseJsonOrObjectLiteral` to accept:
    - Leading `export const X =` or `export default` wrappers
    - Unquoted keys, single quotes
    - Comments and trailing commas
  - Attempt to extract the RHS array assigned to the top-level export; if direct parsing fails, extract the first top-level array literal via a regex fallback.
  - Support simple helpers if present by pre-expansion (e.g., `...fillRange(...)`) when feasible. If helpers are present and cannot be expanded, the API responds with a clear 400 explaining unsupported helpers for saving, but still allows read-only list mode.
- Writing:
  - Render to TS with a stable header: `export const <VAR_NAME> = [\n  {...},\n];\n`
  - Sort chunks by `name` for determinism (unless the file already had a known order and we preserved it during parse).
  - Two-space indentation, unix newlines.

### Client UI updates (Map Editor)

- State additions:
  - `selectedMapFile: string | null`
  - `availableMapFiles: string[]`
  - `selectedChunkName: string | null`
  - `availableChunks: Array<{ name: string; width: number; height: number; type?: string }>`
- UI placements:
  - In the left sidebar, add a new “Maps” section above “Map Information”.
    - Dropdown (or list) for files (from `/api/maps`).
    - Below it, a list of chunk entries for the selected file; clicking loads.
  - When a chunk is clicked:
    - Fetch `/api/maps/[file]/chunk?name=...` (or use `full=1` from the file GET) and pass the chunk to `importMap(JSON.stringify(chunk))`.
    - Set `mapName` to selected chunk’s `name` to keep “Save” targeting consistent.
- Save/export integration:
  - In the Export dialog, add a primary button “Save to file”.
    - Disabled until `selectedMapFile` and a `mapName` are present.
    - On click: build the `MapCluster` from current editor state (already done for JSON export), then PUT to `/api/maps/[file]/chunk`.
    - On success: toast + refresh chunk list for that file to reflect any dimension/type changes.

### Migration of old references

- Identify usage of legacy files like:
  - `apps/client/src/data/chunks.ts`
  - `apps/client/src/data/chunks-*.ts`
  - `apps/server/src/data/chunks-*.ts`
  - `data/chunks-*.ts` (shared scripts)
- Replace with one of:
  - A new loader utility (client-friendly): `apps/client/src/data/maps-loader.ts` that calls the API to fetch runtime chunks instead of static imports, where feasible.
  - For server-only modules (generation, simulation), add a local `fs`-based loader `apps/server/src/data/maps-loader.ts` reading from `${ROOT}/data/maps/`.
- Update call sites to reference `maps/[chunk_name]` semantics (by `file` + `name`) instead of monolithic `@chunks.ts`.
- For any script under `scripts/` that previously imported chunk TS directly, add a small helper that reads and parses from `data/maps/*.ts` using the same tolerant parser to keep behavior consistent.

### Edge cases and constraints

- Vercel/edge deployments: file writes won’t persist; saving should be considered a local/dev or self-hosted feature. The UI will show a warning if the PUT request responds with an environment-not-supported code.
- Mixed-format files with helpers (`floor()`, `wall()`, `fillRange*()`): reading may work; saving will only be allowed for files represented as plain arrays of chunk objects.
- Chunk identity is `chunk.name` (string). If `name` changes in the editor, save will update/replace by the new name; if the old name must be preserved, we’ll treat that as a rename (remove old, insert new).

### Testing plan

- API
  - List files returns expected set for a seeded `data/maps/` directory.
  - Read file returns chunk metadata; `full=1` returns arrays with assets.
  - Save updates an existing chunk and appends when missing; re-read reflects change.
- UI
  - Selecting file → loads chunk list.
  - Selecting chunk → renders in canvas via existing import flow.
  - Editing and Save → PUT succeeds; list refresh shows updated dimensions/type.
  - Export JSON still works as before (download/copy), independent of Save.

### Acceptance criteria

- Files in `data/maps/` are discoverable and their chunks are selectable from the editor.
- Clicking a chunk loads it into the editor without manual copy/paste.
- “Save to file” writes the edited chunk back to the correct file.
- Legacy references are updated or routed through loader utilities to the new structure.
- No client-side FS access; server routes handle IO. UI remains responsive and typed.
