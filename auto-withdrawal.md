## Auto-Withdrawal Workflow (Proposed)

This document outlines the **new, more automated withdrawal flow** for admin-managed token withdrawals, starting from an approved withdrawal row in the database and ending with a fully confirmed onchain transaction.

The goal is to:

- **Keep admin approval manual** (unchanged from today).
- **Move all automation to the server** (cron + handlers), instead of the admin UI polling every 30 seconds.
- **Support safe batching** of withdrawals into onchain transactions.

---

## High-Level Flow

- **Step 1 – Admin approval (unchanged UI path)**
  - **Source**: `@withdrawals-client.tsx` (admin panel).
  - The admin reviews withdrawals in `withdrawal_waiting` status and approves or rejects them.
  - **On approve**, the server updates the withdrawal row to an “approved / ready for processing” status (exact status name to be finalized).
  - **On reject**, the server updates the row to `withdrawal_rejected` with a `failureReason`.

- **Step 2 – DB as the source of truth**
  - Once approved, **no UI-side polling** or per-row processing is needed.
  - The database holds all state:
    - Approved and not yet batched.
    - Batched and submitted onchain (pending confirmation).
    - Confirmed or failed onchain.

- **Step 3 – Cron job: batch-create onchain transactions**
  - A **server-side cron job** (runs every minute) finds **approved-but-unbatched** withdrawals.
  - It groups them into one or more onchain transactions, respecting:
    - **Maximum withdrawals per onchain tx** (configurable).
    - **Per-currency and per-chain constraints** (e.g., all USDC/Base L2 withdraws in a single tx).
  - For each batch:
    - Builds the calldata for the withdrawal contract.
    - Submits a transaction.
    - On success:
      - Creates/updates a **withdrawal batch record** and/or per-row `txHash`.
      - Moves each included withdrawal to a **“onchain pending”** status.
    - On failure (RPC/revert):
      - Marks affected rows as `withdrawal_failed` and records a `failureReason` where possible.

- **Step 4 – Cron/handler: confirmations and finalization**
  - Another **cron handler** (or the same one, in two phases) periodically:
    - Looks up all withdrawals (or batches) in **“onchain pending”** state (have `txHash` but not finalized).
    - Queries the blockchain for each `txHash`:
      - If **confirmed & successful**:
        - Marks withdrawals as `withdrawal_confirmed`.
        - Sets `withdrawalConfirmedAt` and any relevant confirmation metadata.
      - If **confirmed & failed / reverted**:
        - Marks withdrawals as `withdrawal_failed`.
        - Sets an appropriate `failureReason`.
      - If **still pending**:
        - Leaves them as-is, to be retried on the next cron run.

- **Step 5 – Admin visibility**
  - The admin UI (`@withdrawals-client.tsx`) becomes **purely read-only** for post-approval stages:
    - Shows counts and totals per status (already supported).
    - Displays `txHash` and explorer links for batched/confirmed withdrawals.
    - No longer needs to trigger per-withdrawal processing every 30 seconds.

---

## States and Transitions (Proposed)

- **Key statuses** (some already exist, some may be added/clarified):
  - **`received`**: Row created, not yet requested by player.
  - **`withdrawal_waiting`**: Player requested; waiting for admin decision.
  - **`withdrawal_rejected`**: Admin rejected, with `failureReason`.
  - **`withdrawal_approved` (new)**:
    - Admin has approved.
    - Withdraw has **not yet been assigned to an onchain batch / tx**.
  - **`withdrawal_sending` (new)**:
    - Server has claimed the row for broadcasting.
    - Acts as an in-flight marker to prevent double-sends on crash.
  - **`withdrawal_pending`**:
    - At least one onchain tx has been submitted for this withdrawal (likely via a batch).
    - `txHash` is present.
    - Awaiting onchain confirmation.
  - **`withdrawal_confirmed`**:
    - Onchain tx succeeded.
    - Funds are considered withdrawn.
  - **`withdrawal_failed`**:
    - Onchain tx reverted / failed or could not be submitted after retries.
    - `failureReason` should be populated.

- **Core transitions**:
  - `withdrawal_waiting` → `withdrawal_approved` (admin approves).
  - `withdrawal_waiting` → `withdrawal_rejected` (admin rejects).
  - `withdrawal_approved` → `withdrawal_pending` (cron submits batch tx, sets `txHash`).
  - `withdrawal_pending` → `withdrawal_confirmed` (cron sees successful receipt).
  - `withdrawal_pending` → `withdrawal_failed` (cron sees revert / permanent failure).
  - (Optional) `withdrawal_failed` → `withdrawal_approved` (manual re-approve / retry path).

---

## Cron Job Responsibilities (Detailed)

- **Cron #1: Batch creator (once per minute)**
  - **Inputs**:
    - All withdrawals in `withdrawal_approved` status.
    - Config:
      - `MAX_WITHDRAWALS_PER_TX` (e.g., 5–20).
      - Per-chain, per-token routing (e.g., Base L2 USDC, GHST).
  - **Processing**:
    - Group by:
      - `chainId`.
      - `tokenContractAddress` or logical currency symbol (`USDC`, `GHST`), depending on contract design.
      - Any other required dimensions (e.g., withdrawal method / contract).
    - For each group:
      - Chunk into batches of `MAX_WITHDRAWALS_PER_TX`.
      - For each batch:
        - Construct and send a transaction via the server signer.
        - On successful submission:
          - Persist `txHash` and any `batchId` or similar.
          - Move each withdrawal in the batch to `withdrawal_pending`.
        - On submission failure:
          - Either:
            - Mark as `withdrawal_failed` immediately, or
            - Leave them in `withdrawal_approved` with a recorded error and retry later (TBD).

- **Cron #2: Confirmation checker (once per minute)**
  - **Inputs**:
    - All withdrawals in `withdrawal_pending` (or all batches with pending `txHash`).
  - **Processing**:
    - For each distinct `txHash`:
      - Fetch receipt from the chain.
      - If **no receipt yet**:
        - Skip (keep pending), with an upper timeout in mind (e.g., fail after N minutes / blocks).
      - If **receipt indicates success**:
        - Mark associated withdrawals as `withdrawal_confirmed`.
        - Set `withdrawalConfirmedAt`.
      - If **receipt indicates failure**:
        - Mark as `withdrawal_failed`.
        - Populate `failureReason` from logs / error classification if available.
      - If **RPC errors**:
        - Leave as pending and try again next run, with logging and metrics.

- **Implementation note**:
  - These two cron roles **can be in the same handler**:
    - Phase 1: pick and batch `withdrawal_approved`.
    - Phase 2: check confirmation for `withdrawal_pending`.
  - Or they can be **separate jobs** for clearer responsibilities and simpler retries.

---

## Failure Handling & Idempotency

- **Idempotent cron behavior**
  - Selection queries should only pick **rows not already associated with an in-flight batch**.
  - Once a batch is created, each withdrawal should record:
    - A `batchId` or similar grouping key (or, at minimum, a shared `txHash`).
    - A `txHash` (once available).
  - The batch-creation logic must avoid double-including the same withdrawal if the cron job re-runs before completion.

- **Retries**
  - If sending a transaction fails before a `txHash` exists:
    - We can either:
      - Keep rows in `withdrawal_approved` (so they’ll be retried), and store a transient error log, or
      - Move them to `withdrawal_failed` and require manual admin re-approval.
  - If a `txHash` exists but the receipt is **never found** (RPC weirdness):
    - After some timeout, flag them as `withdrawal_failed` with a special reason (e.g., `receipt_not_found_after_timeout`).

- **Admin retrigger / overrides**
  - The admin panel may need:
    - A “retry failed” path (e.g., move `withdrawal_failed` back to `withdrawal_approved`).
    - A way to see batch-level or tx-level status for debugging.

---

## Decisions & Configuration

- **Statuses and naming**
  - We will introduce a distinct **`withdrawal_approved`** status between `withdrawal_waiting` and `withdrawal_pending`.
  - Existing code paths and docs (`withdrawals.md`, `ghst-withdrawals.md`, `tx-monitor.ts`, `token-withdrawals` routes) already treat **`withdrawal_pending`** as “onchain tx submitted, awaiting confirmation”.
  - To avoid breaking these semantics, **`withdrawal_pending` will keep its current meaning**; `withdrawal_approved` will represent “approved in DB but not yet broadcast”.

- **Batching rules**
  - We will cap each cron run to **at most 100 withdrawals processed per batch run** (across all currencies), i.e. `MAX_WITHDRAWALS_PER_RUN = 100`.
  - In v1, each withdrawal will still map to **one ERC‑20 transfer tx** via `createWithdrawalTransaction`; we will not introduce a custom batching contract yet.
  - Withdrawals will be grouped **per-chain** (you cannot mix chains in a single tx), but a single run may freely mix **USDC and GHST** withdrawals on the same chain.

- **Onchain contracts and events**
  - There is **no dedicated withdrawal contract** today; we use direct ERC‑20 transfers from the server wallet via Thirdweb Engine (`tx-creator.ts`).
  - For a future optimization, we can introduce a **multicall-style batching contract** to reduce gas and group many transfers in a single tx.
  - There are **no custom per-withdrawal events**; confirmation today is based on the top-level receipt and (optionally) ERC‑20 `Transfer` logs.
  - Long term, if we add a batching contract, we should emit **per-withdrawal events** to make confirmation more robust at the row level.

- **Timeouts**
  - A withdrawal in `withdrawal_pending` that remains unconfirmed for **24 hours** will be treated as permanently failed.
  - This will be implemented as a **per-chain pending-timeout configuration** (starting with Base Mainnet 8453 = 24h), so other chains can override if needed.

- **Security, rate limiting, and pause switches**
  - Batch creation and confirmation checking will both honor **server-side pause flags** (DB-backed or config-backed).
  - These flags will be **visible and toggleable in the admin withdrawals client** so an admin can quickly pause processing without a redeploy.

- **Observability**
  - We should log and/or export metrics for:
    - Counts of withdrawals by status (received / waiting / approved / pending / confirmed / failed / rejected).
    - Number of withdrawals processed per cron run and average time from `withdrawal_waiting` → `withdrawal_confirmed`.
    - Error rates for tx submission and confirmation checks.
  - Optional alerts (Discord/Slack) can be wired to:
    - Repeated batch failures.
    - Large or growing backlog of `withdrawal_approved` or `withdrawal_pending` rows.

---

## Implementation Plan

- **1. Schema and type updates**
  - **DB enum**: Add `withdrawal_approved` to the `token_withdrawal_status` enum via a new migration.
  - Ensure the `token_withdrawals` table already has `withdrawal_approved_at` (it does) and keep `withdrawal_pending_at` / `withdrawal_confirmed_at` unchanged.
  - **Types**: Update `TokenWithdrawalStatus` in:
    - `apps/server/src/lib/db/types.ts`
    - `apps/server/src/lib/db/repos/token-withdrawals.ts`
    - `apps/client/src/types/withdrawals.ts`
    - Any other references that switch on status strings.

- **2. Repository behavior**
  - Update `updateTokenWithdrawalStatus` in `token-withdrawals.ts` so that:
    - When status is `withdrawal_approved`, it sets `withdrawal_approved_at = coalesce(withdrawal_approved_at, now())`.
    - When status is `withdrawal_pending`, it **only** sets `withdrawal_pending_at = now()` and leaves `withdrawal_approved_at` unchanged (no longer coalesced here).
    - When status transitions to `withdrawal_failed` because of a timeout, set a clear `failureReason` (e.g., `pending_timeout_24h`).

- **3. Admin approval route changes**
  - File: `apps/server/src/routes/token-withdrawals.ts`, endpoint `POST /api/admin/withdrawals/:tokenId/approve`.
  - Change behavior from “**approve + immediately broadcast tx**” to “**approve only**”:
    - Keep all **validation** (status check, amount > 0, wallet address validity, token config lookup).
    - Remove the direct call to `createWithdrawalTransaction`.
    - Instead, update the row via `updateTokenWithdrawalStatus` with:
      - `status: 'withdrawal_approved'`
      - (Optionally) normalize and persist `chainId` and `tokenContractAddress` if they are not already set.
    - Response should return the updated withdrawal (now in `withdrawal_approved`), without `txHash`.
  - Update any docs/comments in `withdrawals.md` / `ghst-withdrawals.md` that still state “approve → withdrawal_pending” to match the new flow.

- **4. Batch processing cron (creation phase)**
  - New module (suggested): `apps/server/src/lib/withdrawals/batch-processor.ts`.
  - Implement a function like:
    - `export async function processApprovedWithdrawals(maxPerRun = 100): Promise<void>`.
  - Behavior:
    - Fetch up to `maxPerRun` withdrawals with `status = 'withdrawal_approved'`, ordered by `created_at asc`.
    - Group logically by `chainId` and (optionally) `tokenContractAddress`, but **do not** enforce single-currency-only groups (USDC and GHST can mix per run).
    - For each withdrawal:
      - Call `createWithdrawalTransaction({ to, amount, tokenAddress, chainId })`.
      - On success, update status to `withdrawal_pending` and persist `txHash`, `chainId`, `tokenContractAddress`.
      - On failure:
        - Either keep it in `withdrawal_approved` with an error logged (to allow retry), or
        - Move directly to `withdrawal_failed` with a descriptive `failureReason` (safer but more manual to retry).
    - Respect a **pause flag** (see step 6) to short-circuit if batch processing is disabled.
  - Wire this function into a scheduler:
    - Option A (simple): invoke from an internal `setInterval` (e.g., every 60s) when the server boots (similar to `startWithdrawalTxMonitor`).
    - Option B: expose it behind an authenticated internal route or CLI, and trigger via an external cron (Fly.io, systemd timer, etc.).

- **5. Confirmation checker cron (confirmation phase)**
  - Reuse and extend `checkPendingWithdrawals` in `apps/server/src/lib/withdrawals/tx-monitor.ts`:
    - Keep its core logic (load `withdrawal_pending`, get receipt, set `withdrawal_confirmed` / `withdrawal_failed`).
    - Add a **pending timeout**:
      - If `now - withdrawal_pending_at >= chainTimeout(chainId)` (default 24h on Base), mark as `withdrawal_failed` with `failureReason = 'pending_timeout_24h'` (or similar).
    - Ensure it respects a **“confirmation paused”** flag (see step 6); if paused, the function should exit quickly after reading the flag.
  - Change `startWithdrawalTxMonitor` to run at a **60s interval** (if not already) and to call the updated `checkPendingWithdrawals`.
  - Optionally, if you prefer a “pure cron” model, remove the `setInterval` usage and trigger `checkPendingWithdrawals` from an external scheduler hitting a small internal route.

- **6. Admin-configurable pause switches**
  - Add a simple server-side config store (e.g., a small `withdrawal_settings` table or use an existing key–value config mechanism) with flags:
    - `is_batch_processing_paused` (bool).
    - `is_confirmation_paused` (bool).
  - Expose these via new admin-only routes, e.g.:
    - `GET /api/admin/withdrawals/settings`
    - `POST /api/admin/withdrawals/settings` (to toggle flags).
  - Update `AdminWithdrawalsClient` to:
    - Fetch current flags and display them (e.g., badges or toggles near the top of the page).
    - Allow an admin to pause/resume batch creation and confirmation via these endpoints.

- **7. Admin withdrawals client adjustments**
  - File: `apps/client/src/app/admin/withdrawals/withdrawals-client.tsx`.
  - Keep the **approval UX** (single and bulk approval) but update the mental model:
    - Approve actions now move rows to `withdrawal_approved`; they no longer submit onchain.
    - The existing status badges and filters already support `withdrawal_pending` / `withdrawal_confirmed` / `withdrawal_failed` and can stay as-is.
  - Add:
    - Display of the new pause flags (from step 6) with clear labels (e.g., “Auto-processing: Active/Paused”).
    - Optional: a small note that onchain submission is handled by the cron, not the browser, to clarify behavior for future maintainers.

- **8. Limits, observability, and alerts**
  - Introduce constants/config for:
    - `MAX_WITHDRAWALS_PER_RUN = 100`
    - `PENDING_TIMEOUTS_BY_CHAIN = { 8453: 24 * 60 * 60_000 /* ms */ }` or equivalent in seconds.
  - Add logging around:
    - How many withdrawals each batch run processed.
    - Any failures to submit txs or confirm receipts.
    - Timeouts applied to long-pending withdrawals.
  - Optionally, hook into the existing Discord webhook (used today for success notifications) to:
    - Report repeated batch failures.
    - Report when backlogs exceed configurable thresholds.

- **9. Testing and rollout**
  - Add unit tests for the new status transitions in `token-withdrawals.ts` and for the batch-processor/monitor functions.
  - Gate the behavior behind a DB-backed toggle in `withdrawal_settings` (`is_auto_processing_enabled`):
    - When disabled, approvals continue to submit immediately (`withdrawal_pending`).
    - When enabled, approvals move to `withdrawal_approved` and the cron handles batching.
  - Once verified in staging:
    - Enable the toggle in production via the admin UI.
    - Remove legacy per-approval sending logic once you’re comfortable with the new cron-based system.

- **NEW: Preventing double-spending (implementation steps)**
  - Add a new intermediate state (e.g., `withdrawal_sending`) **or** a `sending_attempt_id` column to mark a row as claimed before broadcasting onchain.
  - Batch processor changes:
    - Inside the DB transaction, select `withdrawal_approved` rows `FOR UPDATE` and immediately update to `withdrawal_sending` (or set `sending_attempt_id`) plus `updated_at`, then commit.
    - Outside that transaction, broadcast the ERC-20 transfer.
    - On success, update the row to `withdrawal_pending` and store `tx_hash`; on failure, set `withdrawal_failed` (or revert to `withdrawal_approved`) with a `failureReason`.
  - Watchdog:
    - Add a small cron/step to detect `withdrawal_sending` rows (or rows with `sending_attempt_id` and no `tx_hash`) that have been stuck for >N minutes and revert them to `withdrawal_approved` with a timeout reason so they can be retried safely.
  - Tests:
    - Unit test that a crash/rollback between “mark sending” and “broadcast” does not double-send, and that the watchdog recovers stranded rows.

---

## Preventing Double-spending

**Problem**: In the batch processor we currently broadcast the onchain transfer before updating the DB row to `withdrawal_pending`. If the server crashes after the broadcast but before the DB transaction commits, Postgres rolls back, leaving the row in `withdrawal_approved` and causing a retry (duplicate transfer) on the next cron run.

**Clean fix (recommended)**:

- Introduce an intermediate, persisted state (e.g., `withdrawal_sending`) or an in-flight marker stored in the DB before calling `createWithdrawalTransaction`.
- Flow:
  1. `WITHDRAWAL_APPROVED` row is selected `FOR UPDATE`.
  2. Update it to `withdrawal_sending` (or set `sending_attempt_id`) and commit.
  3. Outside that transaction, send the onchain tx.
  4. On success, update to `withdrawal_pending` with `tx_hash`. On failure, mark `withdrawal_failed` (or revert to `withdrawal_approved`) with a reason.
  5. Add a watchdog to detect `withdrawal_sending` rows that never got a `tx_hash` within N minutes and revert them for retry.

**Why**: This makes the “I claimed this withdrawal” write crash-safe before any onchain side effect, so a process restart cannot silently replay the same withdrawal and double-send funds.
