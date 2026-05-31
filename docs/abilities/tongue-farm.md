### Tongue Farm — Clarifying Questions

Tongue Farm is a passive ability attached to the following wearables: `lick_tentacle`, `lick_eyes`, `lick_tongue`, and `lick_brain`. When the wearer kills an eligible enemy, it increases the probability that the enemy drops a Lick Tongue. The effect should apply only to Lickquidator-type enemies.

Please confirm the details below so we can implement Tongue Farm consistently with `docs/ABILITIES.md` and our server‑authoritative loot systems.

## Scope

- **Trigger**: Confirm it triggers on enemy death events attributable to the wearer. Should environment/breakable kills count?
- **Game modes**: PvE only? Any effect in PvP (likely none)?
- **Eligible enemies**: Only Lickquidator‑type enemies. Should elites/boss variants of Lickquidators be eligible as well?
- **Multi‑kill**: On AoE or chain kills, evaluate once per killed enemy independently, correct?

## Enemy Tagging (Lickquidator identification)

- **Authoritative file**: Confirm we should tag Lickquidators in `data/enemies.ts` (and propagate to server via the shared generation flow), not inside app‑specific copies.
- **Tagging shape**: Prefer `tags: ['lickquidator']` for flexibility over a boolean like `isLickquidator: true`. Approve?
- **Coverage**: Which exact enemy ids are Lickquidators today? Please list canonical ids to tag.

## Items & Catalog

- **Canonical item key**: Confirm the exact slug for the drop item (e.g., `lick_tongue`). If different, provide the canonical key.
- **Data source of truth**: Should the tongue drop be modeled in DB tables (`loot_catalog`, `enemy_drops`) per recent migrations, or file‑driven via `data/items.ts`? If DB‑driven, confirm the target tables/columns we should influence.
- **Baseline chance**: What is the base (no ability) drop chance for Lick Tongue from Lickquidators? If not yet defined, provide an initial baseline (e.g., `0.02`).

## Mechanics

- **Additive model**: You mentioned additive stacking and different values per wearable. Do you want the following pattern?
  - Each of the four wearables attaches `tongue-farm` with its own `bonusChance` (fraction, e.g., `0.01` = +1%).
  - At kill time, we sum all `bonusChance` values from all equipped sources with `id: 'tongue-farm'` and add that to the base chance for eligible enemies.
- **Duplicates**: Can a player equip multiple of these Lick wearables simultaneously (different slots)? If yes, should all bonuses stack additively? Confirm no duplicate of the same item per slot.
- **Hard cap**: Provide a global cap for the total additive bonus (e.g., `maxAdditiveCap = 0.20` so base + bonuses ≤ 20% absolute increase).
- **Additional vs. replacement**: Should the Lick Tongue be an additional special drop alongside normal loot when the roll succeeds, or replace the normal selected drop?
- **Order of operations**: Confirm how Tongue Farm integrates with other modifiers:
  - Difficulty tiers (e.g., `dropRateMultiplier`)
  - Magic Find (MF) if it also affects special drops
  - Proposed default: `finalChance = clamp( baseChance × difficultyMultiplier + sumTongueFarmBonuses, 0, 1 )`, or choose a different formula and order.

## Attribution Rules (whose ability applies?)

- **Killer vs. contributor**: Use the killer’s equipment only, or the top damage contributor within a short window, or a party rule (highest/average)?
- **Projectiles/summons**: If a minion/projectile owned by the player secures the last hit, attribute to the owner?
- **Party stacking**: If multiple party members tag the enemy, do we ever combine Tongue Farm bonuses across players? Default recommendation: killer‑only.

## Interactions & Exclusions

- **MF interaction**: Should MF also boost this special drop, and if so, combine with Tongue Farm additively on the bonus portion, or multiplicatively on final chance? Specify the exact formula and cap behavior.
- **Combat RNG exclusion**: Confirm Tongue Farm does not affect combat RNG (crit, evade, etc.).

## UI/UX

- **Tooltips**: Short tooltip line on each of the four wearables, e.g., “Increases chance to loot a Lick Tongue from Lickquidators.”
- **Feedback**: Optional floater on success (e.g., “Tongue Farm!”) when the special drop is produced.

## Telemetry & Anti‑Cheat

- **Structured logs**: Log `tongue_farm_roll` with `{ enemyId, enemyKind, baseChance, bonusesBySource, totalBonus, difficulty, mf, finalChance, outcome, killerId }`.
- **Server authority**: Confirm all rolls and outcomes remain server‑side only and are replay‑safe.

## Data Model (proposal)

Option A (recommended; simplest stacking across wearables): each wearable attaches its own instance with a single bonus value.

```ts
interface TongueFarmParams {
  bonusChance: number; // fraction; e.g., 0.01 = +1% absolute
  appliesToEnemyTags?: string[]; // default ['lickquidator']
}
```

Example attachment on a wearable in `data/wearables.ts`:

```ts
abilities: [
  {
    id: 'tongue-farm',
    params: {
      bonusChance: 0.01, // example per‑wearable tuning
      appliesToEnemyTags: ['lickquidator'],
    },
  },
];
```

Option B (centralized mapping): a single instance could define a per‑wearable map, but this is harder to maintain and not recommended unless you want one item to encode all values.

```ts
interface TongueFarmParamsMapped {
  additiveChanceByWearable: Record<
    'lick_tentacle' | 'lick_eyes' | 'lick_tongue' | 'lick_brain',
    number
  >;
  appliesToEnemyTags?: string[]; // default ['lickquidator']
  maxAdditiveCap?: number; // optional global cap on the summed bonus
}
```

## Proposed Implementation Plan (pending your answers)

1. **Ability Definition**
   - Add `id: 'tongue-farm'` to `data/abilities.ts` with `TongueFarmParams` from Option A above.

2. **Enemy Tagging**
   - In `data/enemies.ts`, add `tags: ['lickquidator']` to the specified enemy ids.

3. **Server Hook (enemy death → special drop)**
   - In the enemy death/loot pipeline, compute `totalBonus = sum(params.bonusChance)` across equipped sources with `id: 'tongue-farm'` on the attributed player.
   - Combine with base chance and other modifiers per your formula/order decision; clamp with the agreed cap.
   - On success, award the `lick_tongue` item as additional or replacement loot per your choice.

4. **Wearables Attachment & Tuning**
   - Attach `tongue-farm` to `lick_tentacle`, `lick_eyes`, `lick_tongue`, `lick_brain` in `data/wearables.ts` with per‑item `bonusChance` values you provide.

5. **Telemetry**
   - Emit `tongue_farm_roll` logs including base chance, bonuses by source, and final outcome.

6. **Validation & Tests**
   - Unit: monotonicity (higher summed bonus → higher observed drop frequency), cap respected, attribution rules respected.
   - Integration: runs of N kills on Lickquidators with/without ability show expected deltas.

---

## Decisions Needed

1. Provide the canonical enemy ids to tag with `tags: ['lickquidator']` in `data/enemies.ts`.
2. Confirm the canonical item key for Lick Tongue (e.g., `lick_tongue`).
3. Specify the base drop chance for Lick Tongue from Lickquidators (no ability).
4. Choose the stacking formula and cap:
   - Additive per‑wearable `bonusChance` (Option A), with `maxAdditiveCap = ?`.
   - Order with difficulty and MF; provide the exact formula (additive vs multiplicative pieces).
5. Attribution rule: killer‑only, top‑contributor, or party. Define projectile/summon ownership.
6. Additional vs. replacement: should Lick Tongue drop in addition to normal loot, or replace the selected drop when it procs?
7. UI: enable a small “Tongue Farm!” floater on success and update four wearable tooltips accordingly?
8. Telemetry: confirm event name/fields and whether to log on every eligible kill or only on successful rolls.

If you answer the above, I’ll implement Tongue Farm server‑side, tag the enemies, attach the ability to the four wearables, and wire telemetry as specified.
