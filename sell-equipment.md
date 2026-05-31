### Sell equipment for gold (proposal)

Players are currently earning a lot of items they’ll never use. Instead of piling those items up, we should let players **sell items for Gold** to reduce inventory bloat and add a simple, satisfying “cleanup loop”.

## Goals

- **Reduce inventory bloat**: turn unwanted drops into Gold.
- **Keep it server-authoritative**: client requests a sale; server validates and computes payout.
- **Make pricing predictable**: simple defaults by tier.
- **Put a global cap on daily sell-out**: limit total Gold minted via selling across all players per day.

## Non-goals (for v1)

- Player-to-player trading / auction house.
- Dynamic pricing / supply-demand.
- “Best value” optimization UI (auto-selling, rules engine, etc.).

## Proposed default sell pricing

This repo already has:

- **Item rarity** on some inventory items: `common | uncommon | rare | epic | legendary` (see `apps/client/src/types/inventory.ts`), but **`epic` is a mistake** and should not be used for equipment rarity.
- **Wearable quality**: `broken | budget | average | excellent | flawless` with scalar multipliers (see `data/wearable-quality.ts` → generated to `apps/*/src/data/wearable-quality.ts`).
- **Wearable rarity** in the wearable dataset: `common | uncommon | rare | legendary | mythical | godlike` (see `data/wearables.ts`).

The defaults below are designed to be:

- **Meaningful** as a progression source, but **bounded** by the global daily cap.
- **Simple**: one base table + quality scalar.

### 1) Base unit sell price by tier (Gold per item)

Used for equipment (wearables + weapons). For non-fungible inventory entries, treat `quantity` as 1.

| Tier | Unit sell (Gold) |
| --- | ---: |
| common | 1 |
| uncommon | 3 |
| rare | 8 |
| legendary | 50 |
| mythical | 100 |
| godlike | 200 |

### 2) Wearable quality modifier (multiplies unit sell)

Apply to wearables (and optionally weapons if they also have `quality` later). Scalars already exist in code:

| Quality | Scalar |
| --- | ---: |
| broken | 0.5 |
| budget | 0.66 |
| average | 1 |
| excellent | 1.5 |
| flawless | 2 |

So a `rare` wearable with `excellent` quality sells for:

\[
8 \times 1.5 = 12 \text{ Gold}
\]

### 3) Sellability rules (v1)

For v1, only equipment is sellable.

- **Sellable**: `wearable`, `weapon`
- **Not sellable**:
  - Anything not `wearable`/`weapon` (materials, potions, coins, etc.)
  - Explicit denylist even if mis-typed as equipment: `lick_tongue`, `usdc_coin`, and all `coin` items (including `Gold`)

## Implementation plan (v1)

### A) Decide “what is sellable”

- **Sellable item types**: `wearable`, `weapon`
- **Not sellable**: everything else (especially `coin`, `usdc_coin`, `lick_tongue`)

### B) Server-authoritative sale endpoint

Implement a new HTTP endpoint (used by the lobby Shop dialogue Sell tab), for example:

- `POST /api/player/inventory/sell`
  - Supports either:
    - **Fungible**: `{ itemType: string, itemName: string, quantity: number }`
    - **Instance** (wearables): `{ inventoryItemId: string }`
  - Validates:
    - Authenticated player
    - Item exists and is sellable
    - Quantity is valid and available
    - For wearables: **not equipped** (join against `player_equipment` / use equipment repo guard)
      - **Do not** attempt to infer equipped state by parsing `players.equipped_wearables` (DB shows mixed formats).
  - Computes payout **on the server**:
    - Determine rarity tier (weapons + wearables support **`common/uncommon/rare/legendary/mythical/godlike`**; do **not** use `epic`)
    - Apply quality scalar (wearables)
    - Apply quantity (no bulk penalty)
  - Enforces **global daily sell cap** (see section below)
  - Executes transaction:
    - Decrement/remove the sold item(s)
    - Increment `Gold` (inventory item: `type/itemType: 'coin'`, `name/itemName: 'Gold'`)
  - Logs economy events (similar to NPC shop spend logging), e.g. source `inventory_sell`.

### C) Global daily limit (v1)

Add a **global cap on Gold minted via selling**:

- **Cap**: **1000 Gold per day** (global across all players)
- **Behavior when cap is hit**:
  - **Reject** with “Sold out for today” and do not remove items.
  - No partial fills.

**Storage/implementation sketch (server)**:

- Create a small table like `global_economy_counters` keyed by day (UTC) and counter name, e.g.:
  - `counter_name = 'equipment_sell_gold'`
  - `bucket_date = YYYY-MM-DD (UTC)`
  - `amount = total_gold_minted`
- During `/api/player/inventory/sell` transaction:
  - Read current day bucket row with `FOR UPDATE`
  - Compute `remaining = 1000 - amount`
  - If `payout > remaining`: reject with a clear error code (e.g. `GLOBAL_SELL_CAP_REACHED`)
  - Else: increment bucket by `payout` and proceed with inventory mutation + gold grant

**API to display remaining cap**:

- Add `GET /api/economy/equipment-sell-cap` returning:
  - `{ dailyCap: 1000, soldToday: number, remainingToday: number, resetsAtUtc: string }`
  - `resetsAtUtc` should always represent **00:00 UTC** of the next day.

### D) Client UX (Shop dialogue in lobby)

Players can sell from the **Shop dialogue in the lobby**, via a new tab.

- **Shop dialogue UI** (Portal Mage / lobby shop)
  - Add a “Sell” tab next to the existing Buy flow
  - List only sellable inventory items (wearables + weapons)
  - Support multi-select and “Sell selected”
  - For each item, show:
    - name, rarity tier, (wearables) quality label, and sell price
      - Quality label should come from the inventory item’s `quality` field (e.g. `broken/budget/average/excellent/flawless`) and the existing label helper (`getQualityLabelForWearable`), not `players.equipped_wearables`.
  - On sell:
    - Call `POST /api/player/inventory/sell`
    - Show a toast/message: `Sold for X Gold`

**Displaying the cap (UI)**:

- Show a small line near Sell controls:
  - `Daily sell cap (global): 1000 Gold — Remaining today: 742`
- If remaining is 0, disable Sell buttons and show:
  - `Sold out for today. Resets at 00:00 UTC.`

### E) Tests

We will ship this feature with a **full suite of automated tests** (server + client, plus at least one full flow test) and require the default validation loop (`pnpm test:agent`) to pass.

- **Server tests (required)**
  - **Pricing**: payout matches the tier table *and* wearable quality scalar.
  - **Sellability**: rejects non-equipment items (`coin`, `potion`, `material`, `usdc_coin`, `lick_tongue`) even if payload is malformed.
  - **Equipped guard**: cannot sell equipped wearables (checked via `player_equipment.inventory_item_id`).
  - **Atomicity**: sale is transactional (item removed + Gold credited, or neither).
  - **Global daily cap**:
    - allows sale when under cap
    - rejects when `payout > remainingToday` (no items removed)
    - resets at **00:00 UTC** (bucket keying)
  - **Concurrency**: two concurrent sells cannot exceed the global cap (row lock / `FOR UPDATE` behavior).

- **Client tests (required)**
  - **UI gating**: Sell controls only appear for sellable items (wearables/weapons subset).
  - **Cap UI**: renders daily cap + remaining; disables selling when remaining is 0; shows server error when cap is reached.
  - **Happy path**: selling updates UI state correctly after a successful response (inventory refresh + Gold increase).

- **Full flow test (required)**
  - One end-to-end style test that exercises:
    - fetch cap → select item(s) → sell → server response → inventory refresh
    - validates equipped item cannot be sold
    - validates cap rejection behavior

### F) Rollout / safeguards

- Add a simple **rate limit** to sales (e.g., N requests per 5s).
- Consider a **max items per request** for bulk selling (e.g., 100 instances) for safety.
- Consider feature flagging behind a config/env toggle for first release.

## Open items before implementation

- **DB verification: “quality” vs “rarity” storage (resolved)**
  - We queried the DB and found:
    - `player_inventories.quality` distinct values (wearables): **`average`, `broken`, `budget`, `excellent`** (no `flawless` observed in current data).
    - `players.equipped_wearables` entries are **mixed-format**:
      - Many entries are **just a slug** (e.g. `wizard-visor`) — 1 segment
      - Some are `slot::slug` (e.g. `head::marine-cap`) — 2 segments
      - A few are `slot::slug::quality` (e.g. `handLeft::trezor-wallet::excellent`) — 3 segments
      - The observed 3rd segment values were **`broken`, `budget`, `excellent`** (i.e., quality-tier values), **not** rarity tiers like `godlike`.
  - Conclusion: the `docs/EQUIPMENT_LIFECYCLE.md` example `"body::armor_suit::godlike"` appears **outdated/incorrect**; the “3rd segment” (when present) behaves like **quality**, not rarity.
  - Implementation implication: do **not** rely on parsing `players.equipped_wearables` for “is equipped” checks; use `player_equipment.inventory_item_id` joins/guards (source of truth for equipped instances).

- **Economy tuning target (answered)**
  - Answer: selling should be a **meaningful progression source**.
  - Implication: initial sell values may need to be tuned upward/downward based on observed sell-through vs the **1000 Gold/day global cap**.

