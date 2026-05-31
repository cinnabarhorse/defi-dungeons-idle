### Weapon-scoped abilities – implementation checklist

Restrict weapon-based abilities to the active weapon only (no procs from other equipped weapons).

- [x] Crit (melee and ranged): compute from active weapon only
  - [x] Add a weapon-scoped helper (e.g., `getPlayerCritForWeapon(characterId, weaponType, activeWeaponSlug)`) or change `getPlayerCrit` to read `stats.activeWeapon?.abilities` instead of all `stats.abilities`.
  - [x] `apps/server/src/lib/actions/attack.ts` (melee): pass `activeWeaponSlug` when computing crit.
  - [x] `apps/server/src/lib/systems/ProjectileSystem.ts` (ranged): pass `activeWeaponSlug` when computing crit.
  - [x] Stamp projectile with `weaponSlug` at spawn so crit/loot logic can reference the firing weapon even if the player swaps mid-flight.

- [x] Cleave (melee): apply only if the active weapon has it
  - [x] Add `getPlayerCleaveForWeapon(...)` or update `getPlayerCleave` to use `stats.activeWeapon?.abilities`.
  - [x] Update `AttackEnemyAction` to call the weapon-scoped function.

- [x] Life Steal (melee): award only if the active weapon has it
  - [x] Modify `applyPlayerLifeSteal(...)` to source from the active weapon’s abilities (accept `activeWeaponSlug` or the weapon summary).
  - [x] Update `AttackEnemyAction` to pass the active weapon context when applying life steal.

- [x] Loot-affecting abilities (weapon-gated): Tongue Farm, Potion Farm
  - [x] Introduce weapon-scoped helpers (e.g., `getPlayerTongueFarmForWeapon(...)`, `getPlayerPotionFarmForWeapon(...)`) that aggregate only the active weapon’s abilities.
  - [x] `apps/server/src/lib/systems/EnemyDeathSystem.ts`: use the weapon that dealt the killing blow.
    - [x] For melee: read `activeWeaponSlug` at attack time and record it on the enemy as `lastHitWeaponSlug` when damage is applied.
    - [x] For ranged: use `projectile.weaponSlug` (stamped at spawn) for kills caused by projectiles.
    - [x] On death, prefer `lastHitWeaponSlug` if present; otherwise, fall back to killer’s current `derivedStats.activeWeaponSlug`.

- [x] Derived stats surface
  - [x] Ensure `player.derivedStats` includes `activeWeaponSlug` (already present via `syncPlayerCharacterStats`); continue using it as the source of truth for call sites.

- [x] Ranged projectile metadata
  - [x] `ProjectileSystem.fireProjectileAtTarget`: set `(projectile as any).weaponSlug = derived.activeWeaponSlug`.
  - [x] Use this slug for ranged crit application and death-time loot ability checks.

- [x] Explicit non-changes (keep aggregated, not weapon-scoped)
  - [x] Player Evade vs. incoming attacks (from wearables like `kimono`, `aagent-shirt`) remains aggregated by incoming attack type; do not scope to player weapon.
  - [x] Enemy aura aggregations remain unchanged.

- [x] Optional: shared utility to fetch abilities for a specific weapon
  - [x] Add helper: `getAbilitiesForWeapon(stats: CharacterDerivedStats, slug?: string)` returning the correct ability list, to reduce duplication across crit/cleave/life-steal/tongue-farm/potion-farm.

- [ ] Tests / validation
  - [ ] Melee: equip one crit weapon and one non-crit weapon; verify crits occur only when the crit weapon is active.
  - [ ] Ranged: same as melee; verify projectile crit flag and kill-derived loot logic use the firing weapon.
  - [ ] Life steal: heals only when attacking with a life-steal weapon.
  - [ ] Tongue/Potion farm: bonus applies only when the kill is from a weapon with that ability.
  - [ ] Evade unaffected by weapon swaps.
