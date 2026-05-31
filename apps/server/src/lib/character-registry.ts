/**
 * Server-side Character Registry
 * Uses inlined character data for reliable deployment
 */

import {
  ALL_CHARACTERS,
  getCharacterStats,
  getAttackRange,
  getCharacterById,
  getRandomCharacter,
  getWeightedRandomCharacter,
  type CharacterInfo,
  type CharacterStats,
  type CharacterDerivedStats,
  type AbilityReference,
  type EquippedWeaponSummary,
  type GetCharacterStatsOptions,
} from '../data/characters';

// Re-export for backwards compatibility
export type {
  CharacterInfo,
  CharacterStats,
  CharacterDerivedStats,
  AbilityReference,
  EquippedWeaponSummary,
  GetCharacterStatsOptions,
};
export const AVAILABLE_CHARACTERS = ALL_CHARACTERS;

// Re-export shared functions for backwards compatibility
export {
  getCharacterStats,
  getAttackRange,
  getCharacterById,
  getRandomCharacter as getRandomCharacterForBot,
  getWeightedRandomCharacter,
};
