### Magic Find — Clarifying Questions

Magic Find (MF) is a new base stat that increases the chances of loot and improves the quality of loot from enemy drops, portal/treasure flows, and other loot-based RNG. It must not affect combat RNG such as Critical Strike, Evade, Stun, etc.

Please confirm the following so we can implement MF aligned with `docs/ABILITIES.md` and our server‑authoritative loot systems.

## Scope

- **Who has MF**: Players only via character base stats and equipment? Should enemies/NPCs ever have MF?
- **Game modes**: PvE only? Any effect in PvP (likely none)?
- **Sources**: Can MF come from characters, weapons, wearables, temporary buffs, room modifiers, or difficulty tiers?
- **Affects which RNG**: Confirm MF only influences loot-related RNG:
  - Enemy death: drop/no-drop, rare-material drops (e.g., `lick_tongue`), item category and item rarity
  - Portal outcomes: chance to go to Treasure Room vs New Map
  - Treasure chest rewards: coin/USDC amounts and/or probability of USDC being present
  - Map/difficulty: interaction with `dropRateMultiplier` in difficulty tiers
  - Any other loot-centric RNG to include?

## Attribution Rules (who’s MF applies?)

- **Enemy death**: Use MF of the killer only, or the top damage contributor within a recent window (e.g., last 5s), or party-based aggregation? If party-based, which policy: highest-of, average-of, sum-of (with cap)?
- **Treasure/portal**: When a portal is used by one player but teleports all players, whose MF should influence the Treasure Room chance and chest rewards? Highest in room, party average, or the interacting player only?
- **Summons/projectiles**: If a pet/projectile owned by a player gets the last hit, count the owner’s MF?

## Units, Stacking, Caps

- **Unit**: Use fraction (e.g., `0.20` for +20%) for all internal calculations? (Recommended: fraction.)
- **Stacking**: Additive across sources (character + weapon + wearables, etc.)? Any multiplicative sources? Any diminishing returns on the final total?
- **Global cap**: Hard or soft cap on total MF (e.g., hard cap 300%)?
- **Diminishing returns**: Prefer a simple DR curve to keep balance? Options:
  - Linear: `effective = totalMF`
  - Hyperbolic: `effective = totalMF / (totalMF + K)`; choose `K` (e.g., `K = 1`)
  - Log: `effective = ln(1 + A*totalMF) / ln(1 + A)`

## What “better items” means

- **Category weighting**: Should MF bias categories (e.g., more `wearable`/`weapon`, fewer `coin`), or leave categories unchanged and only affect rarity?
- **Rarity weighting**: Confirm MF should increase the probability of higher item rarities (`uncommon` → `legendary`). Provide a desired baseline rarity distribution or accept a proposed one (see Implementation Plan).
- **Quantity effects**: Should MF increase stack sizes (e.g., more coins/materials) in addition to rarity?
- **Special drops**: Should MF increase chances of special/rare items like `lick_tongue`?

## Portal Guardian and Treasure Integration

- **Portal Guardian spawn**: Should MF increase the chance to spawn a Portal Guardian at all, or only affect rewards/outcomes after defeating it?
- **Portal outcomes**: Should MF increase `Treasure Room` routing probability?
- **Treasure chest**: Should MF increase probability and/or amount of USDC returned by `calculateTreasureReward`? If yes, by shifting expected value, volatility, or both?

## Interactions and Exclusions

- **Combat RNG exclusion**: Confirm MF does NOT affect Critical Strike, Evade, Stun, Cleave, or any combat-related rolls.
- **Difficulty tier**: Should MF multiply with `dropRateMultiplier` from difficulty tiers, or apply as an additive bonus in a separate step? Order of operations?
- **Future-proofing**: Do you want separate sub-stats later (e.g., `mfDropChance` vs `mfRarity`) or keep a single MF stat that influences all loot knobs?

## UI/UX

- **Display**: Show aggregated MF % in character panel/tooltips? Add a “Lucky!” floater when MF upgrades an item’s rarity?
- **Tooltips**: Should tooltips include short explanations like “+20% Magic Find increases drop chance and item rarity”?

## Telemetry & Anti‑Cheat

- **Logs**: Log MF used for each loot decision (`enemy_drop_roll`, `rarity_roll`, `portal_outcome_roll`, `treasure_reward_roll`) with contributing player id(s).
- **Server authority**: Confirm all MF computations are server-only (no client influence).

---

## Proposed Implementation Plan (pending your answers)

Below is a concrete plan tied to current code paths so we can implement MF without touching combat RNG.

### 1) Data Model: Add a new equipment/base stat

- Add `magicFind` to shared character stats and equipment modifiers:
  - `data/characters.ts`:
    - Extend `CharacterStats` with `magicFind?: number` (default 0)
    - Extend `CharacterDerivedStats` via aggregation (final numeric `magicFind` on both client/server builds)
  - `data/wearables.ts`:
    - Add `'magicFind'` to `EQUIPMENT_STATS`
    - Allow `StatEquipmentEffect` to target `{ stat: 'magicFind', value, operation }`
    - Include example wearable effect entries later (balance pass)
  - Regenerate shared files (`apps/*/src/data/*`) via `scripts/generate-shared-files.ts`.

Notes:

- Use fraction units for MF (e.g., `0.25` = +25%).
- Respect existing `applyModifierValue` semantics for add/mul/min/max.

### 2) Aggregation Helper

- Server: add a small helper (location preference):
  - `apps/server/src/lib/ability-utils.ts` or `apps/server/src/lib/player-stats.ts`
  - `function getPlayerMagicFind(player: PlayerSchema): number` → reads derived stats for the player’s `characterId` via `getCharacterStats()` and returns `stats.magicFind || 0`.
  - Optional `getPartyMagicFind(room: GameRoom, players: PlayerSchema[]): number` if we apply group rules.

### 3) Loot RNG Hooks (Enemy Drops)

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - Replace hardcoded rolls with MF‑aware functions:
    - Base drop/no‑drop: current `0.7` → `finalChance = clamp( baseChance * (1 + effectiveMFDrop), 0, 1 )`
    - Special drop (`lick_tongue`): boost with MF via the same pattern or a rarer-specific multiplier
  - Introduce helpers:
    - `computeEffectiveMF(totalMF: number): number` (per your DR decision)
    - `applyMFToChance(base: number, mf: number): number`
  - Attribution: use killer/top‑contributor MF or group MF per your answer

- File: `apps/server/src/data/items.ts`
  - Add MF‑aware item selection:
    - New `generateRandomItemTypeWithMF(mf: number): string`
      - Option A (category bias): Reweight `ITEM_DROP_RATES` towards `wearable`/`weapon` as MF increases
      - Option B (rarity bias only): Keep category roll unchanged
    - New `generateItemDataWithMF(itemType: string, mf: number): any`
      - Reweight item rarity within the chosen category. Proposed baseline rarity weights (subject to your approval):
        - common: 100, uncommon: 40, rare: 12, epic: 4, legendary: 1
      - MF transforms weights, e.g., `weight' = weight / (1 + R * effectiveMF)^(rarityTier)` where `R` is a tuning constant and `rarityTier` increases with rarity
      - Alternatively implement a simple “rarity upgrade roll” with MF increasing the chance to step up 1–2 tiers
  - Keep output shape identical for client compatibility (`name`, `type`, `quantity`, `rarity`, etc.)

### 4) Portal and Treasure Integration

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - If you want MF to affect portal guardian spawn chance, modify spawn logic after normal kill flow using `applyMFToChance`

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts` → `handlePortalInteraction`
  - Current treasure routing chance per portal type (e.g., `og: 0.4`) → adjust with MF: `finalTreasureChance = applyMFToChance(baseChance, partyMF)` per your party rule

- Files: `apps/server/src/data/difficulty-tiers.ts` and `apps/server/src/rooms/GameRoom.ts`
  - `calculateTreasureReward(tierId)` → add optional `mf` param and adjust curve:
    - Option A: Increase expected value slightly with MF (bounded by tier `maxEarnings`)
    - Option B: Keep expected value same, but tilt distribution to increase high‑end tail probability
    - Option C: Combine A and B with conservative caps
  - In `GameRoom.handleOpenChest`, pass MF (killer/interactor/highest‑in‑room) into `calculateTreasureReward`

### 5) Difficulty Tier Interaction

- MF should combine with `dropRateMultiplier` (difficulty tiers). Proposed order (confirm):
  - `finalDropChance = clamp( baseChance * difficulty.dropRateMultiplier * (1 + effectiveMF), 0, 1 )`
  - Keep rarity weighting separate but use the same `effectiveMF`

### 6) UI/UX (light)

- Client: display aggregated MF % in character details and tooltips
- Optional floater when MF upgrades rarity (e.g., “Lucky!”)

### 7) Telemetry

- Add structured logs for:
  - `enemy_drop_roll { enemyType, baseChance, mf, finalChance, dropped, killerId }`
  - `rarity_roll { baseWeights, mf, finalWeights, resultRarity }`
  - `portal_outcome_roll { portalType, baseChance, mf, finalChance, outcome }`
  - `treasure_reward_roll { tierId, mf, amount, probability, expectedValue }`

### 8) Validation & Tests

- Unit tests:
  - `computeEffectiveMF` (DR function)
  - Chance application monotonicity with MF
  - Rarity weighting increases higher‑rarity outcomes as MF rises
- Integration sanity:
  - Kill enemy with MF=0 vs MF>0: higher drop frequency and higher rarity over N trials
  - Portal treasure routing probability increases with MF (if enabled)
  - Treasure reward distribution shifts as specified (if enabled)

---

## Decisions Needed

Please answer these to lock the spec:

1. Unit/stacking/cap/DR: fraction units, additive stacking, any hard/soft cap, and which DR curve/constant?
2. Attribution: killer‑only, top‑contributor, or party rule (highest/avg/sum)? Apply the same rule to treasure routing and chest rewards?
3. Category vs rarity: Should MF bias item categories or only affect rarity within a category?
4. Special drops: Should MF increase `lick_tongue` drop chance and by how much relative to base?
5. Portal Guardian: Affect spawn chance? If yes, how strongly vs base?
6. Treasure: Should MF change the chance to go to Treasure Room, the USDC reward curve, or both?
7. Difficulty interaction: Multiply with `dropRateMultiplier` or apply additively? Confirm order.
8. UI: Where to display MF and do we want a “Lucky!” floater on rarity upgrades?

If you confirm or adjust the above, I’ll proceed with the implementation exactly as specified.
