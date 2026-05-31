## Top-up (Onchain Deposit) – Implementation Plan

### Scope

- **Client**: Enable deposits of USDC and GHO on Base to the GamePoints diamond contract, with allowance handling, deposit execution, and immediate persistence of a pending record in Supabase.
- **Backend**: Listen to onchain events to confirm deposits and update Supabase.
- **UX**: Show Pending → Confirmed/Failed status and display unlock time (30 days) in Deposit History.

### Network and Contracts

- **Network**: Base Mainnet (Chain ID 8453)
- **Diamond (GamePoints) Address**: `0xb27fa55e15be89e69b9e5babcfb30a8f67ad92a0`
- **Supported Tokens**:
  - **USDC**: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (6 decimals)
  - **GHO**: `0x6Bb7a212910682DCFdbd5BCBb3e28FB4E8da10Ee` (18 decimals)

### ABI and Targets

- **Function** (called by client on submit):
  - `deposit(address token, uint256 amount, uint256 minAmountOut, uint256 deadline, bool autoRenew)` → returns `depositId (uint256)`
- **Event** (consumed by backend):
  - `Deposited(address user, uint256 depositId, address depositToken, uint256 depositAmount, uint256 yieldAmount, uint256 pointsMinted, uint64 unlockAt)`
- Useful reads (later): `getUserDeposits(address)`, `lockDuration()`

### End-to-End Flow

1. User selects token and amount in `apps/client/src/components/topup/topup-form.tsx`.
2. Client checks current allowance and submits `approve(token, spender=Diamond, amount)` if needed.
3. Client submits `deposit(token, amount, minAmountOut, deadline, autoRenew)`, writes a "pending" record to Supabase with tx hash, and shows pending UI.
4. Backend webhook/consumer listens for `Deposited` on Base (via Alchemy webhooks), updates the record to "confirmed" after finality, and persists onchain amounts and `unlockAt`.
5. Deposit History lists the transaction and the unlock time (~30 days). If needed, withdraw becomes available when current time ≥ `unlockAt`.

### Parameter Derivation

- **amount**: parsed from user input with correct decimals per token.
- **minAmountOut** (slippage control for internal swap):
  - Compute via a backend quote endpoint and apply a maximum slippage of **0.5% (50 bps)** to derive `minAmountOut`.
  - The backend returns the recommended `minAmountOut` given `(token, amount_wei)`.
- **deadline**: `now + 20 minutes` (unix seconds) to avoid stuck orders.
- **autoRenew**: from the UI checkbox.

### Supabase Data Model

Proposed `deposits` table fields (store big integers as text/numeric to avoid JS precision loss):

- **id**: uuid (PK)
- **user_id**: uuid (FK to application user/profile; links wallet to internal account)
- **chain_id**: int8 (e.g., 8453)
- **contract_address**: text
- **depositor_address**: text
- **token_address**: text
- **token_symbol**: text ("USDC" | "GHO")
- **amount**: text (user-entered decimal string)
- **amount_wei**: text (onchain integer)
- **tx_hash**: text (nullable until broadcast)
- **tx_status**: text enum ("pending" | "confirmed" | "failed")
- **deposit_id**: text (onchain `depositId`)
- **yield_amount**: text (from `yieldAmount`)
- **points_minted**: text (from `pointsMinted`)
- **unlock_at**: timestamptz (from `unlockAt` seconds)
- **auto_renew**: boolean
- **expires_at**: timestamptz (pending timeout threshold; default now() + 24 hours)
- **created_at**: timestamptz default now()
- **updated_at**: timestamptz default now()

Indexes:

- Unique partial on `tx_hash` where not null
- `(depositor_address, created_at desc)`
- Optional: `deposit_id`
- Optional: `user_id`

### Field Mapping to Requested Items

- **deposit uuid** → `id`
- **deposit tx hash** → `tx_hash`
- **depositor** → `depositor_address` (and `user_id` for internal linkage)
- **deposit amount** → `amount` (decimal string) and `amount_wei`
- **deposit token** → `token_address` (+ `token_symbol`)
- **swapAmount (yieldAmount)** → `yield_amount`
- **unlockTime (timestamp)** → `unlock_at`
- **autoRenew** → `auto_renew`

### Backend Event Consumer/Webhook

- Use **Alchemy webhooks** to subscribe to `Deposited` events on Base for the diamond address.
- On each event:
  - Extract: `user`, `depositId`, `depositToken`, `depositAmount`, `yieldAmount`, `pointsMinted`, `unlockAt`.
  - Correlate with the pending record via `tx_hash` from receipt if available, else `(user, depositId)` fallback.
  - Wait for finality of **5 blocks** before marking as credited.
  - Update record: set `tx_status = confirmed`, fill amounts, set `unlock_at`, and persist `deposit_id`.
  - Persist `points_minted` for audit only (no in-game balance updates).
- Background sweeper: mark any `pending` deposits as `failed` if `expires_at < now()` (default 24 hours without confirmation), and notify the user.

### Client Responsibilities

- Ensure wallet is on Base mainnet; prompt to switch if not.
- Compute `amount_wei` with correct token decimals.
- Check allowance; if insufficient, send `approve` before `deposit`.
- Prefer **exact-amount approvals** (no unlimited approvals). If smart accounts are present, attempt to batch approve+deposit.
- After `deposit` is broadcast, write a pending Supabase row including `tx_hash` and `user_id`.
- Subscribe to **Supabase Realtime** updates:
  - Add a `deposits` subscription scoped to the current user (`user_id` or `depositor_address`) to live-update Deposit History (pending → confirmed/failed) without polling.
- Fallback to periodic refetch when Supabase env vars are not configured.

### Realtime Updates

- **Players stream** (already implemented): subscribe to `public.players` for the current `playerId`. On changes, re-fetch `/api/player` to update preferences.
- **Deposits stream** (to implement): subscribe to `public.deposits` filtered by `user_id` (preferred) or `depositor_address`. On INSERT/UPDATE, refresh the local deposits list and statuses. Handle channel errors gracefully and back off to timed refetch.
- **Security**: ensure RLS policies only expose a user’s own rows. Enable Realtime replication for `players` and `deposits`.

### Security & Validation

- Restrict tokens to the supported map.
- Ensure `spender` equals the diamond address.
- Sanity-check `amount` range (use existing `AMOUNT_MIN`/`AMOUNT_MAX`).
- Use `deadline` to mitigate stale swaps.
- Verify webhook authenticity (Alchemy signatures) and cross-check with RPC/receipt as needed; handle reorgs with finality depth = 5.
- Backend should ensure `depositor_address` is owned by `user_id` (prevent attribution to the wrong account).

### Deposit History UX

- Per row: token, amount, status, `tx_hash` (BaseScan link), `unlock_at` (timestamp + relative countdown), `auto_renew`.
- Use Supabase Realtime to update rows in-place on event-driven changes; fall back to refetch on errors.

### Decisions (Resolved)

- **minAmountOut**: derive via backend quote with maximum slippage of **0.5% (50 bps)**.
- **Finality depth**: **5 blocks** on Base before marking deposits as credited.
- **Event ingestion**: **Alchemy webhooks**.
- **Identity linkage**: store **`user_id`** alongside `depositor_address`.
- **Points minted**: retained for audit only (no in-game balance).
- **Timeouts**: mark `pending` as `failed` after **24 hours** without confirmation.
- **Approvals**: **exact amount** approvals; batch approve+deposit when smart accounts are available.
- **Limits**: enforced **on the smart contract** (no extra server caps beyond UI validation).
- **Unlock display**: standard timestamp + relative time (no special TZ requirements).
- **Post-deposit controls**: `setAutoRenew` already supported in UI.

### Rollout Checklist

- Implement backend quote endpoint to compute `minAmountOut` with 50 bps slippage cap.
- Add Supabase migration for `deposits` table (including `user_id`, `expires_at`) and indexes.
- Configure Alchemy webhooks for `Deposited` and implement the event handler with 5-block finality + idempotent deposit updates.
- Implement client approval + deposit flow and pending DB write (with `user_id`).
- Implement **Realtime deposits stream** on the client; keep the players stream for preferences only.
- Add background sweeper to mark 24h-expired pendings as failed and notify users.
- Build Deposit History view with live updates.
- Test end-to-end on Base with a test wallet; verify statuses, minAmountOut behavior, live updates, and unlock timing.
