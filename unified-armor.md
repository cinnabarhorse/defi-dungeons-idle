### Unified Armor Implementation Plan

Goal: Remove the separate percent damage reduction stat and adopt a single unified armor value. For any incoming damage D and armor A, mitigation is:

- reduced = max(A, clamp(A / 100, 0, 0.8) × D)
- finalDamage = max(0, round(D − reduced))

This keeps flat reduction useful versus small hits and percent-based mitigation useful versus large hits, with the existing 80% cap preserved.

---

### 1) Data model and aggregation

- Root definitions (`data/wearables.ts`)
  - EQUIPMENT_STATS: replace/remove `percentDamageReduction`; add `armor` or relabel `flatDamageReduction` to “Armor”.
  - EQUIPMENT_STAT_LABELS: label to `Armor`.
  - STAT_CONFIG: `armor: { op: 'add' }` (no percent semantics here; percent is derived at runtime from A/100, capped to 0.8).
  - ITEM_TYPE_EFFECTS and WEARABLE_AUGMENT_DEFINITIONS:
    - Replace any `percentDamageReduction` modifiers with equivalent armor values: `armor += round(percent × 100)`.
    - If an entry currently has both flat and percent DR, set the single armor contribution to `max(flat, round(percent × 100))` (do not sum), to avoid overpowering after unification.

- Aggregation function targets
  - Server canonical: `apps/server/src/data/characters.ts` (aggregation path inside `getCharacterStats`):
    - Aggregate to `derived.armor` only; drop `percentDamageReduction` in the result.
    - Backcompat in aggregation: if a modifier is `flatDamageReduction`, `armor += value`; if `percentDamageReduction`, `armor += round(value × 100)`; if new `armor`, `armor += value`.
  - Generator mirrors: `apps/client/src/data/wearables.ts` mirrors labels/stats after `generate:shared`.

---

### 2) Damage mitigation logic (authoritative)

- `apps/server/src/lib/player-stats.ts`
  - Replace `calculateDamageAfterMitigation(player, incomingDamage)` with unified formula using `derivedStats.armor`.
  - Remove any reference to `percentDamageReduction`. Keep the 80% cap by applying it to `(armor / 100)`.
  - `syncPlayerCharacterStats`:
    - Stop composing/writing `percentDamageReduction` into `derivedStats`.
    - Ensure `derivedStats.armor` is included in the serialized JSON.

- Enemy-side mitigation via auras (if applicable)
  - `apps/server/src/lib/systems/EnemySystem.ts`: `applyAuraDamageMitigation` should expect a unified percent-like reduction from auras; if we want auras to use the new armor semantics, give them `armor` and reuse the same formula. Otherwise, keep aura percent handling but apply before/after armor consistently (documented below in Order of Operations).
  - `apps/server/src/lib/systems/AuraSystem.ts`, `apps/server/src/lib/ability-utils.ts`:
    - Replace `aggregateDamageReduction` to produce armor in “A units” (flat-or-percent). If retaining percent-style aura for enemies, convert it to A with `round(percent × 100)`.

Order of operations when both player armor and enemy aura mitigation exist:

1. Compute player armor mitigation via unified formula.
2. Apply enemy aura mitigation (percent or converted A) multiplicatively on the remaining damage.

This preserves previous aura stacking behavior while simplifying the player stat.

---

### 3) Run progression and bonuses

- `apps/server/src/lib/progression/runLevels.ts`
  - Remove `percentDamageReductionBonus`; add `armorBonus` (in A units) if we still grant mitigation via runs.
  - `apps/server/src/lib/player-stats.ts`: replace usage with `armor += armorBonus`.

---

### 4) Abilities and tags

- `data/abilities.ts` and mirrors under `apps/*/data/abilities.ts`
  - Ability id `damage-reduction`: switch to awarding `armor` (A units). For legacy JSON that passes `{ percent }`, convert to `{ armor: round(percent × 100) }` during parsing.
  - `apps/server/src/lib/ability-utils.ts`: update `aggregateDamageReduction` to aggregate `armor` instead of percent; keep a compatibility path that maps `{ percent }` → A.

---

### 5) UI and client

- `apps/client/src/app/me/inventory/inventory-client.tsx`
  - `formatModifier`: already maps flat DR to “armor”; remove `% Damage Reduction` output paths.
  - `summarizeWearable`: will naturally pick up `armor` effects post-generation; ensure fallback (ITEM_TYPE_EFFECTS) emits `armor` instead of percent DR.

- `apps/client/src/app/wearables/page.tsx`
  - Remove `percentDamageReduction` from stat lists and from `PERCENT_STATS`.

- Copy updates
  - `apps/client/src/data/archetypes.ts`, `apps/server/src/data/archetypes.ts`: update strings like “+1% armor per level” → either “+1 armor per level” or keep percent phrasing but emit A units in code.
  - `apps/client/src/components/Lobby.tsx`: any DR-related messaging.

---

### 6) Persistence and schema

- `apps/server/src/lib/db/repos/game-players.ts` and any code writing `derivedStats`
  - Ensure `derivedStats` JSON contains `armor` and no longer stores `percentDamageReduction`.
  - No SQL schema change unless DR fields exist in columns; current flow mostly stores JSON blobs. If columns exist, deprecate/ignore or migrate.

- `apps/server/src/schemas/index.ts`
  - If schemas/types mention `percentDamageReduction`, replace with `armor` or drop if not needed at schema level.

---

### 7) Step-by-step execution

1. Introduce unified stat at the source
   - Edit `data/wearables.ts`:
     - Add `armor` to `EQUIPMENT_STATS`, label to `Armor`, config to `{ op: 'add' }`.
     - Map all `ITEM_TYPE_EFFECTS` and `WEARABLE_AUGMENT_DEFINITIONS` entries:
       - `flatDamageReduction v` → `armor += v`
       - `percentDamageReduction p` → `armor += round(p × 100)`
       - If both exist in the same effect, use `armor += max(v, round(p × 100))`.
   - Run `pnpm run generate:shared`.

2. Server aggregation and mitigation
   - `apps/server/src/data/characters.ts` (aggregation): compute `derived.armor`; drop `percentDamageReduction`.
   - `apps/server/src/lib/player-stats.ts`: update mitigation formula and `syncPlayerCharacterStats` to only use/persist `armor`.

3. Progression and abilities
   - Replace `percentDamageReductionBonus` with `armorBonus` throughout run progression code.
   - Update ability parsing and aggregation to award `armor`.

4. Client/UI
   - Remove percent DR from visible stat lists; ensure “armor” is displayed consistently.
   - Keep the existing compact summary string that prints “+X armor”.

5. Enemy aura interaction (optional alignment)
   - Convert aura damage reduction to A units or keep as percent and apply after player armor. Documented above.

6. Clean-up search-and-replace
   - Remove references to `percentDamageReduction` from:
     - `apps/*/data/wearables.ts` (generated), `apps/*/data/characters.ts`, UI pages, docs where relevant.
   - Keep a transient compatibility path in aggregation for any old data still using percent; remove once all content migrated.

7. Testing checklist
   - Unit-level checks (can be done with existing simulate-combat script):
     - A=10, D=30 → reduced = max(10, 3) = 10 ⇒ final 20.
     - A=10, D=150 → reduced = max(10, 15) = 15 ⇒ final 135.
     - A=200, D=1000 → reduced = max(200, 800 capped at 800) = 800 ⇒ final 200.
   - End-to-end:
     - Verify inventory summaries show `+X armor`.
     - Verify server applies new mitigation on enemy melee and projectile hits.
     - Confirm run-level bonuses and armor-granting abilities affect damage taken.

---

### 8) Rollout strategy

- Phase 1 (safe):
  - Add `armor` stat, update mitigation to prefer `armor` if present; keep a compatibility path converting old percent/flat DR into armor during aggregation.
  - Regenerate client/server data and ship.

- Phase 2 (cleanup):
  - Remove `percentDamageReduction` from EQUIPMENT_STATS and from all data files.
  - Delete compatibility branches and dead code.

---

### 9) Files to touch (primary)

- Source of truth
  - `data/wearables.ts` (stats, labels, item effects, augments)

- Server
  - `apps/server/src/data/characters.ts` (aggregation → `derived.armor`)
  - `apps/server/src/lib/player-stats.ts` (mitigation and sync persistence)
  - `apps/server/src/lib/progression/runLevels.ts` (bonus rename)
  - `apps/server/src/lib/ability-utils.ts`, `apps/server/src/lib/systems/AuraSystem.ts` (aggregate armor)
  - `apps/server/src/lib/systems/EnemySystem.ts` (`applyAuraDamageMitigation` alignment)

- Client
  - `apps/client/src/data/wearables.ts` (generated mirror)
  - `apps/client/src/app/me/inventory/inventory-client.tsx` (format/summary)
  - `apps/client/src/app/wearables/page.tsx` (stat lists)
  - `apps/client/src/data/archetypes.ts`, `apps/server/src/data/archetypes.ts` (copy)

---

### 10) Commands

```bash
pnpm run generate:shared
pnpm -w build
```

---

### 11) Notes

- The unified A-value is intentionally a single knob that maps to both flat and percent contexts. When converting existing content that combined both, prefer `max(flat, percent×100)` per entry to avoid doubling power.
- Keep the percent cap behavior (80%) by applying it to `(armor / 100)` in the mitigation formula; do not clamp the flat side.
