# Token Volatility Score Modifier

## Design Document

**Version:** 1.0  
**Status:** DRAFT - PENDING ANSWERS TO OPEN QUESTIONS  
**Created:** January 3, 2026  
**Related:** [Daily Quest Competition System](./dailyquestcompetition.md)

---

## Executive Summary

This document outlines an **optional** score modifier for daily quest runs that ties the player's final score to real-world cryptocurrency price movements. Players can choose to "predict" whether a token will go up or down during their run, with correct predictions boosting their score and incorrect predictions reducing it.

This feature is designed to:

- Add variance that helps new players compete with veterans
- Create viral, crypto-native gameplay moments
- Reward a different type of skill (market intuition) alongside gameplay skill
- Maintain fairness through optional participation and capped multipliers

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [How It Works](#how-it-works)
3. [Supported Tokens](#supported-tokens)
4. [Multiplier Calculation](#multiplier-calculation)
5. [Concerns & Mitigations](#concerns--mitigations)
6. [UI/UX Considerations](#uiux-considerations)
7. [Technical Requirements](#technical-requirements)
8. [Open Questions](#open-questions)

---

## Core Concept

### The Problem This Solves

In the Daily Quest Competition system, veterans with optimized gear and deep game knowledge have a significant advantage. While the time multiplier helps new players, there's still a "glass ceiling" effect where the same skilled players tend to dominate.

### The Solution

Allow players to optionally tie their score to real-world token price movements:

- **Correct prediction** → Score multiplier above 1.0x
- **Incorrect prediction** → Score multiplier below 1.0x
- **No prediction** → Score unaffected (1.0x)

This creates genuine variance without requiring any additional cost from players. A new player with good market intuition (or luck) can compete with a veteran who chose poorly.

### Key Design Principles

| Principle              | Implementation                                   |
| ---------------------- | ------------------------------------------------ |
| **Optional**           | Players can skip volatility entirely             |
| **No additional cost** | Prediction doesn't cost USDC or GHST             |
| **Capped variance**    | Multiplier bounded between 0.5x and 2.0x         |
| **Skill expression**   | Market knowledge becomes a competitive advantage |
| **Fair competition**   | Same rules apply to all players                  |

---

## How It Works

### Player Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLAYER FLOW                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. BEFORE RUN STARTS                                           │
│     ├── Player clicks "Start Daily Quest"                       │
│     ├── Volatility selection screen appears (optional)          │
│     ├── Player chooses: Token + Direction + Sensitivity         │
│     └── OR clicks "Skip" to proceed without volatility          │
│                                                                 │
│  2. RUN BEGINS                                                  │
│     ├── Token price recorded at run start (via oracle/API)      │
│     ├── Player completes dungeon normally                       │
│     └── Gameplay is identical—volatility doesn't affect dungeon │
│                                                                 │
│  3. RUN ENDS (Boss defeated + return to surface)                │
│     ├── Token price recorded at run end                         │
│     ├── Price change calculated                                 │
│     ├── Volatility multiplier computed                          │
│     └── Final Score = Raw Score × Time Mult × Volatility Mult   │
│                                                                 │
│  4. LEADERBOARD                                                 │
│     ├── Final score submitted to daily leaderboard              │
│     └── Volatility choice displayed alongside entry (optional)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Score Calculation

```
Final Score = Raw Score × Time Multiplier × Volatility Multiplier

Example:
├── Raw Score: 10,000 points
├── Time Multiplier: 1.35x (played 4-8 hours after reset)
├── Volatility Multiplier: 1.25x (correct prediction, medium sensitivity)
└── Final Score: 10,000 × 1.35 × 1.25 = 16,875 points
```

---

## Supported Tokens

### Recommended Token Set

| Token         | Typical Volatility | Strategic Profile                         |
| ------------- | ------------------ | ----------------------------------------- |
| **GHST**      | Medium-High        | Community token, players may have insight |
| **ETH**       | Medium             | High liquidity, follows macro trends      |
| **BTC**       | Low-Medium         | Most stable, "safe" choice                |
| **MATIC/POL** | Medium             | Polygon ecosystem alignment               |

### Why Multiple Tokens?

1. **Strategic depth** — Different tokens suit different risk appetites
2. **Strengthens "game" framing** — Less like "trading GHST," more like "market prediction game"
3. **Broader appeal** — Players who follow BTC/ETH can leverage that knowledge
4. **Manipulation resistance** — BTC/ETH are harder to manipulate than GHST

### Optional: "None" Selection

Players who select no token prediction receive a flat 1.0x volatility multiplier. This is the default for players who:

- Don't want variance
- Don't follow crypto markets
- Prefer pure skill-based competition

---

## Multiplier Calculation

### Sensitivity Levels

| Level      | Sensitivity Factor | Max Upside | Max Downside | Use Case                  |
| ---------- | ------------------ | ---------- | ------------ | ------------------------- |
| **Low**    | 1x                 | +10%       | -10%         | Conservative, small boost |
| **Medium** | 5x                 | +25%       | -25%         | Balanced risk/reward      |
| **High**   | 10x                | +50%       | -50%         | Maximum variance          |

### Formula

```typescript
function calculateVolatilityMultiplier(
  direction: 'UP' | 'DOWN',
  sensitivity: 1 | 5 | 10,
  priceAtStart: number,
  priceAtEnd: number
): number {
  // Calculate percentage price change
  const priceChange = (priceAtEnd - priceAtStart) / priceAtStart;

  // Apply direction (UP = 1, DOWN = -1)
  const directionMultiplier = direction === 'UP' ? 1 : -1;

  // Calculate raw multiplier
  const rawMultiplier = 1 + priceChange * directionMultiplier * sensitivity;

  // Clamp between 0.5x and 2.0x
  return Math.max(0.5, Math.min(2.0, rawMultiplier));
}
```

### Example Scenarios

| Prediction | Sensitivity | Price Move | Calculation                 | Result             |
| ---------- | ----------- | ---------- | --------------------------- | ------------------ |
| UP         | High (10x)  | +3%        | 1 + (0.03 × 1 × 10) = 1.30  | **1.30x**          |
| UP         | High (10x)  | +8%        | 1 + (0.08 × 1 × 10) = 1.80  | **1.80x**          |
| UP         | High (10x)  | -5%        | 1 + (-0.05 × 1 × 10) = 0.50 | **0.50x** (capped) |
| DOWN       | Medium (5x) | -2%        | 1 + (-0.02 × -1 × 5) = 1.10 | **1.10x**          |
| DOWN       | Low (1x)    | +1%        | 1 + (0.01 × -1 × 1) = 0.99  | **0.99x**          |

### Multiplier Caps

The 0.5x floor and 2.0x ceiling are critical design decisions:

| Cap              | Rationale                                                     |
| ---------------- | ------------------------------------------------------------- |
| **0.5x minimum** | Prevents complete score destruction; a good run still matters |
| **2.0x maximum** | Prevents runaway scores; skill remains the primary factor     |

---

## Concerns & Mitigations

### Concern 1: Is This Gambling/Derivatives Trading?

**Analysis:**

| Factor                              | Assessment                                    |
| ----------------------------------- | --------------------------------------------- |
| Does player pay to make prediction? | ❌ No — prediction is free                    |
| Does player bet money on outcome?   | ❌ No — only score is affected                |
| Is there a counterparty?            | ❌ No — pure game math                        |
| Can player lose money?              | ❌ No — only affects leaderboard position     |
| Is prize pool affected by choices?  | ❌ No — fixed pool, just affects distribution |

**Conclusion:** This is a **score modifier using real-world data**, not a financial product. Similar to:

- Fantasy sports using real player stats
- Games with stock market mini-games referencing real prices
- Prediction markets with no entry cost

**Mitigation:**

- Use game-friendly language ("prediction" not "position," "sensitivity" not "leverage")
- Clear UI messaging that this affects score only
- Optional participation with "Skip" as prominent option

---

### Concern 2: Price Manipulation

**Risk:** A whale could pump/dump a token during their run to guarantee favorable price movement.

**Mitigations:**

| Mitigation                | Implementation                                                     |
| ------------------------- | ------------------------------------------------------------------ |
| **TWAP pricing**          | Use time-weighted average price over run duration, not spot prices |
| **High-liquidity tokens** | BTC/ETH are very difficult to manipulate                           |
| **Minimum run duration**  | Require 10+ minute runs to qualify for volatility bonus            |
| **Cap multipliers**       | Even successful manipulation only yields 2.0x max                  |

---

### Concern 3: Skill/Luck Balance Shift

**Risk:** Market luck could overshadow gameplay skill.

**Mitigations:**

| Mitigation                        | Effect                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| **Optional participation**        | Skill purists can ignore volatility entirely                 |
| **Capped multiplier (0.5x-2.0x)** | Raw score still matters significantly                        |
| **Sensitivity choice**            | Risk-averse players can choose Low (1x) for minimal variance |
| **Multiple tokens**               | More tokens = more strategic choices, less pure luck         |

**Example:** A player with 20,000 raw score and 0.5x volatility (10,000 final) still beats a player with 8,000 raw score and 2.0x volatility (16,000 final)... wait, no they don't. Let me recalculate.

Actually: 20,000 × 0.5 = 10,000 vs 8,000 × 2.0 = 16,000. The lucky player wins.

But: 20,000 × 0.5 = 10,000 vs 6,000 × 2.0 = 12,000. The lucky player still wins.

This shows that volatility CAN overcome significant skill gaps. This is intentional—it's the feature's purpose. But the caps prevent it from being completely deterministic.

---

### Concern 4: Optimal Strategy Becomes "Always Pick Volatility"

**Risk:** If volatility is +EV (expected value positive), everyone will use it, and "optional" becomes "mandatory."

**Analysis:** Volatility is zero-sum in expectation:

- Correct predictions boost score
- Incorrect predictions reduce score
- Over many runs, it averages out

But for a single daily run, variance is real. High-skill players might prefer consistency (no volatility), while underdogs might prefer variance (max volatility).

**Mitigation:** This is actually good game design—it creates strategic choice based on your position in the competition.

---

### Concern 5: Run Duration Gaming

**Risk:** Players might optimize for fastest possible run to "lock in" favorable price movement.

**Mitigations:**

| Mitigation               | Implementation                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| **Minimum run duration** | Volatility only applies to runs lasting 10+ minutes                         |
| **Fixed time window**    | Calculate price change over fixed 15-minute window regardless of run length |
| **Score still matters**  | A fast 5,000 score × 2.0x = 10,000 loses to slow 15,000 score × 1.0x        |

---

### Concern 6: Psychological Harm

**Risk:** Leveraged trading mechanics can create gambling addiction patterns.

**Mitigations:**

| Mitigation                 | Implementation                                            |
| -------------------------- | --------------------------------------------------------- |
| **Avoid trading language** | "Prediction" not "position," "sensitivity" not "leverage" |
| **Clear caps in UI**       | Show "Max boost: +50%, Max reduction: -50%"               |
| **"Skip" is prominent**    | Make opting out easy and non-judgmental                   |
| **No compounding**         | Can't "double down" on a bad day                          |
| **Daily limit**            | Only 1-3 daily quest runs anyway (per tier)               |

---

## UI/UX Considerations

### Selection Screen

```
┌─────────────────────────────────────────────────────────────────┐
│              DAILY QUEST - VOLATILITY PREDICTION                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🎲 OPTIONAL: Predict market movement for a score modifier      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SELECT TOKEN                                            │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐            │   │
│  │  │  GHST  │ │  ETH   │ │  BTC   │ │ MATIC  │            │   │
│  │  │ ±2.1%  │ │ ±1.3%  │ │ ±0.8%  │ │ ±1.7%  │            │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘            │   │
│  │      ▲ 24h volatility indicators                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PREDICT DIRECTION                                       │   │
│  │  ┌──────────────────┐  ┌──────────────────┐             │   │
│  │  │     📈 UP        │  │     📉 DOWN      │             │   │
│  │  │  Price will rise │  │  Price will fall │             │   │
│  │  └──────────────────┘  └──────────────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SENSITIVITY                                             │   │
│  │  ○ Low    — Score varies up to ±10%                     │   │
│  │  ● Medium — Score varies up to ±25%                     │   │
│  │  ○ High   — Score varies up to ±50%                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚠️ Your score can increase OR decrease based on price          │
│     movement during your run. This is optional.                 │
│                                                                 │
│  ┌────────────────────────┐  ┌────────────────────────────┐   │
│  │   SKIP (No Modifier)   │  │   CONFIRM & START RUN      │   │
│  └────────────────────────┘  └────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### In-Run Display

Show current price movement during the run (optional, could create anxiety):

```
┌──────────────────────────┐
│ VOLATILITY: ETH 📈 UP    │
│ Current: +0.8% → 1.08x   │
│ (Medium sensitivity)     │
└──────────────────────────┘
```

### Post-Run Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      RUN COMPLETE!                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Raw Score:           15,000                                    │
│  Time Multiplier:     × 1.35                                    │
│  Volatility:          × 1.18  (ETH +3.6%, Medium sensitivity)  │
│  ─────────────────────────────                                  │
│  FINAL SCORE:         23,895                                    │
│                                                                 │
│  Current Rank: #4 (Hell Tier)                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Leaderboard Display

Option to show volatility choices on leaderboard for transparency:

```
┌─────────────────────────────────────────────────────────────────┐
│  HELL TIER LEADERBOARD - January 3, 2026                        │
├─────┬────────────────┬─────────┬──────────────────┬────────────┤
│ Pos │ Player         │ Score   │ Volatility       │ Time       │
├─────┼────────────────┼─────────┼──────────────────┼────────────┤
│ 1   │ xXGotchiKingXx │ 28,450  │ BTC 📈 1.12x     │ 00:45 UTC  │
│ 2   │ DeFiDegen      │ 26,200  │ ETH 📈 1.31x     │ 02:12 UTC  │
│ 3   │ PixelFren      │ 24,800  │ None             │ 01:30 UTC  │
│ 4   │ AavegotchiPro  │ 23,895  │ ETH 📈 1.18x     │ 03:45 UTC  │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Requirements

### Price Oracle

Need reliable price data for:

- Run start timestamp
- Run end timestamp
- Optionally: live price during run

**Options:**

| Source                   | Pros                      | Cons                        |
| ------------------------ | ------------------------- | --------------------------- |
| **Chainlink**            | Decentralized, trusted    | On-chain cost, slight delay |
| **CoinGecko API**        | Free, easy                | Centralized, rate limits    |
| **Binance/Exchange API** | Real-time, accurate       | Centralized, API key needed |
| **The Graph subgraph**   | Decentralized, historical | Setup complexity            |

**Recommendation:** CoinGecko or similar API for v1, consider Chainlink for production.

### TWAP Calculation

To resist manipulation, use Time-Weighted Average Price:

```typescript
interface PricePoint {
  timestamp: number;
  price: number;
}

function calculateTWAP(prices: PricePoint[]): number {
  if (prices.length < 2) return prices[0]?.price ?? 0;

  let weightedSum = 0;
  let totalTime = 0;

  for (let i = 1; i < prices.length; i++) {
    const timeDelta = prices[i].timestamp - prices[i - 1].timestamp;
    const avgPrice = (prices[i].price + prices[i - 1].price) / 2;
    weightedSum += avgPrice * timeDelta;
    totalTime += timeDelta;
  }

  return weightedSum / totalTime;
}
```

### Database Schema Addition

```sql
-- Add volatility tracking to daily quest runs
ALTER TABLE daily_quest_leaderboard ADD COLUMN volatility_token TEXT;
ALTER TABLE daily_quest_leaderboard ADD COLUMN volatility_direction TEXT;
ALTER TABLE daily_quest_leaderboard ADD COLUMN volatility_sensitivity INTEGER;
ALTER TABLE daily_quest_leaderboard ADD COLUMN price_at_start DECIMAL(18,8);
ALTER TABLE daily_quest_leaderboard ADD COLUMN price_at_end DECIMAL(18,8);
ALTER TABLE daily_quest_leaderboard ADD COLUMN volatility_multiplier DECIMAL(4,2);
```

---

## Open Questions

_Please answer these questions before implementation._

---

### Q1: Feature Scope for v1

Should volatility be included in v1 of the Daily Quest Competition, or launched as a v1.1 feature after the base system is stable?

**Options:**

- A) Include in v1 launch
- B) Launch as v1.1 after base system is proven
- C) Launch as optional "beta" feature in v1

**Your Answer:**

---

Include in V1 launch.

### Q2: Multiplier Caps

Are the proposed caps (0.5x minimum, 2.0x maximum) correct?

**Options:**

- A) 0.5x to 2.0x is correct
- B) Tighter range: 0.75x to 1.5x
- C) Wider range: 0.25x to 3.0x
- D) Other: \_\_\_

**Your Answer:**

Yes.

---

### Q3: Sensitivity Levels

Are the proposed sensitivity levels (1x/5x/10x) correct?

**Options:**

- A) 1x / 5x / 10x is correct
- B) Different values: \_\_\_
- C) Only two levels (Low/High)
- D) Continuous slider

**Your Answer:**

---

### Q4: Token Selection

Which tokens should be supported?

**Options:**

- A) GHST only
- B) GHST + ETH + BTC
- C) GHST + ETH + BTC + MATIC
- D) Wider set including meme coins
- E) Other: \_\_\_

**Your Answer:**

---

### Q5: Minimum Run Duration

Should there be a minimum run duration to qualify for volatility bonus?

**Options:**

- A) No minimum
- B) 5 minutes minimum
- C) 10 minutes minimum
- D) 15 minutes minimum

**Your Answer:**

---

### Q6: Price Calculation Method

How should start/end prices be calculated?

**Options:**

- A) Spot price at exact start/end moment
- B) TWAP over first/last 1 minute of run
- C) TWAP over entire run duration
- D) Fixed 15-minute window regardless of run length

**Your Answer:**

---

### Q7: In-Run Price Display

Should players see live price movement during their run?

**Options:**

- A) Yes, show current multiplier
- B) Show price but not multiplier
- C) No, reveal only at run end
- D) Player choice (toggle in settings)

**Your Answer:**

---

### Q8: Leaderboard Visibility

Should volatility choices be visible on the public leaderboard?

**Options:**

- A) Yes, show token + direction + multiplier
- B) Show multiplier only (not prediction details)
- C) Hidden (only visible to the player)
- D) Player choice

**Your Answer:**

---

### Q9: Price Oracle Source

Which price oracle should we use?

**Options:**

- A) CoinGecko API
- B) Chainlink on-chain oracle
- C) Binance/exchange API
- D) Multiple sources with median
- E) Other: \_\_\_

**Your Answer:**

---

### Q10: Cross-Tier Consistency

If a player does multiple runs (Normal + Nightmare + Hell), can they choose different volatility settings for each?

**Options:**

- A) Yes, independent choices per tier
- B) No, one volatility choice applies to all runs that day
- C) Other: \_\_\_

**Your Answer:**

---

### Q11: "None" Option Naming

What should we call the option to skip volatility?

**Options:**

- A) "Skip" / "No Prediction"
- B) "Safe Mode" / "No Volatility"
- C) "Standard" (implying volatility is the special mode)
- D) Other: \_\_\_

**Your Answer:**

---

### Q12: UI Placement

Where in the flow should volatility selection appear?

**Options:**

- A) Before run start (dedicated screen)
- B) On the run start screen (integrated)
- C) During first 30 seconds of run (can change mind early)
- D) Other: \_\_\_

**Your Answer:**

---

### Q13: Volatility + Time Multiplier Interaction

How should volatility and time multiplier stack?

**Options:**

- A) Multiplicative: Final = Raw × Time × Volatility
- B) Additive: Final = Raw × (Time + Volatility - 1)
- C) Only apply to base score: Final = (Raw × Volatility) × Time
- D) Other: \_\_\_

**Your Answer:**

---

### Q14: Future: Paid Volatility Features

Should we consider paid volatility features in the future (e.g., pay GHST to see competitors' volatility choices before your run)?

**Options:**

- A) Yes, add to Future Enhancements
- B) No, keep volatility system free
- C) Maybe, depends on base system performance

**Your Answer:**

---

### Q15: Language/Terminology

Which terminology should we use in the UI?

**Options:**

- A) "Prediction" / "Sensitivity" (game-friendly)
- B) "Position" / "Leverage" (trading-like)
- C) "Bet" / "Multiplier" (gambling-adjacent)
- D) Other: \_\_\_

**Your Answer:**

---

## Summary

The Token Volatility system adds an optional layer of variance to Daily Quest Competition by allowing players to tie their scores to real-world cryptocurrency price movements. Key design decisions:

| Decision                   | Rationale                                |
| -------------------------- | ---------------------------------------- |
| **Optional**               | Skill purists can ignore it              |
| **Capped (0.5x-2.0x)**     | Prevents score destruction/explosion     |
| **Multiple tokens**        | Strategic depth, manipulation resistance |
| **No cost to participate** | Not gambling—just score modification     |
| **Game-friendly language** | Avoids regulatory pattern matching       |

This feature intentionally shifts the skill/luck balance to create variance that helps underdogs compete, while maintaining enough skill relevance that dedicated players still have an advantage.

---

**Document Status:** Awaiting answers to Open Questions before implementation.


