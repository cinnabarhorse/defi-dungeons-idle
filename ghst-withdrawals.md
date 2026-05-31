## GHST Token Withdrawals — Implementation Plan

### Objective

Enable users to request and receive GHST withdrawals, mirroring the existing USDC withdrawals flow, with correct decimals, chain, and monitoring support.

### Current USDC Flow (reference)

- Data model: `token_withdrawals` table tracks currency, base units, status, tx hash, chain id, token address.
- Creation: On pickup of USDC in `GameRoom.applyInventoryDelta()`, we log an economy transaction and insert a `token_withdrawals` row with `currency='USDC'` and `amount_base_units` (6 decimals).
- Request: User calls `POST /api/tokens/withdraw/:tokenId` → status `received` → `withdrawal_waiting` with min-amount check.
- Approve: Admin calls `POST /api/admin/withdrawals/:tokenId/approve` → when auto-processing is enabled in `withdrawal_settings`, the row moves to `withdrawal_approved` (queued for the cron); otherwise it broadcasts immediately and updates status to `withdrawal_pending` with `tx_hash`, `chain_id`, and `token_contract_address`.
- Confirm: Background monitor polls for receipts on Base, marking `withdrawal_confirmed` or `withdrawal_failed`.
- Admin UI: `/admin/withdrawals` lists requests and performs approvals; wallet balance helper shows ETH, USDC, and optional GHST balances for the server wallet.

Key files:

- Server routes: `apps/server/src/routes/token-withdrawals.ts`
- Server tx submit: `apps/server/src/lib/withdrawals/tx-creator.ts`
- Server monitor: `apps/server/src/lib/withdrawals/tx-monitor.ts`
- Creation site: `apps/server/src/rooms/GameRoom.ts`
- Repo/types: `apps/server/src/lib/db/repos/token-withdrawals.ts`, `apps/server/src/lib/db/types.ts`
- Admin UI: `apps/client/src/app/admin/withdrawals/withdrawals-client.tsx`

### What changes for GHST

GHST uses 18 decimals and will be sent on Base (chainId 8453). The platform already supports a generic multi-token `token_withdrawals` row; we primarily need to:

1. Create GHST `token_withdrawals` rows when GHST is earned

- Where: `apps/server/src/rooms/GameRoom.ts` in `applyInventoryDelta()` alongside the existing USDC block.
- Logic:
  - When `sanitizedItem.ghstAmount` is present and `> 0`, compute `baseUnits = ghstAmount * 10^18` (round to bigint, preserve fraction in `amount` string).
  - Log an economy transaction with `currency='GHST'`, `amount=ghstAmount`.
  - Insert `token_withdrawals` row:
    - `currency='GHST'`
    - `amount` (decimal string)
    - `amount_base_units` (bigint, 18 decimals)
    - `source`, `game_id`, `loot_distribution_id`, `economy_transaction_id`, `metadata` (include `ghstAmount`, `ghstBaseUnits`, decimals=18).
- Set defaults for `chain_id` and `token_contract_address` now (Base + GHST address `0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB`) to simplify approval later.

2. Enforce GHST-specific minimum withdrawal amounts

- Server route `POST /api/tokens/withdraw/:tokenId` currently enforces a USDC minimum only.
- Add per-currency thresholds (example defaults, subject to your decision):
  - USDC: 0.1 (already implemented)
  - GHST: 0.1
- Return a map in `GET /api/tokens/withdrawals`:
  - `minWithdrawalAmountByCurrency: { USDC: 0.1, GHST: 0.1 }`
  - Keep `minWithdrawalAmount` for backward-compat (USDC).

3. Admin approval: choose correct chain and token for GHST

- `apps/server/src/routes/token-withdrawals.ts` → approval endpoint:
  - Use the stored `chainId` and `tokenContractAddress` set at creation for GHST rows.
  - Fallback only if missing: set `chainId = 8453` (Base) and `tokenAddress = 0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB`.
  - Continue using `createWithdrawalTransaction({ to, amount, tokenAddress, chainId })`.

4. Multi-chain transaction monitoring

- Base-only: no multi-chain changes required. Ensure GHST withdrawals carry `chain_id=8453`; the existing monitor will poll and confirm on Base.

5. Admin wallet balances endpoint

- Today the balances endpoint reads everything from the Base provider.
- Keep endpoint Base-only and show GHST using `0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB` on Base.

6. Client updates

- User `/me/tokens` page: already lists withdrawals with `currency`; ensure CTA and min error messages reference per-currency thresholds.
- Admin `/admin/withdrawals`:
  - Replace any USDC-specific copy with token-agnostic copy.
  - Add a `currency` filter and show `chainId`/`tokenContractAddress` columns by default.
  - Confirm the approve flow works when `currency='GHST'` (no UI change expected if API returns values correctly).

7. Environment variables

- Thirdweb (unchanged):
  - `THIRDWEB_SECRET_KEY`
  - `THIRDWEB_SERVER_WALLET` (must hold GHST on the chosen chain)
  - `THIRDWEB_TRANSACTIONS_URL` (if using Thirdweb Transactions API)
- RPC:
  - `BASE_RPC_URL` (existing)
- Contracts:
  - `USDC_CONTRACT_ADDRESS_BASE` (existing default baked in; override optional)
  - GHST on Base is hardcoded to `0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB` (no env needed)

8. Backfill (optional)

- If historical GHST earnings exist and should be withdrawable, run `scripts/backfill-ghst-token-withdrawals.ts`:
  - Single player: `pnpm --filter @gotchiverse/server exec tsx ../../scripts/backfill-ghst-token-withdrawals.ts 0xPlayerWallet`
  - All players: add `--all` (optionally combine with `--dry-run` to preview insert counts).
  - The script sources amounts from `economy_transactions` rows where `currency='GHST'`, computes base units with 18 decimals, and inserts `token_withdrawals` rows with status `received`.
  - Chain ID and the Base GHST contract address are stored on each inserted record to keep the approval flow consistent.
  - This enables retroactive withdrawals for GHST rewards earned before the new pipeline went live.

### Detailed change list (by file)

- Server (creation)
  - `apps/server/src/rooms/GameRoom.ts`:
    - Mirror the USDC block for GHST (`sanitizedItem.ghstAmount`):
      - Convert to 18-decimal base units
      - Log economy transaction `currency='GHST'`
      - Insert `token_withdrawals` with `currency='GHST'`
      - Set `chain_id=8453` and `token_contract_address` on insert (Base + GHST)
- Server (API)
  - `apps/server/src/routes/token-withdrawals.ts`:
    - `GET /api/tokens/withdrawals`: return `minWithdrawalAmountByCurrency`
    - `POST /api/tokens/withdraw/:tokenId`: enforce per-currency min thresholds and currency-specific error messages
    - `POST /api/admin/withdrawals/:tokenId/approve`: use stored `chainId`/`tokenContractAddress`; fallback to Base GHST address if missing
    - `/api/admin/withdrawals/wallet-balances`: Base-only; show GHST via hardcoded Base address
- Server (tx submit/monitor)
  - `apps/server/src/lib/withdrawals/tx-creator.ts`:
    - No change required; pass `tokenAddress` + `chainId`
  - `apps/server/src/lib/withdrawals/tx-monitor.ts`:
    - No change; Base-only monitoring suffices
- Server (types/repo)
  - `apps/server/src/lib/db/repos/token-withdrawals.ts`:
    - No schema change required; ensure create helper accepts GHST and optional defaults for chain/address
- Client
  - `apps/client/src/app/me/tokens/*`:
    - Use `minWithdrawalAmountByCurrency` for CTA enable/error text
  - `apps/client/src/app/admin/withdrawals/withdrawals-client.tsx`:
    - Generalize any USDC copy; add currency filter; display `chainId` and `tokenContractAddress`
- Docs
  - Add GHST addresses, chain IDs, and env var examples to project docs/readme as needed.

### Environment examples

```bash
# Thirdweb (server wallet)
THIRDWEB_SECRET_KEY=...
THIRDWEB_SERVER_WALLET=0xYourServerWallet
THIRDWEB_TRANSACTIONS_URL=https://api.thirdweb.com/v1/transactions

# RPC
BASE_RPC_URL=https://mainnet.base.org

# Contracts
# USDC on Base (default already in code): 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
USDC_CONTRACT_ADDRESS_BASE=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
# GHST on Base is hardcoded in code: 0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB
```

### Rollout plan

1. Configure env vars (server wallet funded with GHST on Base).
2. Implement server creation and API changes (GHST creation + per-currency thresholds).
3. Ensure monitor operates on Base (no multi-chain changes).
4. Update client pages to use `minWithdrawalAmountByCurrency` and generic copy.
5. Deploy; test a small GHST withdrawal end-to-end.
6. Backfill GHST where applicable and announce.

### Risks and mitigations

- Wrong chain or token address → add currency→chain/token mapping and defaults; bake in safe defaults but prefer env overrides.
- Decimal conversion errors → centralize per-currency decimals and reuse for both creation and display.
- Gas spikes or slow confirmations → monitor and surface status in admin UI; keep manual retry flow.
- Insufficient server wallet balance → show balances to admins; add clear failure messages on approve.

### Decisions

- Chain: Base only (chainId 8453).
- Minimum GHST withdrawal amount: 0.1 GHST.
- Set `chain_id` and `token_contract_address` at creation for GHST rows.
- Admin wallet balances: Base-only.
- Admin UI: Show currency filter and `chainId`/`tokenContractAddress` columns by default.
- Backfill: Yes (for historical GHST earnings).
- Rollout: Go live immediately after deploy (no feature flag).
