### Item type defaults and rarity scaling (proposal)

This file summarizes suggested default stat effects for each wearable `itemType` across rarities, cross-referenced against the current equipment stats. The intent is to provide consistent baselines that feel sensible and stack well without power creep.

### Equipment stats considered

- **maxHealth**: flat health
- **damage**: flat damage (prefer `damageScalar` for global scaling)
- **damageMin / damageMax**: not used in defaults to avoid conflicting with weapon profiles
- **damageScalar**: multiplicative damage scalar across all sources
- **attackSpeed**: omitted in defaults due to unit ambiguity across profiles
- **meleeAttackRange**: flat melee range (pixels)
- **rangedAttackRange**: flat ranged range (pixels)
- **projectileSpeed**: flat projectile speed (pixels/sec)
- **vacuumRadius**: flat pickup radius (pixels)
- **movementSpeed**: multiplicative movement speed (1.0 is neutral)
- **flatDamageReduction**: flat damage reduction per hit (min clamped to 0)
- **armor**: unified mitigation value (effective percent = clamp(armor / 100, 0, 0.8))

### Rarity scaling guideline

- For additive stats (health, ranges, projectile speed, vacuum): small, increasing steps per rarity.
- For multiplicative stats (movementSpeed, damageScalar): bounded multipliers that feel noticeable but not extreme.
- For defensive stats (flat/percent DR): small at low rarities, scaling to meaningful but safe values at high rarities.

Notes:

- Values below are conservative and intended as stackable baselines. Specific items can still override via `WEARABLE_AUGMENT_DEFINITIONS` or weapon profiles.
- We intentionally avoid `attackSpeed` and `damageMin/Max` in defaults to prevent conflicts with weapon tuning.

### Ready-to-paste TypeScript constant

The following constant covers all `ITEM_TYPES_BY_SLOT` categories. Paste into a suitable module (e.g., `data/wearables.ts`) and wire it where needed. Helper `statsByRarity` compresses the verbosity.

```ts
// If pasting into data/wearables.ts you can type it with the local types.
// import { type ItemTypeEffectsByRarity, type EquipmentEffect, type EquipmentModifierOperation, type EquipmentStat } from './wearables';

type WearableRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

type ModSpec = {
  stat:
    | 'maxHealth'
    | 'damage'
    | 'damageMin'
    | 'damageMax'
    | 'damageScalar'
    | 'attackSpeed'
    | 'meleeAttackRange'
    | 'rangedAttackRange'
    | 'projectileSpeed'
    | 'vacuumRadius'
    | 'movementSpeed'
    | 'flatDamageReduction'
    | 'armor';
  op?: 'add' | 'mul' | 'add_percent';
  values: [number, number, number, number, number, number];
};

function statsByRarity(specs: ModSpec[]): Record<
  WearableRarity,
  {
    type: 'stat';
    modifiers: {
      stat: ModSpec['stat'];
      value: number;
      operation?: ModSpec['op'];
    }[];
  }[]
> {
  const tiers: WearableRarity[] = [
    'common',
    'uncommon',
    'rare',
    'legendary',
    'mythical',
    'godlike',
  ];
  const out: Record<
    WearableRarity,
    {
      type: 'stat';
      modifiers: {
        stat: ModSpec['stat'];
        value: number;
        operation?: ModSpec['op'];
      }[];
    }[]
  > = {
    common: [],
    uncommon: [],
    rare: [],
    legendary: [],
    mythical: [],
    godlike: [],
  } as any;
  for (let i = 0; i < tiers.length; i++) {
    out[tiers[i]] = [
      {
        type: 'stat',
        modifiers: specs.map((s) => ({
          stat: s.stat,
          value: s.values[i],
          operation: s.op,
        })),
      },
    ];
  }
  return out;
}

// Head slot defaults
const HEAD_DEFAULTS = {
  'basic-hat': statsByRarity([
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.02, 1.03, 1.05, 1.07, 1.1, 1.15],
    },
  ]),
  'fancy-hat': statsByRarity([
    {
      stat: 'damageScalar',
      op: 'mul',
      values: [1.02, 1.03, 1.05, 1.08, 1.12, 1.17],
    },
  ]),
  mask: statsByRarity([
    {
      stat: 'armor',
      op: 'add',
      values: [0.02, 0.03, 0.05, 0.07, 0.1, 0.14],
    },
  ]),
  hair: statsByRarity([
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
    },
  ]),
  helmet: statsByRarity([
    { stat: 'flatDamageReduction', op: 'add', values: [1, 2, 3, 4, 5, 6] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.01, 0.02, 0.03, 0.05, 0.07, 0.1],
    },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [0.99, 0.98, 0.97, 0.95, 0.93, 0.9],
    },
  ]),
} as const;

// Body slot defaults
const BODY_DEFAULTS = {
  't-shirt': statsByRarity([
    { stat: 'maxHealth', op: 'add', values: [10, 20, 35, 55, 80, 110] },
  ]),
  pants: statsByRarity([
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.02, 1.04, 1.06, 1.08, 1.1, 1.12],
    },
  ]),
  dress: statsByRarity([
    { stat: 'maxHealth', op: 'add', values: [15, 30, 50, 75, 110, 150] },
  ]),
  'fancy-suit': statsByRarity([
    {
      stat: 'damageScalar',
      op: 'mul',
      values: [1.02, 1.04, 1.06, 1.08, 1.11, 1.15],
    },
  ]),
  'light-armor': statsByRarity([
    { stat: 'flatDamageReduction', op: 'add', values: [1, 2, 3, 4, 5, 6] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.01, 0.02, 0.03, 0.04, 0.06, 0.08],
    },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [0.99, 0.98, 0.97, 0.96, 0.95, 0.94],
    },
  ]),
  'heavy-armor': statsByRarity([
    { stat: 'flatDamageReduction', op: 'add', values: [2, 3, 4, 6, 8, 10] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.02, 0.04, 0.06, 0.09, 0.12, 0.16],
    },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [0.98, 0.96, 0.94, 0.92, 0.9, 0.85],
    },
  ]),
  robe: statsByRarity([
    { stat: 'maxHealth', op: 'add', values: [20, 40, 70, 110, 160, 220] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.01, 0.02, 0.03, 0.05, 0.07, 0.1],
    },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [0.99, 0.98, 0.97, 0.96, 0.95, 0.94],
    },
  ]),
  'fancy-shirt': statsByRarity([
    { stat: 'vacuumRadius', op: 'add', values: [5, 8, 12, 16, 20, 25] },
  ]),
  athletic: statsByRarity([
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.04, 1.07, 1.1, 1.14, 1.18, 1.24],
    },
  ]),
} as const;

// Face slot defaults
const FACE_DEFAULTS = {
  beard: statsByRarity([
    {
      stat: 'damageScalar',
      op: 'mul',
      values: [1.02, 1.03, 1.05, 1.07, 1.1, 1.14],
    },
  ]),
  'face-mask': statsByRarity([
    {
      stat: 'armor',
      op: 'add',
      values: [0.02, 0.03, 0.05, 0.07, 0.1, 0.14],
    },
  ]),
  'other-facial-hair': statsByRarity([
    { stat: 'damage', op: 'add', values: [1, 2, 3, 4, 5, 7] },
  ]),
  accessories: statsByRarity([
    { stat: 'vacuumRadius', op: 'add', values: [5, 8, 12, 16, 20, 25] },
  ]),
  'body-parts': statsByRarity([
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
    },
  ]),
  electronics: statsByRarity([
    { stat: 'projectileSpeed', op: 'add', values: [30, 45, 60, 80, 110, 150] },
    { stat: 'rangedAttackRange', op: 'add', values: [15, 25, 35, 50, 70, 100] },
  ]),
} as const;

// Eyes slot defaults
const EYES_DEFAULTS = {
  eyes: statsByRarity([
    { stat: 'rangedAttackRange', op: 'add', values: [20, 30, 45, 65, 90, 120] },
  ]),
  glasses: statsByRarity([
    { stat: 'projectileSpeed', op: 'add', values: [20, 30, 45, 65, 90, 120] },
  ]),
  shades: statsByRarity([
    { stat: 'rangedAttackRange', op: 'add', values: [15, 25, 35, 50, 70, 100] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.01, 0.02, 0.03, 0.04, 0.06, 0.08],
    },
  ]),
} as const;

// Hands defaults (shared by hands, handRight, handLeft)
const HAND_TYPE_DEFAULTS = {
  grenade: statsByRarity([
    { stat: 'projectileSpeed', op: 'add', values: [30, 50, 70, 90, 120, 160] },
    {
      stat: 'damageScalar',
      op: 'mul',
      values: [1.02, 1.04, 1.06, 1.09, 1.12, 1.16],
    },
  ]),
  shield: statsByRarity([
    { stat: 'flatDamageReduction', op: 'add', values: [2, 3, 4, 6, 8, 10] },
    {
      stat: 'armor',
      op: 'add',
      values: [0.02, 0.04, 0.06, 0.09, 0.12, 0.16],
    },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [0.99, 0.98, 0.97, 0.95, 0.93, 0.9],
    },
  ]),
  flag: statsByRarity([
    { stat: 'vacuumRadius', op: 'add', values: [10, 15, 20, 25, 30, 36] },
    {
      stat: 'movementSpeed',
      op: 'mul',
      values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
    },
  ]),
  sign: statsByRarity([
    { stat: 'vacuumRadius', op: 'add', values: [12, 18, 24, 30, 36, 44] },
    { stat: 'rangedAttackRange', op: 'add', values: [10, 15, 20, 30, 40, 50] },
  ]),
  'ranged-weapon': statsByRarity([
    {
      stat: 'rangedAttackRange',
      op: 'add',
      values: [30, 45, 60, 80, 110, 150],
    },
    { stat: 'projectileSpeed', op: 'add', values: [30, 45, 60, 80, 110, 150] },
  ]),
  'melee-weapon': statsByRarity([
    { stat: 'meleeAttackRange', op: 'add', values: [10, 15, 20, 25, 30, 36] },
    {
      stat: 'damageScalar',
      op: 'mul',
      values: [1.02, 1.04, 1.06, 1.09, 1.12, 1.16],
    },
  ]),
  token: statsByRarity([
    { stat: 'maxHealth', op: 'add', values: [5, 10, 15, 25, 40, 60] },
  ]),
} as const;

// Final mapping covering all slots
export const SUGGESTED_ITEM_TYPE_EFFECTS /*: ItemTypeEffectsByRarity*/ = {
  head: HEAD_DEFAULTS,
  body: BODY_DEFAULTS,
  face: FACE_DEFAULTS,
  eyes: EYES_DEFAULTS,
  hands: HAND_TYPE_DEFAULTS,
  handRight: HAND_TYPE_DEFAULTS,
  handLeft: HAND_TYPE_DEFAULTS,
  pet: {},
  background: {},
  none: {},
} as const;
```

### Implementation notes

- Movement penalties on armor/shields limit kiting while rewarding positioning/tanking.
- Eyes/glasses/shades focus on ranged affordances; shades add a slight DR bonus as a thematic "eye protection" nod.
- Hands defaults complement weapon profiles without overriding them (range/speed scalars rather than raw attack speed).
- Flags/signs lean into utility/pickup gameplay via `vacuumRadius`.

### Additional candidate stats to consider

- **Offense**
  - **critChance**: chance for a critical hit; op: add; clamp: [0, 0.5]
  - **critMultiplier**: damage multiplier on crit; op: mul; clamp: [1, 3]
  - **areaDamageScalar**: multiplier for AoE damage; op: mul; clamp: [0.5, 2]
  - **areaRadius**: AoE radius additive; op: add; clamp: [0, +inf)
  - **projectileCount**: additional projectiles for multi-shot; op: add; clamp: [0, 5]
  - **pierceCount**: number of targets/projectiles can pierce; op: add; clamp: [0, 5]
  - **bounceCount**: bounces before destroy; op: add; clamp: [0, 5]
  - **chainCount**: enemies a projectile can chain to; op: add; clamp: [0, 5]
  - **lifestealPercent**: heal % of damage dealt; op: add; clamp: [0, 0.4]

- **Defense**
  - **thornsPercent**: reflect % of received damage; op: add; clamp: [0, 0.5]
  - **thornsFlat**: flat damage reflect; op: add; clamp: [0, +inf)
  - **shieldCapacity**: temporary barrier max; op: add; clamp: [0, +inf)
  - **shieldRegenPerSecond**: barrier regen; op: add; clamp: [0, +inf)
  - **shieldRechargeDelayReduction**: shorter delay before shield starts regenerating; op: add; clamp: [0, 2]
  - **evasionChance**: chance to avoid an incoming hit; op: add; clamp: [0, 0.4]
  - **blockChance**: chance to reduce hit by flat/percent; op: add; clamp: [0, 0.4]
  - **healingReceivedScalar**: multiplier to all incoming heals; op: mul; clamp: [0.5, 2]
  - **healthRegenPerSecond**: passive health regen; op: add; clamp: [0, +inf)

- **Mobility / Control**
  - **dashCooldownReduction**: reduces dash cooldown; op: add; clamp: [0, 0.6]
  - **dashDistanceScalar**: scales dash distance; op: mul; clamp: [0.5, 2]
  - **accelerationScalar**: movement acceleration; op: mul; clamp: [0.5, 2]
  - **turnSpeedScalar**: faster rotation/retarget; op: mul; clamp: [0.5, 2]

- **Ranged / Projectile**
  - **spreadScalar**: projectile spread (lower is tighter); op: mul; clamp: [0.5, 1.5]
  - **reloadSpeedScalar**: if/when ammo systems used; op: mul; clamp: [0.5, 2]
  - **ammoCapacityAdd**: additional magazine capacity; op: add; clamp: [0, +inf)

- **Melee**
  - **cleaveAngle**: degrees of cleave arc; op: add; clamp: [0, 180]
  - **cleaveTargets**: number of extra targets hit in cleave; op: add; clamp: [0, 5]
  - **knockbackPower**: knockback strength; op: add; clamp: [0, +inf)

- **Ability / Aura**
  - **abilityPower**: scalar applied to generic ability damage/heal numbers; op: mul; clamp: [0.5, 2]
  - **cooldownReduction**: reduces ability cooldowns; op: add; clamp: [0, 0.4]
  - **abilityChargesAdd**: extra ability charges; op: add; clamp: [0, 3]
  - **auraRadius**: radius for aura effects; op: add; clamp: [0, +inf)
  - **auraPotencyScalar**: multiplier for aura magnitude; op: mul; clamp: [0.5, 2]

- **Vision / Utility / Economy**
  - **visionRadiusScalar**: fog-of-war vision multiplier; op: mul; clamp: [0.5, 2]
  - **lootFindChance**: chance for extra loot roll; op: add; clamp: [0, 0.5]
  - **dropQuantityScalar**: multiplier to quantity for eligible drops; op: mul; clamp: [0.5, 2]
  - **xpGainScalar**: multiplier to XP gains; op: mul; clamp: [0.5, 2]
  - **goldFindScalar**: multiplier to currency pickup (e.g., GHST) if applicable; op: mul; clamp: [0.5, 2]
  - **vacuumSpeedScalar**: how fast pickups move to player; op: mul; clamp: [0.5, 2]

- **Status effects (chance/power/duration)**
  - **bleedChance / bleedPower / bleedDuration**: on-hit DoT; ops: add/add/add; clamps: [0,0.5]/[0,+inf)/[0,+inf)
  - **poisonChance / poisonPower / poisonDuration**: on-hit DoT; similar clamps
  - **burnChance / burnPower / burnDuration**: on-hit DoT; similar clamps
  - **slowChance / slowPower / slowDuration**: movement slow; power clamp: [0, 0.8]
  - **stunChance / stunDuration**: hard CC; keep conservative clamps: [0, 0.2]/[0, 1.0]
  - **statusResist**: generic reduction to negative status durations; op: add; clamp: [0, 0.8]

Example STAT_CONFIG entries if any of these are adopted:

```ts
// Pseudocode additions to STAT_CONFIG
critChance: { op: 'add', isPercent: true, clamp: [0, 0.5] },
critMultiplier: { op: 'mul', clamp: [1, 3] },
lifestealPercent: { op: 'add', isPercent: true, clamp: [0, 0.4] },
thornsPercent: { op: 'add', isPercent: true, clamp: [0, 0.5] },
healthRegenPerSecond: { op: 'add', clamp: [0, Number.POSITIVE_INFINITY] },
cooldownReduction: { op: 'add', isPercent: true, clamp: [0, 0.4] },
visionRadiusScalar: { op: 'mul', clamp: [0.5, 2] },
```
