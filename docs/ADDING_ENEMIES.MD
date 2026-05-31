# Adding New Enemies to Gotchiverse Live

This guide explains which files need to be updated when adding new enemy types to the game.

## Overview

Enemy types in Gotchiverse Live consist of:

1. **Server-side definitions**: Stats, behavior, and animation timing
2. **Client-side configurations**: Sprite sheets, animations, and UI interactions
3. **Map editor integration**: Making enemies available for placement

## Required Files to Update

### 1. Server-Side Files

#### `apps/server/src/data/enemies.ts`

- **Purpose**: Defines enemy stats and behavior
- **What to add**: New enemy entry in the `ENEMY_TYPES` object
- **Required fields**:
  - `enemyType`: String identifier (matches sprite config key)
  - `name`: Display name
  - `health`/`maxHealth`: HP values
  - `damage`: Attack damage
  - `aggroRange`: Detection distance
  - `attackRange`: Attack distance
  - `speed`: Movement speed
  - `patrolRadius`: Patrol area size
  - `attackType`: 'melee' or 'ranged'
  - `animated`: Set to `true` for sprite-based enemies
  - `projectileSpeed`: (Optional, for ranged enemies)
  - `spriteConfig`: (Optional, for animated enemies)
    - `displayWidth`/`displayHeight`: Sprite display size
    - `interactiveWidth`/`interactiveHeight`: Click detection area

#### `apps/server/src/data/enemy-animation-config.ts`

- **Purpose**: Defines animation timing for server-side synchronization
- **What to add**:
  1. Animation data object (e.g., `ENEMY_NAME_ANIMATIONS`)
  2. Case in `getEnemyAnimationDuration()` function
- **Animation fields**:
  - `frameRate`: Frames per second
  - `frameCount`: Number of frames in animation

### 2. Client-Side Files

#### `apps/client/src/lib/enemy-sprite-config.ts`

- **Purpose**: Defines sprite sheet layout and animations
- **What to add**:
  1. Individual sprite config object (e.g., `ENEMY_NAME_SPRITE_CONFIG`)
  2. Entry in `ENEMY_SPRITE_CONFIGS` export object
- **Config fields**:
  - `key`: Identifier (matches `enemyType`)
  - `imagePath`: Path to sprite sheet
  - `frameWidth`/`frameHeight`: Individual frame dimensions
  - `animations`: Array of animation definitions

#### `apps/client/src/app/helpers.ts`

- **Purpose**: Handles enemy rendering and interaction
- **What to add**: No changes needed! Interactive areas are now automatically configured from server-side `spriteConfig` data
- **How it works**: The `renderEnemySprite()` function reads `enemy.spriteConfig` and applies display size and interactive area automatically

### 3. Map Editor Files

#### `apps/client/src/types/map-editor.ts`

- **Purpose**: TypeScript types for map editor
- **What to add**: New enemy type to `EnemyType` union type

#### `apps/client/src/data/map-editor-assets.ts`

- **Purpose**: Assets available in map editor
- **What to add**: New enemy entry in `enemies.assets` array
- **Required fields**:
  - `id`: Unique identifier
  - `name`: Display name
  - `isEnemy`: Set to `true`
  - `enemyType`: Must match server-side `enemyType`
  - `category`: Set to `'enemies'`

### 4. Auto-Generated Files (Optional)

#### `data/enemies.js`

- **Purpose**: Compiled JavaScript version for compatibility
- **Note**: This file is auto-generated and should include warning comments
- **What to add**: Same enemy definition as TypeScript version

## Animation Configuration Guide

### Sprite Sheet Layout

Enemy sprite sheets should follow this pattern:

- **Row-based layout**: Each animation type uses one or more rows
- **Consistent frame size**: All frames should be the same dimensions
- **Frame naming**: Unity meta files typically name frames as `enemy_0`, `enemy_1`, etc.

### Animation Types

Standard animations for enemies:

- `idle`: Looping idle animation
- `walk`: Movement animation
- `sprint`: Faster movement (optional)
- `attack`: Attack animation (non-looping)
- `hurt`: Damage reaction (non-looping)
- `death`: Death animation (non-looping)

### Frame Rate Guidelines

- **Idle**: 6-12 FPS for gentle movement
- **Walk**: 8-12 FPS for natural movement
- **Attack**: 10-15 FPS for impactful strikes
- **Hurt**: 12-15 FPS for quick reactions
- **Death**: 6-10 FPS for dramatic effect

## Interactive Area Configuration

Set appropriate interactive rectangles based on sprite size:

```typescript
// For 38x29 sprite (like Slime)
new Phaser.Geom.Rectangle(-19, -14, 38, 29);

// For 64x48 sprite (like RektDoggo)
new Phaser.Geom.Rectangle(-32, -24, 64, 48);
```

## Example: Adding "Slime" Enemy

1. **Server stats** (`apps/server/src/data/enemies.ts`):

```typescript
slime: {
  enemyType: 'slime',
  name: 'Slime',
  health: 25,
  maxHealth: 25,
  damage: 15,
  aggroRange: 80,
  attackRange: 26,
  speed: 1.3,
  patrolRadius: 40,
  attackType: 'melee',
  animated: true,
  spriteConfig: {
    displayWidth: 57,
    displayHeight: 43,
    interactiveWidth: 57,
    interactiveHeight: 43,
  },
}
```

2. **Client sprite config** (`apps/client/src/lib/enemy-sprite-config.ts`):

```typescript
export const SLIME_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'slime',
  imagePath: '/sprites/enemies/Slime.png',
  frameWidth: 38,
  frameHeight: 29,
  animations: [
    {
      key: 'idle',
      row: 0, // First row, frames 0-3
      startFrame: 0,
      endFrame: 3,
      frameRate: 8,
      repeat: -1,
    },
    {
      key: 'walk',
      row: 0, // First row, frames 4-10
      startFrame: 4,
      endFrame: 10,
      frameRate: 10,
      repeat: -1,
    },
    // ... other animations
  ],
};
```

3. **Interactive area**: No manual configuration needed! The `spriteConfig` from step 1 automatically configures both display size and interactive area.

## Testing Your New Enemy

1. **Server**: Enemy should spawn and behave according to stats
2. **Client**: Animations should play correctly
3. **Map Editor**: Enemy should appear in enemy list and be placeable
4. **Interactions**: Click detection should work properly

## Common Issues

- **Animation sync**: Ensure server animation config matches client frame rates
- **Sprite path**: Verify image path is correct and file exists
- **Interactive area**: Test click detection - adjust rectangle if needed
- **Type errors**: Ensure all TypeScript types are updated consistently
