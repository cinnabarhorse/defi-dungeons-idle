### Viewport Fog-Of-War (Client) — Implementation Spec

#### Context

- Current client fog uses world-sized render textures (RTs) per map, which explodes VRAM and causes severe slowdowns on large maps (e.g., 400×400 tiles at 32 px per tile).
- We will switch to a single render texture sized to the camera viewport and redraw it as the camera moves, backed by an efficient discovered-tiles store.

#### Goals

- Replace world-sized fog with a viewport-sized overlay to cap memory usage and stabilize frame times.
- Maintain current fog behavior (unseen = black; discovered = visible) without changing server protocol.
- Keep the API that GameScene uses: state init + incremental reveals + per-frame/camera updates.

#### Non-goals (for this change)

- Re-introducing server-side visibility gating or changing network message shapes.
- Implementing tiled shroud caches. We can add this later if needed.

### High-level design

- Use a single screen-space `Phaser.GameObjects.RenderTexture` (“fogRT”) sized to the camera viewport; `setScrollFactor(0)` so it moves with the screen.
- Maintain a `Uint8Array` discovered bitset of size `mapWidth * mapHeight` (1 byte per tile for simplicity initially).
- When the camera moves sufficiently (tile crossing) or zoom/resize changes, redraw the fogRT by scanning only tiles in the viewport and erasing the discovered tiles.
- Incremental reveals update the bitset immediately; if the reveal intersects the viewport, either apply partial erases or mark a `needsRedraw` flag.

### Data model changes

- Replace `discoveredKeys: Set<string>` with `discovered: Uint8Array` sized to `mapWidth * mapHeight`.
  - Helpers:
    - `encodeIndex(tx, ty) => ty * mapWidth + tx`
    - `isDiscovered(tx, ty) => discovered[idx] === 1`
    - `markDiscovered(tx, ty) => (discovered[idx] = 1)`
- Keep a debug-only enumeration helper (optional) to list discovered tiles for diagnostics without storing a separate Set.

### Public API (unchanged shape)

- `applyState(payload)`
  - Stores `tileSize`, `mapWidth`, `mapHeight`, `radiusTiles`.
  - Allocates/reallocates `discovered` bitset; writes any provided `payload.discovered` into it.
  - (Re)creates the viewport `fogRT` sized to camera view; sets `needsRedraw = true`.
- `applyReveal(tiles)`
  - Marks indices in `discovered`.
  - If any tile is within current view bounds, either do a mini erase or set `needsRedraw = true`.
- `updateCamera()`
  - Computes visible tile rect from `camera.worldView` and only redraws if the camera crossed a tile, zoom changed, or `needsRedraw` is set.
- `destroy()` keeps cleaning up `fogRT` and helper graphics.
- `toggleDebug()` remains; debug visuals will be drawn in screen-space.

### Redraw algorithm (viewport)

1. Read `view = camera.worldView` and compute visible tile bounds:
   - `vx0 = max(0, floor(view.x / tileSize))`, `vy0 = max(0, floor(view.y / tileSize))`
   - `vx1 = min(mapWidth - 1, floor((view.right - 1) / tileSize))`
   - `vy1 = min(mapHeight - 1, floor((view.bottom - 1) / tileSize))`
2. Clear `fogRT` to opaque black.
3. For each tile `(tx, ty)` in the bounds:
   - If `isDiscovered(tx, ty)` then erase a rect at screen coords:
     - `sx = tx * tileSize - view.x`, `sy = ty * tileSize - view.y`
     - Erase rect `(sx, sy, tileSize, tileSize)`
4. Optional: draw a soft translucent radial gradient around the player to approximate current “temporary fog” effect.
5. Track `lastCamTx`, `lastCamTy`, `lastZoom`, and clear `needsRedraw`.

### Integration points

- `apps/client/src/game/systems/FogOfWarSystem.ts`
  - Remove world-sized RT creation in `rebuildOverlay`.
  - Introduce `fogRT` sized to the viewport; `setScrollFactor(0)`; ensure depth ordering is above world and below HUD.
  - Add/replace data model with `Uint8Array discovered`.
  - Implement `updateCamera()` and throttle calls to ≤10 Hz or only on tile-crossing.
  - Update `applyState`, `applyReveal`, `destroyOverlay`, `toggleDebug` accordingly.

- `apps/client/src/game/GameScene.ts`
  - On room join, continue to call `fogOfWarSystem.applyState(...)` and `applyReveal(...)` on events.
  - Wire camera movement to fog redraw:
    - Option A: listen to `this.cameras.main.on('cameraupdate', ...)` and call `fogOfWarSystem.updateCamera()`.
    - Option B: call `updateCamera()` from `scene.update()` with a tile-crossing check.
  - Ensure creation order keeps `fogRT` depth higher than world sprites and lower than UI/HUD.

- `apps/client/src/lib/constants.ts` (optional)
  - Add a client-only flag `FOG_VIEWPORT_MODE = true` to gate rollout.

### Step-by-step plan

1. Introduce bitset in `FogOfWarSystem` and keep world RTs (temporary) to validate correctness.
   - Add helpers for index math; write incoming discovered tiles into bitset.
   - Add a dev-only assert to validate parity between Set (if kept temporarily) and bitset in small sessions.
2. Add viewport `fogRT` creation and redraw logic (screen-space) and a `updateCamera()` method.
   - Compute viewport tile range from `camera.worldView`.
   - Redraw only on tile-crossing or zoom/resize.
3. Replace world RT path:
   - Delete world-sized RT allocations in `rebuildOverlay`.
   - Keep only `fogRT` (viewport) and helper graphics.
4. Integrate with `GameScene` camera updates.
   - Hook `cameraupdate` or `update()` to call `updateCamera()`.
   - Force an initial redraw after `applyState()` and after first spawn position.
5. QA and performance checks.
   - Verify VRAM/memory usage is stable when increasing map size.
   - Validate no seams at tile edges at various zooms (add 1 px erase padding if needed).
   - Confirm latency of incremental reveals during movement.
6. Cleanup and flagging.
   - Remove Set-based discovered store.
   - Optionally keep `FOG_VIEWPORT_MODE` flag for quick rollback.

### Files to change

- `apps/client/src/game/systems/FogOfWarSystem.ts`
  - New: `Uint8Array discovered` store and helpers.
  - New: viewport `fogRT`, screen-space composition, redraw pipeline.
  - Update: `applyState`, `applyReveal`, `destroyOverlay`, `toggleDebug`.
  - Remove: world-sized `renderTexture` creation.

- `apps/client/src/game/GameScene.ts`
  - Wire camera to `fogOfWarSystem.updateCamera()` (cameraupdate or throttled in `update`).
  - Ensure correct depth ordering.

- `apps/client/src/lib/constants.ts` (optional)
  - Add `FOG_VIEWPORT_MODE` feature flag (default true).

### Testing plan

- Local single-player run on small map and 400×400 map:
  - Validate that VRAM usage does not scale with map size.
  - Pan/zoom around map and ensure fog behavior matches expectations.
  - Verify revealed tiles persist as you leave/return to areas.
- Performance:
  - Log redraw triggers (tile-crossing) and measure redraw duration.
  - Check FPS stability while sprinting across the world.
- Edge cases:
  - Zoom changes, window resize, camera bounds at edges, high-DPI displays.

### Rollout and fallback

- Gate behind `FOG_VIEWPORT_MODE` if desired for quick on/off.
- If issues arise, flip the flag to revert to the current implementation while we iterate.

### Acceptance criteria

- No world-sized textures are allocated; a single viewport-sized RT is used.
- Map size increases do not significantly affect client memory.
- Fog visually matches current behavior for unseen vs discovered.
- No significant FPS drops during fast camera movement; redraws occur only on tile-crossings and zoom/resize.

### Risks and mitigations

- Visible seams at tile edges under certain zooms → add 1 px erase padding; round coordinates consistently.
- Frequent redraws on constant micro-scroll → debounce using tile-crossing logic and a small time threshold.
- Future shader needs (soft edges) → keep a path to add a gradient pass post-erase within the same RT.
