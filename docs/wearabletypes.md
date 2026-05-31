## Wearable Item Types – Effects & Stat Bonuses (Questions)

### Scope confirmation

- Which entities should consume these effects now?
  - **Wearable item types** (e.g., `athletic`) → global baseline for all wearables of that type, by rarity.
  - **Individual wearables** → optional overrides/additions per item.
  - Any others for v1?

### Data model

- Where should the canonical registry of item-type effects live?
  - `data/wearables.ts` alongside `ITEM_TYPES_BY_SLOT`?
  - Separate file `data/wearable-item-type-effects.ts`?
- Proposed shape for item-type effects:

Let's keep it in data/wearables.ts.

```ts
export interface EquipmentStatModifier {
  stat: EquipmentStat;
  value: number;
  operation?: 'add' | 'mul' | 'add_percent';
  min?: number;
  max?: number;
}

export interface StatEquipmentEffect {
  type: 'stat';
  modifiers: EquipmentStatModifier[];
}

export type EquipmentEffect = StatEquipmentEffect;

// Map per slot, per type slug → list of effects
export interface ItemTypeEffectsRegistry {
  [slot in WearableSlot]?: Record<string, EquipmentEffect[]>;
}
```

- Confirm: Only `type: 'stat'` for now? Any other effect kinds needed (e.g., tags, procs, auras)?

Tags, auras, and abilities too.

### Operations and semantics

- Confirm meaning of operations:
  - **add**: adds a flat value to the stat (e.g., +10 maxHealth).
  - **mul**: multiplies the base stat by value (e.g., ×1.05).
  - **add_percent**: adds a percent to the aggregate (e.g., +5% damage taken off total?), or should we standardize on `mul` only for percents?
- Movement speed example: should 5% be modeled as `mul: 1.05` or `add_percent: 5`? Preferred convention?

Probably mul:1.05.

- Order of application: type effects → item overrides → character/runes/buffs? Where do these slot in the existing pipeline?

### Stacking and conflicts

- If multiple item types apply (future) or item-level also defines the same stat, how do we combine?
  - Combine all modifiers in declaration order?
  - Priority: item overrides take precedence over type effects?
- Clamp rules: should we enforce global mins/maxes for certain stats (e.g., armor-derived mitigation ≤ 80%)? Provide canonical clamps?

Use sensible defaults.

### UI/UX on `/item-types`

- Filters:
  - Filter by slot (`WearableSlot`) or Rarity level.
  - Search by type slug.
- Editing:
  - Add/remove modifiers for an item type.
  - Choose stat from `EQUIPMENT_STATS` and operation/value.
  - Validation hints (percent vs flat; allowed ranges; integer vs float?).
- Save flow:
  - Dev-only POST to API route to persist to canonical file via AST-safe write.
  - Auto-run `pnpm run generate:shared` after write, like the wearables editor.

### Validation

- Stats list to expose: use existing `EQUIPMENT_STATS` and labels from client data.
- Guardrails:
  - For `mul`, enforce value > 0 and reasonable bounds (e.g., 0.5–3?).
  - For `add_percent`, expected range (e.g., -100 to +500)?
  - For `movementSpeed`: recommend `mul` with 1.05 for 5%?

### Defaults and seeding

- Initial seed examples to confirm:
  - `body: athletic` → movementSpeed +5% (confirm op/value)
  - Any other archetypal mappings to seed now?

  Don't seed anthing. Thast was just an example.

### Persistence & tooling

- Persist in canonical source then sync via existing generator? Confirm command to run: `pnpm run generate:shared`.

Yes.

- CLI: extend `scripts/wearables-cli.ts` later to manage item-type effects? Or UI-only for now?

UI-only for now.

### Gameplay integration (server/client)

- For now, only data entry. Next phase: server-side application in stat computation path. Confirm target modules to read type/item effects and produce final stats.

### Access control

- Restrict API route and page to non-production? Gate with `NODE_ENV !== 'production'` as with wearables editor?

Yes.

### Anything else you want the UI to support in v1?

### Implementation plan

1. Data model updates in `data/wearables.ts`
   - Add rarity-aware effects registry colocated with `ITEM_TYPES_BY_SLOT`:

     ```ts
     export type WearableRarity =
       | 'common'
       | 'uncommon'
       | 'rare'
       | 'legendary'
       | 'mythical'
       | 'godlike';

     export interface TagEffect {
       type: 'tag';
       tags: string[];
     }

     export interface AuraEffect {
       type: 'aura';
       color?: string; // hex or css
       level?: number; // visual intensity 1-5
     }

     export interface AbilityEffect {
       type: 'ability';
       abilitySlug: string; // references ability registry by slug
       params?: Record<string, unknown>;
     }

     export type EquipmentEffect =
       | StatEquipmentEffect
       | TagEffect
       | AuraEffect
       | AbilityEffect;

     export interface ItemTypeEffectsByRarity {
       [slot in WearableSlot]?: Record<
         string,
         Partial<Record<WearableRarity, EquipmentEffect[]>>
       >;
     }

     export const ITEM_TYPE_EFFECTS: ItemTypeEffectsByRarity = {};
     ```

   - Keep per-wearable overrides in the existing `WEARABLE_AUGMENT_DEFINITIONS` map to avoid duplicating mechanisms.

2. API: extend dev-only route to persist effects
   - Extend `apps/client/src/app/api/wearables/item-type/route.ts` to support item-type effects payloads:
     ```ts
     // POST body
     interface SaveItemTypeEffectsInput {
       slot: WearableSlot;
       typeSlug: string;
       rarity: WearableRarity; // required for v1
       mode: 'replace' | 'append' | 'remove';
       effects: EquipmentEffect[]; // validated with zod
     }
     ```
   - Validation (zod):
     - `slot` must be a valid `WearableSlot` and `typeSlug` must exist under that slot.
     - For `StatEquipmentEffect`: `operation` in `['add','mul','add_percent']`, `mul > 0`, reasonable bounds; recommend `mul: 1.05` for +5% movement speed.
     - For `AbilityEffect`: require `abilitySlug` (free-form for now).
     - For `AuraEffect`: allow optional `color`/`level` ranges.
   - Gate with `NODE_ENV !== 'production'`.
   - Persist via `ts-morph` to update or insert `ITEM_TYPE_EFFECTS[slot][typeSlug][rarity]` without reordering unrelated code; then run `pnpm run generate:shared` and Prettier.

3. UI: `/item-types` page editor
   - Keep the route as a server component; dynamically import a small client editor (e.g., `editor-client.tsx`) wrapped in `Suspense`.
   - Filters using `nuqs` URL state:
     - `slot`, `rarity`, and search by type slug.
   - Editor capabilities:
     - View existing effects for the selected `(slot, typeSlug, rarity)`.
     - Add/remove effects with a picker for kind: `stat | tag | aura | ability`.
     - For `stat`: choose `stat` from `EQUIPMENT_STATS`, pick `operation`, enter `value`, optional `min/max` with guardrails.
     - Track unsaved changes; show a prominent Save button; POST to the dev API; show success/error toasts.
   - Read-only mode in production (no Save button).

4. Types reuse and labels
   - Import `EquipmentStat` and `EQUIPMENT_STAT_LABELS` from `../../data/wearables` to avoid duplication.
   - Export `WearableRarity` from `data/wearables.ts` so both client and server can share the union.

5. Idempotency and safety
   - When `mode = append`, deduplicate effects by structural equality (same kind and parameters).
   - When `mode = remove`, match by structural equality; if not found, no-op.
   - Keep declaration order stable; never resort slots or types.

6. Testing
   - Local-only manual test:
     - Add a `mul: 1.05` `movementSpeed` effect for `(slot=body, type='athletic', rarity='common')`.
     - Save and verify `data/wearables.ts` updated; confirm `apps/*/data/wearables.ts` synced after `generate:shared`.
   - UI smoke test: filter by `body` and `common`, locate `athletic`, confirm effect shows in the list.

7. Future (Phase 2, server application)
   - Apply item-type effects in the server stat pipeline, combining in order: item-type effects (by rarity) → per-wearable overrides → other buffs.
   - Add clamps and finalization where appropriate (e.g., max DR%).
