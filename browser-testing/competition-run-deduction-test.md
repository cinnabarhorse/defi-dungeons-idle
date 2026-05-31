# Browser Test: Competition Mode Daily Run Deduction

## Test Overview

| Field | Value |
|-------|-------|
| **Test ID** | `competition-runs-001` |
| **Feature** | Competition Run Limit (3/day) Deduction |
| **Priority** | High |
| **Last Updated** | 2026-01-24 |

## Prerequisites

### Server Requirements
- [ ] Server running on `localhost:2567` (or configured port)
- [ ] Client running on `localhost:3001`

### Starting the Servers (if not running)

**Terminal 1 - Game Server:**
```bash
cd /Users/coderdan/GitHub/gotchiverse-live/apps/server
pnpm dev
```

**Terminal 2 - Client:**
```bash
cd /Users/coderdan/GitHub/gotchiverse-live/apps/client
pnpm dev
```

Wait for both servers to show they are ready:
- Server: Look for `Listening on port 2567`
- Client: Look for `Ready on http://localhost:3001`

### Dev Mode Configuration
```
http://localhost:3001/?dev=true&devMode=true&devInfiniteResources=true&devEquipment=portal-mage-black-axe,milkshake
```

**Note:** The `dev=true` parameter enables dev wallet login (bypasses wallet connection). The `devMode=true` parameter enables game dev mode options.

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `devMode` | `true` | Enable dev mode |
| `devInfiniteResources` | `true` | Ensure player survival for complete run |
| `devEquipment` | `portal-mage-black-axe,milkshake` | Equip damage weapon + healing grenade |
| `devSkipEntryFee` | `true` | **DO NOT USE** - We want to test run deduction |

**CRITICAL:** Do NOT use `devSkipEntryFee=true` for this test. We need to verify that competition runs are actually deducted.

**Important Prerequisite:** The player account must have **42+ total lick tongues** collected historically to unlock the normal tier. This is stored in the database `players.total_lick_tongues` column. The dev wallet (`dev=true`) typically has this requirement met.

---

## Test Steps

### Step 1: Navigate to Game URL
**Action:** Navigate to the dev mode URL (without `devSkipEntryFee`)

```
http://localhost:3001/?dev=true&devMode=true&devInfiniteResources=true&devEquipment=portal-mage-black-axe,milkshake
```

**Expected Result:**
- Page loads successfully
- Lobby screen is visible
- No console errors related to dev mode

---

### Step 2: Check Initial Competition Runs Status
**Action:** Before starting a run, check the current competition runs status via API

**Method 1 - API (Recommended):**
```bash
# Get your session cookie from browser DevTools → Application → Cookies
curl -X GET "http://localhost:2567/api/daily-runs/preview?difficultyId=normal" \
  -H "Cookie: <your-session-cookie>"
```

**Method 2 - UI:**
- Look at the "Competition" section in the lobby
- Note the attunement status (e.g., "3 left" or "Enable" button available)

**Expected Result:**
- API returns: `{ "remainingAttunements": X, "hasUnlockedTier": true, ... }`
- UI shows attunement count or "Enable" button
- **Record the initial `remainingAttunements` value** (should be 0-3)

---

### Step 3: Enable Daily Competition (If Needed)
**Action:** If attunement is not active, click the "Enable" button in the Competition section

**Expected Result:**
- Button briefly shows "Attuning..." while processing
- After success, "ACTIVE" badge appears
- `remainingAttunements` decreases by 1 (if it was > 0)
- Console shows: `[Daily Quest Attune] Success!`

**Note:** If `remainingAttunements` is already 0, you may need to use the dev replenish endpoint first.

---

### Step 4: Verify Competition is Active
**Action:** Observe the Competition section in the lobby

**Expected Result:**
- "ACTIVE" badge is visible next to "Competition"
- Competition mode is ready for the next run

---

### Step 5: Select Competitive Mode
**Action:** Click the "Competitive" mode button in the lobby

**Expected Result:**
- "Competitive" button is highlighted/selected
- Mode description shows: "Daily Quest rewards. 3 runs per day."
- Start button becomes enabled

---

### Step 6: Start Competitive Run
**Action:** Click the "Start Game" button to begin a competitive run

**Expected Result:**
- Game loads and enters idle dungeon mode
- Score display shows "Daily Quest Score" (indicating competition mode is active)
- Auto-explore is available to toggle on
- **Server console shows:** `[DailyQuestCompetition] Recorded daily run on dungeon entry { runsUsed: X, runsRemaining: Y }`

---

### Step 7: Verify Run Started Successfully
**Action:** Wait for game to fully load and verify gameplay is active

**Expected Result:**
- Game UI is visible (HP bar, action log, etc.)
- "Daily Quest Score" label is visible (not just "Score")
- Player can move or auto-explore is available
- No error messages about competition runs exhausted

---

### Step 8: Exit Game Early (Optional)
**Action:** Click "Back to Lobby" or disconnect to return to lobby without completing the run

**Note:** We don't need to complete the run - the competition run is deducted when you START, not when you finish.

**Expected Result:**
- Player returns to lobby
- Game state is reset

---

### Step 9: Check Competition Runs Status After Run Start
**Action:** Check the competition runs status again (same method as Step 2)

**Expected Result:**
- API returns: `{ "remainingAttunements": X-1, ... }`
- **The `remainingAttunements` should be exactly 1 less than the initial value from Step 2**

**Example:**
- Initial: `remainingAttunements: 3`
- After run: `remainingAttunements: 2` ✅

**Note:** Competition runs are tracked separately from progression daily runs. Competition uses the `daily_quest_leaderboard` table, not `player_daily_runs`.

---

### Step 10: Verify Server Logs
**Action:** Check the server console logs

**Expected Result:**
- Log shows: `[DailyQuestCompetition] Recorded daily run on dungeon entry { runsUsed: X, runsRemaining: Y }`
- `runsUsed` increased by 1
- `runsRemaining` decreased by 1
- No errors about competition run consumption

---

### Step 11: Verify Database Record (Optional)
**Action:** Check the `daily_quest_leaderboard` table in the database

**SQL Query:**
```sql
SELECT account_id, date, tier, runs_used, runs_remaining
FROM daily_quest_leaderboard
WHERE account_id = '<your-player-id>'
  AND date = CURRENT_DATE::text
  AND tier = 'normal'
ORDER BY updated_at DESC;
```

**Expected Result:**
- Row exists for today's date and 'normal' tier
- `runs_used` increased by 1
- `runs_remaining` decreased by 1

---

### Step 12: Verify Progression Runs NOT Deducted
**Action:** Check that progression daily runs were NOT deducted (competition uses separate system)

**API Call:**
```bash
curl -X GET "http://localhost:2567/api/player/daily-runs" \
  -H "Cookie: <your-session-cookie>"
```

**Expected Result:**
- `usedRuns` for progression daily runs should be **unchanged** from before the competition run
- Competition runs and progression runs are tracked separately
- Competition uses 3/day limit, progression uses USDC-stake-based allowance

---

## Success Criteria

| Criterion | Required | How to Verify |
|-----------|----------|---------------|
| Initial competition runs count retrieved | ✅ Yes | API shows current `remainingAttunements` |
| Competition enabled (if needed) | ✅ Yes | "ACTIVE" badge appears in lobby |
| Competitive mode selected | ✅ Yes | "Competitive" button highlighted |
| Run starts successfully | ✅ Yes | Game loads, shows "Daily Quest Score" |
| Server log shows competition run recorded | ✅ Yes | Console shows `[DailyQuestCompetition] Recorded daily run` |
| Remaining attunements decreased by 1 | ✅ Yes | API shows `remainingAttunements` decreased by exactly 1 |
| Progression runs NOT deducted | ✅ Yes | Progression `usedRuns` unchanged |
| Database record updated | ✅ Yes | `daily_quest_leaderboard.runs_used` increased by 1 |
| No console errors | ✅ Yes | Browser console is clean |

---

## Test Data

### Competition Run Limits
```typescript
// From data/game-config.ts
dailyRunsPerDay: 3  // Fixed 3 runs per day for all players
```

### Tier Unlock Requirements
```typescript
tierUnlockThresholds: {
  normal: 42,    // Lick Tongues needed
  nightmare: 100,
  hell: 500,
}
```

### Expected API Response (Preview)
```json
{
  "remainingAttunements": 2,
  "hasUnlockedTier": true,
  "multiplierStatus": {
    "multiplier": 1.5,
    "hoursAfterReset": 0
  },
  "prizePool": {...}
}
```

---

## API Endpoints for Verification

### Get Competition Preview
```
GET http://localhost:2567/api/daily-runs/preview?difficultyId=normal
```
Returns: `{ remainingAttunements, hasUnlockedTier, multiplierStatus, prizePool }`

### Attune to Competition
```
POST http://localhost:2567/api/daily-runs/attune
Body: { "difficultyId": "normal" }
```
Returns: `{ remainingAttunements: X }` after consumption

### Replenish Competition Runs (Dev Only)
```
POST http://localhost:2567/api/daily-runs/dev-replenish
```
**Note:** Only available in development mode. Resets competition runs to 3 for today.

### Get Progression Daily Runs (Verify NOT Deducted)
```
GET http://localhost:2567/api/player/daily-runs
```
Returns: `{ usedRuns, allowedRuns, remainingRuns }` - Should be unchanged for competition runs

---

## Troubleshooting

### Competition Runs Not Decreasing
1. **Check if `devSkipEntryFee=true` is in URL** - Remove it! We need entry fee to test run deduction.
2. Verify server logs show `[DailyQuestCompetition] Recorded daily run on dungeon entry`
3. Check database: `SELECT * FROM daily_quest_leaderboard WHERE account_id = '<player-id>' AND date = CURRENT_DATE::text`
4. Verify the run is in Competitive mode (not Practice or Progression)

### "Runs Exhausted" Error
1. Check current `remainingAttunements` - if it's 0, you've used all 3 competition runs for today
2. Use dev replenish endpoint: `POST /api/daily-runs/dev-replenish`
3. Or wait until UTC midnight for automatic reset

### Competition Section Not Appearing
1. Check browser console for errors
2. Verify player has **42+ total lick tongues** in database (not in-run count)
3. Check `/api/daily-runs/preview?difficultyId=normal` response for `hasUnlockedTier: true`
4. If tier is locked, use an account that has collected enough lick tongues historically

### Progression Runs Were Deducted (Bug)
1. This is a bug - competition runs should NOT deduct progression daily runs
2. Check `apps/server/src/rooms/SharedGame.ts` - `registerGamePlayer()` should check `isCompetitionRun` and skip progression run consumption
3. Verify `shouldConsumeProgressionRun = !isCompetitionRun && !player.practiceMode`

### API Returns 401 Unauthorized
1. Ensure you're using the correct session cookie from the browser
2. Check that `dev=true` is in the URL (enables dev wallet login)
3. Verify the server is running and accessible

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/server/src/rooms/SharedGame.ts` | `registerGamePlayer()` - Competition run recording |
| `apps/server/src/lib/db/repos/daily-quest-leaderboard.ts` | `recordAttunementUsage()` - Competition run tracking |
| `apps/server/src/routes/daily-runs.ts` | `/api/daily-runs/preview` and `/api/daily-runs/attune` |
| `apps/client/src/components/Lobby.tsx` | Competition section UI, Enable button |
| `docs/daily-runs.md` | Daily runs specification (competition vs progression) |

---

## Test Execution Log

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| _YYYY-MM-DD_ | _Name_ | _Pass/Fail_ | _Notes_ |

---

## Cleanup

After testing, if you started the servers:

1. Press `Ctrl+C` in the server terminal to stop the game server
2. Press `Ctrl+C` in the client terminal to stop the Next.js client

This prevents port conflicts with future test runs.

### Reset Competition Runs for Re-Testing

If you need to run this test again on the same day:

1. Use the dev replenish endpoint:
```bash
curl -X POST http://localhost:2567/api/daily-runs/dev-replenish \
  -H "Cookie: <your-session-cookie>"
```

2. Or manually update the database:
```sql
UPDATE daily_quest_leaderboard
SET runs_used = 0, runs_remaining = 3
WHERE account_id = '<your-player-id>'
  AND date = CURRENT_DATE::text
  AND tier = 'normal';
```
