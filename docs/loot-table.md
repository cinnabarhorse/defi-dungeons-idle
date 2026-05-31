## Canonical Loot Table

This document describes the canonical loot table defined in `data/loot-table.ts`, how it is configured, and how game systems should use it.

### Goals

- **Single source of truth** for loot probabilities and selection logic.
- **Config-driven**: enemy class and per-enemy overrides live next to the table, not spread across systems.
- **Composable**: the same table powers enemy drops and can be extended for other sources (resources, chests).

### Main APIs

- `rollEnemyDrop(context: EnemyDropContext): DroppedItemData | null`
  - Performs the full enemy-drop calculation and returns a structured item to spawn, or `null` if no drop.
- `rollChestItem(options: { difficultyTierId?: string; potionFarm?: PotionFarmConfig; sourceId?: LootSourceId }): DroppedItemData`
  - Performs a single guaranteed chest loot roll. Chests only produce `coin` (gold) or `wearable`; USDC/GHST are returned via `rollChestCurrency`. Wearables use difficulty-tier rarity multipliers. Prefer `sourceId: LOOT_SOURCE_IDS.treasureChest`.
- `rollChestItems(options: { count: number; difficultyTierId?: string; potionFarm?: PotionFarmConfig; sourceId?: LootSourceId }): DroppedItemData[]`
  - Convenience helper to roll N chest items by calling `rollChestItem` repeatedly.
- `rollChestCurrency(options: { difficultyTierId: string; currency: 'USDC' | 'GHST'; randomSeed?: number }): { currency; amount; probability; expectedValue }`
  - Computes a tier-based currency reward for chests using a beta-like distribution shaped by the tier’s `maxEarnings` and a per-tier risk/return profile. Returns the amount, approximate probability, and expected value.
- `rollChestCurrencyBundle(options: { difficultyTierId: string; currencies: Array<'USDC' | 'GHST'>; randomSeed?: number }): ChestCurrencyReward[]`
  - Rolls multiple currencies at once (e.g., both USDC and GHST) with deterministic seeding.
- `maybeRollLickTongueDrop(enemyTags, aggregateTongueFarm): boolean`
  - Handles the special Lick Tongue drop on tagged enemies, factoring in Tongue Farm bonuses.

### Context shape (EnemyDropContext)

- `enemyType?: string`
- `enemyTags?: string[]`
- `classification?: 'trash' | 'elite' | 'boss' | 'normal'`
- `killStreakPotionCoinFindBonus?: number` absolute 0..1
- `rewardMultiplier?: number` optional scaling, disabled by default
- `potionFarm?: { enabled; enableReweight; potionWeightMultiplier; enableExtraRoll; extraRollChance; hpToManaBias }`

### Drop computation flow

1. Base drop threshold is computed by `computeBaseEnemyDropThreshold(context)`:
   - Start from class base: `ENEMY_CLASS_BASE_DROP[class] * ENEMY_CLASS_MULTIPLIERS[class]`.
   - Apply per-enemy override `ENEMY_BASE_DROP_OVERRIDES[enemyType]` (absolute OR multiplier).
   - Optionally scale by `rewardMultiplier` if `APPLY_REWARD_MULTIPLIER_TO_DROP_CHANCE` is enabled (clamped).
   - Add `killStreakPotionCoinFindBonus`, then cap to `BASE_DROP_CHANCE_CAP` (defaults mirror legacy behavior: base 0.7, cap 0.95).
2. If primary roll fails, an extra roll may succeed via:
   - `killStreakPotionCoinFindBonus` extra roll up to +0.5 absolute, preferring `potion` then `coin`.
   - Potion Farm extra roll (`enableExtraRoll`/`extraRollChance`).
3. Category selection:
   - Default equal weights; if Potion Farm reweight is enabled, `potion` uses `potionWeightMultiplier`.
   - Per-enemy category weights via `ENEMY_CATEGORY_WEIGHT_OVERRIDES[enemyType]`.
4. Item selection inside the category:
   - Potions respect HP/Mana bias from Potion Farm.
   - Per-enemy item-type weights via `ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES[enemyType][category][itemType]`.
   - Enemy coin drops explicitly deny `usdc_coin`.
5. Wearables:
   - Selected from `data/wearables.ts` with rarity weights `WEARABLE_RARITY_WEIGHTS`.
   - Rarity is derived from `traitModifiers` sum (or explicit `rarityLevel` if provided).
   - Per-enemy wearable weighting via `ENEMY_WEARABLE_WEIGHT_OVERRIDES[enemyType][wearableId]`.
   - Quality (`broken|budget|average|excellent|flawless`) and durability score are rolled and included in the item.

### Configuration knobs (in `data/loot-table.ts`)

- Global/class base chance:
  - `const ENEMY_CLASS_BASE_DROP: Record<'trash'|'elite'|'boss', number>`
  - `const ENEMY_CLASS_MULTIPLIERS: Record<'trash'|'elite'|'boss', number>`
- Per-enemy base chance:
  - `const ENEMY_BASE_DROP_OVERRIDES: Record<string, { absolute?: number; multiplier?: number }>`
- Optional reward scaling:
  - `const APPLY_REWARD_MULTIPLIER_TO_DROP_CHANCE = false`
  - `const REWARD_MULTIPLIER_DROP_SCALE = { min: 0.5, max: 2.0 }`
- Category weights per enemy:
  - `const ENEMY_CATEGORY_WEIGHT_OVERRIDES: Record<string, Partial<Record<string, number>>>`
- Item-type weights per enemy and category:
  - `const ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES: Record<string, Partial<Record<string, Record<string, number>>>>`
- Wearable weights per enemy:
  - `const ENEMY_WEARABLE_WEIGHT_OVERRIDES: Record<string, Record<number, number>>`
- Special drops:
  - Lick Tongue base chance (`BASE_LICK_TONGUE_DROP_CHANCE`) + aggregated Tongue Farm via `maybeRollLickTongueDrop`.

### Examples

Lower global base, boost bosses, and make a specific enemy more generous:

```ts
// Lower global
ENEMY_CLASS_BASE_DROP.trash = 0.25;
ENEMY_CLASS_BASE_DROP.elite = 0.35;
ENEMY_CLASS_BASE_DROP.boss = 0.6;

// Per-enemy override (absolute)
ENEMY_BASE_DROP_OVERRIDES['cactus'] = { absolute: 0.4 };

// Optionally scale with rewardMultiplier
// APPLY_REWARD_MULTIPLIER_TO_DROP_CHANCE = true;
```

Bias categories and items on a specific enemy:

```ts
// Potions are twice as likely; coins half as likely on 'cactus'
ENEMY_CATEGORY_WEIGHT_OVERRIDES['cactus'] = { potion: 2, coin: 0.5 };

// Inside weapon category, make 'cactus_spike' the common drop
ENEMY_ITEM_TYPE_WEIGHT_OVERRIDES['cactus'] = {
  weapon: { cactus_spike: 3, dagger: 1 },
};

// Favor a wearable ID for 'cactus'
ENEMY_WEARABLE_WEIGHT_OVERRIDES['cactus'] = { 101: 2.5 };
```

### Integration notes

- Enemy systems should pass a complete `EnemyDropContext`:
  - `enemyType`, `enemyTags`, `classification` (derive from enemy data or schema), `killStreakPotionCoinFindBonus`, `rewardMultiplier` (if used), and `potionFarm` state.
- After `rollEnemyDrop(...)` returns a `DroppedItemData`, the system is responsible for spawning the entity and registering the drop (e.g., `registerEnemyDrop`).
- For Lick Tongue, call `maybeRollLickTongueDrop(enemyTags, aggregateTongueFarm)`; when `true`, spawn `generateItemData('lick_tongue')` with a small offset.

### Data dependencies

- Item metadata and category membership: `data/items.ts`.
- Wearables dataset and traits: `data/wearables.ts`.

### Testing and observability

- Add unit tests for:
  - Class/per-enemy base chance application and capping.
  - Category and item-type override weighting.
  - Wearable rarity/quality distributions and per-enemy weighting.
  - Lick Tongue probability with/without Tongue Farm.
- Ensure `registerEnemyDrop` records the chosen `dropTable`/category and item details for audits.

### Future extensions

- Optionally externalize config to JSON + Zod loader if non-dev editing is needed.

### Integration plan (server-wide)

This section outlines how to adopt the canonical table in `data/loot-table.ts` across server systems without duplicating logic.

#### Phase 1 — Enemy drops (replace bespoke logic)

- **Goal**: `EnemyDeathSystem` stops re-implementing probabilities and selection and instead delegates to `rollEnemyDrop(...)` and `maybeRollLickTongueDrop(...)` from the canonical table (synced to `apps/server/src/data/loot-table.ts`).
- **Files**: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
- **Changes**:
  - Build a `EnemyDropContext` and call `rollEnemyDrop(context)`.
    - **classification**: map encounter to `'elite' | 'boss' | 'trash'` (default `'trash'`).
    - **enemyType**: `enemy.enemyType || enemy.name`.
    - **enemyTags**: lookup from `ENEMY_TYPES[enemyType]?.tags`.
    - **killStreakPotionCoinFindBonus**: from killer player's kill streak bonus.
    - **potionFarm**: map `getPlayerPotionFarm(...)` → `{ enabled, enableReweight, potionWeightMultiplier, enableExtraRoll, extraRollChance, hpToManaBias }`.
    - **difficultyTierId**: `room.state.difficultyTier` (used for normal enemies and elite wearable rarity multipliers).
  - If `rollEnemyDrop(...)` returns a `DroppedItemData`, spawn a single `collectible` entity with the returned JSON state and register via `registerEnemyDrop`.
  - Replace the local Lick Tongue chance roll with `maybeRollLickTongueDrop(enemyTags, aggregateTongueFarm)` and, on `true`, call existing `spawnLickTongueDrop(...)`.

- **Remove duplicated logic from `EnemyDeathSystem`** (now owned by the canonical table):
  - `WEARABLE_QUALITIES`, `WEARABLE_QUALITY_DISTRIBUTION`, `rollWearableQuality`, `rollDurabilityForQuality`.
  - `WEARABLE_RARITY_WEIGHTS`, `computeWearableRarity`, `selectRandomWearableForDrop`.
  - Category and item-type selection helpers (`selectDropCategory`, `selectItemTypeForCategory`).
  - USDC coin filtering (enemy path) — already handled by `rollEnemyDrop`.
  - Base drop threshold math (use `rollEnemyDrop` which calls the same computation and caps).

- **Elite behavior**: Elites now always drop a wearable via the table (rarity is influenced by difficulty tier). This replaces ad-hoc elite handling and ensures consistency.

- **Example (sketch)**:

```ts
// Inside handleEnemyDeath(...)
// Import from the generated server-local canonical table
import { rollEnemyDrop, maybeRollLickTongueDrop } from '../../data/loot-table';

const context = {
  enemyType: enemy.enemyType || enemy.name,
  enemyTags,
  classification: isBossEncounter ? 'boss' : isElite ? 'elite' : 'trash',
  killStreakPotionCoinFindBonus: Number(
    killer?.killStreakPotionCoinFindBonus || killer?.runPotionCoinFindBonus || 0
  ),
  potionFarm: killer
    ? mapPotionFarm(getPlayerPotionFarm(killer.characterId))
    : undefined,
  difficultyTierId: room.state.difficultyTier,
};

const drop = rollEnemyDrop(context);
if (drop) spawnCollectibleFromItemData(room, enemy, enemyId, drop);

if (
  maybeRollLickTongueDrop(enemyTags, (tags) =>
    getPlayerTongueFarm(killer.characterId, tags)
  )
) {
  spawnLickTongueDrop(room, enemy, enemyId);
}
```

> Note: `spawnCollectibleFromItemData(...)` is a thin local helper that writes the `DroppedItemData` JSON into an `EntitySchema` and invokes `registerEnemyDrop` with `dropTable` set to the chosen category (or `'wearable'`).

#### Phase 2 — Treasure chests (unified non-USDC loot + currency)

- **Goal**: Route chest items (only gold coins and wearables) and currency (USDC/GHST) through the canonical table so weights, rarities, and reward curves match difficulty. Items and currency are sourced from `apps/server/src/data/loot-table.ts`.
- **Files**:
  - `apps/server/src/rooms/GameRoom.ts` (`handleOpenChest`, `buildTreasureSpawnList`)
  - `apps/server/src/lib/systems/WorldTransitionSystem.ts` (debug `generateTreasureRoom` payload)
- **Changes**:
  - For items, call `rollChestItems({ count, difficultyTierId, sourceId: LOOT_SOURCE_IDS.treasureChest })` to generate only `coin` (gold) and `wearable` items:
    - Chest context uses `difficultyTierId: room.state.difficultyTier`.
    - Chests ignore `killStreakPotionCoinFindBonus`.
    - Wearables use difficulty-tier rarity multipliers.
  - For currency rewards, call `rollChestCurrency({ difficultyTierId: room.state.difficultyTier, currency: 'USDC' | 'GHST' })` and credit via the wallet pipeline.
  - Remove any static `loot` arrays serialized in debug payloads.

```ts
// Inside handleOpenChest(...)
import {
  LOOT_SOURCE_IDS,
  rollChestItems,
  rollChestCurrency,
} from '../../data/loot-table';

const difficultyTierId = room.state.difficultyTier;

// Items: gold coins and/or wearables
const items = rollChestItems({
  count: chestItemCount,
  difficultyTierId,
  sourceId: LOOT_SOURCE_IDS.treasureChest,
});
for (const item of items) spawnCollectible(room, chestEntity, item);

// Currency: credit wallet balances
const usdc = rollChestCurrency({ difficultyTierId, currency: 'USDC' });
const ghst = rollChestCurrency({ difficultyTierId, currency: 'GHST' });
creditWallet(playerId, { usdc: usdc.amount, ghst: ghst.amount });
```

#### Exports available (non-breaking helpers)

To support chest and future sources without copying internal helpers, `data/loot-table.ts` exposes:

- `selectDropCategoryForEnemy(categories: string[], potionWeightMultiplier: number, enemyType?: string): string`
- `selectDropCategoryForSource(categories: string[], potionWeightMultiplier: number, sourceId?: LootSourceId): string`
- `selectItemTypeForCategory(category: string, potionFarm?: PotionFarmConfig, enemyType?: string): string`
- `selectItemTypeForSource(category: string, potionFarm?: PotionFarmConfig, sourceId?: LootSourceId): string`
- `rollChestItem(options: { difficultyTierId?: string; potionFarm?: PotionFarmConfig; sourceId?: LootSourceId }): DroppedItemData`
- `rollChestItems(options: { count: number; difficultyTierId?: string; potionFarm?: PotionFarmConfig; sourceId?: LootSourceId }): DroppedItemData[]`
- `rollChestCurrency(options: { difficultyTierId: string; currency: 'USDC' | 'GHST'; randomSeed?: number }): ChestCurrencyReward`
- `rollChestCurrencyBundle(options: { difficultyTierId: string; currencies: Array<'USDC' | 'GHST'>; randomSeed?: number }): ChestCurrencyReward[]`

These helpers allow consumers to run category/item selection in contexts where a drop-chance is not desired (e.g., chests rolling N guaranteed items). Enemy coin drops exclude `usdc_coin`; chest currency is produced via `rollChestCurrency` and should be credited through the wallet pipeline.

#### Telemetry and audits

- Continue calling `registerEnemyDrop` with `dropTable` set to the selected category (or `'wearable'` for wearables, `'special_lick'` for Lick Tongue).
- Include `difficultyTierId`, `classification`, and `enemyType` in event metadata for better analytics.

#### Rollout and safety

- Sync `data/loot-table.ts` into `apps/server/src/data/loot-table.ts` via the shared-file generator (see below) and migrate imports to the server-local canonical table.
- Add debug logs during rollout to compare observed distributions against expectations from `getExpectedWearableQualityProportions(...)` and `getExpectedWearableRarityProportions(...)`.

### Build-time sync (shared files)

Add `loot-table` to the shared-file generator so the canonical table is available to both apps:

- File: `scripts/generate-shared-files.ts`
- Add `{ name: 'loot-table' }` to the `FILES` array.
- Run `pnpm tsx scripts/generate-shared-files.ts` after changing `/data/loot-table.ts` to sync to `apps/server/src/data/loot-table.ts` and `apps/client/src/data/loot-table.ts`.

#### Testing

- Unit tests (Node):
  - Verify that elites always return a wearable and that rarity distribution shifts with `difficultyTierId`.
  - Verify `getEnemyDropThresholdForSimulation(...)` matches previous base + cap logic across tiers and overrides.
  - Verify category and item-type overrides are respected with `enemyType` provided.
  - Verify Lick Tongue probability integrates Tongue Farm aggregation.
- Integration tests (server):
  - Simulate enemy deaths across classes and tiers; assert no USDC coins are spawned from enemies.
  - Open treasure chests in treasure room and non-treasure room scenarios; assert USDC flows via the existing pipeline, and non-USDC items are produced via the canonical helpers.

#### Coding guidelines

- Keep the canonical logic in `data/loot-table.ts` as the single source of truth. Do not import from workspace packages; inline any shared types locally as needed.
- All selection logic (weights, rarity, quality, durability) should come from the table; consumers only provide context and spawn entities from returned `DroppedItemData`.
