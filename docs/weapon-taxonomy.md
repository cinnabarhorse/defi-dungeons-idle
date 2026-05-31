### Weapon taxonomy and scaling (authoring outline)

Purpose

- Lock a consistent taxonomy for weapons, set sensible per-category baselines, and enforce strong rarity scaling (≥3–4x) from common → godlike.
- This spec is implementation-oriented and maps directly to `data/weapons.ts` authoring and `data/wearables.ts` rarity handling.

Key concepts

- weaponType: 'melee' | 'ranged' | 'grenades' (existing field)
- weaponCategory: semantic bucket for defaults and tuning (new field)

Rarity damage multipliers

- common: 1.00
- uncommon: 1.30
- rare: 1.70
- legendary: 2.30
- mythical: 3.10
- godlike: 4.00

Notes

- Multipliers apply to base damage or damageRange for the weapon. Attack cadence and ranges are defined at the category level and are not rarity-scaled.
- Grenades scale center/edge damage via the same multipliers (applied to `damageCenter` and `damageEdge`).

Melee categories (common baselines)

- sword: damageRange 12–16, attackSpeed 700 ms, meleeAttackRange 120
- axe: damageRange 14–20, attackSpeed 750 ms, meleeAttackRange 160
- hammer: damageRange 16–22, attackSpeed 800 ms, meleeAttackRange 140
- spear/pitchfork: damageRange 10–14, attackSpeed 800 ms, meleeAttackRange 140
- dagger/knife: damageRange 8–12, attackSpeed 550 ms, meleeAttackRange 100
- improvised/light (parasol, handsaw): damageRange 8–12, attackSpeed 900 ms, meleeAttackRange 80–100
- exotic (claw, guitar, tentacle): damageRange 12–18, attackSpeed 700 ms, meleeAttackRange 110–130

Ranged categories (common baselines)

- pistol: damageRange 8–12, attackSpeed 900 ms, rangedAttackRange 400, projectileSpeed 1000
- staff/wand/scepter: damageRange 10–14, attackSpeed 800 ms, rangedAttackRange 400, projectileSpeed 1000
- bow/longbow: damageRange 10–14, attackSpeed 850 ms, rangedAttackRange 450, projectileSpeed 900
- gun (nail/energy): damageRange 12–16, attackSpeed 850 ms, rangedAttackRange 420, projectileSpeed 900
- lasso/control: damageRange 6–8, attackSpeed 900 ms, rangedAttackRange 350, projectileSpeed 900

Grenades (common baselines)

- frag: blastRadiusPx 96, damageCenter 80, damageEdge 20, cooldownMs 1500
- heavy-frag: blastRadiusPx 112, damageCenter 100, damageEdge 30, cooldownMs 1800
- heal-splash: blastRadiusPx 100–120, damage 0, healingSplash 60–110, cooldownMs 10000

How rarity scaling achieves ≥3–4x spread

- Example (sword): common 12–16 → mythical ≈ 37–50 (×3.1) → godlike ≈ 48–64 (×4.0)
- Example (axe): common 14–20 → mythical ≈ 43–62 → godlike ≈ 56–80

Implementation outline

- Add `weaponCategory` to WeaponAuthoringDefinition (root/client/server copies of `data/weapons.ts`).
- Create `WEAPON_CATEGORY_DEFAULTS` map with the baselines above.
- When building weapon profiles from authoring data:
  - Fill in missing fields from `WEAPON_CATEGORY_DEFAULTS[weaponCategory]`.
  - Determine wearable rarity via existing `getWearableRarity` in `data/wearables.ts`.
  - Apply the rarity multiplier to `damage` or `damageRange` (and to grenade `damageCenter`/`damageEdge`).
- Ranged: ensure final damage scaling parity with melee (either via the same rarity multiplier application or existing `totalDamage` pipeline where applicable).

Initial mappings (for quick alignment)

- spirit-sword (mythical): category sword → 12–16 base → scaled to ~37–50; attackSpeed 700 ms; meleeAttackRange 120.
- portal-mage-black-axe (godlike): category axe → 14–20 base → scaled to ~56–80; attackSpeed 750 ms; meleeAttackRange 160.

Validation notes

- Re-run `scripts/simulate-combat.ts` across Normal 1 and Nightmare 1 after adoption; confirm that Tier and rarity produce monotonic TTK improvements and that godlike weapons clearly outperform lower rarities.
