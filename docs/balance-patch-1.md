## Balance Patch 1 — Character Offense Normalization (TTK)

Goal

- Ensure TTK ordering by character tier is monotonic across baseline encounters: T4 < T3 < T2 < T1.
- Do not change any enemy stats; adjust only player character stats.

Guiding principles

- Prefer small, controlled changes to `attackSpeed` (cadence) and `damageScalar` (post-modifier multiplicative) rather than large flat damage swings.
- Keep weapon identities intact; avoid redefining weapon types or ranges.
- Nudge Tier 4 toward lower TTK via faster cadence and/or higher scalar; soften Tier 1 slightly on offense.

Recommended tier baselines (applied as targets, then tuned per-character)

- Tier 4: attackSpeed ≈ 650–700 ms, damageScalar ≈ 1.25–1.35
- Tier 3: attackSpeed ≈ 700–800 ms, damageScalar ≈ 1.10–1.20
- Tier 2: attackSpeed ≈ 800–900 ms, damageScalar ≈ 0.95–1.00
- Tier 1: attackSpeed ≈ 950–1100 ms, damageScalar ≈ 0.85–0.95

Proposed per-character adjustments (data/characters.ts)

- Notes: These are additive to existing stats. If a field is not shown for a character today, add it under that character’s `stats` object.

```diff
// Tier 4
 bushidogotchi (tier4)
   stats: {
     attackAnimProfile: { totalFrames: 6, impactFrameIndex: 2, frameRateBase: 12 },
+    attackSpeed: 650,
+    damageScalar: 1.28,
   }

 portalmage (tier4)
   stats: {
+    attackSpeed: 650,
+    damageScalar: 1.28,
   }

 // (NPCs left unchanged): laozigotchi, mudgen

// Tier 3
 citaadelknight (tier3)
   stats: {
-    attackSpeed: 300,
+    attackSpeed: 700,
+    damageScalar: 1.15,
     attackAnimProfile: { totalFrames: 6, impactFrameIndex: 2, frameRateBase: 12 },
   }

 coderdan (tier3)
   stats: {
+    damageScalar: 1.12,
   }

// Tier 2
 aagent (tier2)
   stats: {
-    damage: 50,
-    attackSpeed: 600,
+    damage: 42,
+    attackSpeed: 750,
     rangedAttackRange: 400,
     projectileSpeed: 1000,
     weaponType: 'ranged',
     attackRangedVisualScale: 1.6,
   }

 gotchidator (tier2)
   stats: {
     weaponType: 'melee',
-    attackSpeed: 800,
+    attackSpeed: 850,
+    damageScalar: 0.98,
     attackAnimProfile: { totalFrames: 5, impactFrameIndex: 2, frameRateBase: 15 },
   }

 geisha (tier2)
   stats: {
+    damageScalar: 0.96,
   }

 gldnxross (tier2)
   stats: {
+    damageScalar: 0.96,
   }

 xibot (tier2)
   stats: {
+    damageScalar: 0.96,
   }

// Tier 1
 baarbarian (tier1)
   stats: {
-    attackSpeed: 900,
+    attackSpeed: 950,
+    damageScalar: 0.92,
     weaponType: 'melee',
     attackAnimProfile: { totalFrames: 6, impactFrameIndex: 3, frameRateBase: 12 },
   }

 wizard (tier1)
   stats: {
+    attackSpeed: 1050,
+    damageScalar: 0.90,
   }

 farmer (tier1)
   stats: {
+    attackSpeed: 1050,
+    damageScalar: 0.88,
   }
```

Rationale by bucket

- Tier 4: Provide a meaningful offensive edge (≈25–30%) and faster cadence so T4 consistently tops TTK charts without relying on enemy-specific weaknesses.
- Tier 3: Normalize very fast outliers (e.g., `citaadelknight` from 300 ms to ~700 ms cadence) while keeping a moderate scalar bump.
- Tier 2: Pull back the current top performer `aagent` (high base damage + 600 ms cadence) so it doesn’t outrank T3/T4; tiny trims on others for headroom.
- Tier 1: Slight nerfs to move them to the slowest average TTK without drastically impacting early-game feel.

Validation checklist (after applying)

1. Re-run simulations at Normal 1 and Nightmare 1 to confirm ordering stability across tier bands:
   - `pnpm ts-node scripts/simulate-combat.ts --iters=800 --onlyTier=normal_1`
   - `pnpm ts-node scripts/simulate-combat.ts --iters=800 --onlyTier=nightmare_1`
2. In the Simulations UI, confirm:
   - Aggregate (by tier) sorts lower for T4 than T3/T2/T1 (TTK ascending)
   - Per-Enemy Summaries with tier filter also show T4 < T3 < T2 < T1 for the majority of enemies
3. Watch win rate (WR) bands; if WR drifts > ±15% for specific matchups, consider minor defensive trims (flat or percent DR) rather than further offensive changes.

Potential follow-ups (not in this patch)

- If `aagent` still spikes on certain ranged-favoring enemies, consider a small projectile-speed drop (from 1000 → 900) instead of reverting damage.
- If `citaadelknight` dips too far on high-HP targets after cadence normalization, lift `damageScalar` to 1.18.

Impact summary

- Establishes a consistent TTK gradient by tier without enemy changes.
- Keeps class identity; most changes are small cadence and scalar nudges.
- Minimizes downstream risk by avoiding large flat damage or range edits.
