# Browser Test: Health Potion Auto-Use System

## Test Overview

| Field            | Value                                                |
| ---------------- | ---------------------------------------------------- |
| **Test ID**      | `potion-001`                                         |
| **Feature**      | Auto-potion consumption when taking lethal damage    |
| **Priority**     | High                                                 |
| **Last Updated** | 2026-01-09                                           |

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

**Test Case A - Lethal Enemy Damage:**
```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=5&devStartHp=10
```

**Test Case B - Lethal Poison Damage (Slime Encounter):**
```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=5&devStartHp=10
```

**Note:** The `dev=true` parameter enables dev wallet login (bypasses wallet connection). The `devMode=true` parameter enables game dev mode options.

| Parameter          | Value | Purpose                                          |
| ------------------ | ----- | ------------------------------------------------ |
| `devMode`          | `true`| Enable dev mode                                  |
| `devHealthPotions` | `5`   | Start with 5 health potions in persistent inventory |
| `devStartHp`       | `10`  | Start at 10% HP to ensure lethal damage triggers |

---

## Test Scenario A: Auto-Potion on Enemy Attack

### Step A1: Navigate to Game URL

**Action:** Navigate to the dev mode URL

```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=5&devStartHp=10
```

**Expected Result:**

- Page loads successfully
- No console errors related to dev mode

---

### Step A2: Start the Game

**Action:** Click the "Start Game" button to join an idle mode room

**Expected Result:**

- Game room loads
- Action log displays: `[DEV MODE] Your adventure begins. Features: healthPotions=5, startHp=10%`
- Player HP is at ~10% of max HP (very low)
- Potion count shows 5 health potions

---

### Step A3: Enable Auto-Explore

**Action:** Click the "AUTO: OFF" button to enable auto-explore

**Expected Result:**

- "AUTO: ON" is now displayed
- Combat begins automatically

---

### Step A4: Observe Auto-Potion on Lethal Enemy Damage

**Action:** Wait for enemy attack that would deal lethal damage

**Expected Result:**

- When HP drops to 0 or below from enemy attack, a potion is consumed
- Action log shows: `CRITICAL! Consumed X HP Potion(s) to survive! Recovered Y HP.`
- Player HP is restored to positive value
- Potion count decreases by the number consumed
- Player survives and combat continues

---

## Test Scenario B: Auto-Potion on Poison Damage

### Step B1: Navigate to Game URL

**Action:** Navigate to the dev mode URL

```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=5&devStartHp=10
```

**Expected Result:**

- Page loads successfully
- No console errors related to dev mode

---

### Step B2: Start the Game

**Action:** Click the "Start Game" button to join an idle mode room

**Expected Result:**

- Game room loads
- Player HP is at ~10% of max HP (very low)
- Potion count shows 5 health potions

---

### Step B3: Encounter Slime Enemy (Poison Source)

**Action:** Wait for or find a Slime enemy encounter

**Note:** Slimes have a 25% chance to poison on melee hit. Poison deals 3 damage/second for 5 seconds.

**Expected Result:**

- Slime enemy appears in combat
- Action log shows poison application: `☠️ Slime POISONED you! (5 turns, 3 dmg/turn)` 

---

### Step B4: Observe Auto-Potion on Lethal Poison Tick

**Action:** Wait for poison tick to deal lethal damage

**Expected Result:**

- When HP drops to 0 from poison damage, a potion is consumed
- Action log shows: `☠️ CRITICAL! Consumed X HP Potion(s) to survive poison! Recovered Y HP.`
- Player HP is restored to positive value
- Potion count decreases
- Player survives and combat continues
- This is the critical bug fix verification - poison death should NOT occur if potions are available

---

### Step B5: Verify Poison Wears Off

**Action:** Continue combat until poison expires

**Expected Result:**

- Action log shows: `☠️ Poison deals X damage! The poison wears off.`
- Player is no longer poisoned
- HP regeneration resumes (if enabled)

---

## Test Scenario C: No Potions = Death

### Step C1: Navigate to Game URL (No Potions)

**Action:** Navigate to the dev mode URL with 0 potions

```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=0&devStartHp=10
```

**Expected Result:**

- Page loads successfully
- Potion count shows 0 health potions

---

### Step C2: Start and Enable Auto-Explore

**Action:** Click "Start Game" then enable auto-explore

**Expected Result:**

- Combat begins with very low HP
- No potions available

---

### Step C3: Observe Death Without Potions

**Action:** Wait for lethal damage

**Expected Result:**

- When HP drops to 0, NO potion message appears
- Action log shows: `You were defeated. LOOT LOST!` or `You succumbed to poison. LOOT LOST!`
- Run ends in death
- This confirms potions are actually required to survive

---

## Success Criteria

| Criterion                                | Required | How to Verify                                         |
| ---------------------------------------- | -------- | ----------------------------------------------------- |
| Dev mode activates correctly             | ✅ Yes   | Action log shows `[DEV MODE]` message with features   |
| Health potions are set via devHealthPotions | ✅ Yes   | Potion count matches URL parameter                 |
| Starting HP respects devStartHp          | ✅ Yes   | HP bar shows ~10% at game start                      |
| Auto-potion triggers on enemy damage     | ✅ Yes   | `CRITICAL! Consumed X HP Potion(s)` in action log    |
| Auto-potion triggers on poison damage    | ✅ Yes   | `☠️ CRITICAL! Consumed X HP Potion(s) to survive poison!` |
| Potion count decreases after use         | ✅ Yes   | UI shows reduced potion count                        |
| Player survives with potions             | ✅ Yes   | HP is positive after auto-potion                     |
| Player dies without potions              | ✅ Yes   | `LOOT LOST!` message appears with 0 potions          |
| No console errors                        | ✅ Yes   | Browser console is clean                             |

---

## Test Data

### Health Potion Healing Formula

```typescript
// From PotionSystem.ts and IdleMode.ts
const healPerPotion = Math.max(player.maxHp * 0.1, 50);
// Heals 10% of max HP, minimum 50 HP per potion
```

### Slime Poison Parameters

```typescript
// From data/enemies.ts
slime: {
  abilities: [{
    id: 'poison',
    params: {
      chance: 0.25,        // 25% chance on hit
      durationMs: 5000,    // 5 seconds = 5 turns in idle mode
      damagePerSecond: 3,  // 3 damage per tick
      tickIntervalMs: 1000,
      appliesTo: 'melee',
    },
  }],
}
```

### Auto-Potion Priority (Idle Mode)

```typescript
// Run-collected potions are used FIRST (lost on death anyway)
const runPotions = player.idleRoom.runHealthPotionsCollected;
const persistentPotions = player.healthPotionCount;
const totalAvailablePotions = runPotions + persistentPotions;

// Use run-collected first
const runPotionsToUse = Math.min(potionsToUse, runPotions);
const persistentPotionsToUse = potionsToUse - runPotionsToUse;
```

---

## Troubleshooting

### Auto-Potion Not Triggering

1. Verify `devHealthPotions` parameter is in URL
2. Check server logs for `[DevMode] Applied features: healthPotions=X`
3. Verify player actually has potions (check UI counter)
4. Ensure damage is actually lethal (HP must drop to 0 or below)

### Poison Not Being Applied

1. Slimes only have 25% chance to poison - may take multiple hits
2. Check action log for `☠️ ... POISONED you!` message
3. Find another slime encounter if first one doesn't poison

### Player Dying Despite Having Potions

**This is the BUG that was fixed.** If this happens:

1. Check if death was from poison vs enemy damage
2. Verify server code includes the poison auto-potion fix in `IdleMode.ts`
3. Check server logs for any errors during the poison tick
4. Confirm the death message - `succumbed to poison` indicates the poison death path

### Dev Mode Not Working

1. Ensure `devMode=true` is in the URL
2. Ensure `dev=true` is in the URL for dev wallet login
3. Check server logs for `[DevMode] Dev mode requested but not allowed`
4. In production, verify wallet is an admin address

### Daily Runs Exhausted

If "Start Run" is disabled due to daily runs being exhausted:

1. Add `devSkipEntryFee=true` to the URL while in dev mode.
2. Refresh the page.

---

## Related Files

| File                                      | Purpose                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `apps/server/src/rooms/IdleMode.ts`       | Poison tick auto-potion, enemy attack auto-potion  |
| `apps/server/src/rooms/PotionSystem.ts`   | `tryAutoHeal` for legacy tick-based mode           |
| `apps/server/src/lib/dev-mode.ts`         | Dev mode URL parameter handling                    |
| `apps/client/src/lib/dev-mode.ts`         | Client-side dev mode parsing                       |
| `data/enemies.ts`                         | Slime poison ability definition                    |

---

## Bug Fix Reference

**Issue:** Players dying from poison damage despite having potions in inventory.

**Root Cause:** In `IdleMode.ts`, the poison tick section (lines ~171-204) was missing auto-potion logic. When poison damage dropped HP to 0, it immediately set `runStatus = 'dead'` without checking for potions.

**Fix:** Added the same auto-potion logic to the poison tick section that already existed in `processEnemyAttack`. The fix:
- Checks both run-collected potions and persistent inventory
- Uses run-collected potions first (they're lost on death anyway)
- Properly decrements counts and updates inventory
- Only kills player if no potions available

**Verification:** This test specifically validates that poison death triggers auto-potion, confirming the bug fix is working.

---

## Test Execution Log

| Date       | Tester   | Result      | Notes                                               |
| ---------- | -------- | ----------- | --------------------------------------------------- |
| _YYYY-MM-DD_ | _Name_ | _Pass/Fail_ | _Notes_                                             |

---

## Cleanup

After testing, if you started the servers:

1. Press `Ctrl+C` in the server terminal to stop the game server
2. Press `Ctrl+C` in the client terminal to stop the Next.js client

This prevents port conflicts with future test runs.

