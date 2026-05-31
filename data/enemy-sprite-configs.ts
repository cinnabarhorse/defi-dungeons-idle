/**
 * Enemy Sprite Configuration - Single Source of Truth
 * This file contains all enemy sprite configurations used by both client and server
 */

// Re-export the unified types for consistency
export interface AnimationConfig {
  key: string;
  row: number;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  repeat: number;
}

export interface EnemySpriteConfig {
  key: string;
  imagePath: string;
  frameWidth: number;
  frameHeight: number;
  animations: AnimationConfig[];
}

/**
 * RektDoggo Enemy Sprite Configuration
 * Based on Unity animation data and sprite sheet specifications
 */
export const REKT_DOGGO_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'rekt_doggo',
  imagePath: '/sprites/enemies/rektdoggo.png',
  frameWidth: 64,
  frameHeight: 48,
  animations: [
    {
      key: 'idle',
      row: 0,
      startFrame: 0,
      endFrame: 3,
      frameRate: 6,
      repeat: -1,
    },
    {
      key: 'walk',
      row: 1,
      startFrame: 0,
      endFrame: 1,
      frameRate: 8,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 1,
      startFrame: 0,
      endFrame: 1,
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'attack',
      row: 2,
      startFrame: 0,
      endFrame: 3,
      frameRate: 8,
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 3,
      startFrame: 0,
      endFrame: 5,
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 5,
      startFrame: 0,
      endFrame: 7,
      frameRate: 6,
      repeat: 0,
    },
  ],
};

/**
 * Licky Enemy Sprite Configuration
 * Based on Unity animation data and sprite sheet specifications
 */
export const LICKY_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'licky',
  imagePath: '/sprites/enemies/licky.png',
  frameWidth: 126,
  frameHeight: 77,
  animations: [
    {
      key: 'idle',
      row: 0,
      startFrame: 0,
      endFrame: 3,
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'walk',
      row: 1,
      startFrame: 0,
      endFrame: 3,
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 1,
      startFrame: 0,
      endFrame: 3,
      frameRate: 16,
      repeat: -1,
    },
    {
      key: 'hurt',
      row: 2,
      startFrame: 0,
      endFrame: 7,
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'attack',
      row: 3,
      startFrame: 0,
      endFrame: 9,
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 4,
      startFrame: 0,
      endFrame: 17,
      frameRate: 12,
      repeat: 0,
    },
  ],
};

/**
 * Slime Enemy Sprite Configuration
 * Based on Unity animation data and sprite sheet specifications
 * The slime.png.meta shows 24 sprites arranged as follows:
 * - Total width: 494px (13 frames × 38px per frame)
 * - Total height: 87px (3 rows × 29px per frame)
 * - Sprite layout: 13 frames per row, 3 rows total
 *
 * Frame mapping (corrected based on Unity meta file Y coordinates):
 * - Row 2 (y=58): enemy_0-3 = IDLE animation (frames 0-3)
 * - Row 1 (y=29): enemy_4-10 = WALK animation (frames 0-6, 7 frames total)
 * - Row 0 (y=0): enemy_11-23 = ATTACK/HURT/DEATH animations (frames 0-12)
 */
export const SLIME_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'slime',
  imagePath: '/sprites/enemies/slime.png',
  frameWidth: 38, // From slime.png.meta sprite dimensions
  frameHeight: 29, // From slime.png.meta sprite dimensions
  animations: [
    {
      key: 'idle',
      row: 2, // Top row (y=58), frames 0-3 (enemy_0 to enemy_3)
      startFrame: 0,
      endFrame: 3,
      frameRate: 8, // Based on Unity animation sample rate
      repeat: -1,
    },
    {
      key: 'walk',
      row: 1, // Middle row (y=29), frames 0-6 (enemy_4 to enemy_10)
      startFrame: 0,
      endFrame: 6, // 7 frames total (enemy_4 to enemy_10)
      frameRate: 10,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 1, // Same as walk but faster
      startFrame: 0,
      endFrame: 6,
      frameRate: 14, // Faster frame rate for sprint
      repeat: -1,
    },
    {
      key: 'attack',
      row: 0, // Bottom row (y=0), frames 0-7 (enemy_11 to enemy_18)
      startFrame: 0,
      endFrame: 7, // First 8 frames of bottom row for attack
      frameRate: 12, // Based on Unity animation sample rate
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 0, // Bottom row (y=0), frames 8-10 (enemy_19 to enemy_21)
      startFrame: 8,
      endFrame: 10, // 3 frames for hurt animation
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 0, // Bottom row (y=0), frames 11-12 (enemy_22 to enemy_23)
      startFrame: 11,
      endFrame: 12, // Last 2 frames for death
      frameRate: 8,
      repeat: 0,
    },
  ],
};

/**
 * Cactus Enemy Sprite Configuration
 * Based on actual sprite sheet layout analysis
 * Frame layout: 42 frames total (Cactus_0 to Cactus_41), 102x59 each
 * Row 0 (top, y=177): Cactus_0-6 (7 frames) = IDLE
 * Row 1 (y=118): Cactus_7-20 (14 frames) = ATTACK
 * Row 2 (y=59): Cactus_21-28 (8 frames) = HURT
 * Row 3 (bottom, y=0): Cactus_29-41 (13 frames) = DEATH
 */
export const CACTUS_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'cactus',
  imagePath: '/sprites/enemies/cactus.png',
  frameWidth: 102,
  frameHeight: 59,
  animations: [
    {
      key: 'idle',
      row: 0, // Top row (y=177), frames 0-6 (Cactus_0 to Cactus_6)
      startFrame: 0,
      endFrame: 6, // 7 frames for idle animation
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'attack',
      row: 1, // Second row (y=118), frames 7-20 (Cactus_7 to Cactus_20)
      startFrame: 0, // Using row-based indexing
      endFrame: 13, // 14 frames for attack animation
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 2, // Third row (y=59), frames 21-28 (Cactus_21 to Cactus_28)
      startFrame: 0, // Using row-based indexing
      endFrame: 7, // 8 frames for hurt animation
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 3, // Bottom row (y=0), frames 29-41 (Cactus_29 to Cactus_41)
      startFrame: 0, // Using row-based indexing
      endFrame: 12, // 13 frames for death animation
      frameRate: 8,
      repeat: 0,
    },
  ],
};

/**
 * CactusBullet Projectile Sprite Configuration
 * Based on Unity animation data for cactus projectiles
 * Frame layout: 8 frames total (CactusBullets_0 to CactusBullets_7), 53x47 each
 * Row 0 (top, y=47): CactusBullets_0-1 (2 frames) = PROJECTILE/IDLE
 * Row 1 (bottom, y=0): CactusBullets_2-7 (6 frames) = EXPLODE
 */
export const CACTUS_BULLET_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'cactus_bullet',
  imagePath: '/sprites/enemies/cactusbullets.png',
  frameWidth: 53,
  frameHeight: 47,
  animations: [
    {
      key: 'idle',
      row: 0, // Top row (y=47), frames 0-1 (CactusBullets_0 to CactusBullets_1)
      startFrame: 0,
      endFrame: 1, // 2 frames for bullet idle/flying animation
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'explode',
      row: 1, // Bottom row (y=0), frames 2-7 (CactusBullets_2 to CactusBullets_7)
      startFrame: 0, // Using row-based indexing
      endFrame: 5, // 6 frames for explosion animation
      frameRate: 15,
      repeat: 0,
    },
  ],
};

/**
 * Blue Slime Enemy Sprite Configuration
 * Based on Unity animation data and sprite sheet specifications
 * The BlueSlime.png.meta shows 46 sprites arranged as follows:
 * - Frame dimensions: 92x42 pixels each
 * - Total layout: 8 frames per row, 6 rows total (0-based indexing from top)
 * - Row 0 (y=168): BlueSlime_0-7 = IDLE animation (8 frames)
 * - Row 1 (y=126): BlueSlime_8-15 = WALK animation (8 frames)
 * - Row 2 (y=84): BlueSlime_16-23 = HURT/TAKEDAMAGE animation (8 frames)
 * - Row 3 (y=42): BlueSlime_24-31 = ATTACK animation (8 frames)
 * - Row 4 (y=0): BlueSlime_32-45 = DEATH animation (14 frames)
 */
export const BLUE_SLIME_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'blue_slime',
  imagePath: '/sprites/enemies/blueslime.png',
  frameWidth: 92, // From BlueSlime.png.meta sprite dimensions
  frameHeight: 42, // From BlueSlime.png.meta sprite dimensions
  animations: [
    {
      key: 'idle',
      row: 0, // Top row (y=168), frames 0-7 (BlueSlime_0 to BlueSlime_7)
      startFrame: 0,
      endFrame: 7, // 8 frames total
      frameRate: 12, // From Unity animation sample rate
      repeat: -1,
    },
    {
      key: 'walk',
      row: 1, // Second row (y=126), frames 0-7 (BlueSlime_8 to BlueSlime_15)
      startFrame: 0,
      endFrame: 7, // 8 frames total
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 1, // Same as walk but faster
      startFrame: 0,
      endFrame: 7,
      frameRate: 16, // Faster frame rate for sprint
      repeat: -1,
    },
    {
      key: 'attack',
      row: 3, // Fourth row (y=42), frames 0-7 (BlueSlime_24 to BlueSlime_31)
      startFrame: 0,
      endFrame: 7, // 8 frames total
      frameRate: 12, // From Unity animation sample rate
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 2, // Third row (y=84), frames 0-7 (BlueSlime_16 to BlueSlime_23)
      startFrame: 0,
      endFrame: 7, // 8 frames for hurt animation
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 4, // Bottom row (y=0), frames 0-13 (BlueSlime_32 to BlueSlime_45)
      startFrame: 0,
      endFrame: 13, // 14 frames for death animation
      frameRate: 12,
      repeat: 0,
    },
  ],
};

/**
 * Base Dog Enemy Sprite Configuration
 * Based on Unity animation data and Dog.png sprite sheet specifications
 *
 * SPRITE SHEET LAYOUT (512x288, 8 frames per row system):
 * - Frame size: 64x48 pixels
 * - System calculates: 8 frames per row (512÷64=8)
 * - Actual layout is irregular with empty spaces
 *
 * CORRECTED FRAME MAPPING:
 * Row 0: Dog_0-4 at positions 0-4 (5 frames, 3 empty)   = ATTACK
 * Row 1: Dog_5-8 at positions 0-3 (4 frames, 4 empty)   = HURT
 * Row 2: Dog_9-12 at positions 0-3 (4 frames, 4 empty)  = WALK
 * Row 3: Dog_13-18 at positions 0-5 (6 frames, 2 empty) = IDLE
 * Row 4: Dog_19-26 at positions 0-7 (8 frames, full)    = Additional
 * Row 5: Dog_27-34 at positions 0-7 (8 frames, full)    = DEATH
 *
 * Frame calculation: row * 8 + startFrame
 */
export const BASE_DOG_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'base_dog',
  imagePath: '/sprites/enemies/rektdoggobase.png',
  frameWidth: 64,
  frameHeight: 48,
  animations: [
    {
      key: 'idle',
      row: 3, // Row 3: Dog_13-18 (frames 24-29 in 8-per-row system)
      startFrame: 0, // Dog_13 = 3*8+0 = frame 24
      endFrame: 5, // Dog_18 = 3*8+5 = frame 29
      frameRate: 12, // From Unity animation sample rate
      repeat: -1,
    },
    {
      key: 'walk',
      row: 2, // Row 2: Dog_9-12 (frames 16-19 in 8-per-row system)
      startFrame: 0, // Dog_9 = 2*8+0 = frame 16
      endFrame: 3, // Dog_12 = 2*8+3 = frame 19
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 2, // Same as walk but faster
      startFrame: 0,
      endFrame: 3,
      frameRate: 16, // Faster frame rate for sprint
      repeat: -1,
    },
    {
      key: 'attack',
      row: 0, // Row 0: Dog_0-4 (frames 0-4 in 8-per-row system)
      startFrame: 0, // Dog_0 = 0*8+0 = frame 0
      endFrame: 4, // Dog_4 = 0*8+4 = frame 4
      frameRate: 12, // From Unity animation sample rate
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 1, // Row 1: Dog_5-8 (frames 8-11 in 8-per-row system)
      startFrame: 0, // Dog_5 = 1*8+0 = frame 8
      endFrame: 3, // Dog_8 = 1*8+3 = frame 11
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 5, // Row 5: Dog_27-34 (frames 40-47 in 8-per-row system)
      startFrame: 0, // Dog_27 = 5*8+0 = frame 40
      endFrame: 7, // Dog_34 = 5*8+7 = frame 47
      frameRate: 12,
      repeat: 0,
    },
  ],
};

/**
 * Portal Guardian Enemy Sprite Configuration
 * Using RektDoggo as placeholder for now
 */
export const PORTAL_GUARDIAN_SPRITE_CONFIG: EnemySpriteConfig = {
  key: 'portal_guardian',
  imagePath: '/sprites/enemies/rektdoggo.png', // Using RektDoggo as placeholder
  frameWidth: 64,
  frameHeight: 48,
  animations: [
    {
      key: 'idle',
      row: 0,
      startFrame: 0,
      endFrame: 3,
      frameRate: 6,
      repeat: -1,
    },
    {
      key: 'walk',
      row: 1,
      startFrame: 0,
      endFrame: 1,
      frameRate: 8,
      repeat: -1,
    },
    {
      key: 'sprint',
      row: 1,
      startFrame: 0,
      endFrame: 1,
      frameRate: 12,
      repeat: -1,
    },
    {
      key: 'attack',
      row: 2,
      startFrame: 0,
      endFrame: 3,
      frameRate: 8,
      repeat: 0,
    },
    {
      key: 'hurt',
      row: 3,
      startFrame: 0,
      endFrame: 5,
      frameRate: 12,
      repeat: 0,
    },
    {
      key: 'death',
      row: 5,
      startFrame: 0,
      endFrame: 7,
      frameRate: 6,
      repeat: 0,
    },
  ],
};

/**
 * All enemy sprite configurations
 */
export const ENEMY_SPRITE_CONFIGS: Record<string, EnemySpriteConfig> = {
  rekt_doggo: REKT_DOGGO_SPRITE_CONFIG,
  licky: LICKY_SPRITE_CONFIG,
  slime: SLIME_SPRITE_CONFIG,
  blue_slime: BLUE_SLIME_SPRITE_CONFIG,
  cactus: CACTUS_SPRITE_CONFIG,
  cactus_bullet: CACTUS_BULLET_SPRITE_CONFIG,
  base_dog: BASE_DOG_SPRITE_CONFIG,
  portal_guardian: PORTAL_GUARDIAN_SPRITE_CONFIG,
};

/**
 * Helper function to get animation duration from sprite config
 * Used by server for timing calculations
 */
export function getAnimationDuration(
  spriteConfig: EnemySpriteConfig,
  animationType: string
): number {
  const animation = spriteConfig.animations.find(
    (anim) => anim.key === animationType
  );
  if (!animation) {
    console.warn(
      `Animation '${animationType}' not found for sprite: ${spriteConfig.key}`
    );
    return 500; // Default fallback
  }

  // Calculate frame count: endFrame - startFrame + 1
  const frameCount = animation.endFrame - animation.startFrame + 1;

  // Calculate duration: (frameCount / frameRate) * 1000ms
  return Math.ceil((frameCount / animation.frameRate) * 1000);
}
