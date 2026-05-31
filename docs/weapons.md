### Weapons system – questions to clarify before implementation

Please answer these to lock the design. I will implement immediately after.

### Scope and identity

- **Canonical source**: Confirm weapons live in `data/wearables.ts` as a new `category: 'weapon'` (similar to armor), and we propagate derived constants to client/server via `scripts/generate-shared-files.ts`.

Yes, exactly.

- **Identity**: Use stable slugs for weapons (preferred), with optional numeric `aavegotchiId` mapping. Confirm slug for ID 315: `haanzo-katana`.

Yes, exactly.

- **Reference format**: Characters and systems reference weapons by slug, not numeric id. OK?

Yes.

### Weapon model and constraints

- **Slots**: Do we model weapons via `mainHand`/`offHand` slots, or a `hands: [HandSlot, HandSlot]` structure? Your preference?

We can use hand left or hand right.

- **Handedness**: Field `handedness: 'one-handed' | 'two-handed'`. Two‑handed occupies both hand slots and disallows off‑hand. Confirm.

All wearables are single hand.

- **Dual wield**: Allow equipping two different one‑handed weapons simultaneously? If not now, should code enforce a single active weapon for simplicity?

Yes, we should be able to allow dual wield.

- **Offhand types**: If dual wield is not allowed, can offhand hold a non‑weapon (e.g., shield)? Defer or include now?

Yes, we will eventually add things like shields. We'll do that in a future spec.

- **Attack class**: Weapon `attackClass: 'melee' | 'ranged'`. For melee, we use `reach` (in tiles/px). For ranged, `projectileSpeed`, `projectileLifetimeMs`, `projectilePierce`, etc. Confirm fields and units.

We already have these properties on the character itself. Please check the character.ts file for examples. You don't need to update those names, just use the existing ones, but put them on the weapon instead of the character.

- **Base damage modeling**: Preferred representation?
  - flat min/max: `{ damageMin, damageMax }`
  - scalar on character base: `{ damageScalar }`
  - both (flat added, then scalar applied)

Both.

- **Attack speed**: Represent as `attacksPerSecond`, or `cooldownMs`? Existing systems use cooldowns; confirm preferred field.

Let's use the existing system.

- **Crit defaults**: Should `critChance`/`critDamage` be weapon stats or remain purely as abilities? If on weapon, confirm fields and ranges.

Let's use abilities.

- **Other primary stats**: Include `knockback`, `cleaveAngle`/`cleaveRange` (melee), `ammo`/`magazine` (ranged — likely N/A for now). Which should we support now vs later?

You need to include all of the existing abilities that we have already added to the Bushido Gachi character.

### Abilities granted by weapons

- **Granting mechanism**: Weapons can grant abilities by referencing existing ability slugs from `abilities.ts` (e.g., `lifesteal`, `cleave`, `criticalstrike`). Confirm exact slugs to use.

Yes, all of the existing slugs should be supported.

- **Parameterization**: For each granted ability, the weapon provides parameters (e.g., lifestealPercent, cleaveAngle, critChance, critMultiplier). OK to colocate these under `grantedAbilities` on the weapon?

Just call it abilities, not granted abilities.

- **Conflict/duplication**: If multiple equipment pieces grant the same ability, how do we merge?
  - additive then multiplicative then clamp
  - pick strongest
  - first‑wins / deterministic priority (e.g., weapon > armor)

If they are two separate weapons, then the attacking weapon would have those abilities. If you're talking about other things like armor, those would be additive.

- **Bushido migration**: Move Bushido’s current Lifesteal, Cleave, and Critical Strike from character to Hanzo Katana. Should we copy the exact current values, or do you want tweaks? Please confirm target values.

Please use the existing values.

### Effects design

- **Weapon stats**: In addition to abilities, support weapon‑native stats such as `weaponDamageFlat`, `weaponDamagePercent`, `attackSpeedPercent`, `critChance`, `critDamage`, `lifestealPercent`, `attackRange`, `projectileSpeed`, `pierceCount`, `thornsOnHit`, etc. Confirm which to implement in v1.

Krit, lifesteal, cleave, thorns, etc. are all abilities. We should only include base things like weapon damage, attack speed.

- **Operators and order**: Same precedence as armor? (additive → multiplicative → clamp). Any global caps (e.g., lifesteal ≤ 80%, critChance ≤ 100%)?

Whatever is normal and default.

- **Conditional effects**: Scope for v1 is passive effects only, no procs/conditionals? Or permit simple on‑hit procs now (e.g., on‑crit bleed)?

Only passive effects for now.

### Stacking rules

- **Across sources**: Weapon + armor + buffs combine via the same rules as armor. Confirm.

Yes, exactly.

- **Dual wield stacking**: If we allow two one‑handed weapons later, do identical stats/abilities stack? If yes, same additive/multiplicative/clamp ordering?

No, they do not stack. They are separate for each weapon that is currently attacking.

- **Exclusive flags**: For boolean exclusives (e.g., `cannotBeSilenced`), do we OR them or prefer priority?

Whatever is normal, I don't have a strong opinion.

### Server authority and sync

- **Authoritative source**: Server remains authoritative for equipped weapon and derived stats; clients render visuals. Confirm.

Yes.

- **Integration points**: Use central `deriveStats(baseStats, equipment, buffs)` during spawn and on loadout changes; damage pipeline consumes derived results. Any additional hooks needed?

No, not currently.

- **Events**: Keep `equip`, `unequip`, `loadoutChanged` events defined (even if not used yet). Route through action system for future changes? Confirm.

Yes.

- **Network schema**: Extend room API to include `equippedWeapon` (slug) and optionally selected derived weapon stats for client. Confirm.

I think you can just use the equipped wearables with the weapon as a type.

### Authoring shape in data/wearables.ts

- **Proposed minimal shape**: Is this acceptable for v1?

```ts
interface WeaponDefinition {
  slug: string; // stable id, e.g., 'hanzo-katana'
  aavegotchiId?: number; // 315
  category: 'weapon';
  handedness: 'one-handed' | 'two-handed';
  attackClass: 'melee' | 'ranged';
  base: {
    damageMin?: number;
    damageMax?: number;
    damageScalar?: number; // applied to character/base damage
    cooldownMs?: number; // or attacksPerSecond
    reach?: number; // melee reach (tiles/px)
    attackRange?: number; // for ranged or large melee arcs
  };
  stats?: {
    attackSpeedPercent?: number;
    critChance?: number; // 0..1
    critDamage?: number; // 1.0 = +0%, 1.5 = +50%
    lifestealPercent?: number; // 0..1
  };
  grantedAbilities?: Array<{
    slug: string; // 'lifesteal' | 'cleave' | 'criticalstrike'
    params?: Record<string, number | string | boolean>;
  }>;
}
```

That's pretty much what we want, but I think you could change a few names. We talked about that above.

- **Do you want a stricter typed params map per ability (like `abilities.ts`) or a generic `params` object is fine for now?**

Always use strict type of params.

### Migration and seeding

- **Bushido Gotchi**: Equip `haanzo-katana` (ID 315). Is it one‑handed or two‑handed? If two‑handed, we will block offhand. Confirm.

It is one-handed.

- **Ability transfer**: Remove Lifesteal, Cleave, Critical Strike from Bushido’s character definition and attach them to `hanzo-katana` with the confirmed values.

Yes.

- **Other characters**: Any other initial weapons to seed now?

No, not for now.

### Validation and tooling

- **Validation**: Add checks to ensure:
  - referenced ability slugs exist
  - numeric ranges are sane (e.g., 0 ≤ critChance ≤ 1)
  - two‑handed weapons cannot co‑equip offhand
  - weapon slug exists when referenced by a character
- **Propagation**: Update `scripts/generate-shared-files.ts` if needed so weapon metadata is available in `apps/client` and `apps/server` builds. Confirm.

Yes

### Visuals and audio (optional for v1)

- **Animation cues**: Any special swing arcs, trails, or sounds tied to the weapon beyond generic melee effects? Defer for now?

Not for now.

### Naming and conventions

- **Slug confirmation**: `haanzo-katana` for ID 315; keep consistent with existing armor slugs (kebab‑case). OK?

OK

- **No workspace packages**: Keep weapon types/utilities in‑repo for reliability (consistent with your preference). Confirm.

Yes.
