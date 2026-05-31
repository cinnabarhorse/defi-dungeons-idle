## Body + Port Stamps Authoring for Dungeon Chunks

### Objective

- **Eliminate duplication** in dungeon chunks by separating a reusable room/corridor body from **small, oriented port connector stamps** placed along edges at build time.
- Keep the runtime format unchanged: the `CHUNKS` array is generated from blueprints at request time and consumed via API; there is no longer a generated TS map file.

### Current state (relevant touchpoints)

- `MapGenerator` consumes the `Chunk` shape and already understands optional `meta.ports` and orientation.
  - Interfaces with ports today:
    - `Chunk.meta.ports?: ChunkPort[]` with `side`, `centerOffsetTiles`, `widthTiles`.
    - Port inference exists as a fallback.
- Authoring lives in `data/maps/bodies`, `data/maps/stamps`, and `data/maps/blueprints`; the server and editor consume blueprint-generated chunks via API.
- The map editor already exposes a basic Ports editor for a chunk.
- `scripts/compress-dungeon-chunks.ts` exists to normalize walls/floors but doesn’t address structural duplication.

### Implementation checklist (step-by-step)

- [ ] Create types and scaffolding
  - [ ] Add `data/maps/bodies/` with `room-base.ts`, `connector-base.ts` exporting `BodyRecipe` objects.
  - [ ] Add `data/maps/stamps/port-stamps.ts` with `PortStamp[]` and orientation transform utilities.
  - [ ] Add `data/maps/blueprints/` with room and connector blueprints exporting `ChunkBlueprint[]`.
  - [ ] Add `data/maps/authoring-types.ts` for shared authoring interfaces used by the generator.

- [ ] Implement generator
  - [ ] Create `scripts/generate-chunks-from-blueprints.ts` that:
    - [ ] Loads BodyRecipes, PortStamps, and ChunkBlueprints.
    - [ ] Emits floors/details from body in correct order.
    - [ ] Computes perimeter wall segments with port windows subtracted.
    - [ ] Applies oriented port stamps only when allowed by a variant's `stampPolicy` (see policy below). Default: rooms stamp only on the default room variant; connectors never stamp.
    - [ ] Emits `port_marker`s just outside bounds per side.
    - [ ] Returns chunks in the existing `CHUNKS`-compatible shape via API.
  - [ ] Wire into `scripts/generate-shared-files.ts` or add `pnpm generate:chunks` and call it from shared generation.

- [ ] Author bodies and stamps
  - [ ] Extract `room-base` interior from an existing enemy-room variant.
  - [ ] Extract `connector-base` corridor body (shared for H/V).
- [ ] Encode canonical `PortStamp` from the screenshot with precise tile coordinates relative to edge center (`cyberkawaii-port`).
  - [ ] Verify z-order groups: floors → details → walls → stamp overlays → specials.
  - [ ] Confirm stamp footprint derives window width by orientation (north-facing is 8×6; rotate for E/W/S).

- [ ] Define blueprints and variants
  - [ ] Rooms: N, S, E, W; N-S; W-E; corners NE/NW/SE/SW; all-sides.
  - [ ] Connectors: horizontal (W-E) and vertical (N-S).
  - [ ] Ensure `meta.ports` and `meta.orientation` are set where appropriate.
  - [ ] For rooms, set `stampPolicy: 'defaultOnly'` and mark the specific default room variant (e.g., `enemy-room-default`) as the one that receives stamps. All other room variants: `stampPolicy: 'none'`.
  - [ ] For connectors, always set `stampPolicy: 'none'`.

- [ ] Validate output
  - [ ] Generate and open in map editor; verify seams/markers.
  - [ ] Compare against a few existing manual chunks for parity.
  - [ ] Adjust stamp offsets/window math as needed.

- [ ] Migrate and clean up
  - [ ] Remove the legacy `data/maps/chunks-dungeon.ts` file and all references.
  - [ ] Remove hand-authored `port_marker`s from source; keep in generated output.
  - [ ] Retire dungeon usage of `scripts/compress-dungeon-chunks.ts`.
  - [ ] In `MapGenerator`, prefer explicit `meta.ports`; keep `inferPorts` as fallback.

- [ ] Rollout
  - [ ] Phase 0: land generator and sources; keep current chunks for comparison.
  - [ ] Phase 1: switch shared generation to blueprint generator; add snapshot/visual checks.
  - [ ] Phase 2: remove legacy manual duplication once parity is confirmed.

### Proposed architecture

- **BodyRecipe**
  - A canonical, reusable definition of the “interior” look: floors, details, trim, and four wall lines around the perimeter.
  - Walls are defined as four continuous segments that can accept “windows” (gaps) for ports. No destructive removal; we generate wall segments that already exclude port windows.

- **PortStamp**
  - A small cluster of tiles forming the connector mouth and blending trim. Authored once in canonical orientation (e.g., north), then oriented to `N/S/E/W` using rotation/flip rules.
  - Contains:
    - A local, small tile grid relative to an edge-center anchor.
    - Asset placement order groups to preserve visuals: floors → details → walls → overlays → specials.
    - `wallCutStrategy` describing how to cut the perimeter wall line for this port.
    - `footprint` of the canonical north-facing stamp in tiles (e.g., 8×6 for cyberkawaii). Width is rotated with orientation and used as `window width` if a port omits `widthTiles`.

- **ChunkBlueprint**
  - High-level description that composes a `BodyRecipe` with one or more ports.
  - Produces one or more named output chunks by varying the `PortWindow[]` set, mirroring our current variants (`enemy-room-north-south`, `enemy-room-west-east`, etc.).
  - Per-variant `stampPolicy`: `'none' | 'defaultOnly' | 'all'`. v1 rule: rooms → `defaultOnly` (stamps only on the default room variant); connectors → `none`.

### Stamp placement policy (critical)

- **Goal**: Port stamps should only appear on the default room chunk, never on connectors or non-default room variants.
- **Policy**:
  - Rooms: `stampPolicy: 'defaultOnly'`. The generator identifies a single variant per room blueprint as the "default room" (e.g., `enemy-room-default`) and applies stamps only there. All other room variants get wall windows (gaps) but no port overlays.
  - Connectors: `stampPolicy: 'none'`. Connectors only get wall windows where necessary; no stamps.
- **Markers**: `port_marker` assets are for debugging/authoring alignment. They are excluded by default in production output; enable only with a `--debug-markers` flag during generation.

### Data flow (build time)

1. Define `BodyRecipe` and `PortStamp` library.
2. For each `ChunkBlueprint`, specify the `PortWindow[]`:
   - `side: 'N'|'S'|'E'|'W'`, `centerOffsetTiles`, `widthTiles`, optional `stampId` override.
3. Generator assembles assets:
   - Emit floors/details from the `BodyRecipe`.
   - Compute wall segments for each side by subtracting port windows (0–2 segments per side).
   - For each port, apply the oriented `PortStamp` at the edge-center anchor and, if desired, place a `port_marker` just outside bounds.
4. Output named chunks as plain objects and serve via API (`/api/maps/generated/dungeon`).

### File and module changes

- New authoring modules (TypeScript, colocated under `data/maps/`):
  - `data/maps/bodies/room-base.ts` — exports `BodyRecipe` for enemy rooms (40×40 assumed initially).
  - `data/maps/bodies/connector-base.ts` — corridor body for horizontal/vertical connectors.
  - `data/maps/stamps/port-stamps.ts` — exports the canonical port stamp(s) and orientation transformer.
  - `data/maps/blueprints/*.ts` — exports `ChunkBlueprint[]` with combinations of ports per variant.

- New generator script:
  - `scripts/generate-chunks-from-blueprints.ts`
    - Reads the Body/Stamp/Blueprint modules.
    - Renders final assets arrays, preserving the strict ordering used today.
    - Writes `data/maps/chunks-dungeon.ts` with the existing `CHUNKS` shape.
    - Invoked from `generate-shared-files.ts` or as its own npm script (`pnpm generate:chunks`).

- Optional editor updates (deferred if we want a minimal first pass):
  - In `apps/client/src/app/map-editor/page.tsx`, add a “Stamp preview” layer and an “Apply port stamp” toggle when editing ports. This is purely UX; the generator does the heavy lifting.

### Types (conceptual)

```ts
// Not an implementation; documents intent
export interface BodyRecipe {
  name: string;
  size: { width: number; height: number };
  floors: ChunkAsset[]; // base interior
  details?: ChunkAsset[]; // sprinkles
}

export interface PortWindow {
  side: 'N' | 'S' | 'E' | 'W';
  centerOffsetTiles: number;
  widthTiles?: number; // optional; derive from stamp by orientation if omitted
  stampId?: string; // override the default connector stamp if needed
}

export interface PortStamp {
  id: string;
  // Small relative assets, anchored at (0, 0) = edge center
  localAssets: ChunkAsset[];
  wallCutStrategy: 'rectangle'; // first pass
  footprint: { width: number; height: number }; // canonical north-facing footprint (e.g., 8×6)
}

export interface ChunkBlueprint {
  name: string; // outputs one or more chunks
  bodyId: string; // reference a BodyRecipe
  defaultStampId: string; // e.g., grass/dungeon connector look
  variants: Array<{
    name: string; // e.g., enemy-room-north-south
    ports: PortWindow[]; // one or more ports per side
    meta?: Chunk['meta']; // copy through to output
    decorations?: ChunkAsset[]; // pillars/spawnpoints etc.
    stampPolicy?: 'none' | 'defaultOnly' | 'all';
  }>;
}
```

### Assembly rules

- **Ordering:** floors → details → perimeter walls (with gaps) → port stamp overlays → specials (spawn, markers).
- **Wall subtraction:** Given `PortWindow`, compute the window extents and split the side’s wall line into up to two segments; never remove after the fact.
- **Orientation:** apply a rotation/flip transform to `PortStamp.localAssets` so the same stamp works for N/S/E/W.
- **Markers:** by default place `port_marker` at `(-1, y)` for `W`, `(width, y)` for `E`, `(x, -1)` for `N`, `(x, height)` for `S`.
  - In production builds, markers are disabled. In debug mode, markers are emitted to help visually verify alignment.
- **Deterministic variety (optional):** stamps may expose multiple sprite ids; pick by stable hash of chunk name for micro-variation.

### Runtime changes

- Minimal. `MapGenerator` keeps consuming the same `CHUNKS` shape.
- Keep `inferPorts` as a safe fallback, but generated chunks will already have `meta.ports` populated. We should prefer explicit `meta.ports` when present.

### Migration plan

1. Extract the shared “enemy room” interior into `BodyRecipe` and verify visual parity for a no-port, closed-room render.
2. Encode the canonical port stamp from the screenshot (8×6 north-facing footprint) as `PortStamp` `cyberkawaii-port`.
3. Implement wall-window math in the generator (rectangle gaps only in v1).
4. Recreate today’s variants as `ChunkBlueprint.variants`:
   - `enemy-room-north`, `enemy-room-south`, `enemy-room-west`, `enemy-room-east`.
   - `enemy-room-north-south`, `enemy-room-west-east`, `enemy-room-all-sides`.
   - `enemy-room-north-east`, `enemy-room-north-west`, `enemy-room-south-east`, `enemy-room-south-west`.
   - `connector-horizontal`, `connector-vertical` from a `connector-base` body.
5. Generate and compare: open the map editor, spot-check visuals, and verify all current `port_marker` positions match the previous authored ones.
6. Swap CI/script to produce chunks from blueprints; remove duplicated manual assets from the source file.

### What we can roll back from the current PR

- In `data/maps/chunks-dungeon.ts`:
  - Roll back manual duplication of the same floor/trim/wall assets across the many `enemy-room-*` variants. After the generator lands, the source file will be machine-produced; we only keep bodies, stamps, and blueprints as the source of truth.
  - Remove hand-authored `port_marker` placements once the generator consistently emits markers from `PortWindow` (they will still appear in the generated output).
- In `scripts/compress-dungeon-chunks.ts`:
  - We can drop or archive the special-case normalization passes used to compress repeated floor/wall calls for dungeon chunks. The generator will already emit compact ranges. Keeping the script as a general utility is fine, but it’s no longer needed to maintain dungeon chunk parity.
- In `apps/server/src/utils/MapGenerator.ts`:
  - No rollback required for new safeguards; retain `inferPorts` as a fallback. If we added bespoke logic to detect connectors by name/orientation in this PR, we can keep it (harmless) or simplify once all generated chunks include explicit `meta.ports` and `meta.orientation`.
- In `apps/client/src/app/map-editor/page.tsx`:
  - If we introduced one-off UI to manually paste port connector tiles, we can remove that path after stamp previews exist. The existing Ports editor remains valuable.

### What the game designer needs to provide

- **Canonical port stamp spec** (per style):
  - A screenshot is helpful; we need the final tile list with coordinates relative to the edge-center anchor for the canonical orientation.
  - Confirm the stamp’s total width/height in tiles and any overhang into the room.
  - Confirm the corridor opening width in tiles (e.g., 8 tiles) and default offsets used so far.
- **Blending rules**:
  - Which tiles form the trim that must sit above floors but below specials.
  - Whether any wall caps are part of the stamp or remain in the perimeter wall.
- **Body approvals**:
  - Sign off on the `room-base` and `connector-base` looks (floors distribution, sprinkles, wall id/sprite).
- **Variant matrix**:
  - A list of chunk names and the ports each should expose (e.g., `north-south`, `west-east`, single-sides, corners, all-sides).
- **QA checklist**:
  - Acceptance screenshots for each variant; specific spots to verify seam quality; any z-ordering gotchas (e.g., pillar overlap near ports).

### Risks and mitigations

- **Exact seam alignment:** Measure stamp offsets carefully; provide a small epsilon-adjust option during orientation transforms to correct one-tile drift.
- **Multiple ports per side:** The generator supports ≥1 window per side; we’ll constrain phase 1 to one window per side unless needed.
- **Different port widths:** If stamp width ≠ window width, provide filler rules (repeat a middle strip) or define `wide`/`narrow` stamp variants.
- **Collision parity:** If walls/trim affect collision, add parallel collision markers in the stamp; verify against the current layout.

### Success criteria

- `data/maps/chunks-dungeon.ts` shrinks to generated content; human-authored sources live in small, composable modules.
- Visual parity: All existing chunk variants look identical to today’s manually-authored versions.
- Adding a new variant becomes a blueprint change only; no asset duplication.

### Rollout plan

- Phase 0: Land generator behind a script; keep current chunks side-by-side.
- Phase 1: Switch `generate-shared-files` to use the generator; compare outputs in CI/snapshot.
- Phase 2: Remove manual duplicates and retire compression for dungeon chunks.

### Designer checklist (PR readiness)

- [ ] Provide canonical `PortStamp` spec
  - [ ] Tile list with exact coordinates relative to edge-center (canonical orientation)
  - [ ] Total stamp width/height in tiles, any overhang inward
  - [ ] Layering groups for tiles: floors → details → walls → overlays → specials
  - [ ] Sprite ids/paths to use for each tile in the stamp

- [ ] Corridor opening rules
  - [ ] Default opening `widthTiles` (e.g., 8)
  - [ ] Default `centerOffsetTiles` per side (N/S/E/W)
  - [ ] Confirm marker placement just outside bounds for each side

- [ ] Body approvals
  - [ ] Approve `room-base` visuals (floors distribution, sprinkles, wall id/sprite)
  - [ ] Approve `connector-base` visuals (same criteria)

- [ ] Variant matrix
  - [ ] List of chunk variant names and their ports (e.g., N-S, W-E, corners, all-sides)
  - [ ] Orientation for connectors (H/V)
  - [ ] Any stamp overrides (`stampId`) or width differences for specific variants
  - [ ] Decorations toggles (pillars, spawn points, NPCs) per variant, if applicable

- [ ] Collision and gameplay parity
  - [ ] Confirm which tiles near ports are collidable and which are not
  - [ ] Verify spawn/pathing expectations are unchanged by port windows

- [ ] QA acceptance
  - [ ] Screenshots for each variant focusing on seam quality at edges
  - [ ] Z-order checks (stamp overlays below specials, above floors)
  - [ ] Marker visibility and exact positions

- [ ] Optional: backlog requests
  - [ ] Additional stamp styles (wide/narrow/alt art) to support later
  - [ ] Micro-variation rules for deterministic variety
