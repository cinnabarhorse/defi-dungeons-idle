# Wearables Idle Mode Audit (Half-Relevant or Irrelevant)

Context: Based on `apps/server/src/rooms/IdleMode.ts`, Idle Mode uses
`attackSpeed`, `meleeAttackRange`, `rangedAttackRange`, `totalDamage`,
`damage`, `maxHealth`, `hpRegen`, and `tongue-farm` (loot table).
It does not use `movementSpeed`, `projectileSpeed`, `vacuumRadius`,
or the `evade`, `thorns`, `magic-find` abilities.

## Lore-Friendly Alternatives

### Replacements for `projectileSpeed`
- "Arcane focus": `rangedAttackRange` (longer reach via better aim)
- "Powder charge": `totalDamage` (harder hits from stronger shots)
- "Quick draw": `attackSpeed` (faster readied shots)
- "Piercing precision": `damage` (flat damage boost)
- "Spell channeling": `hpRegen` (steadying breathing, fits staves/bows)

### Replacements for `movementSpeed`
- "Battle tempo": `attackSpeed` (faster action cadence)
- "Stalwart frame": `maxHealth` (heavier gear = sturdier)
- "Second wind": `hpRegen` (recovery between turns)
- "Measured strikes": `totalDamage` (deliberate, stronger hits)
- "Guarded stance": `damage` (consistent output without speed)

## Hand Slot (buildHandSlotEffects)
- grenade: `projectileSpeed` (irrelevant)
- shield: `movementSpeed` (irrelevant)
- flag: `vacuumRadius` (irrelevant), `movementSpeed` (irrelevant)
- sign: `vacuumRadius` (irrelevant)
- staff: `projectileSpeed` (irrelevant)
- bow: `projectileSpeed` (irrelevant)
- gun: `projectileSpeed` (irrelevant)
- lasso: `projectileSpeed` (irrelevant)
- spear: `movementSpeed` (irrelevant)
- dagger: `movementSpeed` (irrelevant)
- light: `movementSpeed` (irrelevant), `vacuumRadius` (irrelevant)
- exotic: `movementSpeed` (irrelevant), `projectileSpeed` (irrelevant)
- electronics: `projectileSpeed` (irrelevant)
- token: `vacuumRadius` (irrelevant), `movementSpeed` (irrelevant)

## Head
- hair: `movementSpeed` (irrelevant)
- helmet: `movementSpeed` (irrelevant)

## Body
- pants: `movementSpeed` (irrelevant)
- vest: `movementSpeed` (irrelevant)
- light-armor: `movementSpeed` (irrelevant)
- heavy-armor: `movementSpeed` (irrelevant)
- robe: `movementSpeed` (irrelevant)
- fancy-shirt: `vacuumRadius` (irrelevant)
- athletic: `movementSpeed` (irrelevant)

## Face
- accessories: `vacuumRadius` (irrelevant)
- body-parts: `movementSpeed` (irrelevant)
- electronics: `projectileSpeed` (irrelevant)

## Eyes
- glasses: `projectileSpeed` (irrelevant)

## Pet
- rofl: `movementSpeed` (irrelevant)
- aave-boat: `movementSpeed` (irrelevant)
- nimbus: `movementSpeed` (irrelevant), `evade` (irrelevant ability)
- sus-butterfly: `evade` (irrelevant ability)
- radar: `vacuumRadius` (irrelevant)
- foxy-tail: `magic-find` (irrelevant ability)
- cacti: `thorns` (irrelevant ability)
