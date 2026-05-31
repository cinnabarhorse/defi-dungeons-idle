# Difficulty Tier Unlock System: Migration to USDC Staking

## Overview

This document outlines the code changes required to migrate the difficulty tier unlock system from **Lick Tongues** (in-game currency) to **USDC Staking** via the existing Topup mechanism.

### New Unlock Requirements

| Tier      | Current (Lick Tongues) | New (USDC Staked) |
|-----------|------------------------|-------------------|
| Normal    | 0                      | 0 (Free)          |
| Nightmare | 50                     | 100 USDC          |
| Hell      | 275                    | 1,000 USDC        |

---

## Current System Architecture

### Tier Definitions

**File:** [apps/server/src/data/difficulty-tiers.ts](apps/server/src/data/difficulty-tiers.ts)

```typescript
export interface DifficultyTier {
  id: string;
  name: string;
  lickTonguesRequired: number;  // ← Will change to usdcRequired
  enemyHealthMultiplier: number;
  maxEarningsPerRun: number;
  levelCostUsd: number;
}
```

The three tiers are defined at lines 33-78 with their Lick Tongue costs.

### Unlock Flow (Current)

1. User clicks "Unlock" on a tier in the UI
2. Client calls `POST /api/player/unlocks/difficulty` with `{ tierId }`
3. Server validates:
   - Player exists
   - Tier not already unlocked
   - Previous tier is unlocked (sequential requirement)
   - Player has enough Lick Tongues in inventory
4. Server deducts Lick Tongues from `player_inventories` table
5. Server adds tier to `unlocked_tiers[]` in `players` table

### New Flow (Dynamic Access)

1. User selects a tier in the UI
2. Client checks staked USDC balance (from deposits data)
3. UI shows tier as accessible or locked based on balance
4. When starting a game, server validates staked balance meets tier requirement
5. No persistent "unlock" state - access determined at runtime

### Key Files

| Purpose | File Path |
|---------|-----------|
| Tier definitions (server) | [apps/server/src/data/difficulty-tiers.ts](apps/server/src/data/difficulty-tiers.ts) |
| Tier definitions (client) | [apps/client/src/data/difficulty-tiers.ts](apps/client/src/data/difficulty-tiers.ts) |
| Unlock endpoint | [apps/server/src/index.ts:1824-2108](apps/server/src/index.ts#L1824-L2108) |
| UI component | [apps/client/src/components/DifficultySelector.tsx](apps/client/src/components/DifficultySelector.tsx) |
| Progression hook | [apps/client/src/hooks/useProgression.ts](apps/client/src/hooks/useProgression.ts) |
| Difficulty utilities | [apps/client/src/lib/difficulty-utils.ts](apps/client/src/lib/difficulty-utils.ts) |

---

## Topup/Staking System (Existing)

### How Deposits Work

The Topup system allows users to deposit USDC (or GHO) on Base chain. The system tracks:

- **Deposit amount** (`amount`, `amount_wei`)
- **Lock status** (`unlock_at` timestamp)
- **Auto-renewal** (`auto_renew` boolean)
- **Withdrawal status** (`withdrawn` boolean from subgraph)

**Key Files:**

| Purpose | File Path |
|---------|-----------|
| Deposits repository | [apps/server/src/lib/db/repos/deposits.ts](apps/server/src/lib/db/repos/deposits.ts) |
| Subgraph integration | [apps/server/src/lib/topup/deposits-subgraph.ts](apps/server/src/lib/topup/deposits-subgraph.ts) |
| Type definitions | [apps/client/src/types/topup.ts](apps/client/src/types/topup.ts) |
| Token configuration | [apps/server/src/lib/topup/config.ts](apps/server/src/lib/topup/config.ts) |

### Calculating "Staked" Balance

Currently there is **no explicit staked balance field**. To determine USDC staked, we need to sum deposits that are:
- `tx_status = 'credited'` (confirmed and processed)
- `withdrawn = false` (not yet withdrawn)
- Token is USDC

The subgraph at `https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/dd-deposits-subgraph/prod/gn` is the source of truth for on-chain deposit state.

---

## Required Code Changes

### 1. Update Tier Definitions

**Files:**
- [apps/server/src/data/difficulty-tiers.ts](apps/server/src/data/difficulty-tiers.ts)
- [apps/client/src/data/difficulty-tiers.ts](apps/client/src/data/difficulty-tiers.ts)

**Changes:**

```typescript
// Before
export interface DifficultyTier {
  id: string;
  name: string;
  lickTonguesRequired: number;
  // ...
}

// After
export interface DifficultyTier {
  id: string;
  name: string;
  usdcStakedRequired: number;  // In whole USDC (not cents)
  // ...
}
```

Update tier objects:

```typescript
// Before
{ id: 'normal', lickTonguesRequired: 0, ... }
{ id: 'nightmare', lickTonguesRequired: 50, ... }
{ id: 'hell', lickTonguesRequired: 275, ... }

// After
{ id: 'normal', usdcStakedRequired: 0, ... }
{ id: 'nightmare', usdcStakedRequired: 100, ... }
{ id: 'hell', usdcStakedRequired: 1000, ... }
```

### 2. Update Helper Functions

**File:** [apps/server/src/data/difficulty-tiers.ts:113-162](apps/server/src/data/difficulty-tiers.ts#L113-L162)

```typescript
// Before
export function isTierEligible(tierId: string, lickTongueCount: number): boolean {
  const tier = DIFFICULTY_TIERS.find(t => t.id === tierId);
  return tier ? lickTongueCount >= tier.lickTonguesRequired : false;
}

// After
export function isTierEligible(tierId: string, usdcStaked: number): boolean {
  const tier = DIFFICULTY_TIERS.find(t => t.id === tierId);
  return tier ? usdcStaked >= tier.usdcStakedRequired : false;
}
```

Update `canUnlockTier()` similarly.

### 3. Add Staked Balance Calculation

**File:** [apps/server/src/lib/db/repos/deposits.ts](apps/server/src/lib/db/repos/deposits.ts)

Add a new function:

```typescript
export async function getStakedUsdcBalance(userId: string): Promise<number> {
  const result = await sql`
    SELECT COALESCE(SUM(CAST(amount AS DECIMAL)), 0) as total_staked
    FROM deposits
    WHERE user_id = ${userId}
      AND token_symbol = 'USDC'
      AND tx_status = 'credited'
      AND (withdrawn IS NULL OR withdrawn = false)
  `;
  return parseFloat(result[0]?.total_staked || '0');
}
```

**Note:** For accuracy, this should also cross-reference with the subgraph to ensure withdrawal status is current.

### 4. Remove Unlock Endpoint / Add Access Check

**File:** [apps/server/src/index.ts:1824-2108](apps/server/src/index.ts#L1824-L2108)

**Key changes:**

1. **Delete the unlock endpoint entirely** - No longer needed since access is dynamic
2. **Add access validation to game start** - Check staked balance when player attempts to start a game at a tier
3. **Update eligibility check**:
   ```typescript
   // In game start logic
   const stakedBalance = await getStakedUsdcBalance(playerId);
   if (!isTierEligible(selectedTier, stakedBalance)) {
     throw new Error(`Insufficient USDC/GHO staked for ${selectedTier}. Required: ${tier.usdcStakedRequired}, Current: ${stakedBalance}`);
   }
   ```
4. **Remove `unlocked_tiers` updates** - No longer tracking persistent unlock state

### 5. Update Client UI

**File:** [apps/client/src/components/DifficultySelector.tsx](apps/client/src/components/DifficultySelector.tsx)

**Changes:**

1. Replace Lick Tongue count display with USDC staked display
2. Update unlock button text:
   ```typescript
   // Before
   `Unlock (${tier.lickTonguesRequired} Lick Tongues)`

   // After
   `Unlock (Requires ${tier.usdcStakedRequired} USDC staked)`
   ```
3. Fetch staked balance from API or use existing topup data

### 6. Update useProgression Hook

**File:** [apps/client/src/hooks/useProgression.ts:174-175, 289-290](apps/client/src/hooks/useProgression.ts#L174-L175)

**Changes:**

1. Remove `lickTongueCount` state tracking
2. Add `stakedUsdcBalance` state
3. Fetch staked balance when needed (can leverage existing deposits fetch)

### 7. Update Difficulty Utilities

**File:** [apps/client/src/lib/difficulty-utils.ts:6-10](apps/client/src/lib/difficulty-utils.ts#L6-L10)

**Changes:**

```typescript
// Remove
export function countLickTongues(inventory: InventoryItem[]): number { ... }

// Add
export function calculateStakedUsdc(deposits: TopupRecord[]): number {
  return deposits
    .filter(d =>
      d.token === 'USDC' &&
      d.status === 'credited' &&
      !d.withdrawn
    )
    .reduce((sum, d) => sum + d.amount, 0);
}
```

---

## Database Changes

### Option A: No Schema Changes (Recommended)

The current schema supports this change without modifications:
- `unlocked_tiers` already tracks which tiers are unlocked
- `deposits` table already tracks USDC deposits
- Subgraph tracks withdrawal status

Just update the application logic to check staked balance instead of Lick Tongue inventory.

### Option B: Add Denormalized Staked Balance (Optional)

For performance, add a denormalized field to the `players` table:

```sql
ALTER TABLE players ADD COLUMN staked_usdc_balance DECIMAL(18, 6) DEFAULT 0;
```

Update this when deposits are credited or withdrawn. This avoids querying the deposits table on every unlock check.

---

## API Changes

### Removed Endpoint

```
POST /api/player/unlocks/difficulty  ← DELETE THIS
```

This endpoint is no longer needed. Access is checked dynamically at game start.

### Modified: Game Start Validation

The game start flow (room join) should now validate staked balance:

```typescript
// When player joins a room with a selected tier
if (!isTierEligible(player.selectedTier, stakedUsdcBalance)) {
  return { error: "Insufficient USDC/GHO staked for this difficulty" };
}
```

### New Endpoint (Required)

```
GET /api/player/staked-balance
```

**Response:**
```json
{
  "usdc": 150.00,
  "accessibleTiers": ["normal", "nightmare"],  // Helper for UI
  "gho": 0
}
```

This endpoint is needed so the client can display which tiers are accessible based on current stake.

---

## Migration Considerations

### Existing Unlocks (Breaking Change)

Players who previously unlocked tiers with Lick Tongues will **lose access** if they don't have sufficient USDC staked. This is intentional - the new system is purely stake-based.

**Migration Options:**
1. **Clean break** - All players start fresh, access based solely on USDC staked
2. **Grace period** - Give existing players X days notice before switching systems
3. **Grandfather clause** - Keep old unlocks valid (NOT recommended per design decision)

### Dynamic Access Control

**Design Decision:** Tier access is **dynamically checked** based on current staked balance. If a player withdraws USDC and drops below the threshold, they lose access to that tier.

**Behavior:**
- Access is checked on every game start / tier selection
- If staked balance drops below requirement, tier becomes locked
- Player must re-stake to regain access
- No permanent "unlock" state - it's always based on current balance

**Implementation Implications:**
1. **Remove `unlocked_tiers` tracking** - No longer needed since access is dynamic
2. **Check balance at runtime** - Every tier selection must verify current staked balance
3. **Handle mid-game withdrawals** - Decide behavior if player withdraws during active game session
4. **UI must reflect current status** - Show locked/unlocked based on current balance

### Mid-Game Withdrawal Handling

If a player is in a Nightmare game and withdraws USDC dropping below 100:

**Recommended Approach:**
- Allow current game session to complete
- Block starting new games at that tier until balance restored
- Check balance at game start, not continuously during gameplay

### Lick Tongue Cleanup

After migration, consider:
1. Keeping Lick Tongues for other uses (if any)
2. Removing Lick Tongue references from difficulty system
3. Optionally refunding or converting existing Lick Tongue balances

---

## Implementation Order

1. **Phase 1: Backend**
   - [ ] Update tier definitions in `difficulty-tiers.ts` (replace `lickTonguesRequired` with `usdcStakedRequired`)
   - [ ] Add `getStakedUsdcBalance()` function in deposits repo
   - [ ] Add `GET /api/player/staked-balance` endpoint
   - [ ] Add staked balance validation to game start / room join logic
   - [ ] Delete `POST /api/player/unlocks/difficulty` endpoint
   - [ ] Add tests for balance checking

2. **Phase 2: Frontend**
   - [ ] Update DifficultySelector to show stake requirements (not unlock buttons)
   - [ ] Fetch staked balance and show accessible tiers
   - [ ] Remove unlock flow from useProgression hook
   - [ ] Update difficulty-utils.ts with `calculateStakedUsdc()`

3. **Phase 3: Cleanup**
   - [ ] Remove `unlocked_tiers` field usage (can keep in DB for historical data)
   - [ ] Remove Lick Tongue references from difficulty system
   - [ ] Remove `lickTongueCount` tracking
   - [ ] Communicate breaking change to players

---

## Testing Checklist

### Access Control
- [ ] Normal tier accessible with 0 USDC staked
- [ ] Nightmare accessible with exactly 100 USDC staked
- [ ] Nightmare NOT accessible with 99 USDC staked
- [ ] Hell accessible with exactly 1000 USDC staked
- [ ] Hell NOT accessible with 999 USDC staked

### Dynamic Behavior
- [ ] Withdrawing USDC immediately locks previously accessible tiers
- [ ] Depositing USDC immediately unlocks new tiers
- [ ] UI updates to reflect current staked balance
- [ ] Player cannot start game at tier they don't have access to

### Edge Cases
- [ ] Player in active Nightmare game who withdraws can finish current game
- [ ] Player cannot start NEW Nightmare game after withdrawal
- [ ] Subgraph withdrawal status correctly reflected
- [ ] Pending deposits don't count toward staked balance (only credited)

### Migration
- [ ] Old `unlocked_tiers` data can be ignored/removed
- [ ] Players with old Lick Tongue unlocks must stake USDC for access
