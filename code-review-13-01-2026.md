# Code Review Checklist - 13/01/2026

## PR Summary
This PR includes:
- Leaderboard date navigation for historical daily quest competition results
- Auto-renew feature removal from top-ups
- Lick Tongue requirements removal (all tiers open to everyone)
- Fetch deduplication utility for concurrent API requests
- Cooldown per-turn change (cooldowns decrement per turn instead of per room)
- Daily prize distribution cron job at 00:05 UTC
- Subgraph deposit merging for enhanced deposit history

---

## Checklist

### 🟡 Medium Priority

- [ ] **Remove unused `autoRenew` state** (`apps/client/src/components/topup/topup-form.tsx`)
  - The `autoRenew` state is set to `false` and never changes
  - Remove the state variable or replace uses with `false` directly

- [ ] **Deduplicate contract address constants** (`apps/server/src/lib/topup/deposits-subgraph.ts`)
  - `USDC_ADDRESS` duplicates `SUPPORTED_TOKENS['USDC'].address` from `config.ts`
  - `GAMEPOINTS_CONTRACT` duplicates `GAMEPOINTS_CONTRACT_ADDRESS` from `config.ts`
  - Import from existing configs instead of hardcoding

- [ ] **Remove or document `clearFetchDedupeCache`** (`apps/client/src/lib/fetch-dedupe.ts`)
  - Function is exported but never used
  - Either remove it or add JSDoc comment indicating it's for testing

### 🟢 Low Priority / Consider

- [ ] **Extract date utilities** (`apps/client/src/app/leaderboard/page.tsx`)
  - `getTodayUTC`, `formatDateForDisplay`, `getPreviousDay`, `getNextDay` could be in `lib/date-utils.ts`
  - Only needed if these functions will be reused elsewhere

- [ ] **Verify `dailyQuestActive` check** (`apps/server/src/rooms/IdleMode.ts`)
  - New condition: `player.dailyQuestActive` required to submit scores
  - Verify this is intentional behavior change

- [ ] **Add unit test for cooldown per-turn** (`apps/server/src/rooms/IdleMode.ts`)
  - `onPlayerTurnComplete` is called in 8 places
  - Add test to verify cooldowns decrement correctly across all action types

- [ ] **Replace inline style with Tailwind** (`apps/client/src/components/Lobby.tsx`)
  - `style={{ top: '50%', bottom: 'auto' }}` could be a class
  - Lower priority, cosmetic only

### ✅ Verified Good

- [x] Lick Tongue threshold changes include helpful comments
- [x] `useWalletConnection.ts` uses refs correctly to avoid stale closures
- [x] Fetch deduplication handles concurrent requests properly
- [x] SQL migration file present for Lick Tongue removal
- [x] Tests updated for new 0-threshold behavior

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `apps/client/src/app/leaderboard/page.tsx` | Date navigation feature |
| `apps/client/src/app/page.tsx` | fetchDedupe integration |
| `apps/client/src/components/DialogueBox.tsx` | fetchDedupe integration |
| `apps/client/src/components/Lobby.tsx` | fetchDedupe + dialog positioning |
| `apps/client/src/components/providers/PlayerProvider.tsx` | fetchDedupe integration |
| `apps/client/src/components/topup/faq.tsx` | Removed auto-renew FAQ |
| `apps/client/src/components/topup/history.tsx` | Removed auto-renew column |
| `apps/client/src/components/topup/topup-form.tsx` | Removed auto-renew checkbox |
| `apps/client/src/data/game-config.ts` | Tier thresholds → 0 |
| `apps/client/src/hooks/useCredits.ts` | fetchDedupe integration |
| `apps/client/src/hooks/useEntryCost.ts` | fetchDedupe integration |
| `apps/client/src/hooks/useEquipment.ts` | fetchDedupe integration |
| `apps/client/src/hooks/useInventory.ts` | fetchDedupe integration |
| `apps/client/src/hooks/useWalletConnection.ts` | Fixed stale closure issue |
| `apps/client/src/lib/fetch-dedupe.ts` | **NEW** - Request deduplication |
| `apps/server/package.json` | Added node-cron |
| `apps/server/src/data/game-config.ts` | Tier thresholds → 0 |
| `apps/server/src/index.ts` | Cron job + deposits merging |
| `apps/server/src/lib/__tests__/daily-quest-competition.test.ts` | Updated tests |
| `apps/server/src/lib/daily-quest-competition.ts` | Tier thresholds → 0 |
| `apps/server/src/lib/topup/deposits-subgraph.ts` | Subgraph deposit fetching/merging |
| `apps/server/src/rooms/GameRoom.ts` | onPlayerTurnComplete call |
| `apps/server/src/rooms/IdleMode.ts` | Cooldown per-turn logic |
| `apps/server/src/rooms/SharedGame.ts` | Reset player HP on join |
| `data/game-config.ts` | Tier thresholds → 0 |
| `db/migrations/20260113_000001_remove_lick_tongue_requirements.sql` | **NEW** - Migration |
