### Spend Lick Tongues to Unlock Difficulty Tiers — Implementation Plan

Goal: Replace automatic tier unlocking (based on having ≥ N tongues) with an explicit, server-validated "spend tongues to unlock" flow. Players must pay the required number of Lick Tongues to permanently unlock a tier.

---

### Current Behavior (what we will change)

- Unlocking is derived from a count threshold using `getUnlockedTiers(lickTongueCount)`.
  - Client: `apps/client/src/data/difficulty-tiers.ts`
  - Server: `apps/server/src/data/difficulty-tiers.ts`
  - Root copy: `data/difficulty-tiers.ts` (reference/duplication)
- Multiple server endpoints recompute `unlocked_tiers` on the fly from `lickTongueCount`, overwriting the DB state:
  - `apps/server/src/index.ts`
    - POST `/api/player/progression/allocate` — calls `getUnlockedTiers`
    - POST `/api/player/progression/deallocate` — calls `getUnlockedTiers`
    - POST `/api/player/progression/reset` — calls `getUnlockedTiers`
  - `apps/server/src/rooms/GameRoom.ts` — `persistProgression` recomputes unlocked tiers via `getUnlockedTiers` from `lickTongueCount`.
- Client helper `apps/client/src/lib/difficulty-utils.ts` also derives `unlockedTiers` from inventory tongue count.

Net effect: tiers become unlocked passively without consuming the item and are repeatedly re-derived rather than being durable purchases.

---

### Target Behavior (spend-to-unlock)

- Unlocks are explicit and durable. Server persists them and never auto-recomputes from count.
- New API: POST `/api/player/unlocks/difficulty` to spend tongues and add a tier to `players.unlocked_tiers`.
- Tongue cost is deducted from inventory (and we keep `players.lick_tongue_count` consistent with inventory as a denormalized summary).
- Client UI shows locked tiers with an "Unlock" CTA if the player has enough tongues; clicking performs the unlock via the API and updates UI.
- We keep an "eligibility" concept for UI (hasEnoughTonguesForTier) but do not auto-unlock.

---

### Files to Change (and why)

#### Server

- `apps/server/src/index.ts`
  - Add POST `/api/player/unlocks/difficulty`:
    - Auth via existing session middleware.
    - Validate `tierId` exists and is not already unlocked.
    - Compute unlock cost from difficulty data (e.g., `lickTonguesRequired`).
    - Within a transaction:
      - Read inventory entry for Lick Tongue (see below for canonical identifier).
      - Ensure `quantity >= cost`; if not, 400.
      - Decrement inventory by `cost` (or remove row when 0).
      - Update `players.unlocked_tiers = array_append(..., tierId)`.
      - Recompute `players.lick_tongue_count` from inventory and persist for consistency.
      - Log to `inventoryEvents` with reason `unlock_difficulty`.
    - Response: `{ unlockedTiers, lickTongueCount }` (optionally also return updated inventory slice).
  - Remove auto-recomputation of unlocked tiers in:
    - `/api/player/progression/allocate`
    - `/api/player/progression/deallocate`
    - `/api/player/progression/reset`
    - Instead: preserve the current `players.unlocked_tiers` as-is; do not override.

- `apps/server/src/rooms/GameRoom.ts`
  - In `persistProgression`, stop calling `getUnlockedTiers(lickTongueCount)` and instead use the player's existing unlocked tiers that were loaded into `player.unlockedTiers` at join. Do not mutate unlocked tiers here.
  - Ensure `lickTongueCount` is still updated from inventory syncs, but it no longer controls unlocked tiers.

- `apps/server/src/data/difficulty-tiers.ts`
  - Deprecate or remove `getUnlockedTiers(lickTongueCount)` and `isUnlocked(tierId, lickTongueCount)` as authoritative mechanisms.
  - Add helpers for UI/server validation without side effects:
    - `getUnlockCost(tierId): number` (aliased from existing `lickTonguesRequired`).
    - `isTierEligible(tierId, lickTongueCount): boolean` (pure, for display/validation only).

- `apps/server/src/lib/db/repos/inventory.ts`
  - Add a helper for safe quantity decrement in a transaction:
    - `decrementInventoryItem(playerId, itemType, itemName, amount, client)` — read current, validate, then set new quantity (or remove row) to prevent race conditions.

- `apps/server/src/lib/db/mappers.ts`
  - Confirm canonical Lick Tongue identification in `getLickTongueCount` (currently matches `id` or `name` including `lick_tongue`/`lick tongue`). We will standardize on DB row keys: `item_type = 'material'`, `item_name = 'Lick Tongue'` (and keep fuzzy fallback for robustness).

#### Client

- `apps/client/src/components/DifficultySelector.tsx`
  - For locked tiers, render an "Unlock" button when eligible (`lickTongueCount >= cost`).
  - On click, call a passed `onUnlock(tierId)` prop; show pending state and errors.
  - Update text from "Next unlock" (progress) to "Next eligible" or keep as-is but clarify that it requires spending tongues.

- `apps/client/src/hooks/useProgression.ts`
  - Add `unlockDifficulty(tierId: string): Promise<{ unlockedTiers: string[]; lickTongueCount: number }>` that calls the new server endpoint and updates local state (`unlockedTiers`, `lickTongueCount`).

- `apps/client/src/app/page.tsx`
  - Thread `unlockDifficulty` to `Lobby` → `DifficultySelector` via an `onUnlock` callback.
  - Optionally refresh player inventory/state after successful unlock.

- `apps/client/src/lib/difficulty-utils.ts`
  - Remove or deprecate auto-derivation of unlocked tiers from inventory.
  - Replace with pure helpers used only for UI eligibility:
    - `countLickTongues(inventory)` stays.
    - New `isTierEligible(tierId, lickTongueCount)` for rendering.
    - Do not mutate `unlockedTiers` here.

- `apps/client/src/data/difficulty-tiers.ts`
  - Mirror server changes: remove `getUnlockedTiers` and `isUnlocked` auto logic.
  - Export `getUnlockCost` and `isTierEligible` for client display only.

#### Optional/Docs/Telemetry

- `docs/telemetry.md` (optional): add `difficulty_unlocked` event with fields `{ tierId, cost, remainingTongues }`.

---

### API Spec: POST /api/player/unlocks/difficulty

- Request JSON: `{ tierId: string }`
- Auth: same cookie/session as other `/api/player` endpoints.
- Validation:
  - `tierId` must exist in difficulty data and not be already unlocked.
  - Player must have sufficient Lick Tongues in inventory (DB `player_inventories`).
- Transactional steps:
  1. SELECT inventory row for `item_type = 'material'`, `item_name = 'Lick Tongue'` (fallback search by itemData if needed).
  2. If `quantity < cost`, 400.
  3. Update `player_inventories` to decrement by `cost` (delete if 0).
  4. Update `players.unlocked_tiers = array_append(unlocked_tiers, tierId)` (idempotent guard if present).
  5. Recompute `lickTongueCount` from inventory and `update players.lick_tongue_count`.
  6. Log `inventory_events` with reason `unlock_difficulty` and metadata `{ tierId, cost }`.
- Response JSON: `{ unlockedTiers: string[], lickTongueCount: number }`

---

### Data Model Notes

- No schema changes required. We already have:
  - `players.unlocked_tiers TEXT[] NOT NULL DEFAULT '{normal_1}'`
  - `players.lick_tongue_count INT NOT NULL DEFAULT 0`
  - `player_inventories` with `quantity` rows per item.
- `players.lick_tongue_count` is treated as a denormalized summary; we update it when we perform an unlock so the UI remains consistent even outside a game session.

---

### Edge Cases & Rules

- Unlock prerequisites: Do we require sequential unlocks (e.g., `normal_2` requires `normal_1` unlocked) or allow jumping if the player can afford it?

We can allow jumping.

- Duplicate requests: Endpoint must be idempotent; if already unlocked, return 200 with current state (or 409?).

Yes.

- Partial inventory states: If a player holds multiple rows that can be recognized as Lick Tongue (due to name/ID variants), we should merge counts for validation and then decrement against the canonical row first.
- Concurrency: Wrap in a transaction; consider a `FOR UPDATE` lock on the inventory row to prevent double-spend under rapid clicks.
- Refunds: No refund path planned; confirm this.

---

### Testing Checklist

- New player with 0 tongues sees all but `normal_1` locked; unlock button disabled.
- With sufficient tongues, unlock button enabled; after unlock:
  - `unlockedTiers` includes the tier.
  - `lickTongueCount` decreases by cost.
  - Inventory reflects spent amount.
  - Server rejects subsequent unlock if already unlocked.
- Verify `allocate/deallocate/reset` endpoints no longer alter `unlocked_tiers`.
- In-room gameplay persists progression without changing unlocked tiers.

---

### Open Questions for You

1. Unlock cost: Use the existing `lickTonguesRequired` as the spend cost? Or different costs for spend vs eligibility?

Yes.

2. Prerequisites: Should unlocking enforce a path (e.g., `normal_1 → normal_2 → nightmare_1 → ...`) or any tier is unlockable if affordable?

Any tier is unlockable.

3. Eligibility display: Okay to continue showing "Next

unlock" progress in the UI, but relabeled to clarify it's a spend? Preferred wording?

Show the unlock price next to the lock icon.

4. Inventory key: Confirm the canonical row we should mutate is `item_type = 'material'` and `item_name = 'Lick Tongue'`.

Yep.

5. Idempotency: If the tier is already unlocked and the user clicks unlock again, return 200 (no-op) or 409?

probably 409.

6. Telemetry: Should we emit a `difficulty_unlocked` analytics event? If yes, any specific fields beyond `{ tierId, cost }`?

Add a placeholder for it.

7. Client UX: Show a confirm dialog before spending? Any copy you prefer? E.g., "Spend X Lick Tongues to unlock {tierName}?"

No placeholder.

8. Error copy: If insufficient tongues, specific copy and placement (toast vs inline)?
9. Bulk unlock: Do we want a future "Unlock all eligible" feature (spends cumulatively)? Not in v1 unless you want it.

Not needed.

10. Server responses: Include updated inventory list, or keep payload minimal (`unlockedTiers`, `lickTongueCount`) as proposed?

Up to you.

---

### Quick Reference: Affected Code Locations

- Server
  - `apps/server/src/index.ts` — add new endpoint; stop auto-deriving unlocked tiers in allocate/deallocate/reset.
  - `apps/server/src/rooms/GameRoom.ts` — stop auto-deriving unlocked tiers in `persistProgression`.
  - `apps/server/src/data/difficulty-tiers.ts` — replace `getUnlockedTiers`/`isUnlocked` with `getUnlockCost`/`isTierEligible`.
  - `apps/server/src/lib/db/repos/inventory.ts` — helper to safely decrement item quantity.
  - `apps/server/src/lib/db/mappers.ts` — confirm Lick Tongue identification logic.

- Client
  - `apps/client/src/components/DifficultySelector.tsx` — add `onUnlock` CTA; render eligibility and spend messaging.
  - `apps/client/src/hooks/useProgression.ts` — add `unlockDifficulty` and wire state updates.
  - `apps/client/src/app/page.tsx` — pass `onUnlock`/`unlockDifficulty` through to `DifficultySelector`.
  - `apps/client/src/lib/difficulty-utils.ts` — deprecate auto-unlock logic; add eligibility helpers only.
  - `apps/client/src/data/difficulty-tiers.ts` — mirror helper changes for UI.

If anything above differs from your intent, answer in this file and I’ll align the implementation before writing code.
