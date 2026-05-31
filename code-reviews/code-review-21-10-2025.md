## Code review (21/10/2025)

### Summary

- Critical Strike gating is now correctly scoped to the active weapon for both melee and ranged paths. Projectile metadata now carries `weaponSlug` for kill attribution.
- Found a functional gap: run-level critical chance bonus is not included in player crit calculations.
- Found duplication and debug logging to clean up.

### Findings and recommendations

1. Crit gating (player) — OK

- Melee crit uses active weapon slug and derived snapshot when computing crit:
  - `apps/server/src/lib/ability-handlers.ts` → `computePlayerDamageWithCrit(...)` calls weapon-scoped `getPlayerCrit(...)` with the resolved slug and derived stats.
- Ranged crit is computed at projectile spawn using the active weapon slug and stamped onto the projectile as `isCrit` (and `weaponSlug`).

2. Run-level crit bonus not applied — BUG

- We set run modifiers on the player (`runCriticalChanceBonus`) but do not add them to crit calculations. Recommendation: incorporate run-level crit chance in `getPlayerCrit(...)` by reading it from the `statsOverride` (derived snapshot) at `statsOverride.runProgression?.modifiers?.criticalChanceBonus` and clamping to [0, 1].

3. Duplicate projectile firing paths — REFACTOR

- There are two implementations of projectile spawn logic (one in `ProjectileSystem` and one method on `GameRoom`). They differ (e.g., projectile speed source), which risks drift. Recommendation: keep a single source of truth (`ProjectileSystem.fireProjectileAtTarget`) and delete or delegate the `GameRoom` version.

4. Debug logs — CLEANUP

- `AttackEnemyAction` and parts of `EnemyDeathSystem` have verbose `console.log` diagnostics not gated by a debug flag. Recommendation: remove or wrap with `DEBUG_LOGS` (like other modules) to avoid noisy logs in production.

5. Minor: `getPlayerCritForWeapon` wrapper is redundant

- It delegates directly to `getPlayerCrit`. Either remove it if unused, or start using it consistently for clarity.

6. Tests still outstanding

- Add tests (or manual validation scripts) that verify: weapon-scoped crit for melee and ranged, life steal only on qualifying weapons, and loot-affecting abilities (tongue/potion farm) based on the killing weapon.

### Checklist

- [x] Verify melee crit is scoped to active weapon (current slug from derived stats)
- [x] Verify ranged crit computed at projectile spawn and stamped on projectile
- [ ] Add run-level crit chance into `getPlayerCrit` (read from derived `runProgression`)
- [ ] Remove or delegate `GameRoom.fireProjectileAtTarget` to `ProjectileSystem`
- [ ] Gate or remove debug logs in `AttackEnemyAction` and `EnemyDeathSystem`
- [ ] Remove or adopt `getPlayerCritForWeapon` consistently
- [ ] Add tests for crit gating, life steal gating, and loot ability gating

### Notes

- No schema changes are required for the above; all data is already available in `derivedStats` and on the player instance.

## Code Review - 21/10/2025

### Scope

- apps/server/src/lib/player-stats.ts
- apps/server/src/rooms/GameRoom.ts
- apps/client/src/game/GameScene.ts

### Summary

- Weapon swapping logic is now consistent across server and client.
- Server correctly derives stats from the active hand weapon and reconciled wearables.
- Client HUD builds a left/right weapon list from authoritative derived stats and keeps UI state in sync.

### Findings and Recommendations

1. apps/server/src/lib/player-stats.ts

- Keep: Hand-weapon collection and preferred index selection – clear and robust.
- Keep: Overriding weapon-derived fields (damage, damageRange, totalDamage, attackSpeed, melee/ranged ranges, projectileSpeed, weaponType, activeWeaponSlug) on active selection – fixes stale stats.
- Improve: Remove leftover debug log.
  - Line: console.log('recomputed:', recomputed);
  - Action: delete log or guard behind an environment flag.
- Improve: Avoid casting with `as any` for `activeWeaponSlug` and `totalDamage` – extend typings on `CharacterDerivedStats` or use a narrow helper to set optional fields.
- Optional: The first pass of manual field overrides is followed by a `getCharacterStats` recompute that already accepts `activeWeaponSlug`; consider simplifying by relying on the recomputed object and only preserving reconciled equipment slots. If you keep the manual overrides for safety, add a brief comment that recompute will re-derive the same fields.
- Optional: The silent catch around recomputation could hide data issues. Consider logging once (rate-limited) with context or checking inputs before calling.

2. apps/server/src/rooms/GameRoom.ts

- Keep: `getHandWeaponEntriesForPlayer`/`resolveCurrentHandWeaponIndex`/`selectActiveWeaponByIndex` – they correctly read from `player.derivedStats` and drive authoritative selection.
- Good: After selection, `syncPlayerCharacterStats` is called with `preserveHealthRatio: true` (prevents unintended heals) and the client is notified via `weapon_switched`.
- Improve: Minor duplication of left-slot preference logic mirrors `player-stats.ts`; acceptable, but consider extracting a small shared helper to avoid drift.
- Note: Methods are resilient when zero weapons exist (active index -1). This is correct and safe.

3. apps/client/src/game/GameScene.ts

- Keep: HUD construction from authoritative `derivedStats.equipment.items` and `derivedStats.weapons` with left/right ordering – aligns with server.
- Keep: Optimistic UI update (`applyOptimisticWeaponCycle`/`applyOptimisticWeaponSelection`) then send `cycle_weapon`/`set_active_weapon` – good UX.
- Improve: Remove verbose debug logs in production paths:
  - getPlayerAttackRange(): logs for `currentPlayerData` and `weaponType` each frame; delete or guard.
- Improve: `getPlayerAttackRange` fallback sequence is solid; consider caching parsed `derivedStats` per tick to avoid repeated JSON.parse in hot paths.
- Good: Debounce on weapon cycling prevents spam.

### Cleanup Checklist

- [ ] Remove console.log in `player-stats.ts` during recompute.
- [ ] Remove/guard per-frame console logs in `GameScene.ts` (`getPlayerAttackRange`).
- [ ] Consider adding types for `activeWeaponSlug` and `totalDamage` on `CharacterDerivedStats` to remove `as any` casts.
- [ ] (Optional) Consider relying solely on recompute path in `syncPlayerCharacterStats` to reduce duplication; keep slot reconciliation.
- [ ] (Optional) Extract left/right preference resolver to a shared utility used by both `player-stats.ts` and `GameRoom.ts`.

### Risk Assessment

- Low risk: Removing logs and `as any` casts (with proper typing) is safe.
- Medium (optional) refactor: Relying entirely on recompute path requires verifying parity with manual overrides for all weapons.

### Notes

- The weapon swap fix addresses previous stale state from switching between melee/ranged. The current implementation correctly resets weapon-derived fields and updates `player.attackType`.

# Code Review - 21/10/2025

## Findings

- Active weapon stats were conditionally applied, causing stale `derivedStats` after switching between melee and ranged. Fixed by forcing overrides for weapon-derived fields in `apps/server/src/lib/player-stats.ts` within `syncPlayerCharacterStats`.
- Import path for `EquippedWearableWithQuality` used `src/data/wearables` (client-style alias) on server. Corrected to `../data/wearables`.
- Excessive debug logging in `apps/server/src/lib/actions/attack.ts` (e.g., `console.log('derivedStats:', ...)`, `console.log('attackRange:', ...)`). Consider guarding with `DEBUG` or removing before release.
- Client handler `weapon_switched` in `apps/client/src/app/initPhaser.ts` mixes legacy `weaponMode` with new weapon index echo. Prefer using `activeIndex` + `derivedStats.weaponType` for UI, minimizing reliance on `weaponMode`.
- Ensure `GameScene.handleServerWeaponSelection` gracefully ignores out-of-range indexes and reconciles optimistic selection (already present but verify).

## Cleanup/Refactor Opportunities

- Attack action constructor logs: wrap in `if (DEBUG)` or remove.
- `getAttackRange` usage is minimal; prefer `derivedStats` authoritative ranges during actions to avoid drift, or centralize range resolution.
- Consider extracting the weapon override block in `syncPlayerCharacterStats` to a pure helper for testability.
- Verify all places that set `player.attackType` use `normalizeAttackType(stats.weaponType)`.

## Checklist

- [x] Force override weapon-derived fields when applying active weapon
- [x] Fix server import path for `EquippedWearableWithQuality`
- [ ] Gate noisy `console.log` calls in `apps/server/src/lib/actions/attack.ts`
- [ ] Audit client `weapon_switched` handling to rely on `activeIndex` + `derivedStats`
- [ ] Consider extracting helper for weapon overrides for unit tests
