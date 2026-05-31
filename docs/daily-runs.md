---
task: Daily Runs (USDC stake)
test_command: "pnpm lint && pnpm typecheck && pnpm test:agent"
prd: ""
---

# Daily Runs (USDC-stake gated)

Implement a **daily run allowance** for **all non-competition idle runs** (progression runs), scaled by **USDC staked** (existing Base Topup deposits). **Daily Quest Competition remains fixed at 3 runs/day** regardless of stake. The legacy **Credits system is removed entirely**.

## Goals

- Gate **all non-competition idle runs** behind a **daily run allowance**.
- Scale allowance by **USDC staked** (existing Topup deposits; see `docs/unlock-difficulties.md`).
- Enforce allowance **server-side** with **race-safe** consumption.
- Add an API + UI to show **runs remaining** and **UTC reset countdown**.
- Keep **Daily Quest Competition** unchanged: **3 runs/day**, leaderboard submission, USDC/GHST rewards.
- Remove the **Credits** system entirely (server + client + docs + dead code).

## Non-Goals

- Changing Daily Quest Competition rules, multiplier schedule, or reward distribution.
- Implementing a new on-chain staking contract (we use existing Topup deposits).
- Adding a “soft cap” (reduced rewards after cap) in v1.

## Quality Gates

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:agent`

---

## Success Criteria

### US-001: Add daily runs config + allowance calculation

- [ ] Add `dailyRuns` config to `data/game-config.ts`:
  - [ ] `enabled: true`
  - [ ] `resetTimeUtcHour: 0` (UTC midnight)
  - [ ] `tiers`:
    - [ ] 0 USDC → 10 runs/day
    - [ ] 100 USDC → 20 runs/day
    - [ ] 1000 USDC → 30 runs/day
- [ ] Implement server helper `getDailyRunAllowance({ usdcStaked, tiers }): number`:
  - [ ] Select max tier where `usdcStaked >= usdcStakedGte`
  - [ ] USDC comparisons must work with decimals (deposits may be decimal); thresholds are whole USDC
- [ ] Unit tests cover the tier boundaries and decimals around them.

### US-002: Add `player_daily_runs` table + migration

- [ ] Add DB migration creating `player_daily_runs`:
  - [ ] `account_id UUID NOT NULL`
  - [ ] `date TEXT NOT NULL` (UTC `YYYY-MM-DD`)
  - [ ] `used_runs INTEGER NOT NULL DEFAULT 0`
  - [ ] `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - [ ] `PRIMARY KEY (account_id, date)`
  - [ ] Index on `date`
- [ ] Migration is idempotent and follows repo DB conventions.

### US-003: Implement atomic “consume daily run” repository function

- [ ] Add a DB repo method, e.g. `consumeDailyRun({ accountId, date, allowedRuns })` that:
  - [ ] Ensures `(accountId, date)` row exists (upsert/no-op insert)
  - [ ] Increments `used_runs` only if `used_runs < allowedRuns`
  - [ ] Returns updated `used_runs` on success
  - [ ] Returns a sentinel / throws a typed error on exhaustion
- [ ] Add a concurrency test (or integration test) showing only 1 success when `remainingRuns = 1` and multiple concurrent requests race.

### US-004: Add `GET /api/player/daily-runs` endpoint

- [ ] Implement `GET /api/player/daily-runs` returning:
  - [ ] `date` (UTC `YYYY-MM-DD`)
  - [ ] `resetAtUtc` (next UTC midnight ISO string)
  - [ ] `usdcStaked`
  - [ ] `allowedRuns`, `usedRuns`, `remainingRuns`
  - [ ] `tiers` (optional but recommended to prevent client/server drift)
- [ ] Endpoint uses the same USDC staked calculation as difficulty unlocks (`docs/unlock-difficulties.md`).

Example response:

```json
{
  "date": "2026-01-24",
  "resetAtUtc": "2026-01-25T00:00:00.000Z",
  "usdcStaked": 150,
  "allowedRuns": 20,
  "usedRuns": 7,
  "remainingRuns": 13,
  "tiers": [
    { "usdcStakedGte": 0, "dailyRuns": 10 },
    { "usdcStakedGte": 100, "dailyRuns": 20 },
    { "usdcStakedGte": 1000, "dailyRuns": 30 }
  ]
}
```

### US-005: Enforce daily runs on non-competition idle run start (consume on start)

- [ ] Identify the authoritative server entry point where an idle run is started / room is joined.
- [ ] If `options.dailyQuestActive === true`:
  - [ ] Do **not** consume `player_daily_runs`
  - [ ] Enforce existing Daily Quest Competition run limit (3/day)
- [ ] Else (non-competition idle run):
  - [ ] Compute `usdcStaked` and `allowedRuns`
  - [ ] Atomically consume 1 run via repo
  - [ ] If exhausted, reject start with a structured error:
    - [ ] Include `resetAtUtc`, `allowedRuns`, `usedRuns`, `usdcStaked`
    - [ ] Error code: `DAILY_RUNS_EXHAUSTED`
    - [ ] Use a consistent HTTP status (recommend: 429)
- [ ] Mid-day stake changes apply immediately:
  - [ ] If stake increases: remaining runs increases (because `allowedRuns` increased)
  - [ ] If stake decreases below thresholds: player may have `remainingRuns = 0` until restake or reset; do not interrupt active runs

### US-006: Client UI — show remaining daily runs + reset countdown

- [ ] Add client fetch for `GET /api/player/daily-runs` on the run-start / lobby UI.
- [ ] Display:
  - [ ] `remainingRuns`
  - [ ] countdown to `resetAtUtc`
  - [ ] tier ladder (render from server-provided `tiers` if present)
- [ ] When the server returns `DAILY_RUNS_EXHAUSTED`:
  - [ ] Show a blocking dialog with reset countdown and a Topup/stake CTA.
  - [ ] Ensure the UI cannot “optimistically” start a run when exhausted (server remains source of truth).

### US-007: Remove Credits system entirely (server + client + docs + dead code)

- [ ] Remove any per-run or per-gear **Credits** charging logic.
- [ ] Remove credit balances, credit UI surfaces, and credit-related data plumbing.
- [ ] Delete or inline/remove credit cost calculators (e.g. rarity-based “1–8 credits”) if unused after this change.
- [ ] Update any docs that claim credits exist (notably `docs/dailyquestcompetition.md` sections that mention credit entry costs).
- [ ] Ensure `pnpm typecheck` passes with no unused exports/types introduced by the cleanup.

### US-008: Tests

- [ ] Unit tests:
  - [ ] Allowance tier calculation at 0, 10, 100, 1000 and around boundaries (e.g. 9.99, 99.99, 999.99)
- [ ] Server integration tests:
  - [ ] Non-competition run start consumes a daily run and blocks when exhausted
  - [ ] Competition run start does not consume daily runs and still enforces 3/day
- [ ] Concurrency test:
  - [ ] Multiple concurrent non-competition run starts at `remainingRuns = 1` results in exactly one success

