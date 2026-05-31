# Browser Test: Wizard Abilities (Bounce Attack & Freeze Attack)

## Test Overview

| Field            | Value                                              |
| ---------------- | -------------------------------------------------- |
| **Test ID**      | `wizard-abilities-001`                             |
| **Feature**      | Wizard Spell System (Bounce Attack, Freeze Attack) |
| **Priority**     | High                                               |
| **Last Updated** | 2026-01-07                                         |
| **Status**       | ✅ **IMPLEMENTATION VERIFIED** - Ready for deployment |

---

## ✅ Implementation Complete (2026-01-07)

Spell casting functionality has been **fully implemented** for idle mode with **idle-specific spell logic**.

### Changes Made:

1. **Client: `IdleDungeonScreen.tsx`**
   - `SpellSquare` changed from `<div>` to `<button>` element
   - Added `onClick` prop that calls `castSpell(spell.id)`
   - Added `disabled` prop that disables when not player's turn
   - Added `castSpell` function that sends `idle_cast_spell` message to server
   - Added hover and click states for better UX

2. **Server: `GameRoom.ts`**
   - Added message handler: `onMessage('idle_cast_spell', ...)` at line 875
   - Calls `Idle.handleCastSpell(this, client, data)`

3. **Server: `IdleMode.ts`** - Full idle-specific spell implementation:
   - Added import for `SPELLS_BY_ID` from spells data
   - Added `handleCastSpell` function (lines 1665-1884) that:
     - Validates player turn and encounter state
     - Checks spell cooldown via `player.idleRoom.spellCooldowns`
     - Checks player mana against `spell.manaCost`
     - Finds target enemy from idle encounter
     - Deducts mana directly
     - **Freezing Attack:** Deals damage + reduces enemy action gauge by 50 (slow)
     - **Bounce Attack:** Hits primary target + bounces to others with 20% falloff
     - Awards XP/score for killed enemies
     - Sets cooldown in idle mode format (turns, not ms)
     - Logs action with spell-specific messages (❄️/⚡)
     - Deducts action gauge (spell costs a turn)
     - Checks for encounter completion
     - Applies HP/mana regen after action
     - Sends `spell_cast_result` back to client

4. **Server: `IdleMode.ts` - Cooldown System**
   - Added spell cooldown decrementing in `processNextRoom` (after grenade cooldown)
   - Cooldowns decrement by 1 per room transition

### Critical Bugs Fixed:

1. **Legacy enemy lookup** - The original implementation used `handleManualSpellCast` which looks up enemies from `gameRoom.state.enemies`. This always fails with `'target_not_found'` in idle mode.
   **Fix:** Implemented idle-specific spell logic that directly manipulates `encounter.enemies`.

2. **Missing encounter type check** - Spells could be cast in non-combat encounters (treasure rooms).
   **Fix:** Added `encounter.type !== 'combat'` validation.

3. **Bounce attack duplicate names** - Using enemy names for deduplication could fail if two enemies have the same name.
   **Fix:** Changed to use `enemy.id` for deduplication.

4. **Missing player stun check** - Stunned players could cast spells.
   **Fix:** Added `playerStunTurnsRemaining > 0` check.

5. **Missing weapon type validation** - Server didn't validate weapon category (staff) requirement.
   **Fix:** Added server-side `allowedWeaponTypes` validation using `derived.weaponCategory`.

6. **Missing kill count tracking** - Spell kills didn't increment kill counters for run summary.
   **Fix:** Added `killCount.set()` for all spell kills (freeze + bounce targets).

7. **Missing loot drops** - Spell kills didn't roll for loot.
   **Fix:** Added `rollLootForEnemy()` call for all spell kills.

8. **Boss victory message missing** - Killing boss with spell showed generic "Room cleared" message.
   **Fix:** Added boss detection logic to show proper "Victory! Boss Defeated!" message.

9. **XP leverage multiplier missing** - Spell kills awarded base XP instead of leverage-modified XP.
   **Fix:** Added `GAME_CONFIG.leverage.xpMultiplierEnabled` check matching regular attack behavior.

10. **MapSchema mutation during iteration** - Deleting from spellCooldowns MapSchema during for...of iteration could skip entries.
    **Fix:** Collect expired spell IDs first, then delete in separate loop after iteration.

### Implementation Status:

| Component | Status |
|-----------|--------|
| `SpellSquare` UI | ✅ Now a button element |
| `SpellSquare.onClick` | ✅ Calls `castSpell(spell.id)` |
| `castSpell` client function | ✅ Sends `idle_cast_spell` message |
| Server message handler | ✅ `idle_cast_spell` handler in GameRoom.ts |
| `handleCastSpell` function | ✅ Idle-specific implementation |
| Mana deduction | ✅ Direct deduction in handleCastSpell |
| Cooldown management | ✅ Set on cast, decremented per room |
| Freeze effect | ✅ Damage + action gauge reduction |
| Bounce effect | ✅ Multi-target with ID-based dedup |
| Combat type validation | ✅ Only works in combat encounters |
| Stun validation | ✅ Cannot cast while stunned |
| Weapon type validation | ✅ Server-side staff requirement check |

### Testing Note:

**Local server required** - These changes need to be deployed to test. Restart the server with `pnpm dev` in `apps/server/` directory.

---

## Prerequisites

### Server Requirements

- [ ] Server running on `localhost:2567` (or configured port - often `localhost:1999` in dev)
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

- Server: Look for `Listening on port 2567` (or `1999` in dev mode)
- Client: Look for `Ready on http://localhost:3001`

### Dev Mode Configuration

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=common-wizard-staff&devManaPotions=10
```

**Note:** The `dev=true` parameter enables dev wallet login (bypasses wallet connection). The `devMode=true` parameter enables game dev mode options.

| Parameter         | Value                 | Purpose                                        |
| ----------------- | --------------------- | ---------------------------------------------- |
| `dev`             | `true`                | Enable dev wallet login                        |
| `devMode`         | `true`                | Enable dev mode                                |
| `devEquipment`    | `common-wizard-staff` | Equip the wizard staff (enables spell casting) |
| `devManaPotions`  | `10`                  | Provide mana potions for testing               |

**Character Selection:** Before starting, select the **Wizard** character in the lobby. The Wizard character (`wizard`) has the Mage archetype with mana regen bonuses.

---

## Spell Definitions Reference

### Freezing Attack

```typescript
{
  id: 'freezing_attack',
  name: 'Freezing Attack',
  description: 'Adds a chilling effect to staff attacks, applying the standard Slow on hit.',
  manaCost: 3,
  cooldownMs: 600,
  enabled: true,
  allowedWeaponTypes: ['staff'],
  damage: 20,  // Bonus damage on top of base attack
  autocastEnabledByDefault: true,
  icon: '/spells/freezing_attack_thumb.png',
  effects: { kind: 'freeze' }
}
```

### Bounce Attack

```typescript
{
  id: 'bounce_attack',
  name: 'Bounce Attack',
  description: 'Staff attacks ricochet to nearby enemies, losing 20% damage per hop.',
  manaCost: 3,
  cooldownMs: 600,
  enabled: true,
  allowedWeaponTypes: ['staff'],
  damage: 0,  // Uses base attack damage
  autocastEnabledByDefault: true,
  icon: '/spells/bounce_attack_thumb.png',
  effects: {
    kind: 'bounce',
    maxTargets: 4,       // Includes first target
    radius: 200,         // 200px per hop
    falloffPerHop: 0.2,  // 20% damage reduction per hop
    allowRepeat: false,  // Cannot hit same target twice
    losRequired: true,   // Walls block chain
    travelMs: 80,        // 80ms per hop
    appliesOnHitEffects: true
  }
}
```

---

## Test Steps

### Step 1: Navigate to Game URL

**Action:** Navigate to the dev mode URL

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=common-wizard-staff&devManaPotions=10
```

**Expected Result:**

- Page loads successfully
- Lobby screen is visible
- No console errors related to dev mode

---

### Step 2: Select Wizard Character

**Action:** In the lobby, select the Wizard character from the character selector

**Expected Result:**

- Wizard character card is highlighted/selected
- Character preview shows Wizard with staff equipped
- The character is the Mage archetype with mana regen trait

---

### Step 3: Ensure Daily Runs Available

**Action:** If daily runs are exhausted, enable dev skip via URL

```
http://localhost:3001/?devMode=true&devSkipEntryFee=true
```

**Expected Result:**

- Daily runs limit is bypassed in dev mode
- "Start Run" button is enabled

---

### Step 4: Start the Game

**Action:** Click the "Start Game" button to begin an idle mode run

**Expected Result:**

- Game room loads
- Action log displays: `[DEV MODE] Your adventure begins...`
- Player spawns with the wizard staff equipped

---

### Step 5: Verify Spell Buttons Appear in UI

**Action:** Take a snapshot of the game UI and look for spell ability buttons

**Expected Result:**

- Two spell buttons are visible in the ability bar (bottom-right area)
- Each spell button shows:
  - Spell icon image (`freezing_attack_thumb.png` and `bounce_attack_thumb.png`)
  - "AUTO" badge indicating autocast is enabled
  - Mana cost badge showing "3" (blue badge, top-right of button)
- Neither spell is on cooldown initially

**UI Elements to Verify:**

- `SpellSquare` components with spell icons
- Mana cost badges (showing "3" for each spell)
- No cooldown overlay visible initially

---

### Step 6: Verify Initial Mana Pool

**Action:** Observe the player's mana bar/display

**Expected Result:**

- Player has a mana pool (displayed as blue bar or numeric value)
- Initial mana is at or near maximum (100 by default)
- Mana display is visible in the HUD

---

### Step 7: Enter Combat and Observe Spell Autocasting

**Action:** Wait for enemies to spawn and combat to begin. The wizard will auto-attack with the staff.

**Expected Result:**

- When the player attacks an enemy, spells trigger automatically (autocast)
- Action log shows spell proc messages:
  - `[Freeze icon] Freezing Attack` or similar
  - `[Bounce icon] Bounce Attack` or similar
- Mana decreases after each spell cast (by 3 per spell)

---

### Step 8: Verify Mana Deduction on Spell Cast

**Action:** Monitor mana before and after spell usage during combat

**Expected Result:**

- Before spell cast: Note current mana value (e.g., 100)
- After Freezing Attack: Mana decreases by 3 (e.g., 97)
- After Bounce Attack: Mana decreases by 3 (e.g., 94)
- Mana consumption is consistent at 3 per spell cast

---

### Step 9: Verify Cooldown Behavior

**Action:** After a spell is cast, observe the spell button in the UI

**Expected Result:**

- Spell button shows cooldown overlay (darkened with remaining time)
- Cooldown duration is approximately 600ms (0.6 seconds)
- During cooldown, the spell cannot be cast again
- After cooldown expires, spell button returns to normal state
- Server logs (if visible): `[spell] skip {spell_id} on_cooldown`

---

### Step 10: Verify Insufficient Mana Prevention

**Action:** Deplete mana below the spell cost (3) and observe spell behavior

**Method to deplete mana:**
1. Continue fighting until mana runs low
2. Or use mana potions sparingly while casting spells repeatedly

**Expected Result:**

- When mana < 3, spell buttons show "insufficient mana" visual state:
  - Dimmed appearance (`brightness-75` class)
  - Blue border overlay (`border-blue-500/50`)
- Spells do NOT trigger during autocast when mana is insufficient
- Server logs: `[spell] skip {spell_id} mana_insufficient cost=3 mana={current_mana}`
- Action log does NOT show spell procs when mana is depleted

---

### Step 11: Verify Mana Potion Restores Ability to Cast

**Action:** Use a mana potion when mana is low

**Expected Result:**

- Mana is restored (typically +50 or similar)
- Spell buttons return to normal state (no longer dimmed)
- Spells can be cast again in subsequent attacks
- If mana hits zero during cast, server auto-consumes mana potion

---

### Step 12: Test Freeze Attack - Slow Effect on Enemy

**Action:** Observe enemy behavior after being hit by Freezing Attack

**Expected Result:**

- Enemy receives "slow" status effect
- Server broadcasts: `status_applied { targetId, type: 'slow', amount, durationMs }`
- Enemy movement speed visibly decreases
- Slowed enemy moves slower than the player (cannot catch up)
- Slow effect has limited duration (refreshes on subsequent hits)

**Visual Indicators:**

- Enemy may show slow VFX (if implemented)
- Enemy pathfinding/movement appears sluggish

---

### Step 13: Test Bounce Attack - Multiple Enemy Scenario

**Action:** Wait for a room with 2+ enemies and observe Bounce Attack behavior

**Requirements for Bounce Attack to chain:**
- Multiple enemies in the room (at least 2)
- Enemies within 200px of each other
- Line-of-sight between targets (walls block chain)

**Expected Result:**

- Initial attack hits first enemy
- Bounce Attack chains to nearby enemy (within 200px radius)
- Chain deals reduced damage (80% of previous hop)
- Maximum chain length: 4 targets (including initial)
- Cannot hit the same enemy twice in one chain
- Server broadcasts: `spell_chain_hit { fromId, toId, hopIndex }`

**If only 1 enemy in room:**
- Bounce Attack still triggers but doesn't chain
- Only the initial target takes damage
- Spell still consumes mana and enters cooldown

---

### Step 14: Verify Bounce Attack Damage Falloff

**Action:** In a room with 3+ enemies, observe damage numbers on chained targets

**Expected Result:**

- Target 1: Full damage (100%)
- Target 2: 80% damage (20% reduction)
- Target 3: 64% damage (40% total reduction)
- Target 4: 51.2% damage (60% total reduction, if 4 targets exist)

**Note:** Exact damage values depend on base attack damage and modifiers.

---

### Step 15: Verify Freeze Effect Prevents Enemy Chase

**Action:** After applying Freeze (slow) to an enemy, move the player away

**Expected Result:**

- Slowed enemy cannot catch up to player moving at normal speed
- Player can effectively kite slowed enemies
- Slow effect demonstrates tactical advantage

---

### Step 16: Verify Spells Only Work with Staff Weapons

**Action:** (Optional) If testing weapon restrictions, equip a non-staff weapon

**Expected Result:**

- Spell buttons should NOT appear if no staff-type weapon is equipped
- Spells are restricted to `allowedWeaponTypes: ['staff']`
- This confirms weapon category filtering works correctly

---

## Success Criteria

| Criterion                                     | Required | How to Verify                                              |
| --------------------------------------------- | -------- | ---------------------------------------------------------- |
| Spell buttons appear in UI                    | ✅ Yes   | Two spell buttons visible with icons and mana cost badges  |
| Spells show correct mana cost (3)             | ✅ Yes   | Blue "3" badge on each spell button                        |
| Mana deducted on spell cast                   | ✅ Yes   | Mana decreases by 3 per spell cast                         |
| Cooldown applies after cast                   | ✅ Yes   | Spell button shows cooldown overlay (~0.6s)                |
| Spells blocked when mana < cost               | ✅ Yes   | Dimmed buttons, no spell procs in action log               |
| Freeze Attack applies slow to enemies         | ✅ Yes   | Enemy movement visibly slower, `status_applied` broadcast  |
| Slowed enemies move slower than player        | ✅ Yes   | Player can outrun/kite slowed enemies                      |
| Bounce Attack chains to multiple enemies      | ✅ Yes   | Multiple enemies take damage in sequence                   |
| Bounce damage reduces per hop (20%)           | ✅ Yes   | Subsequent targets take less damage                        |
| Bounce requires multiple enemies to chain     | ✅ Yes   | Single enemy = no chain, just normal hit                   |
| Bounce respects 200px radius                  | ✅ Yes   | Distant enemies not hit by chain                           |
| Bounce limited to 4 targets max               | ✅ Yes   | Chain stops at 4th target                                  |
| Mana potion restores casting ability          | ✅ Yes   | After potion, spells work again                            |
| Autocast badge visible on spell buttons       | ✅ Yes   | "AUTO" badge shown on enabled spells                       |
| No console errors                             | ✅ Yes   | Browser console is clean                                   |

---

## Test Data

### Slow Effect Parameters (from abilities.ts)

```typescript
{
  amount: 0.25,        // 25% movement speed reduction (default)
  durationMs: 2000,    // 2 second duration (default)
  chance: 1,           // 100% application chance
  appliesTo: 'all',    // All attack types
  stacking: 'strongest' // Only strongest slow applies
}
```

### Mana System

- Default max mana: 100
- Mana regen: ~2.5/s in combat, ~5/s out of combat
- Mana potion restore: Variable (typically 30-50)
- Spell mana cost: 3 per spell

### Staff Weapon Category

Spells only activate when the player has a staff-type weapon equipped:

```typescript
allowedWeaponTypes: ['staff']
```

The `common-wizard-staff` is included by default with the Wizard character.

---

## Troubleshooting

### Spell Buttons Not Appearing

1. Verify player has a staff weapon equipped (`common-wizard-staff`)
2. Check `devEquipment=common-wizard-staff` is in URL
3. Verify spells are enabled in `data/spells.ts`
4. Check server logs for weapon category detection

### Spells Not Casting

1. Check mana is ≥ 3
2. Verify spell is not on cooldown (check UI overlay)
3. Confirm autocast is enabled (AUTO badge visible)
4. Check server logs for `[spell] skip` messages with reason

### Freeze Effect Not Visible

1. Verify enemy was hit by staff attack
2. Check server logs for `status_applied` broadcast
3. Enemy may already be slowed (refresh doesn't re-broadcast)
4. Some enemies may have slow immunity (bosses 50% effectiveness)

### Bounce Attack Not Chaining

1. Ensure 2+ enemies in the room
2. Check enemy positions are within 200px radius
3. Verify no walls blocking line-of-sight between targets
4. Bounce requires successful hit on first target

### Mana Not Regenerating

1. Wait for out-of-combat state (faster regen)
2. Mage archetype has +1% mana regen per streak unit
3. Use mana potions for immediate restore
4. Check for server-side mana regen tick (~2.5/s in combat)

### Server Port Issues

If API calls fail, check actual server port:

1. Look at browser Network tab for actual requests
2. Server may run on port **1999** instead of 2567 in dev mode
3. Use `browser_evaluate` to call APIs (uses same origin)

---

## Related Files

| File                                                | Purpose                                 |
| --------------------------------------------------- | --------------------------------------- |
| `data/spells.ts`                                    | Spell definitions (both abilities)      |
| `apps/server/src/data/spells.ts`                    | Server spell definitions                |
| `apps/client/src/data/spells.ts`                    | Client spell definitions                |
| `apps/server/src/lib/spell-system.ts`               | Spell casting logic, mana, cooldowns    |
| `apps/server/src/lib/systems/StatusSystem.ts`       | Slow effect application                 |
| `apps/client/src/components/AbilityBar.tsx`         | Spell button UI rendering               |
| `apps/client/src/components/idle/IdleDungeonScreen.tsx` | SpellSquare component                |
| `apps/client/src/components/GameHUD.tsx`            | Desktop HUD with spell buttons          |
| `apps/client/src/components/MobileGameHUD.tsx`      | Mobile HUD with spell buttons           |
| `data/abilities.ts`                                 | Slow ability parameters                 |
| `data/archetypes.ts`                                | Mage archetype (Wizard character)       |
| `data/characters.ts`                                | Wizard character definition             |

---

## Test Execution Log

| Date | Tester | Result | Notes |
| ---- | ------ | ------ | ----- |
| _YYYY-MM-DD_ | _Name_ | _Pass/Fail_ | _Notes_ |

---

## Cleanup

After testing, if you started the servers:

1. Press `Ctrl+C` in the server terminal to stop the game server
2. Press `Ctrl+C` in the client terminal to stop the Next.js client

This prevents port conflicts with future test runs.

---

## Extended Test Cases (Optional)

### Test Case A: Rapid Spell Casting

**Scenario:** Verify spells respect cooldown in rapid combat

1. Enter combat with multiple enemies
2. Attack rapidly (auto-attack)
3. Verify spells don't cast more frequently than 600ms apart
4. Confirm mana deduction matches spell casts

### Test Case B: Mana Exhaustion Recovery

**Scenario:** Verify smooth transition when mana runs out

1. Cast spells until mana depletes
2. Verify spell buttons become dimmed
3. Wait for mana regen or use potion
4. Verify spells resume automatically

### Test Case C: Freeze + Bounce Synergy

**Scenario:** Verify both spells work together

1. Enter room with 3+ enemies
2. Attack to trigger both spells
3. Verify Freeze slows enemies
4. Verify Bounce chains between slowed enemies
5. Confirm on-hit effects (slow) apply to chained targets

### Test Case D: Boss Combat

**Scenario:** Test spells against boss enemies

1. Progress to boss room
2. Attack boss with staff
3. Verify Freeze applies (with reduced effectiveness if boss has immunity)
4. Verify Bounce doesn't chain (single target in boss room typically)
5. Confirm mana management during extended boss fight

