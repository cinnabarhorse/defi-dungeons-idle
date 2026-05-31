## Non‑Fungible Wearables — Implementation Questions

This document lists the decisions needed to convert wearable items from fungible (stacking) to non‑fungible (unique instances), adding per‑item quality. Please answer inline so we can implement in a single PR.

### 1) Goals and Scope

- [ ] Confirm: Wearables become non‑fungible (each pickup is its own instance) and do not stack. Existing fungible items (coins, potions, materials) remain fungible/stacking.
- [ ] Confirm MVP: quality affects only base wearable stats via a multiplier (no random affixes/durability yet).
- [ ] In/out of scope for this PR: trading, repairing, upgrading, merging, rerolling qualities?

### 2) Quality Model

- [ ] Canonical tier names: choose ONE label per tier for UI and data. Proposal:
  - lowest: "broken" (aka shattered)
  - medium: "budget" (aka scratched/tattered)
  - normal: "average" (aka quality)
  - high: "excellent" (aka polished)
  - highest: "flawless" (aka pristine)
    If different, specify exact canonical strings we should persist.

RESPONSE: We can begin with these labels, but they should be easily extendable per weapon or wearbale type later.

- [ ] Multipliers per tier (applied to wearable base stats/effects). Proposal (edit as needed):
  - broken: 0.30
  - budget: 0.60
  - average: 1.00
  - excellent: 1.50
  - flawless: 2.0
    Provide final numbers and rounding rules (ceil/floor/round to nearest integer where needed).
- [ ] Is there a secondary continuous score within a tier (e.g., qualityScore 0–100) for future granularity? For MVP we can set qualityScore to fixed midpoints per tier; confirm yes/no.

There is going to be a "durability" score from 1-1000. Durability will decrease over time as the wearable gets used. Durability can also be randomly determined on drop, based on the tier.

### 3) Data Model and Persistence

- [ ] Storage approach for non‑fungibles (pick one):
  1. Extend `player_inventories` for both fungible and non‑fungible:
     - Add `instance_id uuid not null default gen_random_uuid()` (unique per row)
     - Keep `quantity` for fungibles; force `quantity=1` for wearables
     - Remove/relax unique `(player_id, item_type, item_name)` to allow multiple rows for same wearable
     - Add typed columns: `wearable_slug text`, `quality text`, `quality_score int` (or keep in `item_data`?)
  2. Create a new `player_item_instances` table for non‑fungibles; leave `player_inventories` for fungibles.
     Which do you prefer for this PR?

Approach 1 sounds fine.

- [ ] For equipment persistence, should `player_equipment` reference the exact instance?
  - Proposal: add `inventory_item_id uuid references player_inventories(id)` and deprecate `wearable_slug` as the canonical pointer (we can still denormalize slug for quick reads).

I'm not sure about this. Use a sensible default.

- Confirm desired schema change.
- [ ] Server types (client mirrored): add fields to `InventoryItem` for wearables:
  - `instanceId: string` (required for non‑fungibles)
  - `wearableId: number` and/or `wearableSlug: string` (confirm which is canonical)
  - `quality: 'broken'|'budget'|'average'|'excellent'|'flawless'`
  - `qualityScore?: number`
  - `durabilityScore?: number`
    Confirm final field names so we can update `apps/client/src/types/inventory.ts` and regenerate server types.

    That looks pretty good to me.

### 4) Migration & Back‑Compat

- [ ] How to convert existing stacked wearables in `player_inventories`?
  - Split any `(player_id, wearable_slug, quantity>1)` into N rows of quantity=1 with generated `instance_id`, default `quality='average'` (unless specified otherwise).

Probably easiest to just wipe the entire player_inventories table for now. We don't have any real players yet.

- Any exceptions?
- [ ] Update `player_equipment` rows: switch from slug to referencing a chosen instance. If multiple instances exist for the equipped slug, which selection rule? Proposal: prefer highest quality; if tie, newest.

Wipe it.

### 5) Drop Tables, Pickup, and Instance Minting

- [ ] When to mint the instance identity:
  - On drop spawn (entity on ground includes the finalized `instanceId`), or
  - On pickup (mint when assigning to a player to avoid dangling items)?

    Proposal: mint on pickup to keep ground items ephemeral and avoid abandoned instance records.

Sounds good.

- [ ] Quality distribution for drops (default weights): please provide percentages summing to 100.
  - broken: 10%
  - budget: 30%
  - average: 40%
  - excellent: 20%
  - flawless: 0%

  Flawless wearables cannot be found, only forged. We will introduce this system later.

- [ ] Should shops/NPCs also sell wearables with qualities? If yes, provide the distribution or fixed quality per SKU.

Yes, but not in this PR. We will add that later.

### 6) Equip/Unequip Semantics

- [ ] Equipping must reference the exact instance (non‑fungible). Confirm we should change equip APIs and the `player_equipment` repo accordingly.

We are working on that PR in the equipping-character.md PR. That will be implemented after this one.

- [ ] If a player owns multiple copies of the same base wearable with different qualities, can they equip multiple if slots allow (e.g., two rings if we add rings later)? For current slots, confirm per‑slot uniqueness remains 1 item.

Yes they can.

- [ ] Selection rule in UI when auto‑equipping by slug (if we keep that UX): choose highest quality by default?

Yes.

- [ ] Two‑handed vs one‑handed conflict resolution remains unchanged; confirm no special handling by quality.

No special handling by quality.

### 7) UI/UX

- [ ] Inventory listing: group by base wearable or list every instance separately? Proposal: list instances (non‑stacking) with a compact row showing quality badge and stat delta vs base.

Sounds good.

- [ ] Sorting default: highest quality first within each base item.

Yes.

- [ ] Visuals: color coding per quality and short label; confirm labels and colors.
  - broken: ? color
  - budget: ? color
  - average: ? color
  - excellent: ? color
  - flawless: ? color

  Use sensible defaultd.

### 8) APIs and Services

- [ ] `upsertInventoryItem` currently stacks on conflict. Plan: keep for fungibles; add `createInventoryInstance` for wearables (always insert quantity=1). Confirm.

Sounds good.

- [ ] Fetch APIs: `getInventory(playerId)` should return both fungibles and non‑fungible instances; confirm ordering (e.g., wearables first by quality desc).

Yes.

- [ ] Equip APIs: change parameters to accept `inventoryItemId` (instance) instead of `wearable_slug`. Confirm deprecations and any interim compatibility we need.

Update in equipping-character.md.

### 9) Stat Aggregation & Clamps

- [ ] Confirm multiplier application points:
  - Apply quality multipliers to the wearable’s contribution before global clamps.

Yes.

- Existing clamps (e.g., armor-derived mitigation capped at 0.8) remain unchanged. Confirm any new caps needed.

Confirm.

- [ ] Rounding strategy for derived stats and display values.

Use sensible default.

### 10) Telemetry / Anti‑Cheat

- [ ] Inventory audit: add `player_inventory_events` entries for instance lifecycle: `pickup`, `mint`, `equip`, `unequip`, `destroy`, `shop_purchase`.
- [ ] Server authority stays: validating ownership, slot compatibility, level gates, and preventing equipping instances not in inventory. Confirm any rate limits.

### 11) Acceptance Criteria (MVP)

- [ ] Wearable pickups create distinct instances with quality and appear non‑stacked in inventory.
- [ ] Equip/unequip operates on instances, persists correctly, and updates derived stats appropriately.
- [ ] DB schema updated, migration performed on existing data; no data loss.
- [ ] Client UI displays quality and sorts accordingly; no regression to other item types.

### 12) Notes (Code Pointers)

- Inventory DB and stacking: `apps/server/src/lib/db/repos/inventory.ts` (`upsertInventoryItem`) and `player_inventories` table.
- Equipment persistence: `apps/server/src/lib/db/repos/equipment.ts` and `player_equipment` table.
- Wearables data and stat aggregation: `data/wearables.ts` and `apps/server/src/data/wearables.ts` (`aggregateEquipmentStats`).
- Enemy drops: `apps/server/src/lib/systems/EnemyDeathSystem.ts` (wearable drops) and `MapGenerator`.

### Detailed Implementation Plan

#### A) Database schema changes (extend `player_inventories`)

1. Modify `player_inventories` to support non‑fungible wearable instances:
   - Drop/relax the unique constraint on `(player_id, item_type, item_name)` to allow multiple rows for the same wearable.
   - Add columns (nullable where noted to support fungibles):
     - `instance_id uuid not null default gen_random_uuid()`
     - `wearable_slug text` (nullable; required only when `item_type='wearable'`)
     - `quality text not null default 'average'` (values: broken|budget|average|excellent|flawless)
     - `quality_score int` (nullable; reserved for future)
     - `durability_score int not null default 1000` (range 1–1000)
   - Keep `quantity` for fungibles; enforce `quantity=1` for wearables at the application layer.
   - Ensure index on `player_id` remains for fast fetches.

2. Equipment linkage (sensible default):
   - Add `inventory_item_id uuid references player_inventories(id)` to `player_equipment`.
   - Keep `wearable_slug` for denormalized reads/back‑compat (optional); canonical reference becomes `inventory_item_id`.

3. Inventory events (optional but recommended):
   - Add `inventory_item_id uuid` to `player_inventory_events` (nullable) for auditing instance lifecycle; continue storing `item_type`, `item_name` for fungibles.

4. Migration behavior for dev (no real users yet):
   - Execute a one‑time wipe: `truncate table player_equipment; truncate table player_inventory_events; truncate table player_inventories;` before applying new constraints/columns.

Example migration (outline):

```sql
-- Remove old uniqueness to allow multiple wearable rows per player
alter table if exists player_inventories drop constraint if exists player_inventories_player_id_item_type_item_name_key;

-- New columns for instances & quality
alter table if exists player_inventories
  add column if not exists instance_id uuid not null default gen_random_uuid(),
  add column if not exists wearable_slug text,
  add column if not exists quality text not null default 'average',
  add column if not exists quality_score int,
  add column if not exists durability_score int not null default 1000;

-- Equipment references an inventory instance (canonical)
alter table if exists player_equipment
  add column if not exists inventory_item_id uuid references player_inventories(id);

-- Optional: events reference instance when available
alter table if exists player_inventory_events
  add column if not exists inventory_item_id uuid;
```

#### B) Types and shared definitions

Update `apps/client/src/types/inventory.ts` (then regenerate server types):

```ts
export interface InventoryItem {
  id: string; // row id
  instanceId?: string; // required for wearables (non-fungible)
  name: string;
  type: 'coin' | 'potion' | 'weapon' | 'material' | 'wearable';
  quantity: number; // wearables fixed to 1; fungibles > 1
  color: string;
  description?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

  // Wearable metadata
  wearableId?: number;
  wearableSlug?: string; // canonical for content; instance is canonical for ownership
  slot?: string;
  imageUrl?: string;

  // Quality & durability
  quality?: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless';
  qualityScore?: number; // reserved for future granularity
  durabilityScore?: number; // 1–1000

  // Optional stats mapping (as today)
  stats?: { AGG?: number; NRG?: number; SPK?: number; BRN?: number };

  // Rendering / economy extras
  spriteId?: number;
  usdcAmount?: number;
  probability?: number;
  expectedValue?: number;
}
```

Then run the existing generator to sync server types.

#### C) Server repositories and services

1. Inventory repo (`apps/server/src/lib/db/repos/inventory.ts`):
   - Keep `upsertInventoryItem` strictly for fungibles; if `item_type='wearable'`, return error or internally route to the new insert.
   - Add `createInventoryInstance(input)` that always performs a plain INSERT with `quantity=1` and sets `wearable_slug`, `quality`, `durability_score`.
   - Add helper: `deleteAllInventoryDev()` used only by migration script/ops.
   - Update `getInventory(playerId)` to return all items (fungible + instances), sorted by wearables first and then by `quality` desc, then `durability_score` desc.

2. Equipment repo (`apps/server/src/lib/db/repos/equipment.ts`):
   - Extend `setEquipment` to accept `inventoryItemId` in addition to the current slug path (slug path will be deprecated in a later PR per equipping doc). For this PR we only add the column writes, leaving caller changes for the follow‑up PR.

3. Inventory events repo:
   - When creating/deleting a wearable instance, write an event with `inventory_item_id` and reason: `pickup`, `mint`, `equip`, `unequip`, `destroy`, or `shop_purchase`.

#### D) Drops and pickup flow (instance minting on pickup)

1. Drop generation (`EnemyDeathSystem.spawnEnemyDrop`):
   - When `selectedCategory === 'wearable'`, choose quality by the approved weights: broken 10%, budget 30%, average 40%, excellent 20%, flawless 0%.
   - Derive initial `durability_score` based on quality (proposal):
     - broken: 50–250
     - budget: 250–500
     - average: 450–700
     - excellent: 650–900
     - flawless: 900–1000 (not dropped in MVP; reserved for forging)
   - Include in the dropped entity `state` at minimum: `type='wearable'`, `name`, `wearableId`, `wearableSlug`, `quality`, `durabilityScore`.

2. Pickup (server‑authoritative):
   - On pickup of a wearable drop, call `createInventoryInstance` with the quality and durability from the drop payload (or re‑roll server‑side if needed).
   - Respond to client with the created `InventoryItem` (including `id` and `instanceId`).
   - Non‑wearable pickups continue to use `upsertInventoryItem`.

#### E) Client updates

1. Types: incorporate new wearable fields and regenerate server types.

2. Inventory hook (`apps/client/src/hooks/useInventory.ts`):
   - Ensure any normalization/grouping logic does NOT stack wearables (instances must list separately).
   - Default sorting: wearables first, then by `quality` (flawless→broken), then `durabilityScore` desc, then `createdAt` desc if available.

3. UI presentation (inventory list and tooltips):
   - Show quality badge (labels per spec) and a compact durability bar (1–1000 scaled).
   - Display derived stat delta vs base (quality multiplier applied to base wearable effects for display only; server remains authoritative).
   - Sensible default colors (can be tweaked later):
     - broken: #8B8B8B
     - budget: #5FB0FF
     - average: #9AE66E
     - excellent: #FFD166
     - flawless: #C084FC (reserved; not dropped)

#### F) Stat aggregation (server)

MVP of this PR does not change equip behavior; quality‑aware stat aggregation will land with the equipping PR. Forward‑looking notes:

- Update equipment aggregation to fetch equipped instances, apply per‑instance quality multipliers to their contributions, then apply global clamps (unchanged caps such as armor mitigation ≤ 0.8).
- Define rounding for integer stats (round half up) and keep fractional multipliers for internal floats where applicable.

#### G) Migration & data reset (dev only)

1. Apply migration to alter schemas.
2. Truncate `player_inventories`, `player_equipment`, and `player_inventory_events` as agreed.
3. Regenerate shared types (`npm run generate:shared`).
4. Smoke test pickup, inventory listing, and equipment readbacks.

#### H) Telemetry and anti‑cheat

1. Log instance lifecycle in `player_inventory_events` with `inventory_item_id` when available.
2. Server validates pickups, ownership, and ensures only `quantity=1` for wearables.
3. Add lightweight rate‑limit on pickup requests (e.g., per player per second) to mitigate spam.

#### I) Acceptance criteria (reiterated for this PR)

- Wearable pickups create distinct instances with quality and durability, listed non‑stacked in inventory.
- Fungible items retain existing stacking behavior.
- DB schema updated; dev tables truncated as specified; no regressions to other item flows.
- Client UI displays quality badges and durability, sorts as specified.
- Events record instance creation and pickup.

#### J) Out of scope (deferred to follow‑up PRs)

- Equip/unequip by `inventoryItemId` and quality‑aware stat aggregation.
- Flawless acquisition via forging system and any shop quality distributions.
- Repairing/upgrading/merging and durability loss rules beyond initial decrement hooks.
