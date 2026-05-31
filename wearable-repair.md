# Wearable Repair Plan

## Goal

Introduce a per-run quality decay rule for wearable instances, along with a
repair loop that is visible to players and balanced with sensible gold costs.

## Assumptions

- Wearables are already non-fungible items with per-instance `quality` and
  `durability_score` stored in `player_inventories`.
- Quality tiers are fixed: `flawless`, `excellent`, `average`, `budget`, `broken`.
- A "run" maps to a completed game session (server-side run end).
- Repair restores wearables by increasing `quality_score` (tier is unchanged).

## Data Model

### Existing

- `player_inventories.quality` (tier label)
- `player_inventories.quality_score` (optional numeric)
- `player_inventories.durability_score` (numeric)

### Proposed

Minimal change first:
- Use `quality_score` to represent decay steps.
- Record repair events in `player_inventory_events` with metadata containing
  `from_quality_score`, `to_quality_score`, and `gold_spent`.

Optional (future):
- Add `original_quality_score` to preserve drop quality and cap repairs.
- Use `durability_score` as a finer-grained counter to avoid a score drop every
  run (e.g., 1000 -> 0, then drop `quality_score` by 1 and reset to 1000).

## Current Status

- `quality_score` is stored per wearable instance, but there is no per-run
  decrement logic.
- There is no auto-destroy flow when `quality_score` reaches 0.
- Manual destroy exists via inventory removal endpoints only.

## Decay Rule

Default behavior:
- On each completed run, for every equipped wearable instance, reduce
  numeric `quality_score` by 1 (down to a minimum of 0).
- `quality` (tier label) never changes.
- When `quality_score` reaches 0, the wearable instance is destroyed (removed
  from inventory and unequipped if applicable).

Stop condition:
- If already at `quality_score` 0, do not reduce further.

## Repair Flow

### Repair Trigger

Player can repair wearables at:
- End-of-run summary screen (primary entry point).
- Inventory / equipment panel (secondary entry point).

### Repair Options

Default options:
- Repair a single wearable instance.
- Repair all equipped wearables (batch).

Repair target:
- Default to repair back to a configured max score (e.g., 100).
- If `original_quality_score` exists, allow repair up to that score.

## UI Plan

### Wearable State Indicator

Placement:
- Inventory and equipment tiles.

Visuals:
- Tier badge with color map (tier does not change; badge is informational):
  - `flawless`: gold
  - `excellent`: green
  - `average`: blue
  - `budget`: orange
  - `broken`: red
- If `quality_score` is low (e.g., <= 20% of max), show a small "needs repair"
  icon.

Tooltip / popover:
- "Quality: 42/100. Degrades by 1 per run."

### End-of-Run Summary

Add a "Wearables Wear" panel:
- List of equipped wearables with old score -> new score.
- CTA: "Repair now" with total gold cost.
- Secondary action: "Repair later".

### Repair Modal

Contents:
- Selected wearable(s)
- Current score and repaired score
- Gold cost
- Confirm / cancel

Accessibility:
- Text labels for tier names and costs.
- Keyboard focus on confirm button.

## Repair Pricing Defaults

Pricing should scale by score and slot type. Suggested baseline:
- Base cost per score point: 1 gold.
- Slot multipliers:
  - Head: 1.0
  - Face: 0.8
  - Body: 1.2
  - Hands: 1.0
  - Feet: 0.9
  - Back: 1.1
  - Pet: 1.3
  - Weapon: 1.5

Example costs (per step):
- Head: 50
- Weapon: 75
- Pet: 65

Formula:
- `repairCost = baseCostPerPoint * slotMultiplier * pointsToRepair`
- Round to nearest 5 gold.

Defaults:
- Repair 20 points: 16-30 gold depending on slot.
- Repair 50 points: 40-75 gold depending on slot.

## Server Implementation Plan

1. Add quality decay on run completion:
   - Identify equipped wearable instances for the run's player(s).
   - Decrement `quality_score` by 1 if above 0.
   - If `quality_score` reaches 0, destroy and unequip the instance.
   - Store a `player_inventory_events` entry per change.
2. Add repair endpoint:
   - POST `inventory/repair` with list of `inventory_item_id`s.
   - Validate ownership, current score, and gold balance.
   - Charge gold, update score, record inventory event.
3. Add repair pricing helper:
   - A map for slot -> multiplier.
   - A max score constant and points-to-repair helper.
4. Add tests:
   - Run completion decreases `quality_score` by 1.
   - Wearable is destroyed at `quality_score` 0.
   - Repair endpoint charges correct gold and updates score.
   - Cannot repair beyond cap if `original_quality_score` is added later.

## Client Implementation Plan

1. Add wearable tier badge in inventory/equipment UI (informational).
2. Add end-of-run wearables panel and repair CTA.
3. Add repair modal and client API call.
4. Add pricing preview in UI before confirm.
5. Add unit tests for pricing display and repair flow.

## Open Questions

- What is the default max `quality_score` (e.g., 100) and initial score for new drops?
- Should decay apply only to equipped wearables or all owned wearables?
- Should repair cap at the original drop score, or always up to max?
- What currency should repairs use, and where is that balance stored?
- When a wearable hits 0, do we auto-unequip and log a specific event reason?
- Where should the primary repair UI live (end-of-run summary only, or also inventory)?
- Should we use `durability_score` for finer granularity?
- Should repairs be allowed during a run?
