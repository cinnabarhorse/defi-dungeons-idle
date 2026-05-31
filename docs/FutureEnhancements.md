# Future Enhancements

A collection of ideas and planned features for future development. These are not part of the current implementation but are worth considering for future updates.

---

## Table of Contents

1. [Combat & Survival Systems](#combat--survival-systems)
2. [Daily Quest Competition](#daily-quest-competition)
3. [Economy & Rewards](#economy--rewards)
4. [Crafting & Progression](#crafting--progression)

---

## Combat & Survival Systems

### Potion Tiering System

**Problem:** Currently, when a player takes lethal damage, the system auto-consumes as many potions as needed to bring HP above 0. This feels overpowered—a player with 10 potions is essentially invincible against spike damage.

**Current Behavior:**

- Player takes 200 damage, HP drops to -50
- System loops: consume potion (+75 HP), still at +25, so 1 potion used
- If damage was 300 and HP dropped to -150, system would consume 3 potions

**Proposed Solution: Tiered Potions with Single-Use Limit**

1. **Limit to 1 potion per attack** — Only one potion can be auto-consumed per incoming damage instance
2. **Introduce potion tiers** — Higher tier potions heal more, earned through crafting

| Tier | Name                   | Heal Amount         | Acquisition                            |
| ---- | ---------------------- | ------------------- | -------------------------------------- |
| 1    | Minor Health Potion    | 10% max HP (min 50) | Loot drops, shop                       |
| 2    | Health Potion          | 25% max HP          | Crafted (Tier 1 × 3)                   |
| 3    | Greater Health Potion  | 50% max HP          | Crafted (Tier 2 × 3)                   |
| 4    | Superior Health Potion | 75% max HP          | Crafted (Tier 3 × 3)                   |
| 5    | Elixir of Life         | 100% max HP         | Crafted (Tier 4 × 2 + rare ingredient) |

**Benefits:**

- Creates meaningful progression for potion crafting
- Rewards preparation and resource management
- Spike damage becomes a real threat again
- Creates a resource sink for the economy
- Players must choose: carry many weak potions or few strong ones

**Alternative Considerations:**

- Could add a short cooldown between potion uses (e.g., 3 seconds)
- Could make auto-consume optional, letting players manually use potions
- Could add "potion sickness" debuff that stacks with each potion used

---

## Daily Quest Competition

### GHST Staking for Additional Attunements

> **Moved from v1.1 simplified scope**

Allow players to stake GHST to unlock additional daily quest attempts per tier.

| Stake Level | Attunements | Daily Quest Runs    |
| ----------- | ----------- | ------------------- |
| 0 GHST      | 1           | 1 per unlocked tier |
| 100 GHST    | 2           | 2 per unlocked tier |
| 500 GHST    | 3           | 3 per unlocked tier |

**Implementation Notes:**

- Attunements are global pool, usable across any unlocked tier
- Staking takes effect immediately
- Consider 24-hour unstaking cooldown to prevent gaming
- Only first run per tier receives time multiplier

---

### Pay to Hide Leaderboard Entry

Allow players to spend GHST to temporarily hide their leaderboard entry from other players.

**Mechanics:**

- Hidden entries are revealed at daily reset
- Other players must decide whether to risk playing late without full information
- Creates a GHST sink and adds a mind-game element to competition
- Suggested price: 5-10 GHST per hide (to discourage overuse)

**Strategic Implications:**

- Early players can hide high scores, making late players uncertain
- Creates tension between visibility and secrecy
- Adds depth to the time multiplier decision

---

### Champion Handicap

If the same player wins multiple days in a row, apply a small score penalty to encourage variety in winners.

**Possible Implementation:**

- 2 consecutive wins: 5% score penalty
- 3 consecutive wins: 10% score penalty
- 4+ consecutive wins: 15% score penalty (cap)
- Penalty resets after a day without winning

---

### Weekly/Monthly Bonuses

- **Consistency Bonus:** Complete 5/7 daily quests in a week → Bonus GHST
- **Streak Rewards:** Consecutive day participation bonuses
- **Monthly Champion:** Highest cumulative score across the month
- **Titles/Cosmetics:** Special rewards for monthly top performers

---

## Economy & Rewards

### Milestone GHST Rewards

Allow F2P players to earn GHST through normal gameplay achievements:

| Milestone                    | GHST Reward |
| ---------------------------- | ----------- |
| First time reaching floor 10 | 5 GHST      |
| First time reaching floor 20 | 10 GHST     |
| First boss kill at Nightmare | 15 GHST     |
| Reach account Level 25       | 10 GHST     |
| Reach account Level 50       | 25 GHST     |

**Purpose:** Provides a path for dedicated F2P players to eventually stake without purchasing GHST.

---

### Participation Rewards

Small reward (0.1-0.25 GHST) for anyone who completes a daily quest, even if not in top 10.

**Benefits:**

- Creates a slow accumulation path for F2P players
- Encourages daily engagement even for non-competitive players
- Builds habit of daily participation

**Considerations:**

- Must balance against bot/alt farming potential
- Could require minimum score threshold to qualify
- Could be limited to first run per day only

---

## Crafting & Progression

### Potion Crafting Recipes

Building on the tiered potion system, introduce a crafting system:

**Basic Recipes:**

```
3× Minor Health Potion → 1× Health Potion
3× Health Potion → 1× Greater Health Potion
3× Greater Health Potion → 1× Superior Health Potion
2× Superior Health Potion + 1× Phoenix Feather → 1× Elixir of Life
```

**Advanced Considerations:**

- Crafting could require a crafting station (base feature)
- Could add crafting skill that improves success rate or bonus effects
- Could introduce crafting materials dropped from specific enemies/bosses
- Failed crafts could produce "Unstable Potions" with random effects

---

### Mana Potion Tiers

Similar tiering system for mana potions:

| Tier | Name                 | Mana Restored |
| ---- | -------------------- | ------------- |
| 1    | Minor Mana Potion    | 15% max mana  |
| 2    | Mana Potion          | 35% max mana  |
| 3    | Greater Mana Potion  | 60% max mana  |
| 4    | Superior Mana Potion | 100% max mana |

---

## Priority Assessment

| Feature               | Impact | Effort | Priority |
| --------------------- | ------ | ------ | -------- |
| Potion Tiering        | High   | Medium | P1       |
| GHST Staking          | High   | High   | P1       |
| Milestone Rewards     | Medium | Low    | P2       |
| Pay to Hide           | Low    | Low    | P3       |
| Champion Handicap     | Low    | Low    | P3       |
| Participation Rewards | Medium | Low    | P2       |
| Potion Crafting       | Medium | Medium | P2       |

---

## Notes

- All features should be configurable via `data/game-config.ts`
- Consider A/B testing for balance-sensitive features
- Monitor economy impact before and after implementation
- Gather player feedback through Discord before finalizing designs

