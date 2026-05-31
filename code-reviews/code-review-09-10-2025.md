## Code Review Checklist — 2025-10-09

### Must fix before merge

- [x] Gate verbose client logs in `apps/client/src/app/initPhaser.ts` behind `NEXT_PUBLIC_DEBUG === '1'`.
- [x] Deduplicate map chunk selection: replace local `selectChunksByDifficulty` in `initPhaser.ts` with an adapter that uses `getChunkSetKeyForDifficulty` from `apps/client/src/data/maps-loader.ts`.

### Refactors

- [ ] Extract portal placement constants from `apps/server/src/lib/systems/EnemyDeathSystem.ts` to `apps/server/src/lib/constants/portals.ts` and import where used.
- [ ] Add `aria-live="polite"` to the quest/countdown container in `apps/client/src/components/GameHUD.tsx` and `apps/client/src/components/MobileGameHUD.tsx`.
- [x] Extract `aggregateAbilityEffects` and helpers from `scripts/simulate-combat.ts` to a small pure module (e.g., `data/abilities-sim.ts`) for reuse and tests.

### Cleanup

- [x] Wrap remaining `console.log` calls in `apps/client/src/app/initPhaser.ts` with the debug guard; keep warnings/errors.
- [x] Remove or justify (with a dated TODO) the commented `setupTimedSpawnInfoListeners` block in `apps/client/src/game/GameScene.ts`.

### Verification

- [ ] Client loads only one chunk set per tier/phase and HUD shows PG countdown correctly; countdown clears on spawn events.
- [ ] New clients receive `portal_guardian_spawn_timer` on join (broadcast on join path confirmed); countdown label updates every 0.5s.
- [ ] Server schedules PG spawn only during in-game phase; clears/reschedules during transitions; no timer leaks.

---

## Performance Review — Enemy/Projectile/Fog Systems (09/10/2025)

### Scope

`apps/server/src/lib/systems/EnemySystem.ts`, `apps/server/src/lib/systems/ProjectileSystem.ts`, `apps/server/src/lib/systems/FogOfWarSystem.ts`

### Must fix (server tick hot paths)

- [ ] EnemySystem: throttle nearest-player scans per enemy (`enemy.nextTargetScanAt = now + 150–250ms`) and reuse target when valid.
- [ ] EnemySystem: fully remove `Math.sqrt` from hot path. Track `nearestDistSq`, compare to `detectionRangeSq`; compute `sqrt` only when strictly needed (e.g., normalization).
- [ ] ProjectileSystem: replace collision `Math.sqrt` with squared-distance checks; hoist `collisionRadiusSq = 24*24`.
- [ ] ProjectileSystem: remove `setTimeout` used to restore enemy animation after projectile hit; set `enemy.animUntil`/`postAnim` and let EnemySystem process it.
- [ ] EnemySystem: avoid `require('./EnemySpawnSystem')`/`require('./EnemyDeathSystem')` inside the update loop. Resolve once at module init or memoize to avoid repeated dynamic requires.

### High-impact refactors

- [ ] Introduce a simple spatial hash (grid) for broad-phase proximity: map enemy/projectile positions to cells; check collisions only in the same/neighboring cells, reducing O(P×E) to near O(P+E).
- [ ] EnemySystem: compute `isOnRoad` only when tile changes. Cache `lastTileX/lastTileY` per enemy; recompute on tile boundary crossings.
- [ ] EnemySystem: cap enemies processed per tick (round-robin). Example: update N enemies per tick based on `TARGET_FPS`, to smooth spikes when population is large.
- [ ] ProjectileSystem: early-cull by simple AABB before distance check; skip enemies/players whose |dx| or |dy| exceeds collision radius.
- [ ] ProjectileSystem: consolidate aggro/charge updates into a helper and avoid redundant property writes when values are unchanged (reduces patch churn).

### Cleanup / micro-optimizations

- [ ] ProjectileSystem: remove stray `console.log('projectile id', ...)` and gate any logs behind `DEBUG_LOGS` (currently used elsewhere).
- [ ] EnemySystem: guard enemy `anim`/`dir`/`isAttacking` writes (set only if changed) to reduce schema patch size.
- [ ] EnemySystem: avoid recomputing distance twice for melee (use existing `distance`/`distSq` for direction and range checks where possible).
- [ ] fireProjectileAtTarget: parse `player.derivedStats` once and cache in the action flow; avoid JSON.parse per call if rate is high.

### FogOfWarSystem

- [ ] Throttle `update()` to ~10 Hz (every 100ms) or trigger only on player tile change; current reveal-per-tick scales linearly with players.
- [ ] Replace `Set<number>` discoveredTiles with a `Uint8Array` bitmap (width×height) to reduce memory/GC pressure; you already use this pattern client-side.
- [ ] If server-side visibility gating remains off, keep this system strictly for reveal events; otherwise, plumb `visible*Ids` into room state caches and filters.

---

### Checklist — code-review-09/10/2025 — Performance

- [ ] Throttle enemy target scans; reuse valid targets
- [ ] Remove sqrt from hot paths; use squared distances
- [ ] Projectile collision: squared-distance + AABB early-out
- [ ] Replace projectile hit setTimeout with timestamp scheduling
- [ ] Memoize/hoist dynamic requires out of hot loop
- [ ] Add spatial hash for enemy/projectile proximity
- [ ] Cache `isOnRoad` on tile change only
- [ ] Round-robin enemy updates per tick (population cap per tick)
- [ ] Guard schema writes to reduce patch churn
- [ ] Parse/cached derived stats in ranged attack flow
- [ ] FogOfWarSystem: throttle or tile-change-triggered updates
- [ ] FogOfWarSystem: bitmap for discovered tiles
      Notes:

- Portal Guardian timer wiring across server and client is correct and robust; late joiners receive the timer immediately. World transitions clear timer state.
- `DEFAULT_MAP_FILES` is the single source of truth across client/server; client now loads only selected chunks via `/api/maps/*`.
- Consider process-start caching for server chunk sets if start-up cost becomes noticeable.
- Consider process-start caching for server chunk sets if start-up cost becomes noticeable.

---

## Code Review — Projectile & Fog Systems (09/10/2025)

### Scope

`apps/server/src/lib/systems/ProjectileSystem.ts`, `apps/server/src/lib/systems/FogOfWarSystem.ts`

### Must fix before merge

- [ ] Remove unused import `getCharacterStats` from `ProjectileSystem.ts`.
- [ ] Guard zero-distance in `fireEnemyProjectile` to avoid division by zero when player and enemy occupy the same position.
- [ ] Replace deprecated `substr` with `slice` in projectile id generation.

### Refactors / Performance

- [ ] Use squared-distance checks for projectile collisions (players/enemies) to avoid repeated `Math.sqrt` in hot loops.
- [ ] Extract projectile collision radius (24 px) and TTL (3000 ms) to `apps/server/src/lib/constants.ts` for single source of truth.
- [ ] Parse `player.derivedStats` once in `fireProjectileAtTarget` and reuse; introduce a small typed helper for derived stats.
- [ ] Replace `setTimeout`-based projectile cleanup for cactus explosions with timestamp scheduling processed in the main tick to reduce timer churn.
- [ ] Compute `attackerDir` from projectile velocity instead of hardcoding `'right'` in `enemy_damaged` broadcast (optional polish).
- [ ] Strengthen typing in `ProjectileSystem.ts` by using `PlayerSchema` and `EnemySchema` instead of `any`.

### Cleanup

- [ ] Remove or narrow empty `try { ... } catch {}` blocks around crit/evade utilities; ensure utilities return safe defaults so throws are unlikely.
- [ ] Consider a shared id generator for projectiles to keep formats consistent across systems.

### FogOfWarSystem

- [ ] If AOI/visibility gating remains rolled back, remove unused `discoveredEntityIds` state and `newlyDiscoveredEntityIds` from return, or wire them up fully.
- [ ] Optionally deduplicate per-tick reveal work by coalescing players on the same tile before calling `revealCircle`.
- [ ] Consider converting the class to a small functional module with explicit state if you want to align with the project’s functional style; not required for this PR.

---

### Checklist — code-review-09/10/2025 — Projectiles & Fog

- [ ] ProjectileSystem: remove unused `getCharacterStats` import
- [ ] ProjectileSystem: zero-distance guard in `fireEnemyProjectile`
- [ ] ProjectileSystem: replace `substr` with `slice` in id generation
- [ ] ProjectileSystem: squared-distance for player/enemy collision checks
- [ ] ProjectileSystem: extract collision radius/TTL to constants
- [ ] ProjectileSystem: parse `derivedStats` once, add typed helper
- [ ] ProjectileSystem: replace explosion `setTimeout` with tick scheduling
- [ ] ProjectileSystem: compute `attackerDir` from velocity
- [ ] ProjectileSystem: use `PlayerSchema`/`EnemySchema` types, remove `any`
- [ ] ProjectileSystem: tighten empty catch blocks or ensure safe utility defaults
- [ ] FogOfWarSystem: remove or implement `discoveredEntityIds` and related return field
- [ ] FogOfWarSystem: coalesce players on same tile per tick before reveal
- [ ] FogOfWarSystem: consider functional module (optional)
