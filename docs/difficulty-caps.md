## Difficulty Caps and Reward Scaling (Draft)

Scope: Player-only. Caps apply to outgoing player attacks (damage per hit and attack speed) and player mitigation (armor). Enemies are not capped by these rules.

Applied systems for rewards: Per-player XP and loot drops (enemy drops and treasure chests). Each player’s multipliers are computed independently from their own tier relative to the activity tier.

### Cap Definitions per Difficulty

For each tier, we define:

- maxDamagePerHit: maximum damage a single player hit can deal after player-side calculations (before enemy HP subtraction)
- minAttackIntervalMs: minimum allowed attack interval (lower values mean faster attacks; we clamp to at least this number)
- maxPercentDamageReduction: cap on total percent-based mitigation from gear/abilities
- maxFlatDamageReduction: cap on flat mitigation value from gear/abilities

Proposed defaults:

- normal_1
  - maxDamagePerHit: 80
  - minAttackIntervalMs: 600
  - maxPercentDamageReduction: 0.25
  - maxFlatDamageReduction: 1
- normal_2
  - maxDamagePerHit: 120
  - minAttackIntervalMs: 550
  - maxPercentDamageReduction: 0.30
  - maxFlatDamageReduction: 3
- normal_3
  - maxDamagePerHit: 180
  - minAttackIntervalMs: 500
  - maxPercentDamageReduction: 0.35
  - maxFlatDamageReduction: 5

- nightmare_1
  - maxDamagePerHit: 250
  - minAttackIntervalMs: 450
  - maxPercentDamageReduction: 0.50
  - maxFlatDamageReduction: 10
- nightmare_2
  - maxDamagePerHit: 350
  - minAttackIntervalMs: 400
  - maxPercentDamageReduction: 0.60
  - maxFlatDamageReduction: 12
- nightmare_3
  - maxDamagePerHit: 450
  - minAttackIntervalMs: 350
  - maxPercentDamageReduction: 0.65
  - maxFlatDamageReduction: 14

- hell_1
  - maxDamagePerHit: 600
  - minAttackIntervalMs: 325
  - maxPercentDamageReduction: 0.70
  - maxFlatDamageReduction: 16
- hell_2
  - maxDamagePerHit: 800
  - minAttackIntervalMs: 300
  - maxPercentDamageReduction: 0.75
  - maxFlatDamageReduction: 18
- hell_3
  - maxDamagePerHit: 1000
  - minAttackIntervalMs: 275
  - maxPercentDamageReduction: 0.80
  - maxFlatDamageReduction: 20

- beyond_hell
  - maxDamagePerHit: 1400
  - minAttackIntervalMs: 250
  - maxPercentDamageReduction: 0.85
  - maxFlatDamageReduction: 25

### Reward Multipliers by Tier Gap (Per Player)

Let gap = playerTier − zoneTier. Apply the following multiplier to that player’s XP and loot rewards (enemy drops and chests):

- gap = 0 → 1.00x
- gap = +1 → 0.60x
- gap = +2 → 0.30x
- gap ≥ +3 → 0.15x

Notes:

- These multipliers are intended to discourage over-leveled farming in lower tiers without removing the option to play together.
- If we introduce a Mentor/Downscale mode later, the player can opt into downscaling to earn the full (1.00x) rewards in lower tiers.

### Implementation Notes (for future PR)

- Enforce minAttackIntervalMs by clamping player derived attack interval when actions are created or when syncing derived stats.
- Enforce maxDamagePerHit by clamping the computed base damage (post-player calculations and crits, pre-HP subtraction) per hit.
- Enforce armor caps in mitigation flow:
  - percent cap: clamp to `maxPercentDamageReduction` per difficulty
  - flat cap: clamp to `maxFlatDamageReduction` per difficulty
- Apply reward multipliers at the point of XP award and loot allocation (both enemy drops and chest allocation) using each player’s gap relative to the current room’s difficulty tier.

Open items to consider next:

- Whether to expose these caps in the lobby UI for transparency.
- Optional “mentor currency” for downscaled play in lower tiers.

