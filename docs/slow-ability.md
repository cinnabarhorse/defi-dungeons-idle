### Slow — Design Plan and Questions

**Goal**: On successful damage, apply a movement speed reduction to the target. Default slow is 25% (i.e., target moves at 75% speed), amount configurable. Works for melee and ranged attacks. Enemies can also have/benefit from it. Ability can be passive (on‑hit) or active (consumes mana).

---

## Core Semantics

- **Trigger**: On successful damage dealt by the attacker to the target.
- **Effect**: Multiply target move speed by `(1 - slowPercent)`. Example: 25% slow → multiplier 0.75.
- **Scope**: Supports `melee`, `ranged`, or `all` via params.
- **Targets**: Enemies and players (PvE and PvP). Boss/elite rules configurable.
- **Duration**: Timed debuff with `durationMs`. Re-application behavior configurable (see Stacking).

---

## Data Model (shared registry)

- Add to `data/abilities.ts` (auto-syncs to server via generate script):
  - `interface SlowParams { amount: number; durationMs: number; chance?: number; appliesTo?: 'melee' | 'ranged' | 'all'; stacking?: 'refresh' | 'extend' | 'strongest'; maxStacks?: number; minSpeedScalar?: number; }`
  - `ABILITIES.slow(params: SlowParams)` returns `{ id: 'slow', kind: 'passive' | 'active', params }`
  - If active: extend params with `manaCost: number; cooldownMs?: number; rangePx?: number; radiusPx?: number; }` depending on UX.

Runtime status representation (server only):

- On entities (`PlayerSchema`, `EnemySchema`) maintain ephemeral status list, e.g. `(entity as any)._movementSlows: Array<{ multiplier: number; expiresAt: number; source?: string }>`; compute a single effective scalar from this list each tick.

---

## Server Integration

- Weapon-scoped behavior: follow `weapon-scope-abilities.md`. Only the currently active weapon’s slow applies for its hits.
- Hook points (on damage):
  - Melee: `apps/server/src/lib/actions/attack.ts` (post-mitigation, after `damage_applied` broadcast, per-target)
  - Ranged: `apps/server/src/lib/systems/ProjectileSystem.ts` (on projectile impact)
  - Enemy → Player: `performEnemyMeleeAttack` and `handleRangedEnemyAttack` in `EnemySystem.ts`, plus boss charge path (`applyBossChargeDamage`) if desired
  - Grenades/other AoE: optional; include only if `appliesTo: 'all'` is intended

- Application logic:
  - Determine if attacker has `slow` ability for the relevant scope (melee/ranged/all) and weapon.
  - Roll `chance` if provided; default 100% if omitted.
  - Compute `multiplier = clamp(1 - amount, minSpeedScalar ?? 0.2, 1)`; push `{ multiplier, expiresAt: now + durationMs }` onto target’s `_movementSlows`.

- Status ticking/expiration:
  - Add `StatusSystem` (new) to prune expired slow entries each server tick.
  - Compute `effectiveSlowScalar(target)`: by default use strongest slow = `min(multiplier[])`; alternative modes via `stacking`.

- Movement application:
  - Enemies: `updateEnemyMovement(...)` multiply path velocity by `effectiveSlowScalar(enemy)`.
  - Players: `GameRoom.handleContinuousInput(...)` multiply computed `velocity` by `effectiveSlowScalar(player)` (after sprint/road bonuses unless you prefer pre-bonus application; see questions).

- Authority & anti‑cheat: Slow is server‑authoritative; clients only render feedback.

---

## Client/UI/FX (optional, phased)

- Broadcast events: `status_applied { targetId, type: 'slow', amount, durationMs }` and `status_removed { targetId, type: 'slow' }` for UX.
- Visual tags: add/remove a `debuff:slowed` tag for shaders/overlays if you want to mirror the aura tag approach.
- HUD: show debuff icon on target frames; tooltip pulls from ability params.

---

## Stacking & Rules (defaults — configurable)

- **Stacking policy**: `strongest` (use lowest multiplier). Alternatives: `refresh` (reset duration if same/stronger) or `extend` (add durations with a cap).
- **Floor**: `minSpeedScalar` default 0.2 (entities cannot be slowed below 20% of base). Settable per ability instance.
- **PvP vs PvE**: Allow separate defaults (e.g., shorter durations in PvP).
- **Boss/elite modifiers**: Optional duration or amount scaling (e.g., bosses take 50% duration).
- **Interaction with sprint/road**: Specify whether slow multiplies before or after these bonuses (see questions).

---

## Active variant (if enabled)

- Two UX options:
  1. **Targeted cast**: Active ability that applies a slow to a single target within `rangePx`; consumes `manaCost`; has `cooldownMs`.
  2. **Empowered next hit**: Toggling or cast‑to‑arm that makes the next hit apply an enhanced slow; consumes `manaCost` on hit.

- Requires a minimal mana system:
  - Add `player.mana`, `player.maxMana`, regen loop (progression already defines a `manaRegenMultiplier`, but mana fields are not yet in schema).
  - Consume mana server‑side; reject cast if insufficient.
  - Client HUD updates for mana and ability cooldowns.

---

## Rollout Steps

1. Add `SlowParams` and `ABILITIES.slow(...)` to `data/abilities.ts`; run shared file generation.
2. Implement `StatusSystem` (pruning + `effectiveSlowScalar` helper).
3. Integrate on-hit application at melee/ranged server hook points (players and enemies).
4. Apply movement scalar in `updateEnemyMovement(...)` and `GameRoom.handleContinuousInput(...)`.
5. Add optional network events and basic VFX/icon.
6. Balance pass: defaults, floors, PvP/PvE and boss/elite tweaks.

---

## Clarifying Questions

Please confirm or adjust:

- Amount & duration
  - Default amount: Is 25% slow correct (multiplier 0.75)?

Yes

- Default duration: What baseline `durationMs`? Proposal: 2000 ms PvE, 1200 ms PvP.

2000 is a good baseline.

- Trigger & scope
  - Apply on every successful basic attack hit (melee and ranged) with 100% chance by default, or include a `chance`?

Include a `chance` parameter, but 100% by default.

- For multi-hit/projectiles and cleave/AoE, apply per target per hit instance?

Yes.

- Should grenade/ability damage also apply slow when `appliesTo: 'all'`, or limit to basic attacks only?

Yes grenades can also have slow effects.

- Stacking & floors
  - Stacking policy: prefer `strongest`, `refresh`, or `extend`? Any global caps on duration extension?

No strong preference.

- Minimum movement floor: is 20% acceptable, or a different floor?

No minimum enforced.

- Boss/elite/PvP rules
  - Bosses: immune, reduced duration (e.g., 50%), or normal?

Normal, for now.

- Elites: reduced duration (e.g., 75%)?

Normal, for now.

- Separate PvP values (amount/duration)?

No PVP right now.

- Sprint/road interaction
  - Should slow multiply the final velocity after sprint/road bonuses (simpler) or the base before bonuses?

  After bonuses.

- Active variant
  - Which UX: targeted cast or empower‑next‑hit?
  - Baseline `manaCost`, `cooldownMs`, and `rangePx`/`radiusPx`?
  - OK to add `mana` fields to `PlayerSchema` now (server‑authoritative) and wire minimal regen, or keep passive‑only for first release?

  Yes add mana to PlayerSchema. But it won't be used yet.

- Sources & inheritance
  - Allowed sources: characters, weapons, wearables, enemies (data‑driven)? Any exclusions?

Nope.

- Weapon‑scoped only vs global ability? (Current standard is weapon‑scoped for on‑hit effects.)

Weapon-scoped.

- Visuals/telemetry
  - Desired icon/style for `slowed`? Broadcast `status_applied/status_removed` events?

Apply a blue-ish tint.

- Log events for analytics (attackerId, targetId, amount, duration, source)?

If you confirm these, we’ll implement the shared ability, server status system, on‑hit hooks, and movement integration accordingly.
