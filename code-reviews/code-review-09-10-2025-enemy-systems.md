## Code Review — Enemy Systems (09/10/2025)

Scope: `apps/server/src/lib/systems/EnemySystem.ts`, `EnemySpawnSystem.ts`, `EnemyDeathSystem.ts`

### Highlights

- Replaced animation timeouts with timestamp scheduling; guarded `anim`/`dir` assignments to reduce patch churn.
- Further opportunities remain for perf and maintainability, especially squared-distance checks, target-scan throttling, reducing dynamic requires, and consolidating repeated logic.
- Added `DEBUG_LOGS` gating; introduced tick-queued removals/spawn follow-ups to avoid timer churn.

### Findings and recommendations

#### EnemySystem.ts

- [ ] Use squared-distance for nearest-player scans; track `nearestDistSq` and compare to `detectionRangeSq`.
- [ ] Compute distance only when needed for normalization; e.g., branch on `distSq > thresholdSq` and only then take `Math.sqrt(distSq)`.
- [ ] Guard `enemy.isAttacking` like `anim/dir` to avoid patch churn.
- [ ] Cache `enemy.onRoad` only when tile changes; consider `lastTileX/lastTileY` on the schema or local cache.
- [ ] Throttle target scans per enemy (e.g., `enemy.nextTargetScanAt = now + 150–250ms`) and reuse target when valid.
- [ ] Extract helpers to reduce duplication:
  - `setAnimIfChanged(enemy, next)`
  - `setDirFromDelta(enemy, dx, dy)` (axis-dominant)
- [ ] Hoist lifesteal `ENEMY_TYPES` usage out of hot path if feasible; pre-resolve abilities map by `enemyType` at spawn.
- [ ] Consider centralizing scheduled removal/follow-ups in `GameRoom` tick to reduce coupling with EnemySystem.

References:

```49:69:apps/server/src/lib/systems/EnemySystem.ts
        nearestDistance = Math.sqrt(
          Math.pow(aggroTargetPlayer.x - enemy.x, 2) +
            Math.pow(aggroTargetPlayer.y - enemy.y, 2)
        );
...
      for (const [playerId, player] of room.state.players) {
        const distance = Math.sqrt(
          Math.pow(player.x - enemy.x, 2) + Math.pow(player.y - enemy.y, 2)
        );
        if (distance <= detectionRange && distance < nearestDistance) {
```

#### EnemySpawnSystem.ts

- [ ] Replace `require('../../data/difficulty-tiers')` with a top-level import (unless breaking a cycle).
- [ ] Replace `require('./MapCollisionSystem')` calls with top-level imports (monitor for circular deps).
- [ ] Consider initializing runtime-only fields explicitly on spawn for clarity (they default correctly but explicit intent helps).
- [ ] Add optional spawn budget/backoff when near `TIMED_SPAWN.maxEnemies` to avoid churn.

References:

```10:12:apps/server/src/lib/systems/EnemySpawnSystem.ts
  const { getDifficultyTier } = require('../../data/difficulty-tiers');
```

```45:49:apps/server/src/lib/systems/EnemySpawnSystem.ts
  const {
    isSpawnPositionSafe,
    findNearestSafePosition,
    findRandomSafePosition,
  } = require('./MapCollisionSystem');
```

#### EnemyDeathSystem.ts

- [ ] Convert death cleanup `setTimeout` to timestamp scheduling processed in the main tick (reduces timers at scale).
- [ ] Use squared-distance comparisons for portal placement/interaction checks.
- [ ] Gate logs behind a debug flag to reduce noise in production.
- [ ] Consider deferring spawn-followups (e.g., delayed spawn after kill) via a tick queue to avoid many timers during waves.
- [ ] Ensure portal placement/interaction switches to squared-distance for consistency.

References:

```101:129:apps/server/src/lib/systems/EnemyDeathSystem.ts
  setTimeout(
    () => {
      room.state.enemies.delete(enemyId);
      ...
      setTimeout(() => {
        spawnEnemyOfType(room, getRandomEnemyType());
      }, 100);
    },
    getEnemyAnimationDuration(enemy.enemyType, 'death')
  );
```

```178:181:apps/server/src/lib/systems/EnemyDeathSystem.ts
      const dx = portal.x - candidateX;
      const dy = portal.y - candidateY;
      return Math.sqrt(dx * dx + dy * dy) >= PORTAL_PLAYER_COLLISION_RADIUS;
```

```482:486:apps/server/src/lib/systems/EnemyDeathSystem.ts
  const distance = Math.sqrt(
    Math.pow(player.x - portal.x, 2) + Math.pow(player.y - portal.y, 2)
  );
  if (distance > PORTAL_MAX_INTERACTION_DISTANCE) {
```

### Cross-cutting (optional follow-ups)

- [ ] Enable AOI/visibility gating using existing schema filters to reduce replication for off-screen enemies/projectiles.
- [ ] Add instrumentation (tick duration, counts for target scans/collisions, patch size) to measure gains.
- [ ] Replace remaining sqrt checks in `MapCollisionSystem` and `ProjectileSystem` hot loops with squared variants.
- [ ] Hoist dynamic `require` in `ProjectileSystem` to top-level imports.

---

### Checklist — code-review-09/10/2025

- [ ] EnemySystem: squared-distance for nearest-player and movement thresholds
- [ ] EnemySystem: guard `isAttacking` writes
- [ ] EnemySystem: throttle target scans per enemy
- [ ] EnemySystem: cache `onRoad` on tile change
- [ ] EnemySystem: extract anim/dir helpers to remove duplication
- [ ] EnemySystem: pre-resolve lifesteal abilities by `enemyType`
- [ ] EnemySpawnSystem: replace dynamic requires with imports
- [ ] EnemySpawnSystem: explicit init of runtime anim fields (clarity)
- [ ] EnemyDeathSystem: timestamp-based death cleanup and spawn follow-ups
- [ ] EnemyDeathSystem: squared-distance for portal placement/interaction
- [ ] EnemyDeathSystem: gate logs behind debug flag
- [ ] EnemySystem: centralize scheduled task processing in `GameRoom`
- [ ] Cross-cutting: squared-distance and hoisted imports in `ProjectileSystem`/`MapCollisionSystem`
- [ ] Cross-cutting: AOI/visibility gating hooked up in `GameRoom`
- [ ] Cross-cutting: add perf instrumentation
