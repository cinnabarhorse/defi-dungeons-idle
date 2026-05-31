# Browser Testing Troubleshooting Guide

This document captures common issues and solutions encountered during browser testing. Read this BEFORE running tests to avoid wasting time on preventable problems.

## Common Issues & Solutions

### 1. Daily Runs Exhausted

**Symptom:** "Start Run" button is disabled, shows "Daily runs exhausted"

**Solution:** Enable the dev skip flag to bypass daily runs:

```
http://localhost:3001/?devMode=true&devSkipEntryFee=true
```

**Note:** `devSkipEntryFee` only works in development mode (`NODE_ENV !== 'production'`).

---

### 2. Server Not Starting - SUPABASE_URL Error

**Symptom:** Server crashes with `Error: SUPABASE_URL is not configured.`

**Solution:** The server requires database configuration. Check:

1. Verify `.env.local` exists in `apps/server/`:

   ```bash
   ls -la apps/server/.env.local
   ```

2. Ensure it contains required variables:

   ```bash
   # Required minimum:
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   DATABASE_URL=your-postgres-connection-string
   ```

3. If the server was previously running elsewhere, the ports might be in use. Check:
   ```bash
   lsof -i :2567  # Game server
   lsof -i :3001  # Client
   ```

**Note:** The client may connect to a remote/production server even if local server isn't running. Check which server the client is configured to use.

---

### 3. Daily Quest Tier Not Unlocked

**Symptom:** Competition section shows "Locked" or Enable button doesn't appear

**Root Cause:** Daily quest tiers require historical lick tongue collection:

- Normal: 42 total lick tongues
- Nightmare: 100 total lick tongues
- Hell: 500 total lick tongues

**Important:** The `devLickTongue` URL parameter sets the **in-run count**, NOT the total in the database.

**Solution:** Use the lick tongues top-up endpoint:

```bash
# Add 100 lick tongues to player's total
curl -X POST http://localhost:2567/api/player/lick-tongues/top-up \
  -H "Cookie: <session-cookie>"
```

Then refresh the lobby to see the updated unlock status.

---

### 4. Daily Quest Already Used

**Symptom:** Competition section shows "Depleted" instead of "Enable"

**Solution:** Use the dev replenish endpoint:

```bash
curl -X POST http://localhost:2567/api/daily-runs/dev-replenish \
  -H "Cookie: <session-cookie>"
```

This clears today's competition entries and attunements, allowing re-testing.

---

### 5. Client Shows Different Data Than Expected

**Symptom:** Client UI doesn't match what you expect based on API calls

**Possible Causes:**

1. Client is connected to a different server (production vs local)
2. Cached data in React state
3. Session cookie mismatch

**Solution:**

1. Check client's server URL in network requests
2. Hard refresh the page (Cmd+Shift+R)
3. Clear localStorage/sessionStorage
4. Verify cookie domain matches

### 5b. Server Running on Wrong Port

**Symptom:** API calls to localhost:2567 fail, but client works fine

**Root Cause:** In development, the server may run on port **1999** instead of 2567.

**Solution:**

1. Use browser's Network tab to see actual API requests
2. Look for requests like `POST http://localhost:1999/api/...`
3. Use the correct port for manual API calls:
   ```bash
   curl http://localhost:1999/api/player/lick-tongues/top-up -X POST -H "Cookie: ..."
   ```

---

### 6. Browser Click Times Out

**Symptom:** `browser_click` tool returns timeout error

**Solution:**

1. Take a fresh snapshot first: `browser_snapshot`
2. Use the new element refs from the snapshot
3. If element is in a dialog/modal, ensure it's visible
4. Check if element is disabled or covered by another element

---

### 7. Cannot Find Element in Snapshot

**Symptom:** Expected UI element not in snapshot

**Possible Causes:**

1. Element hasn't loaded yet (async data)
2. Element is conditionally rendered based on state
3. Element is scrolled out of view

**Solution:**

1. Wait for data to load: `browser_wait_for` with time parameter
2. Wait for specific text: `browser_wait_for` with text parameter
3. Scroll if needed using `browser_evaluate`

---

## Dev Mode Endpoints Reference

| Endpoint                          | Method | Purpose                     |
| --------------------------------- | ------ | --------------------------- |
| `/api/player/lick-tongues/top-up` | POST   | Add 100 lick tongues        |
| `/api/daily-runs/dev-replenish`   | POST   | Reset daily quest for today |

All dev endpoints require:

- `NODE_ENV !== 'production'`
- Valid session cookie

---

## Pre-Test Checklist

Before running any browser test:

- [ ] Verify server is running: `lsof -i :2567`
- [ ] Verify client is running: `lsof -i :3001`
- [ ] Check daily runs remaining (or use `devSkipEntryFee=true`)
- [ ] Check daily quest tier is unlocked (or add lick tongues)
- [ ] Check daily quest isn't already used (or replenish)
- [ ] Ensure dev mode params are in URL: `?dev=true&devMode=true`

---

## Test Account State Recovery

If a test account gets into a bad state, here's how to recover:

```bash
# 1. Bypass daily runs
# Use devSkipEntryFee=true in the URL while in dev mode

# 2. Add lick tongues (for tier unlocks)
curl -X POST http://localhost:2567/api/player/lick-tongues/top-up \
  -H "Cookie: <session>"

# 3. Reset daily quest
curl -X POST http://localhost:2567/api/daily-runs/dev-replenish \
  -H "Cookie: <session>"
```

---

### 8. Spell Buttons Not Clickable (Idle Mode)

**Symptom:** Playing as Wizard with staff equipped, spell buttons (Freeze Attack, Bounce Attack) appear in the UI when AUTO mode is OFF, but clicking them does nothing. Mana stays at 50/50 throughout the run.

**Root Cause:** Spell **casting** is not implemented in idle mode. The `SpellSquare` component renders spell buttons but has no `onClick` handler.

**Technical Details:**

- `activeWeapon.weaponCategory` syncs correctly as `"staff"` ✅
- `availableSpells` filters correctly and returns `[freezing_attack, bounce_attack]` ✅
- `SpellSquare` renders the buttons with icons and mana cost badges ✅
- `SpellSquare` is a `<div>` with **no `onClick` handler** ❌
- `IdleMode.ts` has no `cast_spell` message handler ❌

**Current Status:** This is an incomplete feature. The UI was added but spell casting functionality was never wired up for idle mode.

**Workaround:** None - spell casting cannot be tested until implemented. The spell system exists in legacy server code and could be ported to idle mode.

**Note:** Spell buttons only appear when AUTO mode is OFF.

---

### 9. Player Dying from Poison Despite Having Potions

**Symptom:** Player dies with "You succumbed to poison. LOOT LOST!" message even though they have health potions in their inventory.

**Root Cause (FIXED):** This was a bug where the poison tick in Idle Mode didn't trigger auto-potion logic. The poison damage path bypassed the potion system entirely.

**Fix Applied:** Auto-potion logic was added to the poison tick section in `IdleMode.ts` (lines ~196-272). Now when poison damage would be lethal, potions are consumed just like during enemy attacks.

**Verification:** Run the `potion-auto-use-test.md` test, specifically Test Scenario B, to confirm poison deaths trigger auto-potion.

**If Bug Recurs:**
1. Check server code at `apps/server/src/rooms/IdleMode.ts` around line 196
2. Look for "POTION AUTO-USE (same logic as enemy attack)" comment
3. Verify the poison tick has `if (player.hp <= 0)` check with potion logic inside

---

## Lessons Learned

1. **Don't assume servers are unavailable** - Check ports, check if client connects to remote server
2. **Solve problems, don't report them** - If daily runs are exhausted, use dev skip. If tiers are locked, unlock them.
3. **Use dev endpoints** - They exist for testing. Use them.
4. **Take snapshots frequently** - Element refs change between interactions
5. **Check actual error messages** - Terminal output often has the real cause
6. **Check feature availability** - Some features (like spells) only exist in legacy code, not idle mode
7. **Check AUTO mode** - Some UI elements only appear when AUTO is OFF (e.g., spell buttons)
8. **Verify damage source paths** - Different damage sources (enemy attacks, poison, etc.) may have separate code paths that need similar logic applied
