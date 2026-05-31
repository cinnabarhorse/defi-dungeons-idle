## Descending Changes: Floor-Based Intensity and Boss Loot Depth Bonus

### Goals

- Keep `difficultyTier` constant while descending floors.
- On each descent (next_floor), increase the within-tier Intensity meter by a fixed amount.
- Improve boss loot the deeper you go without inflating economy beyond caps.
- Do not restore player HP/MP on portal transitions (descending or boss).

## Summary of Proposed Behavior

- **Intensity on descent**: When using a “next floor” portal, increment `enemyDifficultyLevel` by +5. The time-based meter continues as-is (no cadence reset).
- **Tier remains constant**: Do not change `difficultyTier` on `next_floor`. Only explicit “new map” transitions may advance tier (if we keep that behavior).
- **No auto-heal**: Remove portal-induced full-heal on both boss entry and floor transitions.
- **Boss loot depth bonus**: The deeper the floor, the better the boss drops. Implement a depth-based modifier that:
  - Increases the chance/quality of boss chest items (e.g., better wearable quality and/or category weighting).
  - Increases the probability (not necessarily the expected value amount) of GHST/USDC boss currency drops within safe caps.
- **Leverage preserved**: Do not reset Leverage when descending or entering the boss room. Keep `floorLeverage`, `roomLeverage`, and `leverageTotal` unchanged across transitions.

## Implementation Plan (No Code in this doc)

### 1) Floor-based Intensity Bump (+5 per descent)

- Trigger at portal interaction when `destination === 'next_floor'`.
- Call a small helper on the room to nudge Intensity by a fixed amount (default 5):
  - `incrementEnemyDifficultyLevel(delta = 5, reason = 'next_floor')`.
  - This should only mutate `state.enemyDifficultyLevel` and should not reset `enemyDifficultyNextAt` (to preserve the cadence).
- Do not change `difficultyTier` for `next_floor` (it remains the same tier).
- Keep time-based ticks unchanged and continuing in the background (pause/resume during transitions already exists).

Config

- `GAME_CONFIG.enemyDifficultyMeter.floorDescendDelta: number` (default: 5).

Hook points

- `apps/server/src/lib/systems/EnemyDeathSystem.ts` → `handlePortalInteraction(...)` on `next_floor` portals.
- `apps/server/src/rooms/GameRoom.ts` → add `incrementEnemyDifficultyLevel(...)` helper near other meter functions.

### 2) Keep Tier Constant on Descent

- Ensure `next_floor` uses the current `difficultyTier` when creating the next map.
- Only advance `difficultyTier` for explicit `destination === 'new_map'` (if we want that mode to still exist).

Hook points

- `apps/server/src/lib/systems/EnemyDeathSystem.ts` → `handlePortalInteraction(...)` logic that currently advances tier for all non-boss transitions should be split to only advance on `new_map`, not on `next_floor`.

### 3) Remove Auto-Heal on Portal Transitions

- Remove/avoid `player.hp = player.maxHp` on:
  - Boss room entry: `transitionAllPlayersToBossRoom(...)`.
  - New floor: `transitionAllPlayersToNewMap(...)`.
- Preserve existing HP and MP; no full-heal. If max stats change at other times (e.g., equipment changes), prefer preserving health ratio rather than force-heal.

Hook points

- `apps/server/src/lib/systems/WorldTransitionSystem.ts`:
  - Inside `transitionAllPlayersToBossRoom(...)` – remove HP reset.
  - Inside `transitionAllPlayersToNewMap(...)` – remove HP reset.

### 3b) Preserve Leverage across Floor and Boss Transitions

- Requirement: Leverage remains the same when descending or entering a boss room; do not reset on floor switches.
- Remove the leverage reset call during floor transitions and ensure boss transitions never touch leverage.

Hook points

- `apps/server/src/lib/systems/WorldTransitionSystem.ts` → in `transitionAllPlayersToNewMap(...)`:
  - Currently calls `resetLeverageForNewFloor({ broadcast: true })`. Remove/skip this to preserve leverage values.
- `apps/server/src/lib/systems/LeverageSystem.ts`:
  - `resetLeverageForNewFloor(...)` resets `floorLeverage`/`roomLeverage`. Avoid invoking this on transitions.
  - Continue to use `recomputeLeverageTotal(...)` when leverage values legitimately change (outside transitions), but do not reset values on map moves.

Considerations

- Preserve lock state and timers (e.g., room leverage lock timeout) through transitions unless there is a clear exploit. If timers need pausing during transitions, pause/resume without value reset.
- Telemetry should capture leverage continuity across transitions to confirm correct behavior.

### 4) Boss Loot Depth Bonus

We will integrate `currentFloor` into both boss chest items and boss currency drops to reward deeper runs. We emphasize probability and quality bias rather than unbounded value inflation, with caps to protect economy.

Source of floor index

- `currentFloor` is incremented at map transitions and is accessible on the `room` instance.

#### 4a) Boss Chest Items (quality and category bias)

- For boss drops spawned via the chest-like path, apply a depth factor to increase the chance of “excellent” items (wearables of higher quality) and, optionally, nudge category weighting toward wearables.

Design

- Define rarity bands as `legendary | mythical | godlike` (rarity) — this is correct.
- Also apply depth-based bias to wearable quality state (independent of rarity): `broken | budget | average | excellent | flawless` (quality modifiers). Depth should push rolls away from `broken/budget` toward `excellent/flawless`, within caps.
- Introduce per-floor quality multipliers applied only for boss chest wearable selection:
  - Example (tunable defaults):
    - `legendary`: +2% weight per floor
    - `mythical`: +1% weight per floor
    - `godlike`: +0.5% weight per floor
  - Apply caps to avoid runaway outcomes (e.g., +50% absolute cap per quality).
- Optional: Reweight category selection for boss chest items to slightly favor `wearable` over `potion`/`weapon` with a small per-floor bonus (also capped).

Config (proposed)

- `GAME_CONFIG.bossLoot.depth.wearableQualityBoostPerFloor`: record of per-quality boosts per floor (with individual caps).
- `GAME_CONFIG.bossLoot.depth.categoryReweightPerFloor`: e.g., `wearable: +0.01`, capped.
- `GAME_CONFIG.bossLoot.depth.wearableStateBiasPerFloor`: per-floor weights that decrease `broken/budget` and increase `excellent/flawless` probabilities, with absolute caps.

Hook points

- `apps/server/src/data/loot-table.ts` → within boss “chest” path used by `rollChestItems(...)`:
  - Add boss-aware quality multiplier computation when the source is boss drops.
  - Optionally reweight categories only for boss chest drops.

#### 4b) Boss Currency (USDC / GHST) probability bonus

- We keep the base expected values anchored to tier, but increase the probability of landing a non-zero currency tier deeper down. Amount caps and tier max earnings remain respected.

Design

- In `rollBossCurrency(...)`, currently total drop probability is a function of leverage. Add a depth bonus term:
  - `dropTarget = base(leverage) + depthBonus`
  - `depthBonus = min(maxDepthBonus, floorIndex * currencyDropBonusPerFloor)`
  - Suggested default: `currencyDropBonusPerFloor = 0.02`, `maxDepthBonus = 0.30` (tunable).
  - Keep `dropTarget` capped (≤ 0.9) to avoid excessive guarantees.
- Maintain the existing tier-based base amount logic and clamp to `tier.maxEarnings`. We’re improving odds (payout frequency), not necessarily the payout magnitude beyond the current tier model.

Config (proposed; updated per decisions)

- `GAME_CONFIG.bossLoot.depth.currencyDropBonusPerFloor: number` (default: 0.02).
- `GAME_CONFIG.bossLoot.depth.currencyDropMaxBonus: number` (default: 0.30).
- `GAME_CONFIG.bossLoot.depth.currencyDropTargetCap: number` (default: 0.9).

Hook points

- `apps/server/src/data/loot-table.ts` → `rollBossCurrency(...)` where `dropTarget` is computed.

## Telemetry & Balancing

- Emit a `floor_descended` match event when descending that includes:
  - `floorIndex`, `difficultyTier`, `intensityBefore`, `intensityAfter`, and `delta`.
- For boss loot:
  - Include `floorIndex`, `depthBonusApplied`, `dropTargetFinal`, and whether currency dropped (and which tier).
  - For chest items, log quality distribution and any depth multipliers applied.
- Maintain dashboards to monitor distribution shifts post-change; adjust config knobs (per-floor bonuses and caps) based on live data.
- For leverage continuity:
- Log `floorIndex`, `floorLeverage`, `roomLeverage`, `leverageTotal` before and after transitions to ensure no unintended resets.
- Persist floor reached to game metrics:
- Store `floorReached` (deepest floor for the run).
- Update on each transition (`next_floor`, `boss_room`) and on run end.
- Include in payloads sent by `persistGameMetrics(...)` / `syncGameMetricsImmediate()`.

## Testing Plan (Server)

- Unit tests for:
  - Intensity bump on `next_floor` (+5; cadence unchanged).
  - No tier change on `next_floor`; tier change on `new_map` only (if retained).
  - No HP reset on boss/floor transitions; verify HP preserved.
  - Leverage values unchanged across floor and boss transitions (no resets to defaults).
  - Telemetry: `floor_descended` events include `floorIndex`; metrics store `floorReached`.
  - Boss chest quality skew scales with floor and respects caps.
  - Boss currency drop probability increases with floor and respects caps, never violating `maxEarnings`.
- Integration tests:
  - Simulate multi-floor run; check Intensity, floor index, and boss loot distributions across floors 1, 3, 5, 10.
  - Verify leverage continuity across those transitions.
  - Verify metrics reflect the highest floor reached when the run ends.

## Decisions (finalized)

1. Intensity bump scope: Is +5 per descent intended for both solo and party runs equally, or should party size influence the bump?

Solo and party runs both.

2. Boss room: Confirm no Intensity bump when entering boss room (only on `next_floor`), even though boss rooms could be “harder.”

Correct. Boss room inherits existing intensity bump, but does not increase it.

3. Floor indexing with `new_map`: Should `new_map` reset
   `currentFloor` back to 1, or continue counting upward across maps?

We arent using new_map right now.

4. XP scaling: Should XP gain scale with Intensity (and thus indirectly with depth), or keep XP derived solely from tier and enemy stats?

Mmm let's not scale it yet.

5. “Excellent” wearable definition: Confirm that “excellent” refers to `legendary | mythical | godlike` qualities, or provide a different mapping.

Excellent refers to the Quality (flawless, average, etc). You're referring to Rarity.

6. Currency mix: Should GHST vs USDC weighting shift with depth, or keep only total probability increases?

Nope, does not change.

7. Economy caps: Increase `currencyDropTargetCap` to 0.9.
   - With leverage L=10 (max), base = 0.6. Reaching cap 0.9 requires depthBonus = 0.3 → about 15 floors (at 0.02 per floor, with `currencyDropMaxBonus = 0.30`).
   - With lower leverage (e.g., L=5 → base ≈ 0.489), cap 0.9 is not reachable due to the 0.30 maxDepthBonus, which is intended to limit rewards at lower leverage.

8. Category reweighting: Do we want to bias boss chest drops more toward wearables with depth, or only improve wearable quality once chosen?
   Both Rarity and Wearable quality can be buffed.

9. UI/HUD: Do we want to surface floor depth’s effect (e.g., “Depth Bonus +X%”) anywhere in HUD or post-boss screens?

The Run Summary can show which floor you reached.

10. Leverage timers/locks: Should we pause leverage lock timers during transitions for fairness, then resume post-transition, while preserving current values?

OK.

11. Floor metrics naming: Prefer `maxFloorReached` or `deepestFloor`? Should we also capture `bossFloorsCleared`?

floorReached is fine.

## Rollout Notes

- All knobs exposed via `GAME_CONFIG` to allow live tuning.
- Ship behind a feature flag if we want to dark-launch: e.g., `GAME_CONFIG.features.depthScaledBossLoot` and `GAME_CONFIG.features.floorIntensityBump`.
- Begin with conservative per-floor bonuses and monitor metrics closely for a few days before increasing.

## Detailed Implementation Strategy (coding notes, no live changes)

### A) Intensity and Tier Behavior

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - In `handlePortalInteraction(...)`:
    - For `destination === 'next_floor'`:
      - Keep `difficultyTier` unchanged.
      - Increment Intensity by `GAME_CONFIG.enemyDifficultyMeter.floorDescendDelta` (default 5) using `room.incrementEnemyDifficultyLevel(delta, 'next_floor')`.
    - For `destination === 'boss_room'`:
      - No Intensity change on entry (inherits current value).
    - For `destination === 'new_map'` (not used now):
      - Keep logic disabled or guarded.
- File: `apps/server/src/rooms/GameRoom.ts`
  - Add `incrementEnemyDifficultyLevel(delta = 5, reason?: string)` helper near other meter methods; update only `state.enemyDifficultyLevel` without resetting `enemyDifficultyNextAt`.

### B) No Auto-Heal on Portals

- File: `apps/server/src/lib/systems/WorldTransitionSystem.ts`
  - Remove `player.hp = player.maxHp;` in:
    - `transitionAllPlayersToBossRoom(...)`
    - `transitionAllPlayersToNewMap(...)`
  - Preserve HP/MP; if max stats change elsewhere (e.g., gear), keep ratio.

### C) Preserve Leverage on Transitions

- File: `apps/server/src/lib/systems/WorldTransitionSystem.ts`
  - In `transitionAllPlayersToNewMap(...)` remove calls to `resetLeverageForNewFloor({ broadcast: true })`.
  - Do not touch leverage in boss transitions.
- File: `apps/server/src/lib/systems/LeverageSystem.ts`
  - Ensure no transition paths invoke `resetLeverageForNewFloor(...)`.
  - Pause/resume leverage lock timers during transition without changing values.

### D) Boss Loot: Depth-Based Item Quality/Rarity Bias

- File: `apps/server/src/data/loot-table.ts`
  - In boss chest path (`rollChestItems(...)` / wearable selection):
    - Apply rarity weight boosts per floor:
      - Example defaults (per floor): `legendary +2%`, `mythical +1%`, `godlike +0.5%`.
      - Cap each band at +50% absolute.
    - Apply quality state bias per floor:
      - Reduce `broken/budget` and increase `excellent/flawless` by `wearableStateBiasPerFloor`, with absolute caps.
    - Read new config:
      - `GAME_CONFIG.bossLoot.depth.wearableQualityBoostPerFloor` (rarity boosts)
      - `GAME_CONFIG.bossLoot.depth.wearableStateBiasPerFloor` (quality shifts)
  - Optional category reweighting: small per-floor bump toward `wearable`, capped.

### E) Boss Currency: Depth-Based Probability Bonus

- File: `apps/server/src/data/loot-table.ts`
  - In `rollBossCurrency(...)`:
    - Compute leverage base: `0.4 + 0.2 * ((L-1)/9)` for L in [1..10].
    - Add depthBonus: `min(currencyDropMaxBonus, floorIndex * currencyDropBonusPerFloor)`.
    - Set `dropTarget = min(currencyDropTargetCap, base + depthBonus)`.
    - Defaults:
      - `currencyDropBonusPerFloor = 0.02`, `currencyDropMaxBonus = 0.30`, `currencyDropTargetCap = 0.9`.
    - Do not alter GHST vs USDC weighting; only modify total probability.

### F) Telemetry & Metrics

- File: `apps/server/src/rooms/GameRoom.ts`
  - Events:
    - Emit `floor_descended` with `floorIndex`, `intensityBefore/After`, `delta`, `difficultyTier`.
  - Metrics:
    - Store `floorReached` (deepest floor in the run).
    - On each transition, update in `persistGameMetrics({ syncState: true })` and in `syncGameMetricsImmediate()`.
  - Ensure `gamesRepo.UpdateMetricsInput` includes `floorReached` (and handle schema migration if needed).
- Client (optional):
  - Run Summary: display `floorReached`.

### G) Config

- File: `apps/server/src/lib/constants.ts` (or where `GAME_CONFIG` is defined)
  - Add:
    - `enemyDifficultyMeter.floorDescendDelta = 5`
    - `bossLoot.depth.currencyDropBonusPerFloor = 0.02`
    - `bossLoot.depth.currencyDropMaxBonus = 0.30`
    - `bossLoot.depth.currencyDropTargetCap = 0.9`
    - `bossLoot.depth.wearableQualityBoostPerFloor` (rarity map)
    - `bossLoot.depth.wearableStateBiasPerFloor` (quality map)
  - Feature flags (optional):
    - `features.floorIntensityBump = true`
    - `features.depthScaledBossLoot = true`

### H) Validation & Safeguards

- Cap all probability/weight adjustments.
- Ensure no negative probabilities or overflows; clamp to [0, 1].
- Maintain `maxEarnings` caps and existing drop ceilings.
- Do not introduce side effects that reset timers/meter cadence.
