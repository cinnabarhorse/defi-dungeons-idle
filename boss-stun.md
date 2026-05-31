# Boss Stun on Charge — Implementation Plan

## Goal

- When the boss lands a hit during its charge ability, the struck player is stunned for 2000 ms (2s).
- Server authoritative; clients only render VFX and read-only HUD cues.

## Current Behavior (anchors)

- Charge ability lives in `apps/server/src/lib/abilities/enemyAbilities.ts` under Bloodlust Charge:
  - Runtime/state machine: `runBloodlustChargeAbility`, `startBloodlustChargePhase`, `handleBloodlustChargePhase`, `enterBloodlustRecoveryPhase`, `finishBloodlustRecovery`.
  - Damage application for the charge hit: `applyBloodlustChargeDamage(...)`.
- Status effects live in `apps/server/src/lib/systems/StatusSystem.ts`:
  - Apply: `applyStunStatus(gameRoom, entity, stun, now, { attackerId })`.
  - Query: `isEntityStunned(entity, now)` and `getMovementSpeedScalar(...)` already disable movement/inputs.
  - Expiration/removal broadcast: `updateStatusSystem(...)` emits `status_removed` for `stun` when it expires.
- Client listens in `apps/client/src/app/initPhaser.ts`:
  - `status_applied` → shows stun label (`showStunLabel`) and `status_removed` → clears (`clearStunLabel`).

## Server Changes

1. Introduce a separate ability: `boss_charge_stun` (shared registry)

- Add to `data/abilities.ts`:
  - `interface BossChargeStunParams { durationMs: number; chance?: number }`
  - `ABILITIES.boss_charge_stun(params)` returns `{ id: 'boss_charge_stun', kind: 'passive', params }`
- This keeps Stun as a reusable ability that can be attached to any enemy without modifying the Bloodlust code itself.

2. Apply stun on successful charge damage

- In `applyBloodlustChargeDamage(...)`, after damage is confirmed and applied (`dealt > 0`):
  - If the attacker has the `boss_charge_stun` ability, roll `chance` (default 1) and call:
    `applyStunStatus(gameRoom, player, { chance, durationMs, appliesTo: 'all', sourceKey: 'enemy:boss_charge:stun', abilitySourceId: 'boss_charge_stun' }, now, { attackerId: enemy.id })`.
  - If `result.applied && !result.hadActiveBefore && result.hasActiveAfter`, broadcast:
    - `status_applied` with `{ targetId: player.id, type: 'stun', durationMs }`.
- Notes:
  - Stun applies only when damage > 0 (evade/staging-invulnerability/0-damage blocks it).
  - Movement/action lock is already enforced by the status system; no extra guards needed.
- Optional: extract a small helper (e.g., `applyEnemyOnHitStatusesForCharge(...)`) to mirror the melee path and centralize future special on-hit effects.

3. Ensure periodic expiry and removal broadcast

- No change needed; `updateStatusSystem(...)` already clears and broadcasts `status_removed` for stun on expiry.

## Data Changes (boss assignment)

1. Attach the new ability to the target boss

- Edit `data/enemies.ts` (source of truth) for `portal_guardian` and add:
  - `{ id: 'boss_charge_stun', params: { durationMs: 2000, chance: 1 } }` alongside its existing `bloodlust_charge` entry.
- Regenerate shared files: `pnpm run generate:shared` (or your usual generate script) to sync `apps/server/src/data/enemies.ts`.

2. Optional per-boss tuning

- Only bosses that include `boss_charge_stun` in data will apply stun on charge; duration/chance are per-boss tunables.

## Client Changes (optional polish)

- Functionally none required; client already handles `status_applied/status_removed` for `stun`.
- Do:
  - Trigger a brief screen shake when a charge hit lands: on `damage_applied` where `weaponType === 'boss_charge'` and `targetId` is the local player.
- Optional polish:
  - Show a small 2s countdown ring above the stunned target.

## Tests

- Unit-ish server test
  - Arrange a room with `portal_guardian` (with `boss_charge_stun: { durationMs: 2000, chance: 1 }`) in `charge` and a player within `hitRadius`; invoke `applyBloodlustChargeDamage` and assert:
    - `applyStunStatus` result applied, player flagged stunned, and a `status_applied` broadcast was sent once.
    - After advancing time > 2s and running `updateStatusSystem`, a `status_removed` broadcast was sent.
- E2E / Playwright (optional)
  - Spawn boss with charge, let it hit the player, assert the stun label appears and clears ~2s later.

## Edge Cases

- Evade / Staging Invulnerability: no damage ⇒ no stun (existing checks).
- Multi-target: the ability uses `hasHitDuringCharge`; only the first player hit gets stunned.
- Lethal hits: if the player dies, stun is irrelevant; no extra handling needed.
- Stun refresh: repeated charges refresh duration (handled by `applyStunStatus`).

## Rollout

- Gate via data by adding `boss_charge_stun` (durationMs: 2000) on the intended boss only (`portal_guardian`).
- Validate on staging; adjust duration if too punishing (e.g., 1500 ms).

---

## Decisions (from answers)

- Boss scope: `portal_guardian` only (for now).
- Duration: fixed 2000 ms.
- Trigger: only on successful damage; 0-damage hits do not stun.
- VFX: add brief screen shake on charge hit; optional 2s countdown ring.
- Immunities/cleanses: none for now (hard CC for full duration).
