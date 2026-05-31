## Loot automation blueprint

### Goals

- **Single source of truth**: define all loot (currencies, items) in data, not code.
- **Generic allocation**: one server path for all currencies, no per-token branches.
- **Config-driven chests**: enable currencies via config/env, not code edits.
- **Generated artifacts**: migrations, seeds, and typed client/server assets from the same data file.
- **Observability + tests**: track requested/granted/remaining per currency and assert via e2e.

### Source of truth: data/loot-catalog.json

- Keep a strict schema (validate with Zod) and include display + spawn hints.

```json
[
  {
    "slug": "usdc",
    "name": "USDC Airdrop",
    "lootType": "erc20",
    "chainId": 8453,
    "tokenAddress": "0x...",
    "decimals": 6,
    "remaining": 1000,
    "isActive": true,
    "display": {
      "label": "USDC Coin",
      "color": "#2775CA",
      "icon": "usdc"
    },
    "spawn": {
      "denominations": [10, 5, 1],
      "denominationMap": { "10": 1.0, "5": 0.5, "1": 0.1 },
      "rarityThresholds": {
        "legendary": 500,
        "epic": 200,
        "rare": 50,
        "uncommon": 10
      }
    }
  },
  {
    "slug": "ghst",
    "name": "GHST Airdrop",
    "lootType": "erc20",
    "chainId": 8453,
    "tokenAddress": "0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB",
    "decimals": 18,
    "remaining": 1000,
    "isActive": true,
    "display": {
      "label": "GHST",
      "color": "#7D33FF",
      "icon": "ghst"
    },
    "spawn": {
      "denominations": [10, 5, 1],
      "denominationMap": { "10": 10, "5": 5, "1": 1 },
      "rarityThresholds": {
        "legendary": 100,
        "epic": 50,
        "rare": 10,
        "uncommon": 5
      }
    }
  }
]
```

Minimal Zod (server-only):

```ts
const LootConfig = z.object({
  slug: z.string(),
  name: z.string(),
  lootType: z.enum(['erc20', 'erc721', 'erc1155', 'virtual']),
  chainId: z.number().int().positive(),
  tokenAddress: z.string().optional(),
  tokenId: z.number().int().optional(),
  decimals: z.number().int().min(0).max(18).nullable().optional(),
  remaining: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  display: z
    .object({
      label: z.string(),
      color: z.string(),
      icon: z.string().optional(),
    })
    .optional(),
  spawn: z
    .object({
      denominations: z.array(z.number().int().positive()).default([1]),
      denominationMap: z.record(z.string(), z.number().positive()).default({}),
      rarityThresholds: z.record(z.string(), z.number().positive()).default({}),
    })
    .optional(),
});
```

### Generator: pnpm loot:generate

- Validate `data/loot-catalog.json`.
- Emit idempotent SQL to upsert rows into `loot_catalog` (insert-if-not-exists, update fields).
- Emit optional env seeds for `remaining` per environment (dev/staging/prod).
- Generate typed constants for server/client (labels, colors, icons, spawn rules) and a `token-sprites` map.
  - Generate files inside each app (no workspace package coupling).

Example usage:

```bash
pnpm loot:generate --input data/loot-catalog.json --env staging
pnpm migrate:run
```

### Generic currency allocator (server)

- Replace per-token allocators with a single function driven by data:

```ts
async function allocateChestLoot({
  lootName,
  requestedAmount,
  precision,
  entityId,
  playerId,
  gameId,
  chestId,
  difficultyTier,
  probability,
  expectedValue,
}): Promise<ChestLootAllocation | null> {
  /* uses loot_catalog, decrements, creates loot_distributions */
}
```

- Precision is derived from `spawn` or `decimals` (e.g., USDC 0.1, GHST integer tokens).
- Chest flow reads a configured list of currencies and calls the allocator for each.

### Config-driven chest currencies

- Env or table to drive which currencies are active:

```bash
CHEST_CURRENCIES=USDC,GHST
```

- Optional table `treasure_currencies (name text primary key, precision smallint, active boolean)` for runtime toggles.

### Unified spawn builder

- Data-driven spawning based on config:

```ts
function buildCurrencySpawnList(
  config: SpawnConfig,
  total: number
): SpawnBuild {
  // splits by config.denominations and config.denominationMap,
  // assigns rarity via config.rarityThresholds,
  // returns items + summary
}
```

### One spawn/write helper

- Extract a single helper to place entities and wire `entityLootDistributions` mapping:

```ts
function spawnCollectiblesForAllocation({
  items,
  allocation,
  chest,
  difficultyTier,
  playerId,
}) {
  /* place, set mapping, metadata */
}
```

### Admin automation

- Endpoints/CLI to:
  - Upsert loot catalog rows (name, address, decimals, active).
  - Reload `remaining`.
  - Dry-run chest: compute allocations and spawns without mutating state for QA.

### Migration automation

- `scripts/migrations/create-loot.ts` generates idempotent SQL from JSON:
  - `insert ... where not exists` for new loot.
  - `update` for changed fields (name, decimals, address, is_active).

### Observability

- Metrics per currency: requested, granted, remaining, and failure counts.
- Alerts when `remaining` drops below thresholds; optional auto-pause of currency.

### E2E test harness

- Headless “open chest” test ensures:
  - A `loot_distributions` row per active currency is created.
  - Entities for each currency spawn and are vacuumable.
  - `chest_opens` summary contains both currencies.

### Implementation checklist

- Add/modify entry in `data/loot-catalog.json`.
- Run `pnpm loot:generate`.
- Run `pnpm migrate:run`.
- (Optional) Use admin endpoint/CLI to reload balances.
- Verify metrics and e2e harness.
