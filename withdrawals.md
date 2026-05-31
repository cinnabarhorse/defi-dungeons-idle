# USDC Token Withdrawal System - Implementation Plan

## Overview

This document outlines the implementation strategy for allowing users to withdraw USDC tokens earned in-game (from boss kills, chest opens, etc.) to their onchain wallet addresses.

## Implementation Status

- Completed
  - Database: `token_withdrawals` table and indices created; enum extended with `withdrawal_rejected` (see 20250220_000024 migration)
  - Server
    - Repository with CRUD implemented: `apps/server/src/lib/db/repos/token-withdrawals.ts`
    - Game integration: creation of `token_withdrawals` on USDC earn in `GameRoom.applyInventoryDelta()` with linked `economy_transaction_id`
    - API routes:
      - User: `GET /api/tokens/withdrawals` (returns list + `minWithdrawalAmount`), `POST /api/tokens/withdraw/:tokenId` (min 0.1 USDC enforced)
      - Admin: `GET /api/admin/withdrawals?status=...`, `POST /api/admin/withdrawals/:tokenId/approve`, `POST /api/admin/withdrawals/:tokenId/reject`
      - Admin helpers: `GET /api/admin/games/:gameId`, `GET /api/admin/players/by-id/:id`
    - Onchain submission: `apps/server/src/lib/withdrawals/tx-creator.ts` (Thirdweb Engine server wallet)
  - Client
    - User page: `/me/tokens` (server + client components) with withdrawal request and status display
    - Link added on `/me` to Tokens page
    - Admin page: `/admin/withdrawals` with status filter, approve and reject (reason) actions
    - Link added on Admin index to Token Withdrawals
  - Backfill: `scripts/backfill-token-withdrawals.ts` implemented

- Pending
  - Transaction confirmation monitor (pending → confirmed/failed) job
  - Optional: batch approvals, user/admin notifications

## Current State Analysis

### Token Earning Flow

- USDC tokens are earned through:
  - **Treasure chests**: `rollChestCurrency()` generates USDC amounts, tracked via `loot_distributions` table
  - **Boss kills**: Similar mechanism via `handleEnemyDeath()` in `EnemyDeathSystem.ts`
- Earnings are logged to `economy_transactions` table with:
  - `currency: 'USDC'`
  - `amount`: decimal amount (e.g., 0.1 USDC)
  - `source`: 'treasure_chest', 'boss_kill', etc.
  - `loot_distribution_id`: links to the specific loot distribution

### Database Schema

- **`players` table**: Contains `wallet_address` (text) for onchain wallet
- **`economy_transactions` table**: Tracks all currency transactions (including USDC earnings)
- **`loot_distributions` table**: Tracks individual loot drops with `claimed` boolean and `claim_tx_hash`
- **`payouts` table**: Exists but appears to be for a different purpose (has `amount_base_units`, `currency`, `status` enum)

### Infrastructure

- **Network**: Base Mainnet (Chain ID 8453) - based on topup implementation
- **USDC Address**: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (6 decimals)
- **Admin Pages**: Located at `/admin/*` with wallet-based access control
- **Client Pages**: `/me/*` routes for user-facing pages
- **Onchain Service**: Thirdweb Engine (server wallet-based execution)

## Proposed Flow

### 1. Token Earning (Existing)

- User earns USDC in-game (boss kill, chest open)
- DB records:
  - `economy_transactions` entry (already exists)
  - `loot_distributions` entry (if applicable)
- **New**: Create entry in `token_withdrawals` table with status `'received'`

### 2. User Tokens Page (`/me/tokens`)

- Display all USDC tokens received with status `'received'` or `'withdrawal_waiting'`
- Show: amount, source (boss/chest), date received, status
- "Withdraw" button for tokens with status `'received'`

### 3. Withdraw Request

- User clicks "Withdraw" on a token entry
- API endpoint: `POST /api/tokens/withdraw/:tokenId`
- Status changes: `'received'` → `'withdrawal_waiting'`
- User can see pending withdrawals in the Tokens page

### 4. Admin Approval (`/admin/withdrawals`)

- Admin page lists all withdrawals with status `'withdrawal_waiting'`
- Admin can:
  - View withdrawal details (amount, user wallet, date requested)
  - Approve individual withdrawals
  - Batch approve multiple withdrawals (optional)
- On approval (when auto-processing is enabled via `withdrawal_settings`):
  - Status changes: `'withdrawal_waiting'` → `'withdrawal_approved'`
  - The server stores the resolved `chain_id` / `token_contract_address`
  - No onchain transaction is sent from the browser; the cron job will process it
- When the feature flag is disabled, approval falls back to the legacy flow (`'withdrawal_waiting'` → `'withdrawal_pending'` + broadcast from the route)
- Admins can pause/resume the cron via `/api/admin/withdrawals/settings` (toggled from the UI)

### 5. Transaction Confirmation

- Backend cron responsibilities:
  - **Batch processor**: pulls up to `MAX_WITHDRAWALS_PER_RUN` rows in `'withdrawal_approved'`, submits each transfer via Thirdweb, and updates status to `'withdrawal_pending'` with a `tx_hash`
  - **Confirmation monitor**: polls receipts for `'withdrawal_pending'` rows, marking them `'withdrawal_confirmed'` or `'withdrawal_failed'` (with timeout handling and Discord notifications)
- Pending rows without receipts for 24h are marked `failure_reason = 'pending_timeout_24h'`

## Database Schema

### New Table: `token_withdrawals` (Implemented)

```sql
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'token_withdrawal_status'
  ) then
    create type public.token_withdrawal_status as enum (
      'received',
      'withdrawal_waiting',
      'withdrawal_approved',
      'withdrawal_pending',
      'withdrawal_confirmed',
      'withdrawal_failed',
      'withdrawal_rejected'
    );
  end if;
end $$;

create table if not exists public.token_withdrawals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,

  -- Token details
  currency text not null default 'USDC',
  amount text not null, -- decimal string (e.g., "0.1")
  amount_base_units bigint not null, -- USDC base units (6 decimals)

  -- Source tracking
  source text not null, -- 'boss_kill', 'treasure_chest', etc.
  game_id uuid references public.games(id) on delete set null,
  loot_distribution_id uuid references public.loot_distributions(id) on delete set null,
  economy_transaction_id uuid references public.economy_transactions(id) on delete set null,

  -- Withdrawal flow
  status public.token_withdrawal_status not null default 'received',

  -- Onchain transaction details
  tx_hash text,
  chain_id int8 default 8453, -- Base Mainnet
  token_contract_address text default '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', -- USDC

  -- Timestamps
  received_at timestamptz not null default now(),
  withdrawal_requested_at timestamptz,
  withdrawal_approved_at timestamptz,
  withdrawal_pending_at timestamptz,
  withdrawal_confirmed_at timestamptz,

  -- Failure handling
  failure_reason text,

  -- Metadata
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_token_withdrawals_player_status
  on public.token_withdrawals (player_id, status, created_at desc);

create index if not exists idx_token_withdrawals_status
  on public.token_withdrawals (status, created_at desc);

create index if not exists idx_token_withdrawals_tx_hash
  on public.token_withdrawals (tx_hash)
  where tx_hash is not null;

create unique index if not exists idx_token_withdrawals_tx_hash_unique
  on public.token_withdrawals (tx_hash)
  where tx_hash is not null;

create trigger trg_token_withdrawals_set_updated_at
before update on public.token_withdrawals
for each row execute procedure public.set_updated_at();
```

### Automation Settings

The cron-based workflow reads toggleable flags from `withdrawal_settings`:

```sql
create table if not exists public.withdrawal_settings (
  id smallint primary key default 1,
  is_batch_processing_paused boolean not null default false,
  is_confirmation_paused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger withdrawal_settings_set_updated_at
before update on public.withdrawal_settings
for each row execute function public.set_updated_at();
```

### Relationship to Existing Tables

- **`economy_transactions`**: One-to-one relationship via `economy_transaction_id`
- **`loot_distributions`**: Optional link via `loot_distribution_id`
- **`games`**: Optional link to track which game/run the token was earned in

## Implementation Components

### Backend (Server)

#### 1. Database Repository

**File**: `apps/server/src/lib/db/repos/token-withdrawals.ts` (Implemented)

```typescript
export interface TokenWithdrawalRow {
  id: string;
  player_id: string;
  currency: string;
  amount: string;
  amount_base_units: bigint;
  source: string;
  game_id: string | null;
  loot_distribution_id: string | null;
  economy_transaction_id: string | null;
  status: string;
  tx_hash: string | null;
  chain_id: number | null;
  token_contract_address: string | null;
  received_at: string;
  withdrawal_requested_at: string | null;
  withdrawal_approved_at: string | null;
  withdrawal_pending_at: string | null;
  withdrawal_confirmed_at: string | null;
  failure_reason: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

export type TokenWithdrawalStatus =
  | 'received'
  | 'withdrawal_waiting'
  | 'withdrawal_approved'
  | 'withdrawal_pending'
  | 'withdrawal_confirmed'
  | 'withdrawal_failed'
  | 'withdrawal_rejected';

export interface TokenWithdrawalRecord {
  id: string;
  playerId: string;
  currency: string;
  amount: string;
  amountBaseUnits: bigint;
  source: string;
  gameId: string | null;
  lootDistributionId: string | null;
  economyTransactionId: string | null;
  status: TokenWithdrawalStatus;
  txHash: string | null;
  chainId: number | null;
  tokenContractAddress: string | null;
  receivedAt: string;
  withdrawalRequestedAt: string | null;
  withdrawalApprovedAt: string | null;
  withdrawalPendingAt: string | null;
  withdrawalConfirmedAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// CRUD operations
export async function createTokenWithdrawal(input: {
  playerId: string;
  currency: string;
  amount: string;
  amountBaseUnits: bigint;
  source: string;
  gameId?: string | null;
  lootDistributionId?: string | null;
  economyTransactionId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<TokenWithdrawalRecord>;

export async function getTokenWithdrawalsByPlayer(
  playerId: string,
  status?: TokenWithdrawalStatus
): Promise<TokenWithdrawalRecord[]>;

export async function getTokenWithdrawalsByStatus(
  status: TokenWithdrawalStatus
): Promise<TokenWithdrawalRecord[]>;

export async function updateTokenWithdrawalStatus(input: {
  id: string;
  status: TokenWithdrawalStatus;
  txHash?: string | null;
  failureReason?: string | null;
  chainId?: number | null;
  tokenContractAddress?: string | null;
}): Promise<TokenWithdrawalRecord | null>;
```

#### 2. Token Earning Integration (Implemented)

**File**: `apps/server/src/rooms/GameRoom.ts`

Modify `applyInventoryDelta()` to create `token_withdrawals` entry when USDC is collected:

```typescript
if (resolvedDelta > 0 && typeof sanitizedItem.usdcAmount === 'number') {
  const usdcAmount = Number(sanitizedItem.usdcAmount);
  if (Number.isFinite(usdcAmount) && usdcAmount > 0) {
    const baseUnits = Math.round(usdcAmount * 1_000_000);

    // ... existing code ...

    // Create token_withdrawals entry
    if (playerId && baseUnits > 0) {
      try {
        await tokenWithdrawalsRepo.createTokenWithdrawal({
          playerId,
          currency: 'USDC',
          amount: usdcAmount.toString(),
          amountBaseUnits: BigInt(baseUnits),
          source: lootSource,
          gameId: this.currentGameId ?? null,
          lootDistributionId: distributionId ?? undefined,
          economyTransactionId,
          metadata: {
            entityId: options.entityId,
            mappedPlayerId,
          },
        });
      } catch (error) {
        console.error('Failed to create token withdrawal record', error);
        // Don't fail the whole operation
      }
    }
  }
}
```

**Note**: `logEconomyTransaction()` may need to return the created transaction ID for linking.

#### 3. API Routes (Implemented)

**File**: `apps/server/src/routes/token-withdrawals.ts`

```typescript
// GET /api/tokens/withdrawals
// List user's token withdrawals (returns minWithdrawalAmount)
app.get('/api/tokens/withdrawals', async (req, res) => {
  const resolved = await resolveSessionFromRequest(req);
  if (!resolved?.playerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const status = req.query.status as TokenWithdrawalStatus | undefined;
  const withdrawals = await tokenWithdrawalsRepo.getTokenWithdrawalsByPlayer(
    resolved.playerId,
    status
  );

  res.json({ withdrawals, minWithdrawalAmount: 0.1 });
});

// POST /api/tokens/withdraw/:tokenId
// Request withdrawal (enforces minimum withdrawal amount)
app.post('/api/tokens/withdraw/:tokenId', async (req, res) => {
  const resolved = await resolveSessionFromRequest(req);
  if (!resolved?.playerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { tokenId } = req.params;
  const withdrawal = await tokenWithdrawalsRepo.getTokenWithdrawalById(tokenId);

  if (!withdrawal || withdrawal.playerId !== resolved.playerId) {
    return res.status(404).json({ error: 'Token withdrawal not found' });
  }

  if (withdrawal.status !== 'received') {
    return res
      .status(400)
      .json({ error: 'Token already withdrawn or invalid status' });
  }

  // Enforce minimum of 0.1 USDC (100_000 base units)
  if ((withdrawal.amountBaseUnits as unknown as bigint) < 100000n) {
    return res.status(400).json({
      error: 'Minimum withdrawal amount is 0.1 USDC',
      minWithdrawalAmount: 0.1,
    });
  }

  const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
    id: tokenId,
    status: 'withdrawal_waiting',
  });

  res.json({ withdrawal: updated });
});

// Admin: GET /api/admin/withdrawals?status=withdrawal_waiting
// List withdrawals for a given status (defaults to waiting)
app.get('/api/admin/withdrawals', async (req, res) => {
  // Check admin wallet allowlist
  const resolved = await resolveSessionFromRequest(req);
  if (!isAdminWallet(resolved?.address)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const status =
    (req.query.status as TokenWithdrawalStatus) || 'withdrawal_waiting';
  const withdrawals =
    await tokenWithdrawalsRepo.getTokenWithdrawalsByStatus(status);

  // Include player wallet address for each withdrawal
  const withdrawalsWithWallets = await Promise.all(
    withdrawals.map(async (w) => {
      const player = await playersRepo.getPlayerById(w.playerId);
      return {
        ...w,
        playerWalletAddress: player?.walletAddress ?? null,
      };
    })
  );

  res.json({ withdrawals: withdrawalsWithWallets, status });
});

// Admin: POST /api/admin/withdrawals/:tokenId/approve
// Approve withdrawal and create onchain transaction
app.post('/api/admin/withdrawals/:tokenId/approve', async (req, res) => {
  // Check admin wallet allowlist
  const resolved = await resolveSessionFromRequest(req);
  if (!isAdminWallet(resolved?.address)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { tokenId } = req.params;
  const withdrawal = await tokenWithdrawalsRepo.getTokenWithdrawalById(tokenId);

  if (!withdrawal || withdrawal.status !== 'withdrawal_waiting') {
    return res.status(400).json({ error: 'Invalid withdrawal status' });
  }

  // Get player wallet address
  const player = await playersRepo.getPlayerById(withdrawal.playerId);
  if (!player?.walletAddress) {
    return res.status(400).json({ error: 'Player wallet address not found' });
  }

  const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
  const resolvedChainId = withdrawal.chainId ?? tokenConfig.defaultChainId;
  const resolvedTokenAddress =
    withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress;

  const settings = await withdrawalSettingsRepo
    .getSettings()
    .catch(() => null);
  const autoProcessingEnabled =
    settings?.isAutoProcessingEnabled ?? false;

  if (autoProcessingEnabled) {
    const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
      id: tokenId,
      status: 'withdrawal_approved',
      chainId: resolvedChainId,
      tokenContractAddress: resolvedTokenAddress,
    });
    return res.json({ withdrawal: updated, mode: 'queued' });
  }

  const { txHash, chainId, tokenAddress } = await createWithdrawalTransaction({
    to: player.walletAddress,
    amount: withdrawal.amountBaseUnits,
    tokenAddress: resolvedTokenAddress,
    chainId: resolvedChainId,
  });

  const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
    id: tokenId,
    status: 'withdrawal_pending',
    txHash,
    chainId,
    tokenContractAddress: tokenAddress,
  });

  res.json({ withdrawal: updated, txHash });
});

// Admin: POST /api/admin/withdrawals/:tokenId/reject
// Reject a waiting withdrawal with a required reason
app.post('/api/admin/withdrawals/:tokenId/reject', async (req, res) => {
  // Check admin wallet allowlist
  const resolved = await resolveSessionFromRequest(req);
  if (!isAdminWallet(resolved?.address)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { tokenId } = req.params;
  const { reason } = (req.body || {}) as { reason?: string };
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Rejection reason is required' });
  }

  const withdrawal = await tokenWithdrawalsRepo.getTokenWithdrawalById(tokenId);
  if (!withdrawal || withdrawal.status !== 'withdrawal_waiting') {
    return res.status(400).json({ error: 'Invalid withdrawal status' });
  }

  const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
    id: tokenId,
    status: 'withdrawal_rejected',
    failureReason: reason.trim(),
  });

  res.json({ withdrawal: updated });
});
```

#### 4. Onchain Transaction Creation (Implemented - Thirdweb Engine)

**File**: `apps/server/src/lib/withdrawals/tx-creator.ts`

```typescript
export interface CreateWithdrawalTransactionInput {
  to: string;
  amount: bigint; // base units
  tokenAddress?: string; // defaults to USDC on Base
  chainId?: number; // defaults to 8453 (Base)
}

export interface CreateWithdrawalTransactionResult {
  txHash: string;
  chainId: number;
  tokenAddress: string;
}

// Implementation uses Thirdweb Engine with a configured server wallet.
// No raw private key is loaded in the application.
export async function createWithdrawalTransaction(
  input: CreateWithdrawalTransactionInput
): Promise<CreateWithdrawalTransactionResult> {
  const engineUrl = process.env.THIRDWEB_ENGINE_URL!; // e.g. https://engine.example.com
  const accessToken = process.env.THIRDWEB_ENGINE_ACCESS_TOKEN!;
  const fromAddress = process.env.THIRDWEB_SERVER_WALLET!; // 0x... server wallet

  const chainId = input.chainId ?? 8453;
  const token =
    input.tokenAddress ?? '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

  const res = await fetch(
    `${engineUrl}/contract/${chainId}/${token}/erc20/transfer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromAddress,
        toAddress: input.to,
        amount: input.amount.toString(), // base units
      }),
    }
  );

  if (!res.ok) {
    const msg = await res.text().catch(() => 'Engine transfer failed');
    throw new Error(msg);
  }

  const payload = (await res.json()) as { transactionHash: string };
  return {
    txHash: payload.transactionHash,
    chainId,
    tokenAddress: token,
  };
}
```

#### 5. Transaction Confirmation Monitor (Pending)

**File**: `apps/server/src/lib/withdrawals/tx-monitor.ts`

```typescript
// TODO: Implement a periodic job to check pending withdrawals and mark
//       them as confirmed or failed based on transaction receipt.
```

### Frontend (Client)

#### 1. Tokens Page (Implemented)

**File**: `apps/client/src/app/me/tokens/page.tsx`

```typescript
export default async function TokensPage() {
  // Server component - fetch initial data
  const withdrawals = await fetchTokenWithdrawals();

  return (
    <main className="...">
      <TokensClient initialWithdrawals={withdrawals} />
    </main>
  );
}
```

**File**: `apps/client/src/app/me/tokens/tokens-client.tsx`

```typescript
'use client';

export function TokensClient({ initialWithdrawals }: Props) {
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);

  const handleWithdraw = async (tokenId: string) => {
    const res = await fetch(`/api/tokens/withdraw/${tokenId}`, {
      method: 'POST',
    });
    const data = await res.json();
    // Update local state
    setWithdrawals((prev) =>
      prev.map((w) => (w.id === tokenId ? data.withdrawal : w))
    );
  };

  return (
    <div>
      <h1>My Tokens</h1>
      <div>
        {withdrawals.map((w) => (
          <div key={w.id}>
            <div>{w.amount} {w.currency}</div>
            <div>Source: {w.source}</div>
            <div>Status: {w.status}</div>
            {w.status === 'received' && (
              <button onClick={() => handleWithdraw(w.id)}>
                Withdraw
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 2. Add Link to Me Page (Implemented)

**File**: `apps/client/src/app/me/view.tsx`

Add new link:

```typescript
<Link href="/me/tokens" className="...">
  <span className="...">
    <Coins className="h-5 w-5 text-white/70" />
  </span>
  <div className="flex-1">
    <div className="text-sm font-medium">Tokens</div>
    <div className="text-xs text-white/60">View and withdraw USDC</div>
  </div>
  <ChevronRight className="h-4 w-4 text-white/50" />
</Link>
```

#### 3. Admin Withdrawals Page (Implemented)

**File**: `apps/client/src/app/admin/withdrawals/page.tsx`

```typescript
export default async function AdminWithdrawalsPage() {
  // Server component - fetch initial data
  const withdrawals = await fetchAdminWithdrawals();

  return (
    <main className="...">
      <AdminWithdrawalsClient initialWithdrawals={withdrawals} />
    </main>
  );
}
```

**File**: `apps/client/src/app/admin/withdrawals/withdrawals-client.tsx`

```typescript
'use client';

export function AdminWithdrawalsClient({ initialWithdrawals }: Props) {
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);

  const handleApprove = async (tokenId: string) => {
    const res = await fetch(`/api/admin/withdrawals/${tokenId}/approve`, {
      method: 'POST',
    });
    const data = await res.json();
    // Update local state
    setWithdrawals((prev) =>
      prev.map((w) => (w.id === tokenId ? data.withdrawal : w))
    );
  };

  return (
    <div>
      <h1>Pending Withdrawals</h1>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Amount</th>
            <th>Source</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {withdrawals.map((w) => (
            <tr key={w.id}>
              <td>{w.playerWalletAddress}</td>
              <td>{w.amount} {w.currency}</td>
              <td>{w.source}</td>
              <td>{w.status}</td>
              <td>
                {w.status === 'withdrawal_waiting' && (
                  <button onClick={() => handleApprove(w.id)}>
                    Approve
                  </button>
                )}
                {w.txHash && (
                  <a href={`https://basescan.org/tx/${w.txHash}`} target="_blank">
                    View TX
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- Notes (Implemented):
  - Status filter via query param to server (`?status=`)
  - Approve action queues rows (`withdrawal_waiting` → `withdrawal_approved`) when auto-processing is enabled, or submits immediately (`→ withdrawal_pending`) when disabled
  - Reject action with required reason moves to `withdrawal_rejected`
  - Basescan link shown when `txHash` exists

#### 4. Add Link to Admin Index (Implemented)

**File**: `apps/client/src/app/admin/page.tsx`

Add new link:

```typescript
<Link href="/admin/withdrawals" className="...">
  <div className="text-lg font-semibold">Token Withdrawals</div>
  <div className="text-sm text-slate-400">
    Approve and process USDC withdrawals
  </div>
</Link>
```

## Questions & Decisions Needed

### 1. Aggregation vs Individual Withdrawals

**Question**: Should users be able to:

- A) Withdraw each USDC earning individually (multiple small withdrawals)
- B) Aggregate multiple earnings into a single withdrawal request (one withdrawal per approval)

**Recommendation**: Option A (individual withdrawals) for simplicity and transparency. Users can see exactly what they're withdrawing and when. Admin can batch approve if needed.

**Decision (Implemented)**: A — individual withdrawals per earning.

### 2. Minimum Withdrawal Amount

**Question**: Is there a minimum withdrawal amount (e.g., 0.1 USDC, 1 USDC)?

**Recommendation**: Set a minimum (e.g., 0.1 USDC) to avoid gas costs exceeding withdrawal value. Enforce in the withdraw request endpoint.

**Decision (Implemented)**: Minimum 0.1 USDC enforced by server.

### 3. Gas Costs

**Question**: Who pays for gas costs?

- A) User (deducted from withdrawal amount)
- B) Game treasury (covered by admin wallet)

**Recommendation**: Option B (game treasury) for better UX. Consider implementing Option A later if gas costs become significant.

**Decision (Implemented)**: B — paid by admin wallet.

### 4. Wallet Address Management

**Question**: Should users be able to change withdrawal address, or must it match their `players.wallet_address`?

**Recommendation**: Use `players.wallet_address` for security. If users want to change, they need to update their wallet address first (potentially requiring re-authentication).

**Decision (Implemented)**: Uses `players.wallet_address` only.

### 5. Transaction Monitoring

**Question**: How should we monitor pending transactions?

- A) Polling via scheduled job (every 30s-1min)
- B) Webhook from Alchemy/Infura
- C) Event listener via ethers provider

**Recommendation**: Start with Option A (polling) for simplicity. Option C (event listener) is more efficient but requires persistent connection.

**Status (Pending)**: Not implemented yet. Plan to use polling job.

### 6. Failure Handling

**Question**: What happens if a transaction fails?

- A) Retry automatically
- B) Mark as failed and allow admin to retry manually
- C) Auto-refund to user's in-game balance

**Recommendation**: Option B (manual retry) for safety. Admin can investigate and retry or refund as needed.

**Status (Partially Implemented)**: Admin rejection with reason supported (`withdrawal_rejected`). Manual retry flow TBD.

### 7. Existing Token Earnings

**Question**: Should we backfill `token_withdrawals` entries for existing USDC earnings in `economy_transactions`?

**Recommendation**: Yes, create a migration script to backfill existing USDC transactions. This allows users to withdraw previously earned tokens.

**Decision (Implemented)**: Backfill script added at `scripts/backfill-token-withdrawals.ts`.

### 8. Multi-Token Support

**Question**: Should this system support other tokens (GHST, etc.) or only USDC initially?

**Recommendation**: Start with USDC only. The schema already supports multiple currencies via `currency` field, so extension is straightforward.

**Decision (Implemented)**: USDC only for now.

## Implementation Phases

### Phase 1: Database & Backend Core (Completed)

1. Create database migration for `token_withdrawals` table
2. Create repository (`token-withdrawals.ts`)
3. Integrate token withdrawal creation into `applyInventoryDelta()`
4. Create API routes for user withdrawal requests
5. Add TypeScript types

### Phase 2: Frontend Tokens Page (Completed)

1. Create `/me/tokens` page
2. Add link to `/me` navigation
3. Implement withdrawal request UI
4. Display withdrawal status

### Phase 3: Admin Approval System (Completed)

1. Create `/admin/withdrawals` page
2. Implement admin API routes
3. Add admin wallet allowlist check
4. Create withdrawal approval UI

### Phase 4: Onchain Integration (Partially Completed)

1. Implement transaction creation (`tx-creator.ts` via Thirdweb Engine)
2. Set up Thirdweb Engine env and server wallet address
3. Implement transaction monitoring (`tx-monitor.ts`) — Pending
4. Test end-to-end flow

### Phase 5: Backfill & Polish (Partially Completed)

1. Create backfill script for existing USDC earnings — Completed
2. Add error handling and retry logic — Partial (admin rejection implemented)
3. Add transaction status notifications — Pending
4. Add transaction history/details view — Pending

#### Backfill Script

- `scripts/backfill-token-withdrawals.ts` backfills `token_withdrawals` rows from historical `game_players` / `run_scores` data.
- Usage:
  ```bash
  pnpm --filter @gotchiverse/server exec tsx ../../scripts/backfill-token-withdrawals.ts 0xc3c2e1cf099bc6e1fa94ce358562bcbd5cc59fe5
  ```
- Options:
  - Provide wallet address as argument (case-insensitive).
  - Or set `BACKFILL_WALLET` env var before running.
- Script behavior:
  - Loads env files with same precedence as the server.
  - Finds the `players` row by wallet.
  - Scans `game_players` joined with `run_scores` for positive `usdc_earned_base_units`.
  - Skips any game already represented in `token_withdrawals`.
  - Inserts `token_withdrawals` entries with source `backfill_game_run`, status `received`, and backfill metadata (game/run IDs).
  - Prints inserted withdrawal IDs plus any skipped games.

## Testing Considerations

1. **Unit Tests**: Repository functions, status transitions
2. **Integration Tests**: API endpoints, transaction creation
3. **E2E Tests**: Withdrawal flow from user request to admin approval
4. **Testnet Testing**: Deploy to Base Sepolia for testing before mainnet

## Security Considerations

1. **Server Wallet**: Use Thirdweb Engine with access token; do not store raw private keys in the application
2. **Rate Limiting**: Prevent spam withdrawal requests
3. **Amount Validation**: Ensure withdrawal amount doesn't exceed available balance
4. **Double Spending**: Ensure each `token_withdrawal` can only be withdrawn once
5. **Access Control**: Verify admin wallet allowlist on all admin endpoints
6. **Transaction Verification**: Verify transaction success before marking as confirmed

## Environment Variables Needed

```bash
# Thirdweb Engine (server wallet)
THIRDWEB_ENGINE_URL=https://<your-engine-host>
THIRDWEB_ENGINE_ACCESS_TOKEN=<engine_access_token>
THIRDWEB_SERVER_WALLET=0x9257b9Ed3F0911bD3B80f81d1c46381b3Eb7bd63

# RPC providers (optional if your app needs direct RPC elsewhere)
BASE_RPC_URL=<alchemy_or_infura_url>

# Admin wallet allowlist (comma-separated, lowercase)
ADMIN_WALLET_ALLOWLIST=<wallet1,wallet2>
```

## Migration Order

1. Database migration for `token_withdrawals` table
2. Backfill existing USDC earnings (optional but recommended)
3. Deploy backend changes
4. Deploy frontend changes
5. Set up admin wallet and environment variables
6. Test with small amounts first
