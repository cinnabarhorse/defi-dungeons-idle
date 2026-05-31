### Cleave – Clarifying Questions

Please confirm the following so we can implement Cleave aligned with the abilities approach in `docs/ABILITIES.md` and the server-authoritative action system in `docs/ATTACK_SYSTEMS.md`.

## Scope

- **Targets**: Should Cleave apply to both players and enemies? Any exceptions (bosses, elites, environment)?

Yes, no exceptions.

- **Attack types**: Confirm Cleave is melee-only. Should we ever allow ranged/projectiles to cleave in the future?

No, we will have a separate ability for that called multishot that we'll create later.

- **PvP**: Enabled in PvP?

Yes.

- **Environment**: Should Cleave affect breakables/objects?

Yes.

## Geometry & Targeting

- **Area shape**: Confirm a circular radius centered on the attacker (not a forward cone/arc). If you prefer a cone, specify angle in degrees.

Probably cone or arc would be better. I'm not sure about the degrees, but do something that feels correct.

- **Radius source**: Should Cleave use the character's melee `attackRange` or a separate `radius` param on the ability?

Yes, it should use the character's melee attack range.

- **Max targets**: Unlimited targets within radius, or a maximum? If capped, what initial value?

I think there could be a target maximum. Let's cap it at three for now.

- **Line-of-sight**: Should walls/obstacles block Cleave hits? Default is no (simple radius check).

No, not for now.

## Damage & Scaling

- **Per-target damage**: Use normal melee damage per target, or scale via a `damageMultiplier` param (e.g., 0.8× on cleave hits)?

I like the idea of a damage multiplier. Let's use that.

- **Falloff**: Any damage falloff as the number of hit targets increases?

No.

- **Critical Strike interaction**: Roll crit once per-target or once per-swing? (Industry norm: per-target.)

Her swing feels better, honestly.

- **Life Steal interaction**: For AoE, compute healing from the actual damage dealt per target. Should rounding occur per target or after summing total dealt?

After summing the total.

## Cooldowns & Costs

- **Cooldown**: Passive (always-on) or add an extra cooldown when Cleave is present?

We'll make it a passive for now.

- **Resource cost**: Any stamina/energy/mana considerations now or planned?

No current resource cost.

## Stacking & Combination Rules

- **Multiple sources**: If character + weapon + wearable grant Cleave, how do we combine parameters?
  - `radius`: additive, max-of, or highest source only?
  - `maxTargets`: additive or max-of?
  - `damageMultiplier`: additive on the bonus portion vs multiplicative vs max-of?

  I'm not sure whatever is industry standard.

## Data Model

- **Ability id**: Confirm `id: 'cleave'`.
- **Params (proposal)**:
  - `radius: number` (pixels)
  - `maxTargets?: number` (omit for unlimited)
  - `damageMultiplier?: number` (default `1` for full damage)
  - `appliesTo?: 'melee' | 'all'` (default `'melee'`)
  - `includeBreakables?: boolean` (default `false`)
  - `lineOfSight?: boolean` (default `false`)

  Looks about right, you probably need to add in the radius cone as well.

Attach via data like:

```ts
abilities: [
  {
    id: 'cleave',
    params: {
      radius: 60,
      maxTargets: 3,
      damageMultiplier: 1,
      appliesTo: 'melee',
    },
  },
];
```

## Engine Integration (Server-Authoritative)

- Implemented within the melee branch of `AttackEnemyAction` at impact time (action system-driven). We will:
  - Find all valid enemy targets within `radius` of the attacker.
  - Apply per-target damage (respecting Critical Strike rules) and broadcast one `damage_applied` per target.
  - Aggregate Life Steal from the total actual damage dealt (or per-target if you prefer per-target rounding).
  - Maintain existing `attack_started` broadcast and animation timing.
- Enemy Cleave: When enemies with Cleave perform a melee attack, damage all players within radius using the same rules.

## UI / FX (Optional)

- **Floaters**: Show damage floaters per target; crit floaters remain bigger/more intense red.
- **VFX**: Optional radial swipe effect; skip initially if not needed.
- **HUD**: Display Cleave parameters (radius, max targets) in character panel/tooltips.

## Bushidogotchi Rollout (Initial)

- **Character id**: `bushidogotchi` (as in `data/characters.ts`).
- **Initial values (proposal)**:
  - `radius: 60`
  - `maxTargets: 3`
  - `damageMultiplier: 1`
  - `appliesTo: 'melee'`

## Validation

- Basic server validation: hitting multiple enemies in range damages all of them once per swing; Life Steal increases with more targets when present.
- No additional tests required unless you want unit/e2e coverage now.

---

If you confirm the above (or adjust where needed), we’ll implement `cleave` on the server melee path using the action system and add it to Bushidogotchi.
