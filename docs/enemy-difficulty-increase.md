## Enemy Difficulty Meter (Progressive Dungeon Intensity)

### TL;DR

- Add a server‑authoritative difficulty meter that increases enemy damage and max HP every minute a run persists.
- New spawns receive scaled stats; existing enemies are rescaled at each minute tick while preserving their current HP ratio.
- Expose minimal state to clients for a compact HUD label and countdown.

---

### Goals

- Increase dungeon difficulty the longer players stay in a run by scaling enemy damage and max HP at fixed time intervals (every 60s).
- Apply to all active enemies (existing and newly spawned) without client desyncs.
- Keep implementation server-side for anti-cheat and as a single source of truth.
- Be tunable via constants and safe under load (avoid network spikes when updating many enemies).

### Non‑Goals (for this iteration)

- No changes to enemy AI, move speed, or spawn frequency.
- No reward scaling, XP changes, or loot changes.
- No boss-specific bespoke rules unless explicitly approved.

---

## Architecture

### Server state

Add lightweight fields to `GameRoomState` so clients can render a HUD and server logic can compute the current level deterministically:

- `enemyDifficultyEnabled: boolean` — starts true when the dungeon run begins, false when paused or during transitions.
- `enemyDifficultyStartedAt: number` — epoch ms when the meter began for this run.
- `enemyDifficultyLevel: number` — non-negative integer; how many minute ticks have occurred (0 at start).
- `enemyDifficultyNextAt: number` — epoch ms for the next scheduled increase; used for a client countdown.

All other computation is derived at runtime.

### Timer/loop integration

- Use the existing `gameTick()` in `apps/server/src/rooms/GameRoom.ts` to check once per tick:
  - Guard: active players present, phase is `in_game`, not transitioning.
  - If `Date.now() >= enemyDifficultyNextAt`: increment level and rescale enemies.
- Avoid adding another long‑running interval; derive from time for drift‑free scheduling and simplicity.

### Scaling model

- Per-minute linear multipliers (defaults; confirm in Open Questions):
  - `METER_DAMAGE_PER_MINUTE = 0.08` (8% per minute)
  - `METER_HP_PER_MINUTE = 0.10` (10% per minute)
- Effective multipliers at level `L`:
  - `damageMultiplier = 1 + L * METER_DAMAGE_PER_MINUTE`
  - `hpMultiplier = 1 + L * METER_HP_PER_MINUTE`
- Caps (defaults; confirm):
  - `MAX_DAMAGE_MULTIPLIER = 4.0`
  - `MAX_HP_MULTIPLIER = 6.0`
- Rationale: linear keeps tuning predictable and avoids runaway growth; caps protect runaway runs.

### Single source of truth for scaling

Enhance `applyDifficultyScaling(room, baseStats)` in `apps/server/src/lib/systems/EnemySpawnSystem.ts` so new spawns include the current meter:

- Today it applies difficulty tier multipliers; extend it to fetch the meter multipliers and multiply on top for `health`, `maxHealth`, and `damage`.
- This keeps all stat application centralized and avoids duplicated formulas.

### Existing enemies: rescaling safely (minute tick)

- On each minute tick, rescale all enemies using their stored base stats and preserve health ratio:
  1. Ensure we capture tier‑scaled bases at spawn time:
     - On spawn (after tier/meter application is computed for that moment), set:
       - `enemy._tierScaledMaxHpBase = enemy.maxHp`
       - `enemy._tierScaledDamageBase = enemy.damage`
     - For elites, do this after elite modifiers are applied so bases reflect post‑elite stats.
  2. Compute new values:
     - `newMaxHp = clamp(round(enemy._tierScaledMaxHpBase * hpMultiplier), 1, HP_CAP)`
     - `newDamage = clamp(round(enemy._tierScaledDamageBase * damageMultiplier), 1, DMG_CAP)`
     - Maintain current HP ratio: `hpRatio = enemy.hp / oldMaxHp` → `enemy.hp = max(1, round(hpRatio * newMaxHp))`
  3. Assign `enemy.maxHp = newMaxHp`, `enemy.damage = newDamage`.

#### Performance: staggered updates

- To avoid bandwidth/CPU spikes when updating many enemies at once, split the rescale across small slices (e.g., chunks of 25–40 enemies) over ~1–2 seconds. This mirrors our stagger pattern used elsewhere (e.g., elite minion formation and arena doc).

---

## Integration Points

### 1) Server constants

Add to `apps/server/src/lib/constants.ts`:

- `METER_TICK_INTERVAL_MS = 60_000`
- `METER_DAMAGE_PER_MINUTE`, `METER_HP_PER_MINUTE`
- `MAX_DAMAGE_MULTIPLIER`, `MAX_HP_MULTIPLIER`

Add these to gameConfig.ts instead.

### 2) GameRoom lifecycle

- On run start (e.g., at `beginDungeonRun` or when phase switches to `in_game`):
  - Initialize `enemyDifficultyEnabled = true`
  - `enemyDifficultyStartedAt = Date.now()`
  - `enemyDifficultyLevel = 0`
  - `enemyDifficultyNextAt = now + METER_TICK_INTERVAL_MS`
- In `gameTick()`:
  - If guards pass and `now >= enemyDifficultyNextAt`, compute new `level`, bump `enemyDifficultyNextAt += METER_TICK_INTERVAL_MS`, call `rescaleAllEnemiesInSlices()`.
- On room transitions or end of run: disable/reset the meter per policy.

### 3) applyDifficultyScaling(room, baseStats)

- Extend to:
  - Read `level` from state and compute `meterDamageMul` / `meterHpMul`.
  - Multiply into `health`, `maxHealth`, `damage` on returned stats.
  - Do not touch speed, aggro, etc. in this feature.

### 4) spawnEnemyOfType(...)

- After assigning `enemy.maxHp`/`enemy.damage`, set base snapshots:
  - `enemy._tierScaledMaxHpBase = enemy.maxHp`
  - `enemy._tierScaledDamageBase = enemy.damage`
- For elite leaders/minions, set these bases after elite modifiers (so subsequent minute ticks scale correctly from elite‑strength baselines).

### 5) Elite flow considerations

- Leaders: After `applyEliteLeaderModifiers`, set `_tierScaled*Base`.
- Minions: After `applyEliteMinionModifiers`, set `_tierScaled*Base`.
- Scaling then applies identically to non‑elites at each minute tick.

### 6) Damage application

- Enemy projectiles snapshot `projectile.damage = enemy.damage` at creation time; existing projectiles will keep old damage (acceptable). New projectiles reflect the new meter automatically.

---

## Client/UI

- Minimal HUD (top/right small label):
  - "Intensity Lv {enemyDifficultyLevel}"
  - Optional tiny countdown to next tick using `enemyDifficultyNextAt`.
- No new messages required; the values are in room state.

---

## Observability

- Emit telemetry on each tick:
  - `enemy_meter_tick` with `{ level, damageMul, hpMul, enemyCount }`.
- Optionally log once per tick at INFO with compact line (guarded by env flag).

---

## Edge Cases & Policies

- Pause when empty: If all players leave, pause meter (don’t advance `level`) until a player returns. Keep `startedAt` intact to avoid drift; recompute `nextAt` on resume.
- Transitions/treasure rooms: Reset or pause? Default proposal: reset on new dungeon map (meter = 0), pause during treasure rooms.
- Bosses: Should `portal_guardian` scale with the meter? Default proposal: yes (consistent with "all enemies"), but can be excluded if desired.
- Death/respawn loops: No change; rescale applies to current population only; new spawns inherit via `applyDifficultyScaling`.

---

## Implementation Plan (server-first)

1. Constants
   - Add meter constants to `constants.ts`.
2. State schema
   - Add fields to `GameRoomState` (`enemyDifficultyEnabled`, `enemyDifficultyStartedAt`, `enemyDifficultyLevel`, `enemyDifficultyNextAt`).
3. Lifecycle wiring
   - Initialize on run start, clear/reset on transition/end.
4. Apply to spawns
   - Extend `applyDifficultyScaling` with meter multipliers.
   - In `spawnEnemyOfType`, snapshot `_tierScaledMaxHpBase` and `_tierScaledDamageBase` post-scaling; ensure elites set these after modifiers.
5. Minute tick
   - Detect in `gameTick()`, increment `level`, and call `rescaleAllEnemiesInSlices()` that:
     - Computes new multipliers
     - Updates `maxHp`/`hp` preserving ratio; updates `damage`
     - Slices updates over ~1–2s
6. Client HUD (optional quick pass)
   - Render small label using new state fields.
7. Telemetry
   - Emit `enemy_meter_tick`.

---

## Acceptance Criteria

- After 1 minute in a run, all existing enemies show increased max HP and deal more damage; newly spawned enemies at 1:00 also have increased stats.
- After N minutes, increases accumulate linearly with caps respected.
- No noticeable server or network spike at the moment of increase (sliced updates).
- Client HUD reflects current level and next increase time.

---

## Open Questions

1. Exact per-minute values: preferred defaults?
   - Damage per minute (current proposal: 8%)
   - HP per minute (current proposal: 10%)
2. Caps: acceptable maximums?
   - Damage cap (proposal: 4.0x), HP cap (proposal: 6.0x)
3. Boss applicability:
   - Should `portal_guardian` be included? If excluded, we’ll set a flag to bypass scaling for `enemyType === 'portal_guardian'`.
4. Pause/reset policy:
   - Pause meter when no players? (proposal: yes)
   - Reset meter on map transition/treasure room? (proposal: reset on new dungeon map, pause in treasure rooms)
5. HUD detail level:
   - Label only (Lv X) vs. include countdown; any preference on placement?
6. Visibility/telemetry:
   - Keep logs minimal or print a short line each tick behind a debug flag?

---

## Notes / Future Extensions (not in this PR)

- Add reward scaling (XP/loot) tied to the meter.
- Introduce small spawn intensity changes by level (batch size or spawn interval) if desired later.
- Add elite/boss floor-specific rules to keep fights fair at very high levels.
