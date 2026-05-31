# Dev Mode - Browser Testing Guide

Dev Mode allows you to test the game with custom configurations like specific equipment, potions, starting conditions, and more. This is useful for:

- Testing specific wearables (e.g., milkshake healing grenade)
- Testing game mechanics with specific potion counts
- Starting at higher floors to test late-game content
- Debugging equipment interactions

## Quick Start

Add `?dev=true&devMode=true` to your URL along with any parameters you want to test:

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake&devHealthPotions=10
```

**Note:** 
- `dev=true` - Enables dev wallet login (bypasses wallet connection)
- `devMode=true` - Enables game dev mode options (equipment overrides, etc.)

## Available Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `devMode` | boolean | Enable dev mode (required) | `devMode=true` |
| `devEquipment` | string (comma-separated) | Override equipped wearables | `devEquipment=milkshake,portal-mage-black-axe` |
| `devHealthPotions` | number | Set health potion count | `devHealthPotions=10` |
| `devGreaterPotions` | number | Set tier 2 health potion count | `devGreaterPotions=6` |
| `devUltraPotions` | number | Set tier 3 health potion count | `devUltraPotions=3` |
| `devManaPotions` | number | Set mana potion count | `devManaPotions=5` |
| `devHud` | boolean | Show potion debug tier tags/logs | `devHud=true` |
| `devLickTongue` | number | Set lick tongue count | `devLickTongue=3` |
| `devStartHp` | number (0-100) | Starting HP percentage | `devStartHp=50` |
| `devStartMana` | number (0-100) | Starting mana percentage | `devStartMana=100` |
| `devStartFloor` | number | Starting floor number | `devStartFloor=5` |
| `devStartDepth` | number | Starting depth (room index). Example: 10 starts in the boss room of floor 1 | `devStartDepth=10` |
| `devInfiniteResources` | boolean | Unlimited potions/no cooldowns | `devInfiniteResources=true` |
| `devSkipEntryFee` | boolean | Skip entry fee charges | `devSkipEntryFee=true` |

## Common Test Scenarios

### Testing the Milkshake Healing Grenade

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake&devStartHp=30
```

This will:
- Equip the milkshake (healing grenade)
- Start with 30% HP so you can see the healing effect

### Testing High-Floor Content

```
http://localhost:3001/?dev=true&devMode=true&devStartFloor=10&devHealthPotions=20&devManaPotions=20
```

This will:
- Start at floor 10 (room 91)
- Give you 20 health and mana potions to survive

### Testing Specific Equipment Combos

```
http://localhost:3001/?dev=true&devMode=true&devEquipment=portal-mage-black-axe,milkshake
```

This will:
- Equip the portal-mage-black-axe (melee weapon)
- Equip the milkshake (healing grenade)

### Testing with Low Resources

```
http://localhost:3001/?dev=true&devMode=true&devHealthPotions=1&devStartHp=20&devStartMana=10
```

This simulates a challenging scenario with limited resources.

## How It Works

### Client Side (`apps/client/src/lib/dev-mode.ts`)

1. The client parses URL parameters when the page loads
2. Dev mode config is converted to room join options
3. Options are sent to the server when joining the room

### Server Side (`apps/server/src/lib/dev-mode.ts`)

1. Server receives dev mode options in the join request
2. Checks if dev mode is allowed (always in development, admin-only in production)
3. Applies overrides to the player:
   - Equipment changes
   - Potion counts
   - Starting HP/Mana
   - Starting floor

### Security

- In **development** (`NODE_ENV !== 'production'`): Dev mode is always allowed
- In **production**: Dev mode requires an admin wallet address

## Finding Wearable Slugs

To find the slug for a wearable you want to test:

1. Check `data/weapons.ts` for weapon slugs
2. Check `data/wearables.ts` for all wearable definitions
3. Use the wearable name in lowercase with hyphens (e.g., "Milkshake" → "milkshake")

### Common Weapon Slugs

| Name | Slug | Type |
|------|------|------|
| Milkshake | `milkshake` | Healing grenade |
| Portal Mage Black Axe | `portal-mage-black-axe` | Melee |
| Aagent Pistol | `aagent-pistol` | Ranged |
| Link Bubbly | `link-bubbly` | Healing grenade |
| MK2 Grenade | `mk2-grenade` | Damage grenade |
| Basketball | `basketball` | Stun grenade |
| Coconut | `coconut` | Stun grenade |

## Running Browser Tests with Dev Mode

### Step 1: Start the Development Servers

```bash
# Terminal 1: Start the server
cd apps/server
pnpm dev

# Terminal 2: Start the client
cd apps/client
pnpm dev
```

### Step 2: Open Browser with Dev Mode

Navigate to:
```
http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake
```

### Step 3: Play the Game

1. Click "Start Game" to join a room
2. The action log will show `[DEV MODE] Your adventure begins. Features: ...`
3. Test the feature you're debugging

### Step 4: Check Logs

- **Client console**: Look for `[DevMode] Joining with dev mode options: ...`
- **Server console**: Look for `[DevMode] Applying dev mode overrides for player: ...`

## Troubleshooting

### Dev Mode Not Working

1. Make sure `devMode=true` is in the URL
2. Check browser console for errors
3. Check server logs for authorization issues
4. In production, verify your wallet is an admin address

### Equipment Not Showing

1. Verify the wearable slug is correct
2. Check if the wearable exists in `data/weapons.ts` or `data/wearables.ts`
3. Check server logs for equipment application errors

### Grenade Button Not Appearing

1. The grenade button only shows if `derivedStats.weapons` contains a grenade
2. Check that the milkshake (or other grenade) is in your `devEquipment` list
3. Verify the equipment was applied (check action log for DEV MODE message)

## Example Test Session

Here's a complete example for testing the milkshake healing grenade:

```bash
# 1. Start servers
cd /Users/coderdan/GitHub/gotchiverse-live
pnpm dev

# 2. Open browser
open "http://localhost:3001/?dev=true&devMode=true&devEquipment=milkshake&devStartHp=30"

# 3. Start the game
# - You should see the grenade button in the UI
# - The action log should show [DEV MODE] message
# - When the grenade is used, you should see "💚 Healed for X HP!"
```

