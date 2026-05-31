### Goal

Add a new Poison status/ability that:

- Prevents HP regen while active
- Deals damage over time (5 damage every 1000 ms) for 3000 ms
- First rollout: Slime melee attacks apply Poison with 25% chance on hit

### High-level Design

- Model Poison as a first-class status in the server `StatusSystem`, parallel to Slow/Stun.
- Add a new ability definition to shared `data/abilities.ts` (source of truth), regenerate server/client copies, and aggregate it in `apps/server/src/lib/ability-utils.ts` like Slow/Stun.
- Apply Poison on melee hit in `EnemySystem` using the aggregated enemy ability, broadcast `status_applied`/`status_removed` events, and tick the DoT in `updateStatusSystem`.
- Block HP regen in both places it’s applied today:
  - Player-only regen loop in `PlayerRegenSystem`
  - Aura-based enemy regen in `AuraSystem`

### Server/Data Changes by File

1. data/abilities.ts (shared, source of truth)

- Add types and factory for Poison.
  - `export interface PoisonParams { chance: number; durationMs: number; damagePerSecond: number; tickIntervalMs?: number; appliesTo?: 'melee' | 'ranged' | 'all'; sourceId?: string }`
  - `ABILITIES.poison(params: PoisonParams)` with sensible defaults:
    - `chance: 0.25`, `durationMs: 3000`, `damagePerSecond: 5`, `tickIntervalMs: 1000`, `appliesTo: 'melee'`
  - Add to `AnyAbilityInstance` union and `isPoison` type guard.

2. apps/server/src/lib/ability-utils.ts

- Define `export interface AggregatedPoison { chance: number; durationMs: number; damagePerTick: number; tickIntervalMs: number; appliesTo: 'melee' | 'ranged' | 'all'; sourceKey: string; abilitySourceId?: string }`.
- Implement normalization and aggregation helpers analogous to Slow/Stun:
  - `normalizePoisonParams(...)` (clamps/validates, computes `damagePerTick = round(dps * interval/1000)`)
  - `aggregatePoison(abilities, weaponType, { sourceKeyPrefix })`
  - `getEnemyPoison(enemyType, weaponType)` and `getPlayerPoison(characterId, weaponType, weaponSlug?, statsOverride?)`

3. apps/server/src/lib/systems/StatusSystem.ts

- Add Poison state and helpers:
  - Internal storage keys: `const POISON_STATE_KEY = '__poisonState'`, `const HAS_POISON_FLAG = '__hasActivePoison'`.
  - `interface PoisonState { expiresAt: number; durationMs: number; nextTickAt: number; tickIntervalMs: number; damagePerTick: number; lastAppliedAt: number; sourceKey?: string; abilitySourceId?: string; lastAttackerId?: string }`
  - `getPoisonState(entity, createIfMissing)` / `setPoisonFlag` / `getPoisonFlag` / `refreshPoisonState(entity, now)`.
  - `export function isEntityPoisoned(entity, now): boolean` (wraps refresh).
  - `export function applyPoisonStatus(gameRoom: GameRoom | null, entity, poison: AggregatedPoison, now: number, options?: { attackerId?: string }): { applied: boolean; hadActiveBefore: boolean; hasActiveAfter: boolean; expiresAt: number }`:
    - On apply: maintain a single poison instance (no stacking). If already active, extend duration (set `expiresAt = state.expiresAt + durationMs`) and do NOT pull `nextTickAt` earlier (keep if in the future). If not active, initialize `expiresAt = now + durationMs` and schedule first `nextTickAt = now + tickIntervalMs`. Set flags and attacker id for telemetry.
    - No movement change; no immediate damage tick.
    - Broadcast will be handled in caller; also log a small telemetry entry like `telemetry: poison_applied` (mirroring stun telemetry style).
  - `export function clearPoisonImmediate(room, entity): void` (remove state + broadcast `status_removed` if active).
- Extend `export function updateStatusSystem(room, now)` to tick Poison:
  - Per entity (players and enemies):
    - Capture `hadPoison = getPoisonFlag(entity)`; `hasPoisonNow = refreshPoisonState(entity, now)`.
    - If active and `now >= state.nextTickAt`: apply `damagePerTick` to `hp` with floor at 0; schedule `nextTickAt += state.tickIntervalMs` (no catch-up burst; clamp to `expiresAt`).
    - If poison expired this tick: `status_removed { type: 'poison' }`.

4. apps/server/src/lib/systems/EnemySystem.ts

- In `performEnemyMeleeAttack(...)` after successful damage application (mirroring Slow/Stun):
  - `const poisonSources = getEnemyPoison(enemy.enemyType, 'melee')`
  - For each source, roll chance; on success `applyPoisonStatus(gameRoomInstance, tgt, poison, now, { attackerId: enemy.id })`.
  - If a poison was newly applied (hadActiveBefore=false, hasActiveAfter=true) and `tgt.id` exists: broadcast `status_applied { targetId, type: 'poison', durationMs, dps: 5, tickMs: 1000 }`.
- Death cleanup: wherever we call `clearAllMovementSlowsImmediate(...)` today on player/enemy death or scheduled removal, also call `clearPoisonImmediate(...)` (and optionally consider `clearStunImmediate(...)` for parity).

5. apps/server/src/lib/systems/ProjectileSystem.ts

- Not required for Slime (melee), but leave a TODO to mirror melee behavior for ranged sources later by applying `getEnemyPoison(...,'ranged')` and `getPlayerPoison(...,'ranged')` at hit sites.

6. apps/server/src/lib/systems/PlayerRegenSystem.ts

- Before HP regen increments, skip when poisoned:
  - Import `isEntityPoisoned` (or `hasActivePoison`) and guard the HP segment: `if (perSecond > 0 && now >= regenState.hpNextAt && !isEntityPoisoned(player, now)) { ... }`
  - Mana regen remains unaffected.

7. apps/server/src/lib/systems/AuraSystem.ts

- When applying aura-based enemy HP regen, check poison first:
  - In the block that computes and uses `state.regenPerSecond`, do not apply HP regen if `isEntityPoisoned(enemy, now)` is true. Keep scheduling `nextRegenAt` behavior consistent when blocked (reset or hold) — simplest: set `nextRegenAt = 0` when blocked.

8. data/enemies.ts (shared)

- Add Poison to `slime` abilities list:
  - `{ id: 'poison', params: { chance: 0.25, durationMs: 3000, damagePerSecond: 5, tickIntervalMs: 1000, appliesTo: 'melee' } }`
- Run `pnpm run generate:shared` to regenerate server/client copies (`apps/server/src/data/enemies.ts`, etc.).

### Events and UI

- Reuse existing patterns:
  - On first application: `status_applied { targetId, type: 'poison', durationMs, dps, tickMs }`.
  - On expiration/clear: `status_removed { targetId, type: 'poison' }`.
- No per-tick broadcast by default (reduce spam). If desired, we can add an optional `status_tick`/`damage_over_time` event later.
- Client effect: show a green tint (visual) while poisoned, matching the Slow blue-tint approach; do not show per-tick damage numbers or hurt animations.

### Edge Cases & Rules of Thumb

- Re-applying Poison while active: extend duration (additive on `expiresAt`) without increasing DPS and without creating new stacks. Do not adjust `nextTickAt` if it is already in the future; if poison was inactive, schedule `nextTickAt = now + tickIntervalMs`.
- Damage rounding: tick damage is an integer — `damagePerTick = round(dps * (tickIntervalMs/1000))`.
- Death by Poison: handled in `updateStatusSystem` by driving `hp` to 0; follow-up death handling flows already run elsewhere per tick. We’ll also clear Poison in the death/cleanup call sites we already touch (mirrors Slow clearing).

### Minimal Test Plan

- Unit-ish simulation via `scripts/simulate-combat.ts` or quick harness:
  - Slime melee hits a 100 HP player; verify 25% chance to apply, 3 ticks of 5 damage, and regen is suppressed while active.
  - Ensure `status_applied` and `status_removed` fire once per application cycle.
  - Verify re-applying within the active window extends total remaining duration (no change in DPS).
- Regression: Verify Slow and Stun behavior is unchanged.
- Verify aura-based regen on enemies does not tick while poisoned.

### Decisions

- Re-application semantics: Extend duration (single-instance; no stacking and no DPS increase).
- UI feedback: Green tint only; no per-tick damage numbers or hurt animations.
- Healing vs regen: Regen-only; do not affect non-regen healing.
- Boss/elite rules: None; same values across all targets.
- Concurrency cap: Single-instance Poison only.
- Event naming: Use `type: 'poison'`.

### After Approval – Implementation Steps

1. Update `data/abilities.ts` and `data/enemies.ts` (slime) and run `pnpm run generate:shared`.
2. Implement aggregator in `ability-utils.ts` (types + aggregate/get helpers).
3. Add Poison state/logic in `StatusSystem.ts` (apply/clear/tick + helpers + update loop + exports).
4. Wire into `EnemySystem.performEnemyMeleeAttack` and call `clearPoisonImmediate` in the same places we clear slows on death/removal.
5. Block regen in `PlayerRegenSystem` and `AuraSystem` when poisoned.
6. Light manual test pass (local run), then we can add a sim or a minimal Jest spec if desired.
