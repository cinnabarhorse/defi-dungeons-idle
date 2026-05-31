### Potion Farm — Clarifying Questions

Potion Farm is a passive ability attached to the `pitchfork` wearable. When the wearer kills an enemy, it increases the likelihood that the drop will be an HP potion or a Mana potion. This should be server‑authoritative and only influence loot RNG (not combat RNG) per our general abilities conventions.

## Scope

- **Triggers**: Confirm it only triggers on enemy death events caused by the player. Should breakables/environment kills count?
- **Game modes**: PvE only? Any effect in PvP (likely none)?
- **Eligible enemies**: Apply to all enemies, including bosses/elites/summons?
- **Multiple kills**: On multi‑kill events (e.g., AoE), evaluate once per killed enemy independently, correct?

## Attribution Rules (whose ability applies?)

- **Killer vs. contributor**: Use the killer’s ability only, or the top damage contributor within a recent window, or a party rule?
- **Summons/projectiles**: If a minion/projectile owned by a player secures the last hit, attribute to the owner?
- **Party**: In parties, if multiple players have Potion Farm, do we use highest, average, or killer only?

## Items & Catalog

- **Canonical item keys**: Confirm the exact keys for potions in our loot data:
  - HP potion key (e.g., `hp_potion`?)
  - Mana potion key (e.g., `mana_potion`?)
- **Tiers/variants**: Are there multiple sizes/tiers (small/large) today? If yes, include all in scope or just base?
- **Authoritative source**: Should we treat potions as rows in `loot_catalog`/`enemy_drops` (DB‑driven) or in `data/items.ts` (file‑driven) for weighting? If DB‑driven, confirm table/column names you want influenced.

## Mechanics

- **Reweight vs. extra roll**: Should Potion Farm:
  - Reweight the drop table toward potions when a drop occurs (`reweight`),
  - Add an additional independent chance to drop a potion even if the normal roll fails (`extra-roll`),
  - Or both, with caps?
- **Order of operations**: If both, confirm order:
  1. Do normal drop/no‑drop; 2) If drop occurs, reweight selection toward potions; 3) If no drop occurred, do a capped extra potion roll.
- **Replacement vs. additional**: When reweighting, potions replace the selected item (single drop), not add a second item, correct? For `extra-roll`, if it succeeds after a no‑drop, it yields exactly one potion.
- **HP vs. Mana split**: Default 50/50, or biased (e.g., 60/40)? Should we bias dynamically (e.g., based on current missing HP vs. mana), or keep deterministic weights for simplicity/anti‑cheat clarity?
- **Stack sizes**: Do potions drop as single units always, or can Potion Farm increase stack size?
- **Difficulty interaction**: Multiply with `difficulty.dropRateMultiplier` or apply additively? Confirm order.
- **Magic Find interaction**: If `magicFind` is present, should both effects stack multiplicatively on probabilities/weights, or should Potion Farm apply after MF’s influence?

## Stacking & Caps

- **Multiple sources**: If the wearer has multiple items that could grant Potion Farm in the future, should effects stack additively on the bonus portion, or take the highest source only?
- **Global cap**: Hard cap on additional potion probability/weighting (e.g., +15% absolute extra potion chance, or 3× max weight multiplier)?

## UI/UX

- **Tooltip**: Add concise tooltip on `pitchfork` explaining: “Increases chance enemies drop HP or Mana potions.”
- **Feedback**: Show a small “Potion Find!” floater when the ability influences the drop outcome?
- **Stats panel**: Surface an aggregated “Potion Farm” value?

## Telemetry & Anti‑Cheat

- **Logs**: Add `potion_farm_roll` with `{ enemyType, baseWeights/baseChance, pfParams, finalChanceOrWeights, outcome, killerId }` for each influenced decision.
- **Server authority**: Confirm all calculations are server‑side only.

---

## Proposed Implementation Plan (pending your answers)

Below is a concrete plan tied to current server drop flow. It keeps combat RNG unchanged and only influences loot selection.

### 1) Ability Definition (shared config)

- Add a new ability id: `potion-farm`.
- Suggested param schema:

```ts
interface PotionFarmParams {
  mode?: 'reweight' | 'extra-roll' | 'both';
  potionWeightMultiplier?: number; // e.g., 2.5 → potions 2.5× as likely when a drop occurs
  extraPotionRollChance?: number; // e.g., 0.03 → 3% second-chance roll if normal drop failed
  maxExtraChanceCap?: number; // e.g., 0.15 → cap extra chance at +15%
  hpToManaBias?: number; // 0..1; 0.5 = equal split; 0.6 = 60% HP / 40% Mana
}
```

- Attachment point: add to the `pitchfork` wearable in `data/wearables.ts`:

```ts
abilities: [
  {
    id: 'potion-farm',
    params: {
      mode: 'both',
      potionWeightMultiplier: 2.5,
      extraPotionRollChance: 0.03,
      maxExtraChanceCap: 0.15,
      hpToManaBias: 0.5,
    },
  },
];
```

### 2) Aggregation Helper

- Server utility to read ability params from the killer at kill time:
  - `getPotionFarmParamsForPlayer(player): PotionFarmParams | undefined`
  - Lives near other ability helpers (e.g., `apps/server/src/lib/ability-utils.ts`).

### 3) Enemy Death → Loot Hook

- Location: Enemy death/loot pipeline (e.g., `apps/server/src/lib/systems/EnemyDeathSystem.ts` or the drop system it delegates to).
- Add two helpers:
  - `applyPotionFarmReweight(baseWeights, params): weights` — multiplies weights for potion items (`hp_potion`, `mana_potion`) by `potionWeightMultiplier`, then renormalizes.
  - `rollPotionFarmExtra(baseChanceNoDrop, params): { success: boolean; item: 'hp_potion' | 'mana_potion' }` — after a no‑drop outcome, roll `extraPotionRollChance` (clamped by `maxExtraChanceCap`) and, on success, return a potion item chosen by `hpToManaBias`.
- Order of operations (if `mode: 'both'`):
  1. Do normal drop/no‑drop as today.
  2. If drop occurs and the drop table includes potions, reweight with `applyPotionFarmReweight` before item selection.
  3. If no drop occurs, try `rollPotionFarmExtra`. If `success`, yield exactly one potion.
- Difficulty & MF: combine per your decision (e.g., multiply difficulty first, then MF, then Potion Farm; or another fixed order) and document it in comments.

### 4) Data Source Integration

- If DB‑driven (`loot_catalog`, `enemy_drops`):
  - Ensure potion rows exist and are enabled for relevant enemies/tiers.
  - At selection time, reweight in memory (don’t mutate DB). Keep output shape identical.
- If file‑driven (`data/items.ts`):
  - Ensure potions exist in the category used by enemies; reweight locally in the generator.

### 5) UI/UX (light)

- Client: update wearable tooltip for `pitchfork`. Optional: show “Potion Find!” floater when a potion is produced due to the extra roll or reweight.

### 6) Telemetry

- Emit structured logs for each influenced kill:
  - `potion_farm_roll` on extra‑roll attempts
  - `potion_farm_reweight` on modified weight vectors

### 7) Validation & Tests

- Unit tests:
  - Reweight increases potion selection probability monotonically with multiplier.
  - Extra roll produces potions at the expected frequency with bias respected.
- Integration sanity:
  - N kills with and without Potion Farm show higher potion frequency for the wearer.

---

## Decisions Needed

1. Confirm `pitchfork` is the canonical wearable slug and where you want the ability attached in `data/wearables.ts`.
2. Choose the mechanic: `reweight`, `extra-roll`, or `both` (with caps).
3. Provide initial tuning values: `potionWeightMultiplier`, `extraPotionRollChance`, `maxExtraChanceCap`, `hpToManaBias`.
4. Attribution: killer‑only, top‑contributor, or party rule (highest/avg)? Apply the same rule for AoE/summon kills.
5. Items: confirm canonical keys for HP/Mana potions and whether multiple tiers exist.
6. Replacement vs. additional: reweight replaces the selected item; extra‑roll yields exactly one potion after a no‑drop — confirm.
7. Difficulty & MF: define combination order (multiply vs. add; position in pipeline).
8. Stacking: if multiple Potion Farm sources exist later, stack additively on the bonus portion or take highest only? Include a hard cap?
9. UI: enable a small “Potion Find!” floater and update tooltips?
10. Telemetry: confirm event names/fields and retention level.

If you confirm or adjust the above, I’ll implement the server‑side hooks and attach `potion-farm` to `pitchfork` exactly as specified.
