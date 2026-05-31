# Daily Quest Competition System

## Design Document

**Version:** 1.2  
**Status:** READY FOR IMPLEMENTATION  
**Created:** January 3, 2026  
**Updated:** January 16, 2026

> **v1.2 Notes (Simplified Scope):**
>
> - GHST staking for additional runs moved to Future Enhancements
> - **Everyone gets 3 daily runs** that can be used on any tier
> - **No Lick Tongue requirements** for daily competition
> - All other features implemented end-to-end
> - Prizes integrate with existing token withdrawal system (`/me/tokens/`)

---

## Executive Summary

This document outlines a redesigned daily quest system that transforms the current threshold-based reward mechanism into a competitive leaderboard system. The new design addresses issues with the original system while creating engaging gameplay loops for both new and veteran players.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Problems with the Original System](#problems-with-the-original-system)
3. [New System Overview](#new-system-overview)
4. [Attunement System](#attunement-system)
5. [Time Multiplier](#time-multiplier)
6. [Leaderboard & Rewards](#leaderboard--rewards)
7. [Reward Distribution](#reward-distribution)
8. [Prize Distribution Mechanics](#prize-distribution-mechanics) ← **NEW**
9. [Player Journeys](#player-journeys)
10. [Future Enhancements](#future-enhancements)
11. [Technical Considerations](#technical-considerations)
12. [Game Config Settings](#game-config-settings) ← **NEW**
13. [Open Questions](#open-questions)

---

## Design Philosophy

### Core Principles

1. **Earned Privilege, Not Entitlement**
   - Additional daily quest attempts should be earned through commitment (GHST staking), not given freely
   - Players who invest more have more opportunities, but not guaranteed victories

2. **Skill Over Volume**
   - Only a player's best score counts on the leaderboard
   - More attempts provide consistency, not multiplication of rewards
   - The time multiplier rewards strategic timing, not just raw power

3. **Accessible Competition**
   - New players can grind unlimited normal runs to prepare
   - The time multiplier gives early players an edge, enabling skilled newcomers to compete
   - Daily reset ensures no permanent advantages—everyone starts fresh each day

4. **Sustainable Economy**
   - Fixed weekly reward pool prevents runaway inflation
   - Top 10 only receive rewards, creating scarcity and value
   - GHST staking creates token demand and player commitment

### Why Leaderboard Over Threshold?

The original threshold system ("beat 50% of yesterday's high score to earn rewards") had fundamental flaws:

| Threshold System                              | Leaderboard System                            |
| --------------------------------------------- | --------------------------------------------- |
| Guaranteed reward if you beat threshold       | Must outperform other players                 |
| Threshold ratchets up throughout day          | Competition is transparent and fair           |
| Early players set difficulty for late players | Time multiplier rewards early play explicitly |
| No cap on daily payouts                       | Fixed pool = predictable costs                |
| Solo experience                               | Community competition                         |

---

## Problems with the Original System

### Problem 1: Threshold Ratchet Effect

In the original system, the threshold increased dynamically when players beat it. This meant:

- Players who completed early faced an easier threshold
- Late players faced a threshold inflated by earlier completions
- Time-of-day became a hidden meta-strategy

**Solution:** Replace dynamic threshold with fixed leaderboard. Everyone sees the same competition; time multiplier makes early advantage explicit and fair.

### Problem 2: Winner-Takes-All Progression

We considered giving more attunements to higher-level players, but this creates runaway advantages:

- Level 60 players get 4 attunements
- 4 attunements = 4x earning opportunities
- More earnings = stay ahead forever
- No entropy in the system

**Solution:** Decouple attunements from player level. Tie them to GHST staking instead—a commitment anyone can make, and one that doesn't compound infinitely.

### Problem 3: Same Experience for All Players

Every player—new or veteran—received exactly 1 daily quest. This provided:

- No way for dedicated players to show commitment
- No aspirational goal beyond "do your one quest"
- No differentiation based on investment

**Solution:** Allow players to stake GHST for additional attunements. This creates earned privilege and rewards commitment.

### Problem 4: New Player Engagement Loop

If a new player's only content was the daily quest, the 24-hour wait between attempts would be brutal.

**Solution:** Normal gameplay is unlimited and free. Players grind, level up, and acquire gear without limits. The daily quest is the _competitive reward layer_, not the core loop.

---

## New System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     GAME STRUCTURE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NORMAL PLAY (Foundation) - Idle Mode                           │
│  ├── Unlimited runs, completely free                            │
│  ├── Earn XP, level up character                                │
│  ├── Acquire gear and wearables                                 │
│  ├── Earn Lick Tongues (progression currency)                   │
│  ├── No real-money rewards                                      │
│  └── Preparation for competitive play                           │
│                                                                 │
│  ──────────────────────────────────────────────────────────     │
│  │  DAILY COMPETITION (Open to all players)                │    │
│  │    3 runs per day, usable on any tier                   │    │
│  │    No Lick Tongue requirements                          │    │
│  ──────────────────────────────────────────────────────────     │
│                                                                 │
│  DAILY QUEST COMPETITION (Reward Layer)                         │
│  ├── Open to all players (no unlock requirements)               │
│  ├── 3 runs per day (usable on any tier)                        │
│  ├── Leaderboard determines winners (top 10 per tier)          │
│  ├── Top 10 earn USDC + GHST rewards                           │
│  ├── Must beat boss + return to surface to qualify             │
│  └── Resets daily at UTC midnight                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Daily Run System

### No Unlock Requirements

The daily quest competition is **open to all players**. There are no Lick Tongue requirements to participate in the daily competition.

- All players can compete on any difficulty tier they can access in the game
- The only limit is the number of daily runs (3 per day)
- This encourages new players to try the competition system early

### Daily Runs

Every player gets **3 daily competition runs per day**. These runs:

- Can be used on **any difficulty tier** (Normal, Nightmare, or Hell)
- Are tracked across all tiers (not per-tier)
- Reset at UTC 00:00 each day

### Daily Run Rules (v1.2 Simplified)

In the current implementation:

- **Everyone gets 3 daily competition runs per day**
- Runs can be used on **any difficulty tier** (Normal, Nightmare, Hell)
- You can use all 3 runs on the same tier, or spread them across different tiers
- **No tier unlock requirements** for daily competition runs
- Only your **best score per tier** counts for leaderboard placement
- You can potentially place on **multiple leaderboards** in a single day

**Examples:**
- Use all 3 runs on Hell to maximize your chance at the Hell leaderboard
- Use 1 run on each tier to compete on all 3 leaderboards
- Use 2 runs on Nightmare and 1 on Hell

### Future Enhancement: Staked Runs

> **Moved to Future Enhancements** — See [Future Enhancements](#future-enhancements)
>
> In a future update, players may be able to stake GHST to unlock additional daily runs beyond the base 3, creating deeper engagement for committed players.

---

## Time Multiplier

### Purpose

The time multiplier creates strategic depth and helps level the playing field:

- **Early players** get a score bonus but expose their score for others to target
- **Late players** know exactly what score to beat but have no multiplier
- **New players** can use the multiplier to compete with better-geared veterans

### Multiplier Schedule

| Hours Since Reset | Multiplier | Strategic Implication           |
| ----------------- | ---------- | ------------------------------- |
| 0-4 hours         | 1.50x      | Maximum bonus, maximum exposure |
| 4-8 hours         | 1.35x      | Strong bonus, still early       |
| 8-12 hours        | 1.20x      | Moderate bonus                  |
| 12-16 hours       | 1.10x      | Small bonus                     |
| 16-24 hours       | 1.00x      | No bonus, but full information  |

### Multiplier Rules

1. **All runs receive multiplier** — Every daily competition run receives the time multiplier
2. **Applied at completion** — Multiplier is calculated based on when you FINISH (beat boss + return to surface)
3. **Best score counts** — Your highest score goes on the leaderboard, regardless of which run achieved it

### v1.2 Implementation Note

All daily competition runs receive the time multiplier based on when they're completed. Players can strategically time their runs throughout the day.

---

## Leaderboard & Rewards

### Daily Reset

- **Reset Time:** UTC 00:00 (midnight)
- **No Rolling Window:** Clean daily competition, not 24-hour rolling
- **Leaderboard Cleared:** All positions reset; yesterday's winner has no advantage today

### Difficulty Tiers

Three separate leaderboards, one per difficulty tier:

| Tier          | Description             | Target Audience               |
| ------------- | ----------------------- | ----------------------------- |
| **Normal**    | Entry-level competition | New and casual players        |
| **Nightmare** | Intermediate challenge  | Progressing players           |
| **Hell**      | Maximum difficulty      | Veterans and hardcore players |

Each tier has its own independent leaderboard and prize pool.

### Scoring

- **Qualification:** Must beat the boss AND return to surface to qualify
- **Score Calculation:** Uses existing run score formula (kills, damage, survival, etc.)
- **Multiplier Applied:** Final score = Raw score × Time multiplier (first run only)
- **Best Score Only:** Only your highest score of the day appears on leaderboard
- **Tie Breaker:** Earlier submission wins ties
- **Cross-Midnight Runs:** Score counts for the day you FINISH (not start)
- **Game Mode:** Idle Mode only (solo runs, no parties)

---

## Reward Distribution

### Weekly Budget

| Currency | Weekly Allocation |
| -------- | ----------------- |
| USDC     | $100              |
| GHST     | 100 GHST          |

> **Note:** Budget reduced from $1,000 to $100 for initial testing phase.

### Daily Budget

| Currency | Daily Allocation |
| -------- | ---------------- |
| USDC     | ~$14.29          |
| GHST     | ~14.29 GHST      |

### Distribution Across Difficulty Tiers

Higher difficulties receive larger shares of the reward pool:

| Tier      | Pool Share | Daily USDC | Daily GHST |
| --------- | ---------- | ---------- | ---------- |
| Normal    | 20%        | $2.86      | 2.86 GHST  |
| Nightmare | 30%        | $4.29      | 4.29 GHST  |
| Hell      | 50%        | $7.14      | 7.14 GHST  |

### Top 10 Distribution (Per Tier)

Rewards are distributed among the top 10 finishers:

| Position | Share | Normal            | Nightmare         | Hell              |
| -------- | ----- | ----------------- | ----------------- | ----------------- |
| 1st      | 30%   | $0.86 + 0.86 GHST | $1.29 + 1.29 GHST | $2.14 + 2.14 GHST |
| 2nd      | 20%   | $0.57 + 0.57 GHST | $0.86 + 0.86 GHST | $1.43 + 1.43 GHST |
| 3rd      | 15%   | $0.43 + 0.43 GHST | $0.64 + 0.64 GHST | $1.07 + 1.07 GHST |
| 4th      | 10%   | $0.29 + 0.29 GHST | $0.43 + 0.43 GHST | $0.71 + 0.71 GHST |
| 5th      | 8%    | $0.23 + 0.23 GHST | $0.34 + 0.34 GHST | $0.57 + 0.57 GHST |
| 6th      | 6%    | $0.17 + 0.17 GHST | $0.26 + 0.26 GHST | $0.43 + 0.43 GHST |
| 7th      | 5%    | $0.14 + 0.14 GHST | $0.21 + 0.21 GHST | $0.36 + 0.36 GHST |
| 8th      | 3%    | $0.09 + 0.09 GHST | $0.13 + 0.13 GHST | $0.21 + 0.21 GHST |
| 9th      | 2%    | $0.06 + 0.06 GHST | $0.09 + 0.09 GHST | $0.14 + 0.14 GHST |
| 10th     | 1%    | $0.03 + 0.03 GHST | $0.04 + 0.04 GHST | $0.07 + 0.07 GHST |

> **Note:** Prize amounts shown are for the testing budget ($100/week). Production values will be 10× higher.

### Unclaimed Rewards

If fewer than 10 players complete a difficulty tier on a given day, or if zero players complete:

**Decision: Unclaimed rewards return to treasury.**

This applies to both partial boards (e.g., only 5 players) and empty boards (0 players). This approach:

- Keeps budget predictable
- Avoids "jackpot" gaming incentives
- Simplifies accounting

---

## Prize Distribution Mechanics

### Distribution Timeline

| Event        | Time      | Action                             |
| ------------ | --------- | ---------------------------------- |
| Daily Reset  | UTC 00:00 | Leaderboard frozen, new day begins |
| Calculation  | UTC 00:01 | System calculates top 10 per tier  |
| Distribution | UTC 00:05 | Prizes credited to winners         |
| Notification | UTC 00:05 | Winners notified (method TBD)      |

### Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRIZE DISTRIBUTION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DAILY RESET (UTC 00:00)                                     │
│     └── Leaderboard entries frozen for previous day             │
│                                                                 │
│  2. CALCULATION (UTC 00:01)                                     │
│     ├── Query top 10 scores per difficulty tier                 │
│     ├── Apply tie-breaking rules if needed                      │
│     └── Calculate prize amounts per position                    │
│                                                                 │
│  3. DISTRIBUTION (UTC 00:05)                                    │
│     ├── Credit USDC to winner's in-game balance                 │
│     ├── Credit GHST to winner's in-game balance                 │
│     └── Record distribution in audit log                        │
│                                                                 │
│  4. NOTIFICATION                                                │
│     └── Notify winners (method TBD - in-game/email/Discord)    │
│                                                                 │
│  5. WITHDRAWAL (Player-initiated)                               │
│     └── Winners can withdraw to wallet when ready               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Tie-Breaking

_Pending decision — see Open Questions Q18_

Options under consideration:

- Earlier submission wins
- Split prize pool
- Both receive full prize

### Prize Crediting

_Pending decision — see Open Questions Q17_

Likely approach: Credit to in-game balance, player withdraws when ready. This:

- Reduces gas costs (batch withdrawals)
- Keeps players engaged (balance visible in-game)
- Allows minimum withdrawal thresholds

### Edge Cases

| Scenario                        | Handling                                                    |
| ------------------------------- | ----------------------------------------------------------- |
| Player has no wallet connected  | Credit to in-game balance, prompt to connect for withdrawal |
| Player's account is banned      | Prize forfeited, redistributed to next position             |
| Distribution job fails          | Manual recovery, prizes credited within 24 hours            |
| Duplicate submissions (exploit) | Only best legitimate score counts                           |

---

## Player Journeys

### New Player

```
Day 1 (Onboarding):
├── Creates account
├── Plays unlimited normal runs (Idle Mode)
├── Learns mechanics, earns gear
├── Can immediately participate in daily competition!
├── Gets 3 daily runs to use on any tier
└── Uses time multiplier (plays at reset for 1.5x)

Week 1-2:
├── Getting stronger from gear/levels
├── Experimenting with different difficulties
├── Uses 3 runs on Normal for best chance at Normal leaderboard
├── Occasionally cracks top 10 at Normal
└── Earns small GHST rewards from placements

Month 1+:
├── Strong enough to compete on Nightmare
├── Spreads runs: 1 Normal + 2 Nightmare
├── More consistent placements
└── Sustainable competitive loop
```

### Experienced Player

```
Daily Loop:
├── Strong character from weeks of play
├── 3 daily runs available
├── Strategic choice: spread across tiers or focus on one
├── Example: 1 Normal + 1 Nightmare + 1 Hell = 3 leaderboard entries
├── Or: 3 attempts at Hell for best chance at 1st place
├── All runs receive time multiplier based on completion time
└── Community reputation from leaderboard presence

Weekly:
├── Consistent top 10 finishes across multiple tiers
├── May experiment with different tier strategies
└── Engages with daily community competition
```

---

## Future Enhancements

These features are not part of the initial design but may be added later:

### Milestone GHST Rewards

Allow F2P players to earn GHST through normal gameplay achievements:

| Milestone                    | GHST Reward |
| ---------------------------- | ----------- |
| First time reaching floor 10 | 5 GHST      |
| First time reaching floor 20 | 10 GHST     |
| First boss kill at Nightmare | 15 GHST     |
| Reach account Level 25       | 10 GHST     |
| Reach account Level 50       | 25 GHST     |

This provides a path for dedicated F2P players to eventually stake without purchasing GHST.

### Weekly/Monthly Bonuses

- Complete 5/7 daily quests: Bonus GHST
- Streak rewards for consecutive participation
- Monthly champion titles/cosmetics

### Participation Rewards

Small reward (0.1-0.25 GHST) for anyone who completes a daily quest, even if not in top 10. Creates a slow accumulation path for F2P players.

### Champion Handicap

If the same player wins multiple days in a row, apply a small score penalty to encourage variety in winners.

### Pay to Hide Entry

Allow players to spend GHST to temporarily hide their leaderboard entry from other players. This creates strategic depth:

- Hidden entries are revealed at daily reset
- Other players must decide whether to risk playing late without full information
- Creates a GHST sink and adds a mind-game element to competition
- Could be priced to discourage overuse (e.g., 5-10 GHST per hide)

---

## Technical Considerations

### Smart Contract (GHST Staking)

- **Network:** Polygon
- **Functions Required:**
  - `stake(amount)` — Lock GHST for attunements
  - `unstake(amount)` — Withdraw staked GHST (with cooldown)
  - `getStakedAmount(address)` — Query stake for attunement calculation
- **Cooldown:** Consider 24-hour unstaking period to prevent gaming
- **Events:** Emit stake/unstake events for backend synchronization

### Leaderboard Database

```sql
-- Daily leaderboard entries
CREATE TABLE daily_quest_leaderboard (
  id UUID PRIMARY KEY,
  date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  difficulty_tier TEXT NOT NULL, -- 'normal', 'nightmare', 'hell'
  account_id UUID NOT NULL,
  raw_score INTEGER NOT NULL,
  multiplier DECIMAL(3,2) NOT NULL,
  final_score INTEGER NOT NULL, -- raw_score * multiplier
  run_id UUID NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  run_number INTEGER NOT NULL,  -- 1st, 2nd, or 3rd run of day

  UNIQUE(date, difficulty_tier, account_id)
);

-- Track staking for attunements
CREATE TABLE player_ghst_stakes (
  account_id UUID PRIMARY KEY,
  staked_amount DECIMAL(18,8) NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ NOT NULL
);
```

### API Endpoints

```
GET  /api/daily-quest/leaderboard?date=YYYY-MM-DD&tier=nightmare
GET  /api/daily-quest/my-status  (attunements, runs used, best score)
POST /api/daily-quest/submit-run (called on run completion)
GET  /api/daily-quest/rewards?date=YYYY-MM-DD (payout summary)
```

### Reward Distribution Job

- Runs daily after reset (UTC 00:01)
- Calculates top 10 per tier
- Distributes USDC and GHST to winners
- Records in rewards table for audit trail

---

## Game Config Settings

All configurable values should be placed in `data/game-config.ts` under a `dailyQuestCompetition` key for easy adjustment without code changes.

### Proposed Config Structure

```typescript
// In data/game-config.ts
dailyQuestCompetition: {
  enabled: true,

  // Daily Runs (usable on any tier)
  dailyRunsPerDay: 3,

  // Unlock Requirements (no longer used - all tiers open)
  tierUnlockThresholds: {
    normal: 0,
    nightmare: 0,
    hell: 0,
  },

  // Time Multiplier Settings
  resetTimeUtcHour: 0,  // UTC 00:00
  timeMultipliers: [
    { hoursAfterReset: 0,  multiplier: 1.50 },
    { hoursAfterReset: 4,  multiplier: 1.35 },
    { hoursAfterReset: 8,  multiplier: 1.20 },
    { hoursAfterReset: 12, multiplier: 1.10 },
    { hoursAfterReset: 16, multiplier: 1.00 },
  ],

  // Budget Settings (weekly)
  weeklyBudget: {
    usdc: 100,
    ghst: 100,
  },

  // Tier Distribution (must sum to 1.0)
  tierDistribution: {
    normal: 0.20,
    nightmare: 0.30,
    hell: 0.50,
  },

  // Top 10 Share Distribution (must sum to 1.0)
  positionShares: [
    0.30,  // 1st place
    0.20,  // 2nd place
    0.15,  // 3rd place
    0.10,  // 4th place
    0.08,  // 5th place
    0.06,  // 6th place
    0.05,  // 7th place
    0.03,  // 8th place
    0.02,  // 9th place
    0.01,  // 10th place
  ],

  // Qualification Requirements
  requireBossKill: true,

  // Cross-midnight behavior
  scoreCountsForDayFinished: true,

  // Unclaimed rewards behavior
  unclaimedReturnsToTreasury: true,
}
```

### Config Benefits

| Benefit                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| **Easy Tuning**        | Adjust multipliers, thresholds, and budgets without code deploys |
| **A/B Testing**        | Can test different configurations easily                         |
| **Transparency**       | Single source of truth for all competition parameters            |
| **Client/Server Sync** | Shared config ensures consistency across stack                   |

### Values That Should NOT Be in Config

| Value                   | Reason                                    |
| ----------------------- | ----------------------------------------- |
| Smart contract address  | Security-sensitive, should be in env vars |
| Treasury wallet address | Security-sensitive, should be in env vars |
| Database table names    | Infrastructure, not game design           |

---

## Summary

The Daily Quest Competition system transforms daily quests from a solo threshold-beating exercise into a vibrant daily competition. Key features:

| Feature               | Benefit                                                |
| --------------------- | ------------------------------------------------------ |
| Leaderboard-based     | Creates community, drama, and clear goals              |
| Top 10 rewards        | Scarcity creates value; competition creates engagement |
| GHST staking          | Earned privilege, not entitlement                      |
| Time multiplier       | Strategic depth; helps new players compete             |
| Best score only       | Skill matters more than volume                         |
| Daily reset           | No permanent advantages; fresh competition daily       |
| Unlimited normal play | New players can grind without limits                   |

The system is designed to be fair, engaging, and economically sustainable while rewarding both dedication and skill.

---

## Appendix: Quick Reference

### Multiplier Schedule

```
UTC 00:00 - 04:00  →  1.50x
UTC 04:00 - 08:00  →  1.35x
UTC 08:00 - 12:00  →  1.20x
UTC 12:00 - 16:00  →  1.10x
UTC 16:00 - 24:00  →  1.00x
```

### Daily Runs

```
All players get 3 daily competition runs per day.
Runs can be used on any difficulty tier.

Example strategies:
  Option A: 3 runs at Hell (maximize Hell leaderboard chances)
  Option B: 1 Normal + 1 Nightmare + 1 Hell (compete on all boards)
  Option C: 2 Nightmare + 1 Normal (focus on Nightmare)
```

### Daily Prize Pool

```
Normal:     $28.57 + 28.57 GHST
Nightmare:  $42.86 + 42.86 GHST
Hell:       $71.43 + 71.43 GHST
```

### Top 10 Share

```
1st: 30%  |  2nd: 20%  |  3rd: 15%  |  4th: 10%  |  5th: 8%
6th: 6%   |  7th: 5%   |  8th: 3%   |  9th: 2%   |  10th: 1%
```

---

## Open Questions

_Please answer these questions directly below each item. Your answers will inform the final implementation._

---

### Q1: Unclaimed Rewards

If fewer than 10 players complete a difficulty tier on a given day, what happens to the unclaimed prize pool?

**Options:**

- A) Roll over to next day (same tier) — creates "jackpot" days
- B) Redistribute among participants — rewards active players
- C) Return to treasury — conservative, preserves budget

**Your Answer:**

Option C.

---

### Q2: Can Players Compete on Multiple Tiers?

Can a player use their attunements across different difficulty tiers in the same day?

**Example:** Player has 3 attunements. Can they do 1 run at Normal, 1 at Nightmare, 1 at Hell?

**Options:**

- A) Yes, attunements are fungible across tiers
- B) No, must pick one tier per day
- C) Attunements are per-tier (1 per tier, staking adds more per tier)

**Your Answer:**

## Option C.

### Q3: Staking Lock Period

How long should the unstaking cooldown be?

**Options:**

- A) Instant unstake (no lock)
- B) 24-hour cooldown
- C) 7-day cooldown
- D) Other: \_\_\_

**Your Answer:**

TBD.

---

### Q4: Mid-Day Stake Changes

If a player stakes GHST mid-day, when do they get their additional attunements?

**Options:**

- A) Immediately (can use today)
- B) Next daily reset (tomorrow)

**Your Answer:**

Immediately.

---

### Q5: Minimum Score to Qualify

Should there be a minimum score threshold to appear on the leaderboard? (Prevents someone from doing a 1-second run and claiming 10th place on an empty board)

**Options:**

- A) No minimum — anyone who completes qualifies
- B) Must beat the boss to qualify
- C) Must achieve minimum score of X to qualify
- D) Other: \_\_\_

**Your Answer:**

No minimum.

---

### Q6: Leaderboard Visibility

Should the leaderboard be visible live, or hidden until daily reset?

**Options:**

- A) Real-time visible — players can see current standings and strategize
- B) Hidden until reset — mystery/surprise element
- C) Partially visible (show top 3 only, or show without names)

**Your Answer:**

Real-time visible. But it's an interesting question. Maybe someone could pay GHST to hide their entry??

---

### Q7: Multiple Entries Display

If a player has 3 attunements but only their best score counts, what shows on the leaderboard?

**Options:**

- A) Only their best run appears (one entry per player)
- B) All their runs appear, but only best counts for prizes
- C) Show all runs, best one is highlighted

**Your Answer:**

Option A.

---

### Q8: Beyond Hell Tier

The current game has "Beyond Hell" as a 4th difficulty tier. Should it be included in the competition?

**Options:**

- A) Yes, add Beyond Hell as a 4th tier with its own prize pool
- B) No, keep it to 3 tiers (Normal, Nightmare, Hell)
- C) Beyond Hell is special/seasonal (not daily)

If yes, how should the prize pool be redistributed across 4 tiers?

**Your Answer:**

No.

---

### Q9: Difficulty Sub-Tiers

Currently the game has sub-tiers (Normal 1, Normal 2, Normal 3, etc.). How do these map to the 3 competition tiers?

**Options:**

- A) Combine all sub-tiers: Normal 1-3 → "Normal" board, Nightmare 1-3 → "Nightmare" board, etc.
- B) Only highest sub-tier counts: Normal 3, Nightmare 3, Hell 3 are the competition tiers
- C) Keep all sub-tiers as separate boards (9+ leaderboards)

Option A

**Your Answer:**

---

### Q10: Historical Leaderboards

How long should past leaderboards be viewable?

**Options:**

- A) Forever (archived)
- B) 30 days rolling
- C) 7 days rolling
- D) Only current day + yesterday

**Your Answer:**

A

---

### Q11: What Happens If No One Plays?

If zero players complete a difficulty tier on a given day, what happens to that day's prize pool?

**Options:**

- A) Rolls over to next day
- B) Returns to treasury
- C) Redistributes to other tiers that day

**Your Answer:**

A

---

### Q12: Prize Pool Ratio (USDC vs GHST)

Currently the design assumes equal USDC and GHST value (e.g., 1st place gets $21.43 + 21.43 GHST). Should these always be equal, or could the ratio vary?

**Options:**

- A) Always equal (1:1 ratio)
- B) Could vary by tier (higher tiers = more GHST-weighted?)
- C) Could vary over time (adjustable)

**Your Answer:**

A

---

### Q13: Idle Mode vs Active Mode

Does the daily quest competition apply to Idle Mode runs, Active Mode runs, or both?

**Your Answer:**

---

Only Idle mode.

### Q14: Party/Co-op Runs

If multiple players complete a run together, how is scoring handled?

**Options:**

- A) Each player gets their own score (individual submission)
- B) Party shares highest score
- C) Daily quest is solo-only (no parties allowed)
- D) Other: \_\_\_

**Your Answer:**

C

---

### Q15: Existing Daily Quest System

What happens to the existing threshold-based daily quest system?

**Options:**

- A) Fully replaced by leaderboard system
- B) Runs in parallel during transition period
- C) Deprecated but code kept for reference

**Your Answer:**

---

A. Remove all of the deprecated code.

### Q16: Prize Distribution Timing

When are daily quest prizes distributed to winners?

**Options:**

- A) Immediately at daily reset (UTC 00:00) — automated job runs right after reset
- B) Shortly after reset (UTC 00:01-00:05) — small delay for calculation
- C) Manual distribution by admin — more control, less automation
- D) Delayed (e.g., 1 hour after reset) — gives time for late submissions to finalize

**Your Answer:**

I think option A is the cleanest automated jobs. When the reset happens, it can also send out the funds.

---

### Q17: Prize Payment Mechanism

How are USDC and GHST prizes delivered to winners?

**Options:**

- A) Credited to in-game balance — players can withdraw later
- B) Sent directly to player's connected wallet — immediate on-chain transfer
- C) Claimable from a "rewards" page — player initiates withdrawal
- D) Hybrid: credited to in-game, auto-withdraws above threshold

**Your Answer:**

Credited to endgame balance, option A.

---

### Q18: Tie-Breaking Rules

What happens if two or more players have the exact same final score?

**Options:**

- A) Earlier submission wins — incentivizes playing early
- B) Split the prize pool for that position — both get half
- C) Both get full prize for that position — costs more
- D) Random selection — true coin flip
- E) Other: \_\_\_

**Your Answer:**

Probably option A is maybe fairest

---

### Q19: Prize Claiming Process

Do winners need to take any action to receive their prizes?

**Options:**

- A) Automatic — prizes credited without player action
- B) Manual claim — player must click "claim" on rewards page
- C) Automatic with notification — credited + notified
- D) Expires if not claimed — must claim within X days

**Your Answer:**

Yes, the player must click claim on the rewards page using the existing system that we've already created. The only thing new that we've added is the daily leaderboard reset funding distribution.

---

### Q20: Winner Notification

How are winners notified that they placed in the top 10?

**Options:**

- A) In-game notification/popup on next login
- B) Email notification
- C) Discord bot announcement
- D) Leaderboard page shows results (no push notification)
- E) All of the above
- F) Combination: \_\_\_

**Your Answer:**

The leaderboard should show the results and I'll probably make a discord bot.

---

### Q21: Prize Pool Source

Where does the daily USDC/GHST prize pool come from?

**Options:**

- A) Pre-funded treasury wallet — manual top-ups as needed
- B) Smart contract escrow — funded weekly/monthly
- C) Revenue share from game fees — dynamic pool size
- D) Other: \_\_\_

**Your Answer:**

Pre-funded treasury wallet with manual top-ups.

---

### Q22: Minimum Prize Threshold

Should there be a minimum prize value? (Avoids dust amounts like $0.29)

**Options:**

- A) No minimum — pay exact calculated amount
- B) Round down to nearest $0.10 — excess stays in pool
- C) Round up to nearest $0.50 — ensures meaningful rewards
- D) Set minimum: $0.50 — if calculated is lower, skip or bump up
- E) Other: \_\_\_

**Your Answer:**

No minimum price value.

---

### Q23: Lick Tongue Unlock Amount

The document specifies 42 Lick Tongues to unlock daily quest access. Is this the correct amount?

**Context:**

- Too low = bots/alts can quickly farm access
- Too high = frustrating barrier for legitimate new players
- Current: 42 Lick Tongues

**Options:**

- A) 42 is correct
- B) Should be higher: \_\_\_ Lick Tongues
- C) Should be lower: \_\_\_ Lick Tongues

**Your Answer:**

A

---

## Notes & Additional Thoughts

_Add any other thoughts, concerns, or ideas here:_

---

## Addendum: Inconsistencies & Clarifications Needed

_These items were identified during review and need resolution before implementation._

---

### ⚠️ Inconsistency 1: Q1 vs Q11 - Unclaimed Reward Logic

| Question | Scenario                       | Your Answer            |
| -------- | ------------------------------ | ---------------------- |
| Q1       | Fewer than 10 players complete | Return to treasury     |
| Q11      | Zero players complete          | Rolls over to next day |

**Issue:** These are inconsistent. Should unclaimed rewards follow the same rule?

**Options:**

- A) Always rollover (creates jackpot days)
- B) Always return to treasury (simpler, consistent)
- C) Keep as-is (different rules for partial vs empty)

**Your Answer:**

Always return to treasury.

---

### 🚨 Clarification 2: Q2 - Per-Tier Attunements Structure

You answered that attunements are **per-tier**. Please clarify exactly how this works:

**Option A: Multiplicative (staking affects all tiers equally)**

| Stake Level | Normal | Nightmare | Hell | Total Runs/Day |
| ----------- | ------ | --------- | ---- | -------------- |
| 0 GHST      | 1      | 1         | 1    | 3              |
| 100 GHST    | 2      | 2         | 2    | 6              |
| 500 GHST    | 3      | 3         | 3    | 9              |

**Option B: Additive (staking adds to a pool you distribute)**

| Stake Level | Base Per Tier | Bonus Pool | Example Distribution |
| ----------- | ------------- | ---------- | -------------------- |
| 0 GHST      | 1             | 0          | 1+1+1 = 3 total      |
| 100 GHST    | 1             | +1         | 2+1+1 or 1+2+1, etc. |
| 500 GHST    | 1             | +2         | 2+2+1 or 3+1+1, etc. |

**Option C: Other (please describe)**

**Your Answer:**

Attunements are global, but they can be used in any tier. So if you used one attunement in normal, one in nightmare, and one in hell, then you've used all three of your attunements.

---

### ⚠️ Inconsistency 3: Network - Base vs Polygon

The document mentions two different networks:

- Line 177: "Smart contract on **Base**"
- Line 507: "Network: **Polygon**"

**Which blockchain should the GHST staking contract be deployed on?**

**Your Answer:**

---

Base Network.

### ⚠️ Clarification 4: Q5 - Empty Board Exploit Risk

With **no minimum score** + **rollover for empty boards**, an exploit is possible:

1. Player does a 1-second run, dies immediately, scores 100 points
2. Only person on the Hell board that day
3. Wins 1st place: $21.43 + 21.43 GHST

**Should there be a minimum qualification requirement?**

**Options:**

- A) Keep no minimum (accept this edge case)
- B) Must beat the boss to qualify
- C) Minimum score required (suggest amount: \_\_\_)
- D) Must complete at least X floors to qualify

**Your Answer:**

## Of course you must beat the boss to qualify. To qualify for a daily quest run, you have to beat the boss and return back to the surface. That has not changed.

### ❓ Edge Case 5: Cross-Midnight Runs

What if a player **starts** a run at 23:59 UTC and **finishes** at 00:05 UTC?

**Options:**

- A) Score counts for the day they started (23:59 = yesterday's board)
- B) Score counts for the day they finished (00:05 = today's board)
- C) Run is invalid for daily quest (must complete before reset)

**Your Answer:**

---

I think it has to be B, score count for the day that they finished. Because otherwise the leaderboard will have reset and rewards have already been distributed.

### ❓ Edge Case 6: Tier Unlock Requirements

Currently players need Lick Tongues to unlock difficulty tiers (Normal 2 = 10 LT, Normal 3 = 25 LT, Nightmare = 50 LT, etc.).

**Does daily quest access follow these same requirements?**

**Options:**

- A) 42 Lick Tongues unlocks daily quest for ALL tiers simultaneously
- B) 42 LT unlocks Normal only; Nightmare/Hell require their own LT thresholds
- C) Daily quest access follows existing tier unlock requirements exactly

**Your Answer:**

---

Yes, let's make a change there. The first daily quest is for normal. That is not unlocked until you unspend 42 lick tongues, but normal difficulty is always unlocked by default. Then when you spend the next amount of lictung to unlock Nightmare, that also unlocks the daily quest. Same for hell.

### ❓ Edge Case 7: Staking "Immediately" Scope

You said staking takes effect "immediately" (Q4). Please clarify:

**Options:**

- A) Mid-day stake → Can use new attunements for remaining runs that same day
- B) Stake checked at run start → New stake applies to next run you start
- C) Other: \_\_\_

**Your Answer:**

Staking will automatically increase the number of attunements that you have for that day. So it applies immediately.

---

### ❓ Edge Case 8: Time Multiplier UI Display

When a player is about to start their daily quest, what should they see?

**Options:**

- A) Current multiplier value only (e.g., "1.35x bonus active!")
- B) Countdown to next multiplier tier change
- C) Both multiplier and countdown
- D) No display (players check documentation/leaderboard page)

**Your Answer:**

countdown to next multiplier and the current multiplier. Also, within the game itself, we should show the current multiplier and the countdown.

---

### ❓ Edge Case 9: "Pay to Hide" Feature

You mentioned: "Maybe someone could pay GHST to hide their entry?"

**Should this be added as a Future Enhancement?**

**Options:**

- A) Yes, add to Future Enhancements section
- B) No, keep leaderboard fully transparent
- C) Interesting idea, but deprioritize for now

**Your Answer:**

Yes, add to the future enhancements section.

---

### ❓ Edge Case 10: Paying Player Journey Accuracy

The "Paying Player" journey currently says "3 daily quest attempts from day 1" but:

1. They still need 42 Lick Tongues first
2. Per-tier attunements change the structure

**Should I update the Player Journeys section after you clarify the attunement structure?**

**Your Answer:**

Yes, update it.

---

### ❓ Edge Case 11: Specific LT Thresholds for Each Tier's Daily Quest

You said daily quest access follows tier unlock requirements. Please confirm the specific thresholds:

| Tier      | Daily Quest Unlocks At | Notes                                                  |
| --------- | ---------------------- | ------------------------------------------------------ |
| Normal    | 42 Lick Tongues        | Separate from tier unlock (Normal is always available) |
| Nightmare | 100 Lick Tongues       | Unlocks Nightmare daily quest access                   |
| Hell      | 500 Lick Tongues       | Unlocks Hell daily quest access                        |

**Your Answer:** Normal = 42 LT, Nightmare = 100 LT, Hell = 500 LT

---

## Resolution Status

| Item                          | Status      | Notes                                      |
| ----------------------------- | ----------- | ------------------------------------------ |
| Q1 vs Q11 inconsistency       | ✅ Resolved | Always return to treasury                  |
| Per-tier attunement structure | ✅ Resolved | 3 global runs per day, any tier (v1.2)     |
| Network (Base vs Polygon)     | ✅ Resolved | Base Network                               |
| Empty board exploit           | ✅ Resolved | Must beat boss to qualify                  |
| Cross-midnight runs           | ✅ Resolved | Counts for day finished                    |
| Tier unlock requirements      | ✅ Resolved | Removed - all tiers open (v1.2)            |
| Staking "immediately" scope   | ✅ Resolved | Applies immediately                        |
| Time multiplier UI            | ✅ Resolved | Show multiplier + countdown                |
| Pay-to-hide feature           | ✅ Resolved | Added to Future Enhancements               |
| Update player journeys        | ✅ Resolved | Simplified for v1.2 (no unlock gates)      |
| Game config settings          | ✅ Resolved | Section added with all configurable values |

**All items resolved! Document is ready for implementation.**

---

## Automated Prize Distribution (Cron Job Setup)

The daily prize distribution runs automatically via a Supabase Edge Function scheduled at **UTC 00:05**.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED DISTRIBUTION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SUPABASE EDGE FUNCTION (00:05 UTC daily)                    │
│     └── supabase/functions/daily-prize-distribution/            │
│                                                                  │
│  2. CALLS GAME SERVER                                           │
│     └── POST /api/internal/distribute-daily-prizes              │
│     └── Authenticated via CRON_SECRET header                    │
│                                                                  │
│  3. SERVER EXECUTES JOB                                         │
│     └── apps/server/src/jobs/distribute-daily-quest-prizes.ts   │
│     └── Logs execution to cron_job_executions table             │
│                                                                  │
│  4. SENDS DISCORD NOTIFICATION                                  │
│     └── Success/failure message with summary                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Required Environment Variables

#### Game Server (.env)

```bash
# Generate with: openssl rand -hex 32
CRON_SECRET=your-secure-random-secret
```

#### Supabase Edge Function Secrets

Configure in **Supabase Dashboard → Settings → Edge Functions → Secrets**:

| Secret Name           | Description                                      |
| --------------------- | ------------------------------------------------ |
| `CRON_SECRET`         | Same value as server's CRON_SECRET               |
| `GAME_SERVER_URL`     | Server URL (e.g., `https://play.gotchiverse.io`) |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications                |

### Deploying the Edge Function

```bash
# From project root
supabase functions deploy daily-prize-distribution --project-ref YOUR_PROJECT_REF
```

### Configuring the Schedule

1. Go to **Supabase Dashboard → Edge Functions**
2. Select `daily-prize-distribution`
3. Click **Schedule**
4. Set cron expression: `5 0 * * *` (00:05 UTC daily)

### Admin Dashboard

View execution history at: `/admin/cron`

Features:

- Execution history with status, prizes distributed, amounts
- Stats overview (total runs, success/failure counts)
- Manual trigger button for testing or catch-up
- Detailed error logs for failed runs
- Dry-run mode for simulation

### Manual Trigger

Via Admin Dashboard:

1. Go to `/admin/cron`
2. Click "Trigger Distribution"
3. Optionally specify a date (defaults to yesterday)
4. Enable "Dry run" to simulate without distributing

Via API:

```bash
# With admin session cookie
curl -X POST https://play.gotchiverse.io/api/admin/cron/trigger-distribution \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-01-04", "dryRun": false}'
```

### Monitoring

All executions are logged to the `cron_job_executions` table with:

- Start/finish timestamps and duration
- Prizes distributed/skipped/failed counts
- Total USDC and GHST distributed
- Error messages if any
- Full result JSON for debugging

Query recent executions:

```sql
SELECT * FROM cron_job_executions
WHERE job_name = 'daily_prize_distribution'
ORDER BY started_at DESC
LIMIT 10;
```

### Troubleshooting

| Issue                      | Solution                                   |
| -------------------------- | ------------------------------------------ |
| Job not running            | Check cron schedule is enabled in Supabase |
| 401 Unauthorized           | Verify CRON_SECRET matches in both places  |
| 500 Server Error           | Check server logs, verify DB connection    |
| No Discord notification    | Verify DISCORD_WEBHOOK_URL is correct      |
| Prizes already distributed | Job is idempotent; check date parameter    |
