# Daily Chest — Implementation Plan

## Goal
Introduce a **Daily Chest** mechanic that “hooks” new players earlier by giving meaningful daily rewards once they’ve staked a small amount.

- **Claimable**: once per day per account (UTC reset, aligned with existing Daily Runs reset).
- **Location**: accessible from the **Lobby** when available.
- **Eligibility**: only for users with **at least 1 total staked** (USDC and/or GHO; see questions).
- **Rewards (random)**:
  - **Potion**: *Greater Healing Potion* OR *Ultra Healing Potion*
  - **+1 Daily Run**: increases today’s **practice/progression** run allowance by 1
  - **+1 Daily Competition Run**: increases today’s **competition** run allowance by 1
  - **Wearable**: **excellent quality** wearable, **any rarity** with configurable drop rates
- **Bonus (always in addition)**:
  - **Gold**: also grants **one** gold drop of **10**, **50**, or **100** (with configurable weights)

## Confirmed decisions (from you)
- **Stake semantics**: fractional is allowed; eligibility is **total stake \(USDC + GHO\) >= 1.0**
- **Reset time**: **00:00 UTC** (same as Daily Runs)
- **Default weights**: I will propose reasonable defaults in config (you’ll be able to tune later)
- **Potion quantity**: when the potion reward is rolled, award **1–3 potions** with tunable weights

## Non-goals (initial version)
- Multiple chests per day, streak bonuses, social sharing.
- Manual UI testing as a requirement (we’ll rely on automated tests).
- A “store” of chest inventory; rewards are resolved server-side at claim time.

---

## Existing code paths we should reuse

### Stake gate / eligibility
- Client reads stake via `useProgression()` (`apps/client/src/hooks/useProgression.ts`) → `GET /api/player/staked-balance`
- Server endpoint `GET /api/player/staked-balance` (in `apps/server/src/index.ts`) uses:
  - `depositsRepo.getStakedUnlockBalances(playerId)` returning `{ usdc, gho, total }`

### Daily reset semantics
- Server daily date + reset time already exists:
  - `getDailyRunsDate()` and `getDailyRunsResetAt()` in `apps/server/src/lib/daily-runs.ts`
  - Uses a **configurable UTC reset hour** (currently `0`) and returns `YYYY-MM-DD`

### Reward plumbing (inventory)
- Potions and fungibles:
  - `inventoryRepo.upsertInventoryItem(...)` (`apps/server/src/lib/db/repos/inventory.ts`)
  - Potions get normalized to `itemType: 'potion'` with `itemData.type='potion'` and `itemData.potionTier`
- Wearables as instances:
  - `inventoryRepo.createInventoryInstances(...)` for wearable instances (quality/durability stored)
- Loot table already knows wearable rarity/quality systems:
  - `apps/server/src/data/loot-table.ts` defines wearable rarity weights and quality distributions.

---

## Proposed architecture

### Server-owned source of truth
The server must own:
- Eligibility checks (logged in + staked >= threshold)
- “Once per day” enforcement
- RNG + reward resolution
- Persisted record of what was awarded (auditing, idempotency, support)
- Any “bonus run” entitlement used during runs (both progression and competition)

The client should be a thin UI:
- Fetch status
- Present CTA in Lobby
- Trigger claim
- Display reward result

---

## Data model (DB)

### New table
Add a migration under `db/migrations/`:

**`player_daily_chest`**
- `account_id uuid not null references players(id) on delete cascade`
- `date text not null` (same format as `getDailyRunsDate()`; e.g. `2026-01-27`)
- `claimed_at timestamptz not null default now()`
- `reward_type text not null` (e.g. `potion`, `bonus_progression_run`, `bonus_competition_run`, `wearable`)
- `reward_payload jsonb not null default '{}'::jsonb` (details; see below)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- primary key `(account_id, date)` (enforces once-per-day)
- index on `(date)` for ops/analytics

**Reward payload shape (examples)**
- Potion:
  - `{ "potionTier": 2, "itemName": "Greater Healing Potion", "quantity": 1 }`
- Bonus progression run:
  - `{ "bonusRuns": 1, "mode": "progression" }`
- Bonus competition run:
  - `{ "bonusRuns": 1, "mode": "competition" }`
- Wearable:
  - `{ "wearableSlug": "aave-hero-shades", "rarity": "legendary", "quality": "excellent", "durabilityScore": 812 }`
- Gold bonus (always included in claim response):
  - `{ "goldBonus": { "amount": 50 } }`

### Bonus runs tables (recommended, shared with GHST purchases)
Since `spend-ghst-daily-run.md` will introduce “paid extra competition runs”, we should make **one shared entitlement layer** that both features write into, so the run gate reads a single “base + bonus” number.

Add a migration under `db/migrations/`:

**`player_daily_run_bonus`**
- `account_id uuid not null references players(id) on delete cascade`
- `date text not null` (same `YYYY-MM-DD` key as `getDailyRunsDate()` / competition date key)
- `mode text not null check (mode in ('progression','competition'))`
- `bonus_runs integer not null default 0`
- `updated_at timestamptz not null default now()`
- primary key `(account_id, date, mode)`

Optional but recommended for audit/idempotency across multiple sources:

**`player_daily_run_bonus_events`**
- `id uuid pk default gen_random_uuid()`
- `account_id uuid not null references players(id) on delete cascade`
- `date text not null`
- `mode text not null check (mode in ('progression','competition'))`
- `delta integer not null` (e.g. `+1`)
- `source text not null` (e.g. `daily_chest`, `daily_quest_purchase`, `admin`)
- `source_ref text` (optional; e.g. tx hash or purchase id; can be unique per `source` if needed)
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

How this aligns with `spend-ghst-daily-run.md`:
- The GHST purchase feature still keeps its **purchase table** (for tx validation + prize pool rollover math).
- After a purchase is confirmed, it should also **increment** `player_daily_run_bonus` for `mode='competition'` (and optionally log a bonus event).
- Daily Chest simply increments the same table for the appropriate mode.

### New repo
Create `apps/server/src/lib/db/repos/player-daily-chest.ts`:
- `getForDate(accountId, date)`
- `claimForDate(...)` (atomic insert / on-conflict behavior; see next section)

Why a repo:
- Keeps SQL isolated
- Allows transactional claim that also writes inventory changes in the same `runTransaction(...)` block

---

## Server API design

### Routes
Add `apps/server/src/routes/daily-chest.ts` and register it from `apps/server/src/index.ts` alongside existing route registration functions:
- `registerDailyChestRoutes(app)`

### `GET /api/player/daily-chest`
**Purpose**: Lobby status rendering.

Response (suggested):
- `enabled: boolean`
- `date: string` (daily date key)
- `resetAtUtc: string` (ISO)
- `isLoggedIn: boolean` (or omit and rely on 401)
- `isEligibleByStake: boolean`
- `stakeTotal: number` (optional, for UI)
- `minStakeRequired: number` (1)
- `hasClaimedToday: boolean`
- `claimedAt: string | null`
- `isClaimAvailable: boolean` (eligible && !claimed)
- `bonusProgressionRunsToday: number` (0+; optional for UI)
- `bonusCompetitionRunsToday: number` (0+; optional for UI)
- `rewardPreview?: never` (no preview; server-only)

Behavior:
- `401` if no session (consistent with other player endpoints)
- If logged in but stake < min: return `isEligibleByStake=false` and `isClaimAvailable=false`
- If eligible: read claim row for today and compute availability

### `POST /api/player/daily-chest/claim`
**Purpose**: claim and resolve reward.

Rules:
- Must be logged in
- Must satisfy stake threshold at claim time
- Must be unclaimed for today

Idempotency strategy (recommended):
- If row exists for today:
  - Return `200` with the **existing reward** (safe for double-click / retries)
  - Include `hasClaimedToday=true`

Transactional behavior (important):
- In one DB transaction:
  1. Re-check stake (or accept a slightly stale stake check but prefer fresh)
  2. Insert claim row if not exists (or lock/check)
  3. Apply reward side effects (inventory insert / increment bonus runs)
  4. Return reward payload

Security / fairness:
- Use a non-client-controllable RNG. Prefer Node `crypto` (`randomInt`) over `Math.random()`.
- Record minimal metadata for auditing (IP optional; request id already exists in index route patterns).

---

## Reward resolution design

### Global config
Add a `dailyChest` section to the canonical `data/game-config.ts` (repo root) so it’s auto-synced into `apps/*/src/data/game-config.ts`:

Suggested config:
- `dailyChest.enabled: boolean`
- `dailyChest.minStakeTotal: number` (default 1)
- `dailyChest.resetTimeUtcHour: number` (default `0` / 00:00 UTC)
- `dailyChest.weights: { potion: number; bonusProgressionRun: number; bonusCompetitionRun: number; wearable: number }`
- `dailyChest.potion: { tierWeights: { greater: number; ultra: number }; quantityWeights: Record<1|2|3, number> }`
- `dailyChest.wearable: { rarityWeights: Record<rarity, number> }`
- `dailyChest.goldBonus: { enabled: boolean; amounts: Array<{ amount: number; weight: number }> }`

This makes drop rates tunable without code changes.

### Proposed default weights (initial)
These defaults are intended to feel good for new users while keeping higher-impact rewards rarer. Everything is tunable.

- **Primary reward roll weights** (`dailyChest.weights`)
  - `potion`: 55
  - `bonusProgressionRun`: 20
  - `bonusCompetitionRun`: 10
  - `wearable`: 15

- **Potion tier weights** (`dailyChest.potion.tierWeights`)
  - `greater`: 75
  - `ultra`: 25

- **Potion quantity weights** (`dailyChest.potion.quantityWeights`)
  - `1`: 70
  - `2`: 25
  - `3`: 5

- **Wearable rarity weights** (`dailyChest.wearable.rarityWeights`)
  - `common`: 50
  - `uncommon`: 30
  - `rare`: 15
  - `legendary`: 4
  - `mythical`: 1
  - `godlike`: 0.5

- **Gold bonus weights** (`dailyChest.goldBonus.amounts`)
  - `10`: 70
  - `50`: 25
  - `100`: 5

### Potion reward
- Decide tier:
  - Tier 2 => “Greater Healing Potion”
  - Tier 3 => “Ultra Healing Potion”
- Decide quantity:
  - Roll `1|2|3` using `dailyChest.potion.quantityWeights`
- Apply:
  - `inventoryRepo.upsertInventoryItem({ itemType: 'potion', itemName: '<name>', quantity, itemData: { type: 'potion', potionTier: 2|3, source: 'daily_chest', date } })`
- Log:
  - `inventoryEventsRepo.logInventoryEvent(... reason: 'daily_chest')`

### Wearable reward (excellent quality)
- Select wearable:
  - Use server wearable catalog (`apps/server/src/data/wearables.ts`) and filter to wearable candidates already used by loot table.
  - Pick a rarity using configurable rarity weights, then select uniformly among wearables of that rarity (or weighted by existing loot-table weights; choose one approach and document it).
- Force quality to `excellent`
- Choose durability within the existing `excellent` range (reuse loot table range logic or encode a single helper).
- Apply:
  - `inventoryRepo.createInventoryInstances({ playerId, items: [{ wearableSlug, quality: 'excellent', durabilityScore, itemData: { source: 'daily_chest', rarity, date } }] })`
- Log:
  - `inventoryEventsRepo` for wearables is currently skipped in some diffs; instead log a dedicated event (or add a wearable-specific logging path with metadata).

### Gold bonus (always in addition)
On every successful Daily Chest claim, do an additional roll for gold:
- Outcomes: `10`, `50`, `100` (weights configurable in `GAME_CONFIG.dailyChest.goldBonus.amounts`)

Implementation:
- Persist as a normal currency-like inventory item using existing conventions:
  - `inventoryRepo.upsertInventoryItem({ playerId, itemType: 'coin', itemName: 'Gold', quantity: <amount>, itemData: { source: 'daily_chest', date } })`
  - Ensure the client continues to recognize it as gold (Lobby currently matches `type` coin/gold and `name` "gold").
- Log:
  - `inventoryEventsRepo.logInventoryEvent(... reason: 'daily_chest', delta: +amount, itemType: 'coin', itemName: 'Gold')`

API / payload:
- `POST /api/player/daily-chest/claim` returns:
  - `reward` (primary reward) AND `goldBonus` (always present when enabled)
- The `player_daily_chest.reward_payload` should include the gold amount for auditing, regardless of primary reward type.

### “+1 Daily Run” reward (practice/progression)
Goal: increase today’s progression run allowance by 1.

Where it applies today:
- Run gating for progression happens in `registerGamePlayer(...)` (shared flow) via:
  - `depositsRepo.getStakedUsdcBalance(playerId)`
  - `getDailyRunAllowance({ usdcStaked, tiers })`
  - `playerDailyRunsRepo.consumeDailyRun({ accountId, date, allowedRuns })`

Plan:
- Add repo `playerDailyRunBonusRepo`:
  - `getBonusRuns(accountId, date, mode)`
  - `incrementBonusRuns(accountId, date, mode, delta, sourceRef?)`
- When consuming a progression run, compute:
  - `allowedRunsEffective = baseAllowedRuns + bonusRuns`
- Only the gate uses the bonus; the underlying `player_daily_runs.used_runs` remains the single “used counter”.

Daily Chest claim side effect:
- If reward is `bonus_progression_run`:
  - increment `player_daily_run_bonus.bonus_runs` by 1 for today’s date with `mode='progression'`
  - store `{ bonusRuns: 1, mode: "progression" }` in `player_daily_chest.reward_payload`

### “+1 Daily Competition Run” reward
Goal: increase today’s competition run allowance by 1.

Where it applies today:
- Competition run gating uses `dailyQuestLeaderboardRepo.hasRemainingDailyRuns(date, playerId, limit)` and config `dailyRunsPerDay`.

Plan (minimal, localized):
- Reuse `playerDailyRunBonusRepo` (same table), using `mode='competition'`.
- Update `hasRemainingDailyRuns(...)` (and any other competition gate that assumes a fixed `dailyRunsPerDay`) to treat:
  - `effectiveLimit = config.dailyRunsPerDay + bonusRuns`

Daily Chest claim side effect:
- If reward is `bonus_competition_run`:
  - increment `player_daily_run_bonus.bonus_runs` by 1 for today’s date with `mode='competition'`
  - store `{ bonusRuns: 1, mode: "competition" }` in `player_daily_chest.reward_payload`

---

## Client implementation

### Types
Add `apps/client/src/types/daily-chest.ts` with:
- `DailyChestStatus`
- `DailyChestClaimResult`

### Hook
Add `apps/client/src/hooks/useDailyChest.ts` mirroring `useDailyRuns`:
- `useDailyChest(playerId, options?: { enabled?: boolean })`
- fetches `GET /api/player/daily-chest`
- exposes `claim()` calling `POST /api/player/daily-chest/claim`
- exposes `refresh()`

### Lobby UI
Update `apps/client/src/components/Lobby.tsx`:

Placement recommendation:
- Put a compact card **near the Daily Runs section**, since it shares “daily reset” semantics and stake gating.

Behavior:
- If not logged in: do nothing (or show “Log in to claim” — optional; see questions).
- If logged in and stake total < 1: hide entirely (per requirement “disappears”).
- If eligible and unclaimed:
  - Show “Daily Chest available” badge + button “Open Daily Chest”
  - On click: open dialog → call claim → show reveal animation + reward summary
- If claimed:
  - Show “Claimed” + “Resets in …” (use existing countdown logic in Lobby already used for Daily Runs reset).
  - Optionally show: “Bonus runs today: +X practice, +Y compete” (if status includes these fields)

Reward reveal UI details:
- Potion: show potion icon (you already use `/wearables/127.svg` and `/wearables/129.svg` in Lobby for tiers 2/3).
- Wearable: show wearable icon via existing wearable id-to-svg mapping logic (similar to `resolveWearableIconFor` in Lobby).
- Bonus runs: show a clean text banner (e.g. “+1 Daily Run” or “+1 Daily Competition Run”).

State consistency:
- After claim, refresh:
  - daily chest status
  - inventory counts (if needed; depends on how PlayerProvider keeps inventory in sync)

---

## Testing plan

### Server tests (required)
Add unit/integration tests (Jest) in `apps/server/src/routes/__tests__/daily-chest.test.ts` (or similar):
- **Unauthorized**:
  - `GET /api/player/daily-chest` returns 401 without session
  - `POST /api/player/daily-chest/claim` returns 401 without session
- **Stake gating**:
  - With stake `< 1`: status shows ineligible; claim returns 403
- **Once per day**:
  - First claim returns reward
  - Second claim same day returns the same reward (idempotent) and does not duplicate inventory
- **Reward side effects**:
  - Potion reward: inventory upsert called; potion tier stored correctly
  - Wearable reward: wearable instance created with `quality='excellent'`
  - Bonus progression run: bonus table increments; gate uses effective allowance
  - Bonus competition run: bonus table increments; competition gate uses effective limit
  - Gold bonus: inventory upsert increments gold by one of 10/50/100 and claim payload includes `goldBonus.amount`

RNG determinism for tests:
- Inject a “random provider” into the claim handler (or wrap RNG in a helper that can be mocked) so tests can force each reward path.

### Server gate tests (recommended)
Add focused tests around the two gates:
- Progression: `allowedRunsEffective = base + bonus`
- Competition: `effectiveLimit = base + bonus`

### Client tests (optional)
If you want UI coverage, add a lightweight client test for the Lobby card rendering and claim flow (but server tests are the critical gate).

---

## Observability / ops
- Add structured logs on claim:
  - playerId, date, reward_type, payload summary
- Add admin/dev-only endpoint to reset today’s claim (non-production only), similar to `/api/daily-runs/dev-replenish`, to ease QA.
- Consider adding economy/inventory event metadata `source: 'daily_chest'` for analytics.

---

## Rollout strategy
1) Ship DB migration + server endpoints behind `GAME_CONFIG.dailyChest.enabled=false`
2) Ship client UI gated by `status.enabled`
3) Enable feature in config in a controlled deploy
4) Observe:
   - claim rate / day
   - reward distribution matches expected weights
   - no abuse patterns (e.g. claim attempts + stake flapping)

---

## Open questions (need your answers)

1) **Stake requirement semantics**
   - Is eligibility based on **total** \(USDC + GHO\) `>= 1`, or **either token individually** `>= 1`?
   - Should it be “>= 1.00” exactly, or allow fractional \(e.g. 0.5 USDC + 0.5 GHO\)?

   **Answer**: total stake can be fractional; eligibility is **total >= 1**.

2) **Reset time**
   - Should Daily Chest reset at **00:00 UTC** (same as Daily Runs today), or a different UTC hour?

   **Answer**: **00:00 UTC**.

4) **Reward weights**
   - What weights do you want for:
     - potion vs bonus daily run vs bonus competition run vs wearable
     - greater vs ultra potion
     - gold bonus: weights for 10 vs 50 vs 100
   - If you don’t have a preference, I’ll propose reasonable defaults in config (e.g. wearable rarer than potion).

   **Answer**: defaults proposed in this doc are acceptable (tunable later).

5) **Wearable rarity drop rates**
   - Please provide target weights for `common/uncommon/rare/legendary/mythical/godlike`.
   - Should godlike be possible from Daily Chest, or excluded?

   **Answer**: provide reasonable defaults (included above). Godlike is allowed but rare by default.

6) **Potion reward quantity**
   - Always **1** potion, or can it sometimes be multiple?

   **Answer**: up to **3** potions, tunable weights (included above).

