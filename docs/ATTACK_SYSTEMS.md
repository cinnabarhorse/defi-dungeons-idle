# Attack Systems Documentation

## 🎯 System Overview

The Gotchiverse uses a server-authoritative action system for all combat interactions. This ensures proper animation handling, anti-cheat protection, and consistent game state across all clients.

## 🏗️ Architecture

### Action System (CORRECT APPROACH)

**Use this for ALL attack functionality:**

```typescript
// ✅ CORRECT: Use action system
this.room.send('startAction', {
  type: 'attack_enemy',
  targetId: enemyId,
});
```

## 🐺 Enemy Aggro and Charge Behavior

- When a player enters an enemy's `aggroRange`, the enemy will immediately acquire the player as a target and enter a brief charge state to close distance more aggressively.
- The charge provides a temporary chase speed boost and expires automatically after a short duration.
- Charging can also be triggered when the enemy is damaged by a projectile or grenade.

Server reference:

```21:21:apps/server/src/lib/systems/EnemySystem.ts
// Charging is set when an enemy first acquires a target during aggro scan
```

**Benefits:**

- ✅ Proper attack animations that play fully
- ✅ Automatic pathfinding if enemy moves
- ✅ Server-authoritative timing and validation
- ✅ Integrated cooldown management
- ✅ State protection (animations won't be overridden)

### Direct Attack Method (AVOID)

**Do NOT use this approach:**

```typescript
// ❌ WRONG: Direct attack bypasses systems
this.room.send('attack', {
  targetId: enemyId,
  dir: direction,
});
```

**Problems:**

- ❌ Attack animations get cut off immediately
- ❌ No pathfinding support
- ❌ State conflicts with movement system
- ❌ Bypasses action system protections

## 🎮 Auto-Attack Implementation

The auto-attack aggro range system correctly uses the action system:

```typescript
checkAutoAttackAggro(currentTime: number) {
  // ... enemy detection logic ...

  if (nearestDistance <= attackRange) {
    // ✅ Use action system for proper animations
    this.room.send('startAction', {
      type: 'attack_enemy',
      targetId: nearestEnemy,
    });
  }
}
```

## 🔧 Key Components

### Server-Side (`apps/server/src/lib/actions.ts`)

- **`AttackEnemyAction`**: Handles all enemy combat
- **`BaseInteractiveAction`**: Base class with animation management
- **`ActionManager`**: Coordinates all active actions

### Client-Side (`apps/client/src/game/GameScene.ts`)

- **Auto-attack detection**: `checkAutoAttackAggro()`
- **Action system integration**: Uses `startAction` messages
- **Debug visualization**: Aggro range display

## 📋 Animation Flow

1. **Client**: Sends `startAction` with `attack_enemy` type
2. **Server**: Creates `AttackEnemyAction` instance
3. **Server**: Sets `player.anim = 'attack'` in action logic
4. **Server**: Broadcasts `player_action_animation` message
5. **Client**: Plays attack animation via server-driven system
6. **Server**: Manages action lifecycle and animation resets

## 🎯 Controls

- **A key**: Toggle auto-attack on/off
- **B key**: Toggle debug mode (shows aggro range)
- **Space key**: Manual attack (also uses action system)

## ⚠️ Critical Rules

1. **ALWAYS use the action system** for any attack functionality
2. **NEVER bypass** the action system with direct attack messages
3. **The action system handles animations** - don't try to manage them manually
4. **Server state protection** prevents animation conflicts during actions

## 🔍 Debug Features

When debug mode is enabled (B key):

- **Cyan/Green circle**: Auto-attack aggro range (120px)
- **Orange circle**: Actual attack range (50px melee, 110px ranged)
- **Red highlight**: Current auto-attack target
- **Status label**: Shows auto-attack on/off and range info

## 📊 Configuration

Auto-attack settings in `apps/client/src/lib/constants.ts`:

```typescript
AUTO_ATTACK_AGGRO_RANGE: 120, // pixels - detection range
AUTO_ATTACK_COOLDOWN: 800, // ms - cooldown between auto-attacks
```

## 🚨 Common Mistakes to Avoid

1. **Don't use direct attack messages** - they bypass the animation system
2. **Don't manually manage attack animations** - let the action system handle it
3. **Don't override server state** during actions - respect the action protection
4. **Don't implement custom attack logic** - extend the existing action system instead

---

_Remember: The action system exists to provide consistent, server-authoritative combat with proper animations. Always use it for any attack functionality._
