### PhaserJS Performance Review (Client + Server)

This document summarizes concrete, file-specific performance improvements for the gotchiverse-live project. Items are prioritized and reference exact files/areas to change.

## Priorities

- High: Immediate wins that reduce CPU/GPU or network load without changing gameplay.
- Medium: Structural improvements or tunables with low risk.
- Low: Nice-to-haves or debug-only improvements.

---

## Client (Next.js + Phaser)

- High — Throttle/Batch Client→Server input messages ✅ Done
  - File: `apps/client/src/game/GameScene.ts`
  - Issue: In `update`, the client sends continuous input every frame: `this.room.send(0, this.inputPayload);` which at 60 FPS can exceed snapshot/tick rates and create backpressure.
  - Fix: Gate by time and coalesce identical payloads.
    - Add an input send rate (e.g., 20–30 Hz) and skip sends if payload unchanged since last emit.
    - Add simple dirty-bit when keyboard/mobile input changes; only send when dirty or every 100–150 ms keepalive.

- High — Reduce console logging in hot paths ✅ Done
  - Files:
    - `apps/client/src/game/GameScene.ts` (many `console.log` in lifecycle and input handlers)
    - `apps/client/src/game/systems/EnvironmentSystem.ts`
  - Issue: Numerous logs execute during normal play. Console I/O is synchronous in some environments and can stall frames.
  - Fix: Implemented `DEBUG_CLIENT` gate and `debugLog` helper in `apps/client/src/lib/debug.ts`. Wired `silenceConsoleLogsUnlessDebug()` in `initPhaser` to no-op `console.log/debug` unless `NEXT_PUBLIC_DEBUG_CLIENT`/`NEXT_PUBLIC_DEBUG` is set. Replaced frequent logs in `GameScene.ts` and `EnvironmentSystem.ts` with `debugLog`.

- High — Renderer configuration consistency
  - File: `apps/client/src/app/initPhaser.ts`
  - Issue: Mobile path sets `rendererType = Phaser.CANVAS` but messages/log comment suggest WebGL. Canvas on mobile can bottleneck large scenes; WebGL is typically faster.
  - Fix: Prefer `Phaser.WEBGL` on capable devices, keep Canvas as a fallback only. Keep `powerPreference: 'low-power'`, `depth:false`, `stencil:false`, and disable antialiasing when `pixelArt` is true (antialiasing defeats crisp pixels and adds cost). Consider `roundPixels:true`.
  - Also ensure scale config avoids excessively large render sizes on high-DPR devices; prefer RESIZE plus controlled camera zoom rather than inflating width/height by 1.5x.

- High — Floor virtualization: avoid per-tile put calls in mount ✅ Done
  - File: `apps/client/src/game/systems/EnvironmentSystem.ts`
  - Issue: `mountCellFloorsWithTilemap` writes tiles with nested loops calling `layer.putTileAt` for each tile.
  - Fix: Use `Phaser.Tilemaps.Parsers.Parse2DArray` flow or `TilemapLayer.putTilesAt(tiles)` to batch; or precompute a `Phaser.Tilemaps.LayerData` for faster bulk placement. If staying with loops, reduce work by skipping runs of -1 with `putTileAtWorldXY` disabled, but best is batching tile data once per cell.
  - Additional: Cull padding is `setCullPadding(1,1)`; consider increasing to reduce frequent mount/unmount churn when camera jiggles. Alternatively, expand visible window by 1 cell in `updateVisibleFloors` and reduce thrash.

- Medium — Adjust floor/minimap throttles
  - File: `apps/client/src/game/GameScene.ts`
  - Lines: uses `floorVisibilityThrottleMs = 100`, `minimapUpdateThrottleMs = 100`.
  - Suggest: On desktop keep 100 ms; on mobile lower frequency (e.g., 150–200 ms) to reduce CPU. Make throttles device-aware from `initPhaser`.

- Medium — Fog-of-war RenderTexture optimizations
  - File: `apps/client/src/game/systems/FogOfWarSystem.ts`
  - Issue: World-sized `RenderTexture` is redrawn fully on state apply. Erase operations are batched but graphics allocation toggles visibility frequently.
  - Fixes:
    - Keep a persistent `Graphics` object with `visible=false` but avoid `destroy()/create()` cycles; done mostly but ensure it never re-allocates per call.
    - For `redrawFogWorld`, switch to tile-run batching: compute continuous spans and use fewer `fillRect` calls, or draw to a temporary bitmap (CanvasTexture) then `draw` once to the RT.
    - Verify RT size caps for very large maps; if map > certain px dimensions, use segmented RTs or viewport-sized RT that follows camera (with alpha dithering to hide seams).

- Medium — Texture filtering and animation costs
  - File: `apps/client/src/lib/sprite-manager-unified.ts`
  - Ensure `pixelArt:true` + `NEAREST` scale mode throughout. Consider setting global config for textures rather than per-sheet adjustments.
  - Where possible, use lower `frameRate` for idle/background animations; e.g., coins can run at 6–8 FPS.

- Medium — Asset lazy-loading
  - Files: `apps/client/src/game/GameScene.ts`
  - Only load enemy/portal/character animations required for the current run (or chunk set). Already partially implemented; review `loadAnimatedEnemySprites` to gate by active difficulty and `mapChunks` present.

- Low — Edge panning lerp cost
  - File: `apps/client/src/game/GameScene.ts` (edge panning block before update)
  - Ensure edge pan math runs only when mouse is near edges and when the feature is enabled.

---

## Server (Colyseus + Node)

- High — Reduce broadcast rates and payload size
  - File: `apps/server/src/rooms/GameRoom.ts`
  - Snapshot interval: `setInterval(..., 1000 / GAME_CONFIG.SNAPSHOT_HZ)` (15 Hz). Ensure payloads are minimal deltas, not full entity state. If snapshots already deltas via Colyseus schema, verify large arrays (e.g., enemies, projectiles) are pruned of derived fields.
  - Consider per-client interest management (AOI) to exclude distant entities from messages.

- High — Throttle fog_reveal traffic
  - File: `apps/server/src/rooms/GameRoom.ts` (`this.broadcast('fog_reveal', { tiles })`)
  - Batch reveals per tick and limit frequency to <= 10 Hz. If sending indices, compress consecutive tile runs.

- High — Input handling backpressure
  - File: `apps/server/src/rooms/GameRoom.ts` (`onMessage(0, payload)` continuous inputs)
  - Guard against 60 FPS client inputs: debounce to server tick rate, process latest per client per tick.

- Medium — Tick/snapshot HZ tunables
  - File: `apps/server/src/rooms/GameRoom.ts` setupGameLoop
  - Tick: 30 Hz; Snapshot: 15 Hz. Validate enemy AI computation budget p95; if CPU headroom is low, consider 20–24 Hz tick with tuned speeds and animations to match feel.

- Medium — Logging reduction in hot paths
  - Files: many in `apps/server/src/rooms/GameRoom.ts`, `lib/systems/*` include frequent `console.log` in common flows (pathfinding, interactions, AI). These should be under a `DEBUG_SERVER` flag, with log sampling.
  - Replace verbose per-entity logs with aggregate counters emitted by the existing `server_perf` sampler every 1s.

- Medium — AI and projectile updates batching
  - File: `apps/server/src/rooms/GameRoom.ts` (`updateEnemyMovement`, `updateProjectiles`, `updateVacuumSystem`)
  - Ensure loops early-out based on distance to nearest player or AOI; skip physics/AI for entities outside any player AOI to reduce per-tick cost.

- Medium — Timed spawn scheduler
  - File: `apps/server/src/rooms/GameRoom.ts` (commented timed spawn interval)
  - Keep scheduling light; ensure no setInterval storms during transitions. Use a single tick to drive timers and schedule next spawn timestamps (already partially implemented by `nextTimedSpawnAt`).

---

## Networking

- High — Binary opcodes for hot messages
  - Current: input uses opcode `0` already; ensure all frequent events (move, aim) are on numeric channels. Keep verbose events (chat, debug) on strings.
  - Compress complex events where possible; avoid nested JSON for hot paths.

- Medium — Client packet loss and ping UI
  - Already present hooks in `initPhaser`/page for ping/packetLoss. Consider adapting rates when packet loss spikes: reduce input send Hz and snapshot Hz for that client.

---

## Configuration and Build

- High — Environment flags
  - Create a single shared `DEBUG_*` gate: `NEXT_PUBLIC_DEBUG_CLIENT`, `DEBUG_SERVER`, `PROFILE_SERVER`. Use it to silence logs and enable perf overlay.
  - Ensure `pixelArt:true` implies `antialias:false` in Phaser config.

- Medium — Asset sizing
  - Audit large spritesheets and `public/sprites/...` for over-resolution PNGs. Prefer WebP where supported by Phaser Loader to reduce decode time and memory.

---

## Quick Code Edits (high-impact checklist)

- Client input batching (GameScene.update):
  - Add `lastInputPayload`, `lastInputSentAt`, `INPUT_SEND_INTERVAL_MS = 50`.
  - Only `room.send(0, payload)` when changed or interval elapsed.

- Renderer config (initPhaser):
  - Prefer `type: Phaser.WEBGL` by default, fallback to Canvas on error.
  - Set `pixelArt:true`, `antialias:false`, optionally `roundPixels:true`.
  - Avoid setting extremely large scale sizes on mobile; rely on RESIZE + camera zoom.

- Floor mounting (EnvironmentSystem):
  - Replace per-tile `putTileAt` loops with a batched `putTilesAt` using a 2D array, or construct a `DynamicTilemapLayer` and set data directly.
  - Increase cull padding or visible window by 1 cell to reduce mount churn.

- Fog-of-war:
  - Keep a persistent draw buffer and draw spans instead of per-tile rectangles.
  - Consider camera-follow RT if world RT becomes too large.

- Server loop:
  - Debounce continuous inputs to one per tick per client.
  - AOI filter for enemies/projectiles outside any player radius.
  - Batch `fog_reveal` to <=10 Hz and compress.
  - Wrap logs under `DEBUG_SERVER` and sample.

---

## Validation Steps

- Measure client FPS with debug overlay and Chrome tracing before/after.
- Track server `server_perf` avg/p95 tick and CPU% after changes.
- Inspect network (WS frames/sec, avg frame size) to confirm reduced chatter.

These targeted changes should materially lower client CPU/GPU load and server CPU/network usage while preserving gameplay feel.
