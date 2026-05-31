## Custom Quality Names for Wearables — Implementation Plan

### Goal

- **Allow per‑wearable overrides of canonical quality tier labels** for display, while keeping the underlying quality tier keys stable in data and gameplay.

### Canonical Tiers (unchanged keys)

- `broken` → default label: "Broken"
- `budget` → default label: "Cheap"
- `average` → default label: "Basic"
- `excellent` → default label: "Excellent"
- `flawless` → default label: "Flawless"

These keys continue to be used across client/server data, sorting, and gameplay logic.

### Source of Truth (shared data)

- Add a new shared data file: `data/wearable-quality.ts` and sync it to both apps.
- Contents:
  - `QualityTier` union type for the 5 tiers.
  - `QUALITY_DEFAULT_LABELS: Record<QualityTier, string>` with the default display labels.
  - `WEARABLE_QUALITY_OVERRIDES: Record<string, Partial<Record<QualityTier, string>>>` keyed by wearable slug; values are per‑tier overrides.
  - `WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES: Record<string, Partial<Record<QualityTier, string>>>` keyed by wearable `itemType`; values apply to every wearable of that type when a slug override is absent.
  - `getQualityLabelForWearable(quality: QualityTier, wearableSlugOrId?: string | number): string` which resolves the display label using overrides first, then defaults. If an id is provided, it will resolve slug via the wearables registry.

Example (authoring):

```ts
export type QualityTier =
  | 'broken'
  | 'budget'
  | 'average'
  | 'excellent'
  | 'flawless';

export const QUALITY_DEFAULT_LABELS: Record<QualityTier, string> = {
  broken: 'Broken',
  budget: 'Cheap',
  average: 'Basic',
  excellent: 'Excellent',
  flawless: 'Flawless',
};

export const WEARABLE_QUALITY_OVERRIDES: Record<
  string,
  Partial<Record<QualityTier, string>>
> = {
  'jamaican-flag': {
    broken: 'Torn', // yields "Torn Jamaican Flag"
  },
  // add more slugs here
};

export const WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES: Record<
  string,
  Partial<Record<QualityTier, string>>
> = {
  'basic-hat': {
    broken: 'Torn', // yields "Torn Camo Hat"
  },
  'fancy-hat': {
    broken: 'Torn', // yields "Torn Marine Cap"
  },
  // add more itemTypes here
};

export function getQualityLabelForWearable(
  quality: QualityTier,
  wearableSlugOrId?: string | number
): string {
  // Implementation notes:
  // 1) Resolve wearable definition via slug or id (getWearableBySlug / getWearableById).
  // 2) Return slug override if present.
  // 3) Fall back to itemType override.
  // 4) Otherwise use QUALITY_DEFAULT_LABELS[quality].
  return QUALITY_DEFAULT_LABELS[quality];
}
```

### Generation / Sync

- Update `scripts/generate-shared-files.ts`:
  - Add `{ name: 'wearable-quality' }` to `FILES` so `data/wearable-quality.ts` is auto‑synced to:
    - `apps/client/src/data/wearable-quality.ts`
    - `apps/server/src/data/wearable-quality.ts`
- No custom processing needed (treat like `items`, `weapons`).

### Client Helper (single entry point for display)

- Extend `apps/client/src/lib/wearable-utils.ts` with a small formatter to compose quality adjective + base name:

```ts
import {
  getQualityLabelForWearable,
  type QualityTier,
} from '../data/wearable-quality';

export function formatWearableDisplayName(args: {
  quality?: QualityTier;
  wearableId?: number;
  wearableSlug?: string;
  fallbackName?: string;
}): string {
  const base = getWearableName(args.wearableId, args.fallbackName);
  const q = args.quality;
  if (!q) return base;
  const label = getQualityLabelForWearable(
    q,
    args.wearableSlug ?? args.wearableId
  );
  return `${label} ${base}`;
}
```

### UI Wiring (replace hard‑coded quality labels)

- `apps/client/src/app/me/inventory/inventory-client.tsx`
  - Remove local `QUALITY_LABELS` and `getQualityLabel` usage.
  - Where label is composed for options/cards, use:
    - `formatWearableDisplayName({ quality: item.quality, wearableSlug: slug, fallbackName: wearable.name })`.
  - Keep `QUALITY_COLORS` unchanged (colors remain global per tier).

- `apps/client/src/components/Toast.tsx`
  - Replace `getWearableName(item.wearableId, item.name)` with:
    - `formatWearableDisplayName({ quality: item.quality, wearableId: item.wearableId, fallbackName: item.name })`.

Notes:

- Sorting and ranks already use `QUALITY_ORDER` and are unaffected.
- No server gameplay changes; this is a display‑only enhancement.

### Authoring Overrides (guideline)

- Key by slug produced by our existing slugifier (e.g., `Jamaican Flag` → `jamaican-flag`).
- Only set the tiers you want to override; others fall back to defaults.
- Keep overrides short adjectives by convention (e.g., "Torn", "Faded", "Pristine").
- For broader changes, prefer `WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES` so every wearable that shares an `itemType` gets the same adjective.

### Steps to Ship

1. Create `data/wearable-quality.ts` with defaults, overrides, and resolver.
2. Add `'wearable-quality'` to the `FILES` list in `scripts/generate-shared-files.ts`.
3. Run `pnpm generate:shared` to sync to client/server.
4. Add `formatWearableDisplayName` to `apps/client/src/lib/wearable-utils.ts`.
5. Update `inventory-client.tsx` and `Toast.tsx` to use the formatter.
6. Seed an example override: `'jamaican-flag'` → `{ broken: 'Torn' }`.
7. Test: ensure Inventory option labels and pickup toasts show "Torn Jamaican Flag"; regression‑check other wearables still show default labels.

### Future Extensions (optional)

- Per‑wearable templates (e.g., `'{adjective} {base}'` vs `'The {base}, {adjective}'`).
- Localization hooks (map overrides per locale).
- Optional per‑wearable color overrides (if we ever need exceptions to global tier colors).

### Quality‑Based Stat Scaling (server‑authoritative)

Goal: Apply a quality multiplier to an item's own stat contributions (its wearable "effects" and weapon base damage numbers) at runtime, server‑authoritatively, using the inventory instance's `quality`.

Multipliers:

- `broken` → 0.50x
- `budget` → 0.66x
- `average` → 1.00x
- `excellent` → 1.50x
- `flawless` → 2.00x

Scope and rules:

- Scale all wearable `stat` effect modifiers contributed by the item:
  - For `add`: scale the additive value by the quality scalar.
  - For `add_percent`: scale the percent by the quality scalar (i.e., multiply by `1 + (percent * scalar)`).
  - For `mul`: scale only the delta from 1.0, i.e., `effective = 1 + (baseMul - 1) * scalar`.
  - Do not scale effect clamps (`min` / `max`).
- Scale weapon base damage numbers contributed by a wearable weapon profile:
  - `damage` and `damageRange` are scaled by the quality scalar.
  - `totalDamage` scalar (if present) is scaled like `mul` delta: `1 + (base - 1) * scalar`.
  - Do not scale `attackSpeed`, ranges, or projectile speed (unless explicitly requested later).
- Default/fallback: when the equipped item instance is unknown (slug‑only), use scalar = 1.0 (`average`).

Source of truth for quality:

- Instance quality comes from `player_inventories.quality` (already present via migration `20251220_000020_nonfungible_wearables.sql`).
- Equipment should reference the exact instance through `player_equipment.inventory_item_id` (column already present).

Shared data additions

- `data/wearable-quality.ts`
  - Add and export:
    - `QUALITY_SCALARS: Record<QualityTier, number>`
    - `getQualityScalar(q: QualityTier): number`
  - Example:

    ```ts
    export const QUALITY_SCALARS: Record<QualityTier, number> = {
      broken: 0.5,
      budget: 0.66,
      average: 1,
      excellent: 1.5,
      flawless: 2,
    };

    export function getQualityScalar(q: QualityTier): number {
      return QUALITY_SCALARS[q] ?? 1;
    }
    ```

  - This will be auto‑synced to `apps/client/src/data/wearable-quality.ts` and `apps/server/src/data/wearable-quality.ts` via `scripts/generate-shared-files.ts`.

Server implementation

- `apps/server/src/lib/db/repos/inventory.ts`
  - Add `getInventoryByIds(ids: string[]): Promise<PlayerInventoryRecord[]>` to fetch qualities in bulk.
  - Optional: `getInventoryMapByIds(ids: string[]): Promise<Map<string, PlayerInventoryRecord>>` for convenience.

- `apps/server/src/lib/db/repos/equipment.ts`
  - Already reads/writes `inventory_item_id`. No schema change.
  - Optional convenience: `getEquippedWithInstances(playerId, characterId?)` that joins to inventory to return `{ slot, wearableSlug, inventoryItemId, quality }[]`.

- `apps/server/src/lib/equipment-service.ts`
  - Equip path:
    - When equipping by slug, select a specific available instance to equip and pass `inventoryItemId` to `setEquipment` (heuristic: highest quality, then highest durability; later accept a client‑provided `inventoryItemId`).
  - `buildEquipmentState(...)`:
    - Use `getEquipmentByPlayer` to collect `inventoryItemId`s; fetch corresponding inventory rows; build `equipped = Array<{ slug: string; quality: QualityTier }>`.
    - Call `getCharacterStats(characterId, { equippedWearablesWithQuality: equipped })`.
    - Persist `players.derived_stats` as today.

- `apps/server/src/data/wearables.ts`
  - Extend aggregation with quality support:
    - Add `aggregateEquipmentStatsWithQuality(equipped: Array<{ slug: string; quality?: QualityTier }>)`.
    - Internally, compute `scalar = getQualityScalar(quality ?? 'average')` per item and apply scaling rules to each effect modifier before aggregating.
    - Keep the current `aggregateEquipmentStats(slugs: string[])` as a wrapper that maps each slug to `quality: 'average'`.

- `apps/server/src/data/characters.ts`
  - Extend `GetCharacterStatsOptions` with `equippedWearablesWithQuality?: Array<{ slot: WearableSlot; slug: string; quality: QualityTier }>`.
  - If provided, use `aggregateEquipmentStatsWithQuality`.
  - When building `weaponSummaries`/`activeWeapon`, if a quality scalar exists for that slug, scale `damage`/`damageRange`/`totalDamage` as defined above before applying downstream modifiers.

- `apps/server/src/lib/player-stats.ts`
  - Optional hardening: if no `equippedWearables` override is provided, read equipped instances (join `player_equipment` → `player_inventories`) to build `equippedWearablesWithQuality` (including `slot`) so runtime resyncs also respect quality.
  - Otherwise, continue relying on the equip‑time snapshot (`players.derived_stats`).

Client implementation

- `apps/client/src/data/wearables.ts`
  - Mirror `aggregateEquipmentStatsWithQuality` for local previews (UI‑only), importing `getQualityScalar` from the generated `../data/wearable-quality`.

- `apps/client/src/data/characters.ts`
  - Extend `getCharacterStats` signature to accept `equippedWearablesWithQuality` (including `slot`) and forward to the new aggregator; scale weapon numbers as on server for consistent previews.
  - Maintain backward compatibility for existing slug‑only calls.

- `apps/client/src/app/me/inventory/inventory-client.tsx`
  - If/when we show per‑instance equip previews, pass `{ slug, quality }` to the client `getCharacterStats` variant; otherwise no UI change required to ship.

API and types

- Expose optional `inventoryItemId` in equip endpoints so the client can explicitly equip a chosen instance.
- Augment `EquipmentAssignment` sent to clients to include the `inventoryItemId` and `quality` for transparency (helps client previews without extra calls).

Database changes (minimal)

- No new columns. Use existing:
  - `player_inventories.quality` (enum‑checked by migration)
  - `player_equipment.inventory_item_id` (nullable)
- Optional index for faster joins:
  - `create index if not exists idx_player_equipment_inventory on player_equipment (inventory_item_id);`

Rollout plan

1. Add `QUALITY_SCALARS` + `getQualityScalar` to `data/wearable-quality.ts`; run `pnpm generate:shared`.
2. Implement server aggregator with quality and wire `getCharacterStats` option.
3. Update `equipment-service` to select instances on equip, set `inventory_item_id`, and pass quality to `getCharacterStats` in `buildEquipmentState`.
4. Optional: add repo helpers (`getInventoryByIds`, `getEquippedWithInstances`).
5. Mirror aggregator + character updates on client for previews (no behavioral authority).
6. Add optional index on `player_equipment(inventory_item_id)`.
7. QA: Verify derived stats reflect expected multipliers with different quality instances; confirm weapon damage numbers scale while attack speed/ranges remain unchanged; regression‑check display labels still use `formatWearableDisplayName`.
