# Browser Test: Milkshake Healing Grenade

## Test Overview

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| **Test ID**      | `grenade-001`                      |
| **Feature**      | Healing Splash Grenade (Milkshake) |
| **Priority**     | High                               |
| **Last Updated** | 2026-01-07                         |

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
http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake&devStartHp=30&devHealthPotions=0
```

**Note:** The `dev=true` parameter enables dev wallet login (bypasses wallet connection). The `devMode=true` parameter enables game dev mode options.

| Parameter          | Value       | Purpose                                     |
| ------------------ | ----------- | ------------------------------------------- |
| `devMode`          | `true`      | Enable dev mode                             |
| `devEquipment`     | `milkshake` | Equip the healing grenade                   |
| `devStartHp`       | `30`        | Start at 30% HP to observe healing          |
| `devHealthPotions` | `0`         | No health potions (isolate grenade healing) |

---

## Test Steps

### Step 1: Navigate to Game URL

**Action:** Navigate to the dev mode URL

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake&devStartHp=30&devHealthPotions=0
```

**Expected Result:**

- Page loads successfully
- No console errors related to dev mode

---

### Step 2: Start the Game

**Action:** Click the "Start Game" button to join an idle mode room

**Expected Result:**

- Game room loads
- Action log displays: `[DEV MODE] Your adventure begins. Features: ...`
- Player HP is at ~30% of max HP

---

### Step 3: Verify Grenade Button Appears

**Action:** Take a snapshot of the game UI

**Expected Result:**

- A grenade/ability button is visible in the UI
- Button shows the milkshake grenade icon or label
- Button is not on cooldown initially

---

### Step 4: Observe Grenade Usage in Combat

**Action:** Wait for combat encounter and observe grenade behavior

**Expected Result (Low HP Scenario):**

- When player HP is below max, grenade triggers automatically
- Action log shows: `[Milkshake icon] Milkshake healed for X HP!` (where X > 0)
- Player HP increases after healing

**Expected Result (Full HP Scenario):**

- When player HP is at max, grenade does NOT trigger (conserves cooldown)
- Player uses regular attack instead
- Grenade will trigger on the next turn when player HP drops below max

---

### Step 5: Verify Cooldown Behavior

**Action:** After grenade is used, observe cooldown

**Expected Result:**

- Grenade button shows cooldown indicator
- Cooldown duration is ~10 seconds (as defined in weapon config)
- Grenade cannot be used again until cooldown expires

---

## Success Criteria

| Criterion                    | Required | How to Verify                                           |
| ---------------------------- | -------- | ------------------------------------------------------- |
| Dev mode activates correctly | ✅ Yes   | Action log shows `[DEV MODE]` message                   |
| Milkshake is equipped        | ✅ Yes   | Grenade indicator visible in Player section             |
| Healing works when HP < max  | ✅ Yes   | `[icon] Milkshake healed for X HP!` in action log       |
| Skips usage when HP = max    | ✅ Yes   | No healing message when at full HP, uses regular attack |
| Cooldown applies after use   | ✅ Yes   | Grenade indicator shows cooldown (e.g., "10s", "9s")    |
| Icon shows in action log     | ✅ Yes   | Milkshake SVG icon appears next to healing message      |
| No console errors            | ✅ Yes   | Browser console is clean                                |

---

## Test Data

### Milkshake Weapon Definition

```typescript
milkshake: {
  weaponType: 'grenades',
  weaponCategory: 'heal-splash',
  grenade: {
    blastRadiusPx: 120,
    healingSplash: {
      radius: 120,
      healAmount: 110,
      cooldownMs: 10000,
      affectsSelf: true,
      alliesOnly: true,
    },
  },
  slots: ['handLeft', 'handRight'],
}
```

### Expected Healing Amount

- Base heal: 110 HP
- Affected by: Player's healing modifiers (if any)

---

## Troubleshooting

### Grenade Button Not Appearing

1. Check browser console for errors
2. Verify `derivedStats.weapons` contains a grenade type weapon
3. Check server logs for `[DevMode] Applying equipment overrides`

### Healing Not Triggering

1. Verify `getEquippedGrenadeSlug` returns `"milkshake"`
2. Check `processGrenade` is being called in the encounter loop
3. Verify player HP is below max HP

### Dev Mode Not Working

1. Ensure `devMode=true` is in the URL
2. Check server logs for `[DevMode] Dev mode requested but not allowed`
3. In production, verify wallet is admin address

---

## Related Files

| File                                   | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `apps/server/src/rooms/IdleMode.ts`    | `getEquippedGrenadeSlug`, `processGrenade` |
| `apps/server/src/data/weapons.ts`      | Milkshake weapon definition                |
| `apps/client/src/hooks/useIdleGame.ts` | Client-side grenade detection              |
| `apps/client/src/lib/dev-mode.ts`      | Dev mode URL parsing                       |
| `apps/server/src/lib/dev-mode.ts`      | Server-side dev mode application           |

---

## Test Execution Log

| Date       | Tester   | Result  | Notes                                               |
| ---------- | -------- | ------- | --------------------------------------------------- |
| 2026-01-07 | AI Agent | ✅ PASS | Updated: Milkshake now skips when at full HP        |
|            |          |         | - Waits until player takes damage before triggering |
|            |          |         | - `Milkshake healed for 8 HP!` after taking damage  |
|            |          |         | - Icon shows in action log next to healing message  |
|            |          |         | - Grenade indicator in Player section with cooldown |
|            |          |         | - No more "already at full HP" wasted activations   |

---

## Cleanup

After testing, if you started the servers:

1. Press `Ctrl+C` in the server terminal to stop the game server
2. Press `Ctrl+C` in the client terminal to stop the Next.js client

This prevents port conflicts with future test runs.
