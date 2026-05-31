### Trading game – score settlement via token price action (Mechanic B)

## Context (why this doc exists)

The game currently has an in-run **Leverage** mechanic (player selects a leverage value; higher leverage increases in-run score and also increases damage taken / risk).

This doc scopes and plans a replacement for that concept for **Competition** (daily quest) runs:

- Leverage **no longer modifies in-run gameplay** (no damage multiplier, no score multiplier, no kill-streak trait scaling from leverage).
- Instead, the run produces a **baseScore**, and the player’s chosen **token + long/short + risk leverage** affects the final settled score **after** the run, via token price action.

> The end goal is: gameplay skill → baseScore, market timing → settlement multiplier.

This doc specifies **Mechanic B** only:

- **Per run**: player chooses **one token** and **direction** (**long** or **short**).
- **Run ends quickly**: the run produces a **baseScore** (fixed at run end).
- **After run**: baseScore is multiplied by a **live multiplier** driven by token price action.
- **Manual stop**: player can **stop/lock** settlement when they want.
- **Fallback**: if player never stops, settlement locks at **daily close** (23:59 UTC).
- **No difficulty mechanic**: price action does **not** affect in-run gameplay or run difficulty in v1.

---

## Goals

- **Make real markets matter**: token price movement creates meaningful upside/downside on the daily leaderboard.
- **Separate skill loops**:
  - gameplay skill → baseScore
  - market timing skill → settlement multiplier
- **Server-authoritative and deterministic**: settlement uses robust sampling (TWAP/median), is replayable/auditable, and resilient to bad ticks.
- **Bounded variance**: multipliers have caps/floors so daily leaderboards don’t become pure lottery.

## Non-goals (v1)

- Using **Open-of-day** prices for anything.
- Price-driven difficulty or enemy scaling.
- Multi-token portfolios inside a single run.
- Liquidations, margin calls, funding rates, perps realism, etc. (this is a mini-game, not an exchange).

---

## Player-facing flow (v1)

### 1) Start run: choose token + direction (+ risk tier)

At run start, player selects:
- **Token**: e.g. `ETH`, `BTC`, `GHST` (final list TBD)
- **Direction**: `long` or `short`
- **Risk leverage**: `1x`–`20x`
  - This maps to a numeric scalar \(L\) used in settlement math only (not gameplay).

### 2) Run ends: baseScore is locked

When the run finishes:
- Store `baseScore` (never changes)
- Store **entry price sample** \(P_entry\) for the chosen token (server-side)
- Mark run state as **UNSETTLED**

### 3) Post-run settlement window (until 23:59 UTC)

- UI shows a **live multiplier** \(M(t)\) updating through the day based on price moves since entry.
- Player may click **Stop & Settle** once.
  - Settlement locks at **settlement price** \(P_settle\) (sampled server-side at stop time).

### 4) End-of-day fallback close (23:59 UTC)

At 23:59 UTC:
- Any UNSETTLED runs auto-settle using \(P_close\).
- Daily leaderboard locks/finalizes.

---

## Settlement math (recommended baseline)

### Definitions

- \(P_{entry}\): token price sample at **entry time** (recommend: run end / boss kill; see Questions)
- \(P_settle\): token price sample at **manual stop** time
- \(P_close\): token price sample at **23:59 UTC** (daily close)
- \(r = \frac{P_x}{P_{entry}} - 1\) where \(P_x\) is \(P_{settle}\) or \(P_{close}\)
- Direction sign \(s\): `long` → \(+1\), `short` → \(-1\)
- Risk/leverage scalar \(L \ge 1\)

We compute signed return:

\[
\Delta = s \cdot r
\]

Then compute multiplier:

#### Option A (simple, clamp)
\[
M = clamp(1 + L \cdot \Delta,\; M_{min},\; M_{max})
\]

Suggested safe defaults to start:
- \(M_{min} = 0.25\) (you can get rekt but not deleted)
- \(M_{max} = 4.0\) (keeps leaderboard meaningful)

#### Option B (saturating curve; “feels” high leverage without blowing up)
\[
M = \exp(clamp(L \cdot \Delta,\; a,\; b))
\]

Suggested safe defaults:
- \(a = \ln(M_{min})\)
- \(b = \ln(M_{max})\)

This avoids negative multipliers and makes “1000x” marketing possible while still bounded by caps.

### Risk tiers → \(L\)

Use explicit leverage `1x`–`50x` (not “1000x”), still bounded by \(M_{min}\) / \(M_{max}\).

---

## Price sampling / oracle design

Possible sources include **CoinGecko** or **Binance**. Either can work; the key is stability + anti-bad-tick handling.

### Recommendation: median-of-sources + TWAP

For each sampling point (entry, stop, close):

- Fetch from 1–2 sources.
- Convert to a normalized USD price.
- Produce a **TWAP** over a short window (e.g., 60s–300s) and/or median of several ticks.
- Combine sources by median (if both present), else fallback to the available one.
- Apply sanity checks (reject outliers vs last good value).

Suggested v1 approach (simple, robust):
- **Binance** for `BTCUSDT`, `ETHUSDT` (high quality)
- **CoinGecko** for `GHST` (and as a fallback for majors)
- Compute **60s TWAP** sampled every 5–10s (or use “last price” + 60s median if TWAP is too heavy)

### Sanity rules

- **Staleness**: if last good tick is older than X minutes, settlement should block (or use last known + flag “stale”).
- **Jump guard**: if a tick differs by >Y% from the rolling median, ignore it unless confirmed by a second source.
- **Audit log**: store the sampled values used for settlement with source + timestamps.

---

## State model (server)

### Run settlement states

- `RUNNING`
- `FINISHED_UNSETTLED`
- `SETTLED_MANUAL`
- `SETTLED_CLOSE`

### Minimal fields to persist per run

- `runId`, `playerId`
- `tokenSymbol`
- `direction` (`long` | `short`)
- `riskTier` (or `leverageScalar`)
- `baseScore`
- `entrySample`:
  - `entryPriceUsd`
  - `entrySampledAtUtc`
  - `entrySourceMeta` (source(s), sample window)
- `settlement` (nullable until settled):
  - `settleReason` (`manual` | `close`)
  - `settlePriceUsd`
  - `settledAtUtc`
  - `settleSourceMeta`
  - `multiplier`
  - `finalScore`

### Daily close tracking

- A “day bucket” keyed by `YYYY-MM-DD` (UTC):
  - `closePriceUsdByToken`
  - `closeSampledAtUtc`
  - `closeSourceMeta`
  - `finalizedAtUtc` (when leaderboard locks)

---

## Anti-abuse / incentive constraints (v1)

### 1) Prevent infinite “lottery tickets”

Need one (or more) limits:
- **Max unsettled runs per player per day** (e.g., 3–10)
- **Only the best settled run counts per day** (or per token per day)
- **Entry cost** (in-game currency) for choosing higher risk tiers

### 2) Prevent “stop spam” or micro-timing exploits

- Allow **one stop** per run (irreversible)
- Optional: apply **stop settlement TWAP** (e.g., 60s TWAP starting at stop click) to reduce wick-sniping

### 3) Keep the leaderboard legible

- Cap multiplier range (`M_min`, `M_max`)
- Consider multiplying only a **portion** of score:
  - `finalScore = baseScore * (1 + (M - 1) * k)` with \(k \in (0,1]\)
  - or apply multiplier only to “rank points” rather than every score component

---

## UX notes (client)

- At run end, show:
  - `baseScore`
  - chosen `token` + `long/short`
  - current `multiplier` + projected `finalScore`
  - a prominent **Stop & Settle** button
  - “Auto-settle at 23:59 UTC” timer
- Daily leaderboard views:
  - “Unsettled” badge until settled
  - show settle reason (manual vs close)
  - show token + direction for transparency
  - show live multiplier immediately (live estimate), not delayed

---

## Integration notes (current codebase)

### Where “Leverage” exists today (needs removal/repurpose)

Client:
- Lobby UI and local preference: `apps/client/src/components/Lobby.tsx`, `apps/client/src/app/page.tsx` (join options include `leverage`)
- Idle HUD display: `apps/client/src/components/idle/IdleDungeonScreen.tsx`
- Golden runs / run history display: `apps/client/src/app/golden-runs/*`

Server:
- Join option handling: `apps/server/src/rooms/SharedGame.ts` (reads `options.leverage`, sets `room.state.leverageTotal`, locks leverage)
- Score awarding: `apps/server/src/rooms/XpScoreSystem.ts` (multiplies score deltas by `room.getLeverageTotal()`)
- Idle mode score + damage: `apps/server/src/rooms/IdleMode.ts` (multiplies damage and score by leverage)
- Status damage: `apps/server/src/lib/systems/StatusSystem.ts` (poison damage multiplied by leverage)
- Stat scaling: `apps/server/src/lib/progression/killStreak.ts` is invoked with leverage in `apps/server/src/rooms/SharedGame.ts` / `applyProgressionToPlayer`
- State schema fields: `apps/server/src/schemas/index.ts` (leverageTotal / floorLeverage / roomLeverage + locks)
- Run persistence metadata: `apps/server/src/rooms/XpScoreSystem.ts` persists `metadata.leverage.total`

Competition/leaderboard:
- Competition submission: `apps/server/src/rooms/DailyQuestSystem.ts` and `apps/server/src/rooms/IdleMode.ts`
- Leaderboard storage is monotonic “best score wins”: `apps/server/src/lib/db/repos/daily-quest-leaderboard.ts`
- Daily jobs exist at 00:05 / 00:10 UTC: `apps/server/src/routes/internal-cron.ts` + `apps/server/src/jobs/*`

### Key constraint to design around

`daily_quest_leaderboard` upserts only when `final_score` increases. This is compatible with the trading mechanic **only if we do not write any unsettled / live-estimate scores** to `daily_quest_leaderboard`.

---

## Detailed implementation plan (v1)

### Phase 0 — Confirmed decisions (v1)

- **Mode gating**: idle-only + competition-only (use `player.dailyQuestActive === true`).
- **Final score**: `finalScore = baseScore * timeMultiplier * tradeMultiplier` (keep time multiplier in v1).
  - Capture `timeMultiplier` at run end / boss kill and persist it so settlement later uses the original multiplier.
- **Multiplier bounds**: `M_min = 0.25`, `M_max = 4.0`.
- **Close cutoff**: auto-close locks at **23:59 UTC** (gives a 1-minute buffer before the 00:00 UTC reset).
- **Entry price**: sample `P_entry` at run end / boss kill.
- **Oracle failure**: multi-source fallback; if all sources fail, use last cached price and mark the sample stale in `oracle_meta`.
- **Leaderboard writes**: write only when settled; compute live estimates on read (API/UI) for unsettled runs.
- **Unsettled runs**: multiple runs allowed; they may remain unsettled until close.

### Phase 1 — Data model + migrations

Add a new persistence model for trading settlement state. Recommend creating a dedicated table rather than overloading JSON metadata:

**New table**: `competition_trade_runs`
- Primary key: `id` (uuid)
- Unique key: `(competition_date, difficulty_id, account_id, run_id)` or `(run_id, account_id)` depending on game_id uniqueness guarantees
- Required fields:
  - `competition_date` (YYYY-MM-DD, UTC bucket; use existing `getCompetitionDate()` at run end)
  - `difficulty_id` (competition tier: `normal|nightmare|hell`)
  - `account_id` (player id)
  - `run_id` (game id)
  - `base_score` (int; locked at run end)
  - `time_multiplier` (numeric; captured at run end / boss kill)
  - `token` (`BTC|ETH|GHST|...`)
  - `direction` (`long|short`)
  - `risk_leverage` (numeric)
  - `entry_price_usd`, `entry_sampled_at`
  - `state` (`unsettled|settled_manual|settled_close`)
  - nullable settlement fields:
    - `settle_price_usd`, `settled_at`, `settle_reason`
    - `trade_multiplier`, `final_score`
  - `oracle_meta` (jsonb; sources, window, tick count, staleness flags)
- Indexes:
  - `(competition_date, difficulty_id)` for leaderboard page
  - `(account_id, competition_date)` for “my runs”
  - `(state, competition_date)` for close settlement job scans

**Migration location**: `supabase/migrations/<timestamp>_competition_trade_runs.sql`

Optional: if we want the public leaderboard API to include trade metadata without extra joins, add nullable columns to `daily_quest_leaderboard` too (token/direction/risk_leverage/trade_multiplier). This is optional in v1; we can also join from `competition_trade_runs` in API responses.

### Phase 2 — Server: price/oracle + settlement logic

#### 2.1 Price service (server)

Create a small server module (new folder suggested: `apps/server/src/lib/price-oracle/`) with:
- Adapters:
  - `BinanceAdapter` (majors; USDT pairs)
  - `CoinGeckoAdapter` (GHST + fallback)
- Core API:
  - `getSpotUsd(token, nowMs)` (cached)
  - `sampleTwapUsd(token, windowMs, nowMs)` (entry/stop/close sampling)
- Guardrails:
  - staleness cutoff
  - outlier rejection (requires 2 sources to override)
  - multi-source fallback, else cached (stale flagged)
  - audit meta captured into `oracle_meta`

Tests: pure unit tests with mocked adapters (no network).

#### 2.2 Capture trade selection at run start (join options)

Client sends (new) join options:
- `tradeToken`, `tradeDirection`, `tradeLeverage`

Server (`apps/server/src/rooms/SharedGame.ts`) validates and stores on player state (idle-mode-friendly) and/or room state:
- For v1 (solo competition), simplest is store on `player.idleRoom` (new fields) and also keep a server-side “current run trade config” map keyed by session id.
- Keep backward compat for `options.leverage` for one deploy:
  - treat as `tradeLeverage` if `tradeLeverage` absent
  - force gameplay leverage to 1 for competition if/when trading enabled

#### 2.3 On run end: create an UNSETTLED trade-run row

At boss kill / victory (IdleMode: `apps/server/src/rooms/IdleMode.ts`; Tick mode: `apps/server/src/rooms/DailyQuestSystem.ts`), instead of calling `submitToCompetitionLeaderboard(...)`:
- compute `baseScore` (existing rawScore calculation, **without** gameplay leverage)
- compute and store `timeMultiplier` (same multiplier used today, but persisted at run end)
- sample `P_entry` (recommended: at run end)
- insert `competition_trade_runs` row with `state='unsettled'`
- send a client message so UI can show settlement screen:
  - payload includes `baseScore`, entry price, and initial estimated multiplier

#### 2.4 Manual stop endpoint

Add an authenticated route (suggested):
- `POST /api/competition/trade/stop`
  - body: `{ runId }`
  - server:
    - loads `competition_trade_runs` row (must be `unsettled` and belong to caller)
    - samples `P_settle` (TWAP/median)
    - computes `tradeMultiplier` and `finalScore`
    - marks row `settled_manual`
    - upserts into `daily_quest_leaderboard` with settled final score (see Phase 3)

#### 2.5 Auto-close settlement job

Add a new internal cron endpoint + job, scheduled **before prize distribution**:
- new endpoint: `POST /api/internal/settle-competition-trades` (protected by `CRON_SECRET`)
- schedule: **00:01 UTC** (or similar) for the previous competition date
- job:
  - samples `P_close` per token at the **23:59 UTC** close cutoff
  - settles all `unsettled` rows for that date with reason `close`
  - upserts each into `daily_quest_leaderboard`
  - writes execution log into `cron_executions` like other jobs

### Phase 3 — Server: leaderboard write strategy

#### Recommendation: write only when settled (Pattern 1)

- Do **not** call `dailyQuestLeaderboardRepo.upsertLeaderboardEntry(...)` at run end anymore.
- Instead:
  - at settlement time (manual/close), compute a final score and then upsert.

Leaderboard payload options:
- **Option A (minimal DB changes)**: treat `rawScore` passed to upsert as “already trade-multiplied”:
  - `rawScoreForLeaderboard = Math.round(baseScore * tradeMultiplier)`
  - `timeMultiplier` unchanged (use the value captured at run end)
  - preserves `final_score = raw_score * time_multiplier`
  - store full breakdown in `competition_trade_runs`
- **Option B (more explicit schema)**: extend `daily_quest_leaderboard` to store `trade_multiplier` and compute `final_score = raw_score * time_multiplier * trade_multiplier`.

Pick one; Option A ships faster, Option B is cleaner for analytics.

### Phase 4 — Gameplay changes: remove in-run leverage effects

For the mechanic’s “no gameplay impact” guarantee, do the following when the trading mechanic is enabled:

- Score awarding:
  - `apps/server/src/rooms/XpScoreSystem.ts`: stop multiplying score deltas by leverage
  - `apps/server/src/rooms/IdleMode.ts`: stop multiplying score by leverage (including thorns/reflections and any other score paths)
- Damage:
  - `apps/server/src/rooms/IdleMode.ts`: stop multiplying damage taken by leverage
  - `apps/server/src/lib/systems/StatusSystem.ts`: stop multiplying poison damage by leverage
- Stat scaling:
  - `apps/server/src/rooms/SharedGame.ts` / `applyProgressionToPlayer`: call `computeKillStreakModifiers(..., leverage=1)` for competition runs (or remove leverage from that path entirely)
- State:
  - keep `leverageTotal` fields around short-term for compatibility, but set them to `1` for competition runs when trading is enabled.

### Phase 5 — Client UX + APIs

#### 5.1 Lobby changes (run start)

Replace the “Leverage” selection UI with “Trade Setup” when in competitive mode:
- Token selector (segmented control)
- Long/Short toggle
- Risk leverage picker (reuse the existing leverage slider/button grid, relabeled)

Files:
- `apps/client/src/components/Lobby.tsx`
- `apps/client/src/app/page.tsx` (join options: add `tradeToken`, `tradeDirection`, `tradeLeverage`; stop sending gameplay `leverage` when trading enabled)

#### 5.2 Victory / end-of-run settlement screen

In Idle end flow, show:
- baseScore
- time multiplier (captured at run end)
- entry price + current price
- live projected final score
- “Stop & Settle” CTA
- fallback close countdown

Files likely involved:
- `apps/client/src/components/idle/endflow/EndFlowController.tsx`
- `apps/client/src/components/idle/IdleDungeonScreen.tsx`

#### 5.3 Leaderboard page updates

Add:
- unsettled entries section (“Pending settlement”) with **live estimates** computed when the leaderboard is queried
- settled entries show token/direction + multiplier breakdown (optional v1)

Files:
- `apps/client/src/app/leaderboard/page.tsx`
- server routes under `apps/server/src/routes/daily-quest-competition.ts` (extend API responses)

### Phase 6 — Tests + rollout

#### Server tests
- Settlement math unit tests (long/short sign, clamp, bounds)
- Repo tests for `competition_trade_runs` transitions (unsettled → settled_manual/close)
- Cron job test (auto-close settles and then leaderboard updates)
- Regression tests for “no gameplay leverage” in idle-mode (score/damage no longer scale)

#### Client tests (minimum)
- Lobby selections are included in join options for competitive runs
- Stop & Settle calls the endpoint and updates UI state

#### Rollout / flags

Add a feature flag:
- env: `TRADING_GAME_ENABLED=1` (or in `GAME_CONFIG`)
- start with competition-only + idle-only
- keep existing leverage visible/usable in progression mode until v2 decision

---

## Acceptance criteria (v1)

- Competitive run start requires choosing `token`, `long/short`, and `risk leverage` (with sensible defaults).
- During competitive runs, “leverage” does **not** affect:
  - damage taken
  - in-run score / XP award math
  - kill-streak trait scaling
- On run completion:
  - server stores an `unsettled` trade-run record with `baseScore`, `timeMultiplier`, trade params, and `P_entry`
  - server does **not** upsert `daily_quest_leaderboard` yet
- Manual settlement:
  - player can settle exactly once
  - settlement computes and persists `tradeMultiplier` + `finalScore`
  - settled runs upsert into `daily_quest_leaderboard` (best-score monotonic rule preserved)
- Auto-close settlement:
  - any unsettled runs are settled for the previous competition day before prize distribution (00:05 UTC)
- UI:
  - end-of-run shows projected multiplier + final score and supports “Stop & Settle”
  - leaderboard page can display unsettled vs settled status (even if unsettled isn’t ranked yet)
- Validation:
  - `pnpm test:agent` passes
  - no unexpected snapshot diffs (or diffs are explained and intentional)

## Tests (minimum)

- **Math**:
  - long vs short sign correctness
  - clamps/caps behave as expected
  - deterministic given fixed samples
- **State transitions**:
  - cannot stop before run finished
  - cannot stop twice
  - auto-close settles remaining
- **Oracle behavior**:
  - bad tick rejection (if implemented)
  - fallback source works when one source fails

---

## Decisions (confirmed)

- **Scope**: idle-only + competition-only (`player.dailyQuestActive === true`).
- **Run setup**: token = `BTC|ETH|GHST`, direction = `long|short`, risk leverage = `1x–20x`.
- **Scoring**: `finalScore = baseScore * timeMultiplier * tradeMultiplier` (keep time multiplier; capture it at run end / boss kill).
- **Multiplier bounds**: `M_min = 0.25`, `M_max = 4.0`.
- **Close cutoff**: auto-close locks at **23:59 UTC**; settlement processing must finish before **00:05 UTC** prize distribution.
- **Oracle failure**: multi-source fallback; if all sources fail, use cached last price and flag stale in `oracle_meta`.
- **Leaderboard**: write only when settled; compute and show live estimates on leaderboard queries for unsettled runs.
- **Entry price**: `P_entry` sampled at run end / boss kill.
- **Unsettled runs**: multiple allowed; can remain unsettled until close.

## Remaining TBD (v1)

- **Sampling window**: spot vs short TWAP (recommend: short TWAP for entry/stop/close; spot for live UI).
- **Multiplier curve**: Option A clamp vs Option B exp (recommend: Option A clamp for v1 simplicity).
