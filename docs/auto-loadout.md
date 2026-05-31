### Strategies to add “Equip Best Loadout” on `me/inventory`

- **Entry point (UI)**
  - Add a primary button near the loadout header with a dropdown: “DPS”, “Defense”, “Speed”, “Balanced”, plus “Custom…”.
  - Offer “Lock current items” per-slot (checkbox/lock icon) so users can protect a slot from changes.
  - Show a preview sheet: stat deltas by slot and why each item was chosen; allow “Apply” or “Cancel”.
  - Persist the chosen mode in URL using `nuqs` (e.g., `?mode=dps&respectLocked=1`).

- **Where to compute**
  - Compute the recommended set on the server (anti-cheat, single source of truth) and return item IDs; client only previews and sends equip mutations.
  - Mirror a lightweight client scorer for instant preview, but treat the server’s result as authoritative.

- **Rollout plan**
  - MVP: greedy per-slot pick with simple weights.
  - Phase 2: set bonuses, 2H constraints, and synergy.
  - Phase 3: context-aware (map, enemy type, active ability) and user-tunable weights.

### How to determine “best” (scoring approaches)

- **MVP weighted sum (fast, predictable)**
  - Normalize stats per slot across owned items (min–max or percentile).
  - Weighted score per item, fill each slot with max score, respecting requirements (level, class, slot, two-handed).
  - Presets define weights:
    - DPS: high weight on attackDamage, attackSpeed, critChance/critDamage.
    - Defense: armor, hp, damageReduction, resistances.
    - Speed: movementSpeed, dashCharges/cooldown.
    - Balanced: moderate weights across core stats.

- **Role- and build-aware weighting**
  - Derive weights from the active character/archetype and currently equipped weapon/ability scaling (e.g., if your primary scales with attackSpeed, boost that weight).
  - Optionally detect recent combat telemetry (crits vs DoT vs ability usage) to auto-bias weights.

- **Set/synergy bonuses**
  - Add group scores for set thresholds (2/3/4-piece). Score should reflect marginal value of adding another piece.
  - Heuristic: evaluate top-K sets first; temporarily reserve their slots; fill remaining with best singles; compare a few top combinations.

- **Two-handed and slot coupling**
  - Treat 2H weapons as a single candidate that consumes both hand slots.
  - For off-hand synergy (e.g., shield + 1H), include pairwise bonus terms.

- **Negative/conditional stats**
  - Subtract penalties (e.g., -movementSpeed) with negative weights.
  - Only consider conditional bonuses when conditions are likely met (e.g., “on crit” if critChance above a threshold).

- **Greedy vs global optimization**
  - Greedy with lookahead is often enough:
    - Try “no set”, “best 2-piece of each top set”, “best 3-piece” options; for each, fill remaining slots greedily; pick the best total.
  - If you need exactness: model as ILP/knapsack (binary select per item, slot capacity constraints, 2H coupling, set bonuses). Likely overkill for runtime; good for offline tuning.

- **Tiebreakers**
  - Prefer items already equipped (minimize swaps).
  - Prefer lighter/cost-free swaps (durability/repair, if applicable).
  - Prefer higher rarity if scores tie.

- **Context inputs (optional)**
  - Map/enemy plan: give resistances/elemental weights based on upcoming area.
  - Player toggles: “favor survivability”, “favor clear speed”, “avoid movement penalties”.
  - Respect cosmetics-only slots or exclude them.

### Minimal example of a scorer (weights + normalization)

```ts
interface StatWeights {
  attackDamage: number;
  attackSpeed: number;
  critChance: number;
  critDamage: number;
  movementSpeed: number;
  armor: number;
  hp: number;
  damageReduction: number;
  resistFire: number;
  resistCold: number;
  // extend as needed
}

interface ItemStats {
  id: string;
  slot:
    | 'head'
    | 'body'
    | 'hands'
    | 'offhand'
    | 'feet'
    | 'ring'
    | 'amulet'
    | 'belt';
  isTwoHanded?: boolean;
  setKey?: string;
  // numeric stats used by the scorer (undefined treated as 0)
  attackDamage?: number;
  attackSpeed?: number;
  critChance?: number;
  critDamage?: number;
  movementSpeed?: number;
  armor?: number;
  hp?: number;
  damageReduction?: number;
  resistFire?: number;
  resistCold?: number;
}

function scoreItem(
  stats: ItemStats,
  weights: StatWeights,
  ranges: Partial<Record<keyof StatWeights, { min: number; max: number }>>
): number {
  let total = 0;
  for (const key in weights) {
    const w = weights[key as keyof StatWeights] ?? 0;
    const raw = (stats[key as keyof ItemStats] as number | undefined) ?? 0;
    const r = ranges[key as keyof StatWeights];
    const norm = r && r.max !== r.min ? (raw - r.min) / (r.max - r.min) : raw; // fallback if range unknown
    total += w * norm;
  }
  return total;
}
```

### Server-side shape (authoritative)

- Input: characterId, ownedItemIds, lockedSlotIds, mode, optional custom weights, context hints (map/enemy).
- Output: chosen itemIds per slot, rationale: per-slot score, set bonuses applied, total deltas.
- Validation: enforce level/class/slot constraints and 2H coupling; server recomputes derived stats.

### UX guardrails

- “Respect locked slots” toggle.
- “Explain choice” accordion showing per-slot top 3 alternatives with scores.
- Undo button to revert to previous loadout.

### Performance

- Precompute per-slot candidate rankings; memoize by `mode` and ownership hash.
- If you keep scoring client-side for preview, run in a Web Worker and cap combinatorics (e.g., only evaluate top 5 sets × 3 sizes).

### Persistence

- Save preferred mode and custom weights per-account in profile; reflect in URL via `nuqs` for quick switching and shareable links.

- Equip Best loadout should:
  - Maximize a weighted, normalized stat sum.
  - Respect constraints (slots, 2H, class/level).
  - Account for set/pair synergies.
  - Be server-authoritative for anti-cheat; client previews are advisory.

- Start simple (greedy + presets), add synergy and context over time.
