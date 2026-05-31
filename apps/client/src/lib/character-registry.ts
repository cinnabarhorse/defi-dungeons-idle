/**
 * Character Registry - Client-side Character Management
 * Uses shared character data with client-specific sprite configurations
 */

import {
  ALL_CHARACTERS,
  getCharacterStats as getSharedCharacterStats,
  getAttackRange,
  type CharacterInfo,
  type CharacterStats,
  type CharacterDerivedStats,
  type GetCharacterStatsOptions,
} from '../data/characters';

interface SpriteSheetConfig {
  key: string;
  frameWidth: number;
  frameHeight: number;
  imagePath: string;
  animations?: Array<{
    key: string;
    row: number;
    startFrame: number;
    endFrame: number;
    frameRate: number;
    repeat: number;
  }>;
}

export interface Character {
  id: string;
  info: CharacterInfo;
  config?: Partial<SpriteSheetConfig>; // Optional customizations
}
// Runtime sprite overrides (e.g., use gotchi object URL for a base character)
interface SpriteOverride {
  imagePath: string;
  frameWidth?: number;
  frameHeight?: number;
}

const spriteOverrides = new Map<string, SpriteOverride>();
const overrideSubscribers = new Set<() => void>();

export function setCharacterSpriteOverride(
  characterId: string,
  override: SpriteOverride
) {
  spriteOverrides.set(characterId, override);
  // Notify subscribers so components can re-render
  overrideSubscribers.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function clearCharacterSpriteOverride(characterId: string) {
  spriteOverrides.delete(characterId);
  overrideSubscribers.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function onSpriteOverridesChange(listener: () => void): () => void {
  overrideSubscribers.add(listener);
  return () => {
    overrideSubscribers.delete(listener);
  };
}

// Re-export shared types and functions for backwards compatibility
export type {
  CharacterInfo,
  CharacterStats,
  CharacterDerivedStats,
  GetCharacterStatsOptions,
};

/**
 * Base animation configuration used by all characters
 */
const BASE_ANIMATIONS = [
  // Idle animations
  {
    key: 'idle_down',
    row: 0,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: -1,
  },
  {
    key: 'idle_right',
    row: 0,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: -1,
  },
  {
    key: 'idle_up',
    row: 0,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: -1,
  },

  // Walking animations
  {
    key: 'walk_down',
    row: 1,
    startFrame: 0,
    endFrame: 5,
    frameRate: 8,
    repeat: -1,
  },
  {
    key: 'walk_right',
    row: 1,
    startFrame: 0,
    endFrame: 5,
    frameRate: 8,
    repeat: -1,
  },
  {
    key: 'walk_up',
    row: 1,
    startFrame: 0,
    endFrame: 5,
    frameRate: 8,
    repeat: -1,
  },

  // Attack animations - loop continuously for actions
  {
    key: 'attack_down',
    row: 12,
    startFrame: 0,
    endFrame: 5,
    frameRate: 6, // Slower to match 1000ms server timing
    repeat: -1, // Loop continuously
  },
  {
    key: 'attack_right',
    row: 12,
    startFrame: 0,
    endFrame: 5,
    frameRate: 6, // Slower to match 1000ms server timing
    repeat: -1, // Loop continuously
  },
  {
    key: 'attack_up',
    row: 12,
    startFrame: 0,
    endFrame: 5,
    frameRate: 6, // Slower to match 1000ms server timing
    repeat: -1, // Loop continuously
  },

  // Ranged attack animations - loop continuously for actions (3 frames)
  {
    key: 'attack_ranged_down',
    row: 10,
    startFrame: 0,
    endFrame: 2, // Only 3 frames (0, 1, 2)
    frameRate: 4, // Adjusted for 3 frames in 800ms timing
    repeat: -1, // Loop continuously
  },
  {
    key: 'attack_ranged_right',
    row: 10,
    startFrame: 0,
    endFrame: 2, // Only 3 frames (0, 1, 2)
    frameRate: 4, // Adjusted for 3 frames in 800ms timing
    repeat: -1, // Loop continuously
  },
  {
    key: 'attack_ranged_up',
    row: 10,
    startFrame: 0,
    endFrame: 2, // Only 3 frames (0, 1, 2)
    frameRate: 4, // Adjusted for 3 frames in 800ms timing
    repeat: -1, // Loop continuously
  },

  // Hurt animations
  {
    key: 'hurt_down',
    row: 13,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: 0,
  },
  {
    key: 'hurt_right',
    row: 13,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: 0,
  },
  {
    key: 'hurt_up',
    row: 13,
    startFrame: 0,
    endFrame: 5,
    frameRate: 12,
    repeat: 0,
  },
];

// 1x1 transparent PNG for non-intrusive placeholder (no Coderdan fallback)
const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8NU1kAAAAASUVORK5CYII=';

/**
 * Character definitions with client-specific sprite configurations
 * Character info comes from shared data, sprite configs are client-specific
 */
export const CHARACTERS: Character[] = ALL_CHARACTERS.map(
  (characterInfo: CharacterInfo) => {
    const character: Character = {
      id: characterInfo.id,
      info: characterInfo,
    };

    // Add client-specific sprite configurations for certain characters
    if (characterInfo.id === 'fairy') {
      // Example customization: Fairy could have different frame rates for magical feel
      character.config = {
        animations: BASE_ANIMATIONS.map((anim) =>
          anim.key.includes('idle')
            ? { ...anim, frameRate: 8 } // Slower, more graceful idle
            : anim
        ),
      };
    }

    return character;
  }
);

/**
 * Generate full sprite sheet config for a character
 */
export function getCharacterConfig(characterId: string): SpriteSheetConfig {
  const character = CHARACTERS.find((c) => c.id === characterId);
  const overrideExisting = spriteOverrides.get(characterId);

  // Tiny string hash for key versioning (consistent across sessions)
  function hashString(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0; // 32-bit
    }
    return Math.abs(h).toString(36);
  }

  const override =
    overrideExisting || spriteOverrides.get(character?.id || characterId);

  // Fallback: if dynamic gotchi without override, construct server URL
  const imagePath = override?.imagePath
    ? override.imagePath
    : character
      ? `/sprites/character/${character.info.id.toLowerCase()}.png`
      : TRANSPARENT_PX;

  // Include a content-derived suffix in the key so loaders treat overrides as new textures
  const versionSuffix = override?.imagePath
    ? `_${hashString(override.imagePath)}`
    : characterId.startsWith('gotchi:')
      ? `_${characterId.split(':')[1]}`
      : '';

  const resolvedId = character?.id || characterId;
  const base: SpriteSheetConfig = {
    key: `character_${resolvedId}${versionSuffix}`,
    imagePath,
    frameWidth: override?.frameWidth ?? 100,
    frameHeight: override?.frameHeight ?? 100,
    animations: character?.config?.animations || BASE_ANIMATIONS,
    ...(character?.config || {}),
  } as SpriteSheetConfig;

  return base;
}

/**
 * Get character info by ID
 */
export function getCharacter(id: string): Character | null {
  return CHARACTERS.find((char) => char.id === id) || null;
}

/**
 * Get random character for bots
 */
export function getRandomCharacter(): Character {
  const randomIndex = Math.floor(Math.random() * CHARACTERS.length);
  return CHARACTERS[randomIndex];
}

/**
 * Get all character IDs
 */
export function getAllCharacterIds(): string[] {
  return CHARACTERS.map((char) => char.id);
}

// Re-export shared functions for backwards compatibility
export const getCharacterStats = getSharedCharacterStats;
export { getAttackRange };

/**
 * Get default character for main player
 */
export function getDefaultCharacter(): Character {
  return getCharacter('coderdan') || CHARACTERS[0];
}
