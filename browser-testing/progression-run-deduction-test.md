# Browser Test: Progression Mode Daily Run Deduction

## Test Overview

| Field | Value |
|-------|-------|
| **Test ID** | `progression-runs-001` |
| **Feature** | Daily Run Deduction for Progression Mode |
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
| `devSkipEntryFee` | `true` | **DO NOT USE** - We want to test run deduction, so entry fee should NOT be skipped |

**CRITICAL:** Do NOT use `devSkipEntryFee=true` for this test. We need to verify that runs are actually deducted.

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

### Step 2: Check Initial Daily Runs Count
**Action:** Before starting a run, check the current daily runs status via API or UI

**Method 1 - API (Recommended):**
```bash
# Get your session cookie from browser DevTools → Application → Cookies
curl -X GET "http://localhost:2567/api/player/daily-runs" \
  -H "Cookie: <your-session-cookie>"
```

**Method 2 - UI:**
- Look at the "Daily Runs" section in the lobby
- Note the "Remaining" count (e.g., "10 left" or "25 left")

**Expected Result:**
- API returns: `{ "usedRuns": X, "allowedRuns": Y, "remainingRuns": Z }`
- UI shows remaining runs count
- **Record the initial `remainingRuns` value** (e.g., `remainingRuns: 10`)

---

### Step 3: Select Progression Mode
**Action:** Click the "Progression" mode button in the lobby

**Expected Result:**
- "Progression" button is highlighted/selected
- Mode description shows: "Earn XP + loot. Uses daily runs."
- Start button becomes enabled

---

### Step 4: Start Progression Run
**Action:** Click the "Start Game" button to begin a progression run

**Expected Result:**
- Game loads and enters idle dungeon mode
- Score display shows "Score" (NOT "Daily Quest Score" - that's competition)
- Auto-explore is available to toggle on
- **Server console shows:** `[registerGamePlayer] Daily run deducted { playerId, sessionId }`

---

### Step 5: Verify Run Started Successfully
**Action:** Wait for game to fully load and verify gameplay is active

**Expected Result:**
- Game UI is visible (HP bar, action log, etc.)
- Player can move or auto-explore is available
- No error messages about daily runs exhausted

---

### Step 6: Exit Game Early (Optional)
**Action:** Click "Back to Lobby" or disconnect to return to lobby without completing the run

**Note:** We don't need to complete the run - the run is deducted when you START, not when you finish.

**Expected Result:**
- Player returns to lobby
- Game state is reset

---

### Step 7: Check Daily Runs Count After Run Start
**Action:** Check the daily runs status again (same methods as Step 2)

**Expected Result:**
- API returns: `{ "usedRuns": X+1, "allowedRuns": Y, "remainingRuns": Z-1 }`
- UI shows remaining runs decreased by 1
- **The `remainingRuns` should be exactly 1 less than the initial value from Step 2**

**Example:**
- Initial: `remainingRuns: 10`
- After run: `remainingRuns: 9` ✅

---

### Step 8: Verify Server Logs
**Action:** Check the server console logs

**Expected Result:**
- Log shows: `[registerGamePlayer] Daily run deducted { playerId: '...', sessionId: '...' }`
- No errors about daily run consumption
- No "Credits deducted" messages (we should only see run deduction)

---

### Step 9: Verify Database Record (Optional)
**Action:** Check the `player_daily_runs` table in the database

**SQL Query:**
```sql
SELECT account_id, date, used_runs, updated_at
FROM player_daily_runs
WHERE account_id = '<your-player-id>'
  AND date = CURRENT_DATE::text
ORDER BY updated_at DESC;
```

**Expected Result:**
- Row exists for today's date
- `used_runs` increased by 1
- `updated_at` timestamp is recent (within last few minutes)

---

### Step 10: Verify Game Players Metadata (Optional)
**Action:** Check the `game_players` table metadata for the run

**SQL Query:**
```sql
SELECT id, player_id, game_id, metadata, joined_at
FROM game_players
WHERE player_id = '<your-player-id>'
ORDER BY joined_at DESC
LIMIT 1;
```

**Expected Result:**
- Most recent `game_players` record exists
- `metadata` JSON contains: `{ "dailyRunConsumed": true, "wallet": "...", "sessionId": "..." }`
- This confirms the run was recorded with the `dailyRunConsumed` flag

---

## Success Criteria

| Criterion | Required | How to Verify |
|-----------|----------|---------------|
| Initial daily runs count retrieved | ✅ Yes | API/UI shows current remaining runs |
| Progression mode selected | ✅ Yes | "Progression" button highlighted, description visible |
| Run starts successfully | ✅ Yes | Game loads, no "runs exhausted" error |
| Server log shows run deduction | ✅ Yes | Console shows `[registerGamePlayer] Daily run deducted` |
| Remaining runs decreased by 1 | ✅ Yes | API/UI shows `remainingRuns` decreased by exactly 1 |
| No "Credits deducted" messages | ✅ Yes | Server logs show only run deduction, not credits |
| Database record updated | ✅ Yes | `player_daily_runs.used_runs` increased by 1 |
| Game players metadata correct | ✅ Yes | `game_players.metadata.dailyRunConsumed === true` |
| No console errors | ✅ Yes | Browser console is clean |

---

## Test Data

### Daily Run Tiers
```typescript
// From data/game-config.ts
tiers: [
  { usdcStakedGte: 0, dailyRuns: 10 },
  { usdcStakedGte: 100, dailyRuns: 20 },
  { usdcStakedGte: 1000, dailyRuns: 30 }
]
```

### Expected API Response
```json
{
  "date": "2026-01-24",
  "resetAtUtc": "2026-01-25T00:00:00.000Z",
  "usdcStaked": 0,
  "allowedRuns": 10,
  "usedRuns": 3,
  "remainingRuns": 7,
  "tiers": [...]
}
```

---

## API Endpoints for Verification

### Get Daily Runs Status
```
GET http://localhost:2567/api/player/daily-runs
```
Returns: `{ date, resetAtUtc, usdcStaked, allowedRuns, usedRuns, remainingRuns, tiers }`

### Reset Daily Runs (Dev Only)
```
POST http://localhost:2567/api/admin/daily-runs/reset
Body: { "playerId": "<player-id>" }
```
**Note:** Only available in development mode. Use this to reset runs for re-testing.

---

## Troubleshooting

### Daily Runs Not Decreasing
1. **Check if `devSkipEntryFee=true` is in URL** - Remove it! We need entry fee to test run deduction.
2. Verify server logs show `[registerGamePlayer] Daily run deducted`
3. Check database: `SELECT * FROM player_daily_runs WHERE account_id = '<player-id>' AND date = CURRENT_DATE::text`
4. Verify the run is in Progression mode (not Practice or Competition)

### "Runs Exhausted" Error
1. Check current `remainingRuns` - if it's 0, you've used all runs for today
2. Use dev reset endpoint: `POST /api/admin/daily-runs/reset`
3. Or wait until UTC midnight for automatic reset

### Server Log Shows "Credits deducted"
1. This is a bug - we should only see "Daily run deducted"
2. Check `apps/server/src/rooms/SharedGame.ts` - ensure no credit deduction code remains
3. Verify `consumeProgressionRun()` is being called, not any credit deduction

### API Returns 401 Unauthorized
1. Ensure you're using the correct session cookie from the browser
2. Check that `dev=true` is in the URL (enables dev wallet login)
3. Verify the server is running and accessible

### Database Record Not Found
1. Check the `account_id` matches your player ID (from session)
2. Verify the `date` is today's date in UTC (format: `YYYY-MM-DD`)
3. Check if the run actually started (game_players record exists)

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/server/src/rooms/SharedGame.ts` | `registerGamePlayer()` - Run deduction logic |
| `apps/server/src/lib/db/repos/player-daily-runs.ts` | `consumeDailyRun()` - Database consumption |
| `apps/server/src/routes/daily-runs.ts` | `/api/player/daily-runs` - Status endpoint |
| `apps/client/src/components/Lobby.tsx` | Daily runs UI display |
| `apps/client/src/hooks/useDailyRuns.ts` | Client-side daily runs fetching |
| `docs/daily-runs.md` | Daily runs specification |

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

### Reset Daily Runs for Re-Testing

If you need to run this test again on the same day:

1. Use the dev reset endpoint:
```bash
curl -X POST http://localhost:2567/api/admin/daily-runs/reset \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"playerId": "<your-player-id>"}'
```

2. Or manually update the database:
```sql
UPDATE player_daily_runs
SET used_runs = 0
WHERE account_id = '<your-player-id>'
  AND date = CURRENT_DATE::text;
```
