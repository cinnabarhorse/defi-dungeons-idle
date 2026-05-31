# Browser Test: Potion Tiering System

## Test Overview

| Field            | Value                                                |
| ---------------- | ---------------------------------------------------- |
| **Test ID**      | `potion-tier-001`                                    |
| **Feature**      | 3-tier health potion system with crafting and smart selection |
| **Priority**     | High                                                 |
| **Last Updated** | 2026-01-17                                           |

## Prerequisites

### Server Requirements

- [ ] Server running on `localhost:2567` (or configured port)
- [ ] Client running on `localhost:3001`
- [ ] Database migrations applied (potion_tier column)

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

**Test Case A - Crafting System:**
```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=10
```

**Test Case B - Auto-Consume Smart Selection:**
```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=5&devStartHp=5
```

**Test Case C - Higher Difficulty Drops:**
```
http://localhost:3001/?dev=true&devMode=true&devDifficulty=nightmare
```

| Parameter          | Value       | Purpose                                          |
| ------------------ | ----------- | ------------------------------------------------ |
| `devMode`          | `true`      | Enable dev mode                                  |
| `devHealthPotions` | `10`        | Start with 10 health potions (T1)                |
| `devStartHp`       | `5`         | Start at 5% HP for damage testing                |
| `devDifficulty`    | `nightmare` | Higher difficulty for better drop rates          |

---

## Test Scenario A: Crafting System

### Step A1: Navigate to Game URL

**Action:** Navigate to the dev mode URL with potions

```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=10
```

**Expected Result:**

- Page loads successfully
- No console errors related to dev mode
- Player has 10 health potions visible in HUD

---

### Step A2: Open Crafting Menu

**Action:** Click the "Craft" button in the Lobby UI (next to Shop button)

**Expected Result:**

- Crafting menu modal opens
- Current potion inventory displays:
  - T1 (Health Potion): 10
  - T2 (Greater Healing Potion): 0
  - T3 (Ultra Healing Potion): 0
- T1→T2 craft button is ENABLED (have >= 3 T1)
- T2→T3 craft button is DISABLED (have < 3 T2)

---

### Step A3: Craft T1 → T2

**Action:** Click the "Craft" button next to the T1→T2 recipe

**Expected Result:**

- Success message appears: "Crafted 1x Greater Healing Potion from 3x Health Potion!"
- Potion counts update:
  - T1: 7 (was 10, -3)
  - T2: 1 (was 0, +1)
  - T3: 0
- T1→T2 button still enabled
- T2→T3 button still disabled

---

### Step A4: Craft Multiple T2s

**Action:** Click T1→T2 craft button twice more

**Expected Result:**

- After 2 more crafts:
  - T1: 1 (7 - 6)
  - T2: 3 (1 + 2)
  - T3: 0
- T1→T2 button now DISABLED (only 1 T1 left)
- T2→T3 button now ENABLED (have 3 T2)

---

### Step A5: Craft T2 → T3

**Action:** Click the "Craft" button next to the T2→T3 recipe

**Expected Result:**

- Success message appears: "Crafted 1x Ultra Healing Potion from 3x Greater Healing Potion!"
- Potion counts update:
  - T1: 1
  - T2: 0 (3 - 3)
  - T3: 1 (0 + 1)
- Both craft buttons now DISABLED

---

### Step A6: Attempt Craft with Insufficient Materials

**Action:** Attempt to click disabled craft button

**Expected Result:**

- Button is visually disabled (grayed out)
- Clicking has no effect
- No error messages appear

---

### Step A7: Close Crafting Menu

**Action:** Click outside the modal or press Escape

**Expected Result:**

- Modal closes
- Potion counts persist in HUD

---

## Test Scenario B: Smart Auto-Consume Selection

### Step B1: Setup Mixed Tier Inventory

**Action:** 
1. Start game with potions
2. Use crafting to create a mix: 2 T1, 1 T2, 1 T3

**Expected Result:**

- Inventory has mixed tiers

---

### Step B2: Take Moderate Lethal Damage

**Action:** 
1. Start game with low HP (5%)
2. Enable auto-explore
3. Wait for enemy attack dealing ~40 damage

**Expected Result:**

- Auto-heal triggers
- T1 potion consumed (lowest tier that saves)
- If T1 heal (50 HP) is sufficient to survive
- Higher tier potions preserved

---

### Step B3: Take Severe Lethal Damage

**Action:** Wait for enemy dealing large damage (> 50 HP)

**Expected Result:**

- Auto-heal triggers
- Smart selection picks appropriate tier:
  - If damage > T1 heal, uses T2
  - If damage > T2 heal, uses T3
- Only 1 potion consumed per attack
- If no single potion can save, uses highest available

---

### Step B4: Verify 1-Potion-Per-Attack Limit

**Action:** Take massive damage that exceeds any single potion heal

**Expected Result:**

- Only 1 potion consumed
- Player may still die if damage too severe
- NOT multiple potions consumed to survive

---

## Test Scenario C: Higher Difficulty Drops

### Step C1: Start Nightmare Difficulty

**Action:** Navigate to nightmare difficulty

```
http://localhost:3001/?dev=true&devMode=true&devDifficulty=nightmare
```

**Expected Result:**

- Game starts on nightmare difficulty
- Enemies are harder

---

### Step C2: Kill Enemies and Observe Drops

**Action:** Kill multiple enemies (10+) and observe potion drops

**Expected Result:**

- Some potion drops should be T2 (Greater Healing Potion)
- Rare drops might be T3 (Ultra Healing Potion)
- Drop rates follow:
  - Normal: 100% T1, 0% T2, 0% T3
  - Hard: 90% T1, 10% T2, 0% T3
  - Nightmare: 70% T1, 25% T2, 5% T3

---

### Step C3: Pick Up Tiered Potion

**Action:** Pick up a T2 or T3 potion drop

**Expected Result:**

- Potion added to inventory with correct tier
- HUD shows updated total potion count
- Crafting menu shows correct tier count

---

## Test Scenario D: Manual Potion Use

### Step D1: Setup with Mixed Tiers

**Action:** Create inventory with T1 and T3 potions (craft T2→T3)

**Expected Result:**

- Have both T1 and T3 potions
- NO T2 potions

---

### Step D2: Manually Use Potion at Full HP

**Action:** Press potion key (or click potion in UI) while at full HP

**Expected Result:**

- Nothing happens
- Potions not wasted when at full HP

---

### Step D3: Manually Use Potion with Damage

**Action:** 
1. Take some damage (not lethal)
2. Manually use potion

**Expected Result:**

- T3 potion consumed (highest tier first)
- Heals 50% max HP
- Lower tier potions preserved for emergencies

---

## Success Criteria

| Criterion                                | Required | How to Verify                                         |
| ---------------------------------------- | -------- | ----------------------------------------------------- |
| Crafting menu opens from Lobby           | ✅ Yes   | Click "Craft" button, modal opens                     |
| Crafting 3x T1 → 1x T2 works             | ✅ Yes   | T1 count decreases by 3, T2 increases by 1            |
| Crafting 3x T2 → 1x T3 works             | ✅ Yes   | T2 count decreases by 3, T3 increases by 1            |
| Cannot craft without materials           | ✅ Yes   | Button disabled when < 3 input potions                |
| Cannot craft from T3                     | ✅ Yes   | No T3→T4 recipe available                             |
| Smart selection uses minimum tier to survive | ✅ Yes | Low damage uses T1, high damage uses T2/T3          |
| Only 1 potion per attack                 | ✅ Yes   | Single potion consumed regardless of damage           |
| Higher difficulty drops higher tiers     | ✅ Yes   | Nightmare can drop T2/T3 potions                      |
| Manual use selects highest tier          | ✅ Yes   | Using potion manually consumes T3 before T1           |
| Mana potions unchanged                   | ✅ Yes   | Mana potions have no tier                             |
| No console errors                        | ✅ Yes   | Browser console is clean                              |

---

## Test Data

### Potion Tiers Configuration

```typescript
// From data/game-config.ts
POTION_TIERS = {
  1: { name: 'Health Potion', healPercent: 0.10, minHeal: 50, spriteId: 126 },
  2: { name: 'Greater Healing Potion', healPercent: 0.25, minHeal: 0, spriteId: 127 },
  3: { name: 'Ultra Healing Potion', healPercent: 0.50, minHeal: 0, spriteId: 129 },
};

// Crafting recipes
CRAFTING_RECIPES = [
  { inputTier: 1, outputTier: 2, inputCount: 3, outputCount: 1 },
  { inputTier: 2, outputTier: 3, inputCount: 3, outputCount: 1 },
];
```

### Drop Rate Configuration

```typescript
// From data/game-config.ts
POTION_DROP_RATES = {
  normal: { 1: 1.0, 2: 0.0, 3: 0.0 },     // 100% T1
  hard: { 1: 0.9, 2: 0.1, 3: 0.0 },       // 90% T1, 10% T2
  nightmare: { 1: 0.7, 2: 0.25, 3: 0.05 }, // 70% T1, 25% T2, 5% T3
};
```

### Smart Selection Logic

```typescript
// From potion-utils.ts selectOptimalPotion
// Input: currentHp (negative), maxHp, available potions by tier
// Output: tier to use, or null if no potion
// Logic: 
// 1. Find lowest tier where heal brings HP > 0
// 2. If none can save, use highest available
// 3. Return null if no potions
```

---

## Troubleshooting

### Crafting Button Not Working

1. Verify you have at least 3 potions of the input tier
2. Check browser console for API errors
3. Ensure server is running and logged in

### Drops Always T1

1. Verify difficulty is set correctly (nightmare for T2/T3 drops)
2. Drop rates are probabilistic - kill more enemies
3. Check server logs for drop generation

### Manual Use Not Selecting Highest Tier

1. Verify inventory has multiple tiers
2. Check that all potions are correctly typed with potionTier
3. Server logs should show tier selection

### Smart Selection Issues

1. Verify currentHp is negative when auto-heal triggers
2. Check maxHp value is correct
3. Ensure availablePotions object has correct tier counts

---

## Related Files

| File                                      | Purpose                                            |
| ----------------------------------------- | -------------------------------------------------- |
| `apps/server/src/rooms/CraftingSystem.ts` | Server-side crafting logic                         |
| `apps/server/src/rooms/PotionSystem.ts`   | Auto-heal and manual use logic                     |
| `apps/server/src/lib/potion-utils.ts`     | selectOptimalPotion, computeHealthPotionHeal       |
| `apps/client/src/components/crafting/`    | Crafting menu UI                                   |
| `apps/client/src/components/Lobby.tsx`    | Craft button in Lobby                              |
| `data/game-config.ts`                     | POTION_TIERS, CRAFTING_RECIPES, POTION_DROP_RATES  |
| `data/items.ts`                           | Item definitions with potionTier field             |

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
