# Spend 1 GHST to buy extra Daily Quest Competition runs (up to +7/day)

## Summary

Add a paid extension to the existing Daily Quest Competition run limit:

- **Base allowance**: keep current `dailyRunsPerDay` (currently 3) from `dailyQuestCompetition` config.
- **Paid extra runs**: allow a player to buy **up to 7 additional runs per competition day**.
- **Price**: **1 GHST per extra run**.
- **Allocation**:
  - **90%** of paid GHST is added to **the next day’s GHST reward pool** (not same day).
  - **10%** is sent to a configurable **EOA fee recipient** (address provided later).

This spec is written against the current server enforcement points:

- `apps/server/src/rooms/SharedGame.ts` (`registerGamePlayer` → competition gating + attunement recording)
- `apps/server/src/rooms/DailyQuestSystem.ts` (eligibility + player status)
- `apps/server/src/routes/daily-runs.ts` (competition “attune”/preview flow)
- `apps/server/src/jobs/distribute-daily-quest-prizes.ts` (prize crediting via `token_withdrawals`)
- `apps/server/src/lib/db/repos/daily-quest-leaderboard.ts` (attunement tracking + run count)
- `apps/server/src/rooms/IdleMode.ts` (restart behavior; currently bypasses competition run consumption)

---

## Goals

- **G1**: Players can buy +1 competition run for 1 GHST, up to **+7** per competition day.
- **G2**: Competition “runs remaining” calculations and gating respect **base + purchased** runs.
- **G3**: The **next day’s** GHST prize pool increases by **0.9 GHST per purchase** (net of fee).
- **G4**: The **fee recipient** receives **0.1 GHST per purchase** (immediate or batched; see questions).
- **G5**: System is **idempotent** and safe against replay/duplicate tx hashes.
- **G6**: Clear observability: audit tables + logs for purchases, pool accrual, fee payouts.

## Non-goals (for this iteration)

- Building a full “GHST wallet balance” inside the game (deposit/withdraw-like balance system).
- Smart-contract staking mechanics (this feature is direct payment per run).
- UI polish (we’ll expose server APIs; client UX can follow).

---

## Current behavior (relevant)

### Run usage tracking

- Competition run eligibility is gated by `dailyQuestLeaderboardRepo.hasRemainingDailyRuns(date, playerId, config.dailyRunsPerDay)`.
- Usage is recorded via `dailyQuestLeaderboardRepo.recordAttunementUsage(...)` in `SharedGame.registerGamePlayer` when a player enters a competition run.

### Important mismatch / bug risk

1) **Idle mode restart may bypass competition run consumption**

- `apps/server/src/rooms/IdleMode.ts` `restartRun()` consumes progression daily runs when `!player.dailyQuestActive`, but it currently **does not consume competition runs**.
- If restart is available during competition runs, it can allow “free” additional attempts within the same room/session.

This feature should be implemented alongside fixing the restart semantics.

---

## Proposed design

### Competition “max runs per day” becomes dynamic per player

For a given competition date \(D\):

- `baseMax = config.dailyRunsPerDay` (currently 3)
- `extraMax = 7`
- `purchased = countPurchases(date=D, playerId)` capped at `extraMax`
- `maxRuns = baseMax + purchased`
- `used = countAttunements(date=D, playerId)`
- `remaining = max(0, maxRuns - used)`

### Payment flow (server-validated on-chain transfer)

Because we do not have an in-game GHST balance/ledger that supports debits, the simplest robust interpretation of “spend 1 GHST” is:

1) Player sends **1 GHST** on Base from their wallet to a configured **treasury receive address**.
2) Player submits the transaction hash to the server.
3) Server validates:
   - chainId is Base (8453)
   - tx is confirmed, not reverted
   - tx contains an ERC20 `Transfer` of GHST for exactly `1e18` base units
   - `from` equals the player’s wallet address
   - `to` equals our configured treasury receive address
   - tx hash hasn’t been used previously
4) Server records the purchase and immediately increases runs available for that competition date.

> Alternate approach: “paymaster” style or frontend wallet UX can be built later, but server validation should be the authority.

### Prize pool rollover (90% to next day)

If a purchase is confirmed for competition date \(D\), then:

- `rolloverToDate = D + 1`
- `rolloverGhstAmount = 0.9 GHST`

We treat rollover as **a single additional GHST pool** that is distributed using the existing `tierDistribution` and `positionShares` rules.

Concretely, for prize distribution on date \(T\):

- `baseDailyGhst = config.weeklyBudget.ghst / 7`
- `rolloverGhstFromPrevDay = sum(confirmedPurchases where competition_date = T-1) * 0.9`
- `effectiveDailyGhst(T) = baseDailyGhst + rolloverGhstFromPrevDay`

Then for each tier:

- `tierGhstPool(T, tier) = effectiveDailyGhst(T) * config.tierDistribution[tier]`
- position prizes follow the existing share schedule.

USDC prize pools remain unchanged (unless we intentionally extend later).

---

## Configuration / secrets

### Required env vars

- `DAILY_QUEST_EXTRA_RUNS_ENABLED` (optional; default on/off decision)
- `DAILY_QUEST_EXTRA_RUN_GHST_PRICE` (default `1`)
- `DAILY_QUEST_EXTRA_RUNS_MAX_PER_DAY` (default `7`)
- `DAILY_QUEST_GHST_TREASURY_RECEIVE_ADDRESS` (Base EOA; where players pay GHST)
- `DAILY_QUEST_GHST_FEE_RECIPIENT_ADDRESS` (Base EOA; receives 10% fee; can be blank until known)

### Token config

Use existing withdrawal token config to resolve GHST token address/decimals (see `getWithdrawalTokenConfig('GHST')` in withdrawals code).

---

## Data model changes (DB migrations)

### 1) Keep one run per tier per day

The existing constraint `unique (date, difficulty_id, account_id)` is **intentional**.
We continue to allow **one run per tier per day** (max 3), and this feature
does **not** change that rule.

If we need additional idempotency or performance, we can add a secondary index
for counting, but we should **not** remove the tier uniqueness constraint.

### 2) Add `daily_quest_extra_run_purchases`

This table is the authoritative record of paid extra runs.

**Columns (proposed):**

- `id uuid pk default gen_random_uuid()`
- `competition_date date not null` (the competition date the purchased run applies to)
- `account_id uuid not null references players(id) on delete cascade`
- `chain_id bigint not null default 8453`
- `tx_hash text not null unique`
- `ghst_amount numeric(30,18) not null` (should be `1.0`)
- `ghst_amount_base_units bigint not null` (should be `1e18`)
- `runs_added int not null default 1`
- `rollover_ghst_amount numeric(30,18) not null` (should be `0.9`)
- `fee_ghst_amount numeric(30,18) not null` (should be `0.1`)
- `status text not null check (status in ('pending','confirmed','rejected'))`
- `confirmed_at timestamptz`
- `rejected_reason text`
- `metadata jsonb not null default '{}'::jsonb` (e.g. block number, from/to, log index)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

**Indexes:**

- `(account_id, competition_date, created_at desc)`
- `(competition_date, status)`

### 3) Add `daily_quest_fee_payouts` (optional but recommended)

If we do not want to send fee transfers inline during purchase confirmation, add a queue table.

- `id uuid pk`
- `purchase_id uuid not null references daily_quest_extra_run_purchases(id) on delete cascade`
- `recipient_address text not null`
- `amount_base_units bigint not null`
- `currency text not null default 'GHST'`
- `status text not null check (status in ('queued','sending','confirmed','failed','cancelled'))`
- `tx_hash text`
- `chain_id bigint not null default 8453`
- `failure_reason text`
- `created_at/updated_at`

Processor can reuse `createWithdrawalTransaction({ to, amount, tokenAddress })`.

---

## Server logic changes

### A) DB repo additions

Create a new repo module (suggested): `apps/server/src/lib/db/repos/daily-quest-extra-runs.ts`:

- `createPendingPurchase(...)`
- `confirmPurchase(...)` (idempotent by `tx_hash`)
- `getPurchasedExtraRunsForDay(date, accountId)` → number (0..7)
- `getRolloverGhstForDate(date)` → number
  - computes `sum(purchases where competition_date = date-1 and status='confirmed') * 0.9`

Extend `dailyQuestLeaderboardRepo` or add helper wrappers:

- `getMaxCompetitionRunsForPlayer(date, accountId, baseRunsPerDay)` → `base + min(extraMax, purchased)`
- `hasRemainingDailyRunsWithPurchases(date, accountId, baseRunsPerDay)` → `{ hasRemaining, used, remaining, max }`

### B) Competition gating updates

Update these callers to use the new “max”:

- `apps/server/src/rooms/SharedGame.ts`:
  - `ensureCompetitionRunsAvailable()` should call `hasRemainingDailyRunsWithPurchases(...)`.
  - `recordAttunementUsage(...)` should accept the computed `maxRuns` rather than `config.dailyRunsPerDay`.

- `apps/server/src/rooms/DailyQuestSystem.ts`:
  - `checkCompetitionEligibility()` should report:
    - `runsUsed`, `runsRemaining`, `dailyRunsPerDay` (base), `extraRunsPurchased`, `maxRunsToday`
  - `getPlayerCompetitionStatus()` should also include these fields.

- `apps/server/src/routes/daily-runs.ts` (competition “attune” endpoint):
  - Use new `maxRunsToday` in the error message payload and in `remainingAttunements`.

### C) Idle-mode restart semantics (must be decided)

We need explicit behavior for **what counts as consuming a competition run**:

- If “run consumed” means “one attempt at the dungeon,” then `IdleMode.restartRun()` must **also consume** a competition run (or be disabled in competition mode).

Implementation options:

- **Option A (recommended):** Restart in competition mode consumes another run (same as starting a new attempt).
- **Option B:** Disable restart button/handler for competition mode, forcing players to leave and re-join (so `registerGamePlayer` consumption covers it).

If Option A:

- Add a competition-run consumption step in `IdleMode.restartRun()` analogous to progression run consumption:
  - Check remaining runs via `hasRemainingDailyRunsWithPurchases`.
  - Record usage (insert attunement row) with a new `game_id` / run id (requires deciding what “game id” means for idle restarts; see questions).

---

## API surface (new endpoints)

### 1) GET purchase status (for UI)

`GET /api/daily-quest/extra-runs/status`

Returns:

- `date` (competition date)
- `baseRunsPerDay`
- `extraRunsPurchased`
- `extraRunsMax` (7)
- `maxRunsToday`
- `runsUsed`
- `runsRemaining`
- `priceGhst` (1)
- `treasuryReceiveAddress`

### 2) POST confirm purchase by tx hash

`POST /api/daily-quest/extra-runs/confirm`

Body:

- `txHash: string`

Behavior:

- Resolve session → playerId + walletAddress
- Validate tx as “paid 1 GHST from walletAddress to treasuryReceiveAddress”
- Determine `competition_date` from **tx block timestamp** using `getCompetitionDate({ nowMs: blockTimeMs })`
- Ensure player has not exceeded `extraRunsMax` for that date
- Insert/confirm `daily_quest_extra_run_purchases` (idempotent by `tx_hash`)
- Enqueue fee payout record (if recipient configured) or store as “pending”
- Return updated status payload (same shape as `status` endpoint)

Failure codes:

- `INVALID_TX_HASH`
- `TX_NOT_FOUND`
- `TX_NOT_CONFIRMED`
- `TX_REVERTED`
- `NOT_GHST_TRANSFER`
- `WRONG_FROM_ADDRESS`
- `WRONG_TO_ADDRESS`
- `WRONG_AMOUNT`
- `EXTRA_RUNS_CAP_REACHED`
- `TX_ALREADY_USED`

### 3) (Optional) POST create “intent”

If we want a smoother UX, add:

`POST /api/daily-quest/extra-runs/intent`

Returns a stable “payment instruction” payload:

- `to`, `tokenAddress`, `amountBaseUnits`, `chainId`, `memo`

This doesn’t record anything; it’s just for UI.

---

## Prize pool + distribution changes

### A) Prize distribution job (`distribute-daily-quest-prizes.ts`)

Current job uses `getPositionPrize(tier, position)` which is purely config-based.

We need to adjust GHST prizes for date \(T\) to:

- Use `effectiveDailyGhst(T) = baseDailyGhst + rolloverFrom(T-1)`

Implementation approach:

- Add a helper in the job:
  - `const rolloverGhst = await dailyQuestExtraRunsRepo.getRolloverGhstForDate(targetDate)`
  - `const effectiveDailyGhst = baseDailyGhst + rolloverGhst`
  - For each tier and position:
    - compute GHST payout using the same share math but with `effectiveDailyGhst`
    - keep USDC payouts unchanged (use existing helpers)

Also record in prize distribution metadata:

- baseDailyGhst
- rolloverGhstFromPrevDay
- effectiveDailyGhst

### B) Public API prize pool display

These endpoints:

- `GET /api/daily-quest/config`
- `GET /api/daily-quest/leaderboards`
- `GET /api/daily-quest/leaderboard/:tier`

Should display prize pool for the requested `date` using the same `effectiveDailyGhst(date)` formula.

This requires DB access (rollover depends on purchases), so implement prize pool computation in the route layer (or a shared service), not in `lib/daily-quest-competition.ts` (which currently reads only `GAME_CONFIG`).

---

## Fee payout (10%)

We need an operationally safe way to send 0.1 GHST per purchase to a configurable EOA.

### Recommended approach: queued payouts + cron processor

- On purchase confirmation:
  - If `DAILY_QUEST_GHST_FEE_RECIPIENT_ADDRESS` is configured, enqueue `daily_quest_fee_payouts` row.
  - If not configured, store `fee_ghst_amount` in purchase row only; keep payout queue empty.

- A small job processes queued payouts:
  - batches are optional; simplest is one tx per payout row
  - uses `createWithdrawalTransaction({ to: feeRecipient, amount: 0.1e18, tokenAddress: GHST, chainId: 8453 })`
  - marks payout row confirmed/failed with tx hash and reason

### Alternative: inline send

Not recommended unless we accept purchase confirmation endpoint latency + external dependency risk.

---

## Security, anti-abuse, and correctness

- **Idempotency**: `tx_hash` unique; confirm endpoint returns “already confirmed” success.
- **Amount strictness**: exact 1 GHST in base units per run (no partials).
- **Log-index safety**: if a tx includes multiple GHST transfers, we must identify the correct transfer log (match from/to/amount).
- **Date correctness**: compute `competition_date` from the transaction’s block timestamp relative to reset hour (same logic as `getCompetitionDate`).
- **Rate limiting**: per-player confirm endpoint rate limit (e.g., 10/min) to prevent RPC abuse.
- **Replay protection**: `tx_hash` can be claimed by only the wallet that sent it (`from` must match).

---

## Testing plan

### Unit tests

- `hasRemainingDailyRunsWithPurchases`:
  - base 3, purchased 0..7, used 0..(base+purchased)
  - cap enforcement at +7
- tx validation helper:
  - wrong token address, wrong from/to, wrong amount, reverted tx, unconfirmed tx

### Integration tests

- `POST /api/daily-quest/extra-runs/confirm` idempotency:
  - same tx twice → second call returns success and does not double-count.
- Competition gating:
  - `SharedGame.registerGamePlayer` blocks at (used == maxRuns)
  - then allow after purchase increments max

### Regression tests (existing)

- Update `SharedGame.daily-run-limits.test.ts` to incorporate purchased runs in the mocked `hasRemaining` behavior and in `max`.

---

## Rollout plan

- Phase 1 (server-only):
  - add tables + repos
  - add confirm/status endpoints
  - switch gating to dynamic max
  - adjust prize pool display + distribution to include rollover
  - keep UI unchanged (feature can be tested via API)

- Phase 2 (client UI):
  - add “Buy extra run” button + tx submission UX
  - show `extraRunsPurchased/7` and `runsRemaining`

---

## Questions (need your answers)

### Q1: Treasury receive address

What Base address should players send GHST to (the “receive address”)?

### Q2: Fee payout mechanics

Do you want the 10% fee to be:

- **A)** sent immediately per purchase, or
- **B)** batched (e.g., hourly/daily), or
- **C)** accumulated until manually triggered?

### Q3: If fee recipient is not configured

Until you provide the EOA, should we:

- **A)** block purchases, or
- **B)** allow purchases and accrue fee in DB, then pay later?

### Q4: Restart semantics in competition runs

Should `IdleMode.restartRun()` during a competition run:

- **A)** consume another competition run, or
- **B)** be disabled, or
- **C)** be allowed without consuming (not recommended)?

### Q5: “What date does a purchase apply to?”

Should the purchase be attributed to:

- **A)** the competition date of the tx block timestamp (recommended), or
- **B)** “today” at the time the user submits the tx hash?

### Q6: Confirmations threshold

How many confirmations should we require before crediting the extra run?

- Suggested: 1-3 on Base for UX.
