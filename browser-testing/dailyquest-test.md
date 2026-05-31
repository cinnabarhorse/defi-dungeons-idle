# Browser Test: Daily Quest Competition Flow

## Test Overview

| Field | Value |
|-------|-------|
| **Test ID** | `dailyquest-001` |
| **Feature** | Daily Quest Competition Enable & Leaderboard |
| **Priority** | High |
| **Last Updated** | 2026-01-07 |

## Prerequisites

### Server Requirements
- [ ] Server running on `localhost:2567` (or configured port)
- [ ] Client running on `localhost:3001`

### Starting the Servers

If the servers are not running, start them in separate terminals:

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

**CRITICAL:** The `devEquipment` parameter must include a damage-dealing weapon. Healing-only weapons (like milkshake alone) cannot kill enemies and the player will die before completing the run.

**Important Prerequisite:** The player account must have **42+ total lick tongues** collected historically to unlock the normal tier. This is stored in the database `players.total_lick_tongues` column. The dev wallet (`dev=true`) typically has this requirement met.

---

## Test Steps

### Step 1: Navigate to Game URL
**Action:** Navigate to the dev mode URL

```
http://localhost:3001/?dev=true&devMode=true&devInfiniteResources=true
```

**Expected Result:**
- Page loads successfully
- Lobby screen is visible
- No console errors related to dev mode

---

### Step 2: Verify Daily Competition Section Exists
**Action:** Take a snapshot of the lobby UI

**Expected Result:**
- A "Competition" section is visible in the lobby
- Shows current multiplier status (e.g., "×1.50" or similar)
- Shows "Enable" button if attunement is available

---

### Step 3: Check Initial Attunement Status
**Action:** Observe the Competition section in the lobby

**Expected Result:**
- "Enable" button is visible (not "ACTIVE" and not "Depleted")
- This indicates 1 daily attunement is available

---

### Step 4: Enable Daily Competition
**Action:** Click the "Enable" button in the Competition section

**Expected Result:**
- Button briefly shows "Attuning..." while processing
- After success, "ACTIVE" badge appears in the Competition section
- The "Enable" button disappears or changes state
- Console shows: `[Daily Quest Attune] Success!`

---

### Step 5: Verify Attunement is Consumed
**Action:** Observe the Competition section after enabling

**Expected Result:**
- The "ACTIVE" badge is visible next to "Competition"
- No "Enable" button visible (attunement was consumed)
- The daily competition is now active for the next run

---

### Step 6: Start the Game
**Action:** Click the "Start Game" button to begin an idle mode run

**Expected Result:**
- Game loads and enters idle dungeon mode
- The score display shows "Daily Quest Score" (indicating competition mode is active)
- Auto-explore is available to toggle on

---

### Step 7: Enable Auto-Explore and Wait for Victory
**Action:** Click the "AUTO: OFF" button to enable auto-explore, then wait for the run to complete

**Note:** The player will automatically fight through the dungeon. With `devInfiniteResources=true`, the player should survive to victory. This may take several minutes.

**Expected Result:**
- "AUTO: ON" is now displayed
- The player progresses through rooms automatically
- Action log shows combat and room progress
- Eventually, the player defeats the boss and "VICTORY" screen appears

---

### Step 8: Verify Run Summary Shows Score
**Action:** On the VICTORY screen, observe the Run Summary

**Expected Result:**
- Run Summary displays the following:
  - "Quest Score" label (indicates this was a competition run)
  - Score value (e.g., `1,234`)
  - Time multiplier badge (e.g., `×1.50` if applicable)
  - Floor reached, Max Depth, Difficulty, Leverage

**Record the displayed Quest Score for later verification.**

---

### Step 9: Record the Final Score
**Action:** Note the exact Quest Score displayed in the Run Summary

**Capture:**
- Raw Score: The base score value
- Time Multiplier: The multiplier applied (if shown)
- Final Quest Score: Raw Score × Time Multiplier

---

### Step 10: Return to Lobby
**Action:** Click the "Return to Lobby" button

**Expected Result:**
- Player returns to the lobby screen
- Game state is reset for a new run

---

### Step 11: Verify Attunement is Depleted
**Action:** Observe the Competition section in the lobby

**Expected Result:**
- "Depleted" text appears instead of "Enable" button
- OR "Enable" button is disabled/grayed out
- This confirms the daily competition credit was consumed

---

### Step 12: Verify Leaderboard Entry
**Action:** Navigate to the leaderboard page at `http://localhost:3001/leaderboard`

**Expected Result:**
- Leaderboard page loads
- "Normal" tier tab is selected (or can be selected)
- Your player's entry appears in the leaderboard
- The displayed score matches the Quest Score from the Run Summary

---

### Step 13: Cross-Verify Scores Match
**Action:** Compare the scores:
1. Quest Score from Run Summary (Step 9)
2. Final Score on Leaderboard (Step 12)

**Expected Result:**
- Both scores are identical
- This confirms the score was correctly recorded to the leaderboard

---

## Success Criteria

| Criterion | Required | How to Verify |
|-----------|----------|---------------|
| Daily competition section visible in lobby | ✅ Yes | Competition section shows in lobby UI |
| Enable button available initially | ✅ Yes | "Enable" button visible before activation |
| Competition activates on Enable click | ✅ Yes | "ACTIVE" badge appears after clicking Enable |
| Attunement consumed after enabling | ✅ Yes | Button changes to "Depleted" or disappears |
| Game shows "Daily Quest Score" label | ✅ Yes | Score section shows competition mode indicator |
| Run completes with victory | ✅ Yes | "VICTORY" screen appears |
| Run Summary shows Quest Score | ✅ Yes | Score displayed in run summary |
| Attunement is zero after run | ✅ Yes | "Depleted" shown in lobby Competition section |
| Leaderboard entry exists | ✅ Yes | Player's score visible on leaderboard page |
| Run Summary score = Leaderboard score | ✅ Yes | Both scores match exactly |
| No console errors | ✅ Yes | Browser console is clean |

---

## Test Data

### Competition Tier Requirements
```typescript
// From data/game-config.ts
tierUnlockThresholds: {
  normal: 42,    // Lick Tongues needed
  nightmare: 100,
  hell: 500,
}
```

### Time Multipliers (first run of day)
```typescript
timeMultipliers: [
  { hoursAfterReset: 0, multiplier: 1.5 },
  { hoursAfterReset: 4, multiplier: 1.35 },
  { hoursAfterReset: 8, multiplier: 1.2 },
  { hoursAfterReset: 12, multiplier: 1.1 },
  { hoursAfterReset: 16, multiplier: 1.0 },
]
```

### Score Calculation
- **Raw Score**: XP earned during run × Leverage
- **Final Score**: Raw Score × Time Multiplier
- Time multiplier only applies to first run per tier per day

---

## API Endpoints for Verification

### Daily Quest Preview
```
GET http://localhost:2567/api/daily-runs/preview?difficultyId=normal
```
Returns: `remainingAttunements`, `hasUnlockedTier`, `multiplierStatus`

### Daily Quest Attune
```
POST http://localhost:2567/api/daily-runs/attune
Body: { "difficultyId": "normal" }
```
Returns: `remainingAttunements: 0` after consumption

### Leaderboard
```
GET http://localhost:2567/api/daily-quest/leaderboard/normal?limit=100
```
Returns: Array of leaderboard entries with `rawScore`, `finalScore`, `timeMultiplier`, `playerName`

---

## Troubleshooting

### Competition Section Not Appearing
1. Check browser console for errors
2. Verify player has **42+ total lick tongues** in their database record (not in-run count)
3. Check `/api/daily-runs/preview?difficultyId=normal` response for `hasUnlockedTier: true`
4. If tier is locked, you may need to use an account that has collected enough lick tongues historically

### Enable Button Not Available
1. Check if attunement was already used today
2. Use Dev Mode replenish: POST to `/api/daily-runs/dev-replenish`
3. Verify server is in development mode (NODE_ENV !== 'production')

### Score Not Appearing on Leaderboard
1. Verify the run was completed (boss killed = victory)
2. Check server logs for "Submitted score to competition leaderboard"
3. Verify `daily_quest:leaderboard_update` message was sent to client
4. Check if score is higher than previous entry (only best score per day is kept)

### Player Dies Before Victory
1. Ensure `devInfiniteResources=true` is in the URL (provides unlimited potions, no cooldowns)
2. Alternatively, add potions: `devHealthPotions=99&devManaPotions=99`
3. Equip strong weapons: `devEquipment=frying-pan`

### Dev Mode Not Working
1. Ensure `devMode=true` is in the URL
2. Ensure `dev=true` is in the URL for dev wallet login
3. Check server logs for `[DevMode] Dev mode requested but not allowed`
4. In production, verify wallet is an admin address

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/client/src/components/Lobby.tsx` | Daily quest section UI, Enable button |
| `apps/client/src/hooks/useIdleGame.ts` | Competition state tracking |
| `apps/client/src/components/idle/IdleDungeonScreen.tsx` | Run summary display, Quest Score |
| `apps/server/src/routes/daily-runs.ts` | Attune/preview API endpoints |
| `apps/server/src/rooms/IdleMode.ts` | Victory handling, leaderboard submission |
| `apps/server/src/rooms/DailyQuestSystem.ts` | `submitToCompetitionLeaderboard` |
| `apps/server/src/routes/daily-quest-competition.ts` | Leaderboard API endpoints |
| `apps/server/src/lib/daily-quest-competition.ts` | Competition config, tier mapping |
| `apps/client/src/lib/dev-mode.ts` | Client dev mode parsing |
| `apps/server/src/lib/dev-mode.ts` | Server dev mode application |

---

## Test Execution Log

| Date | Tester | Result | Notes |
|------|--------|--------|-------|
| 2026-01-07 | AI Agent | ✅ PASS | All 7 requirements verified |
|            |          |         | - Enable button → "ACTIVE" badge appeared |
|            |          |         | - "0 left" attunements (credit consumed) |
|            |          |         | - Game showed "Daily Quest Score" with ×1.20 multiplier |
|            |          |         | - VICTORY achieved on Floor 1-10 |
|            |          |         | - Final score: 4,272 (raw) × 1.20 (time bonus) |
|            |          |         | - Leaderboard shows exact same score: 4,272 |
|            |          |         | - Return to lobby: "0 left" + "#2 • 4,272" displayed |

### Key Learnings from Test
1. **Healing-only weapons won't win** - Milkshake grenade alone cannot deal damage; player dies
2. **Use devEquipment param** - `devEquipment=portal-mage-black-axe,milkshake` equips damage weapon
3. **Server runs on port 1999** - Not 2567 in dev mode; check network requests
4. **Replenish resets daily quest** - Click "🔄 Replenish" button to reset after failed run

---

## Cleanup

After testing, if you started the servers:

1. Press `Ctrl+C` in the server terminal to stop the game server
2. Press `Ctrl+C` in the client terminal to stop the Next.js client

This prevents port conflicts with future test runs.

### Reset Daily Quest for Re-Testing

If you need to run this test again on the same day:

1. In dev mode, use the replenish endpoint:
```bash
curl -X POST http://localhost:2567/api/daily-runs/dev-replenish \
  -H "Cookie: <your-session-cookie>"
```

2. Or, the test can call this automatically before running if needed


