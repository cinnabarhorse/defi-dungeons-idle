/**
 * Centralized resource configuration system
 * Defines all resource types and their properties in one place
 */
import type { ServerToClientMessages } from '../types/messages';

export interface ResourceConfig {
  type: string;
  emoji: string;
  actionVerb: string;
  harvestInterval: number; // Time between harvests (ms)
  harvestRange: number; // Range to harvest from (pixels)
  defaultHealth: number; // Starting health
  harvestedByField: string; // State field for tracking harvester
  lastHarvestField: string; // State field for timing
  harvestMessage: keyof ServerToClientMessages; // Message sent on harvest
  destroyMessage: keyof ServerToClientMessages; // Message sent on destruction
  collectibleMaterial: string; // Material type for collectible
  collectibleDescription: string;
}

/**
 * All resource configurations in one centralized location
 */
export const RESOURCE_CONFIGS: Record<string, ResourceConfig> = {
  tree: {
    type: 'tree',
    emoji: '🌳',
    actionVerb: 'chopping',
    harvestInterval: 1000, // 1 second
    harvestRange: 80,
    defaultHealth: 3,
    harvestedByField: 'choppedBy',
    lastHarvestField: 'lastChopTime',
    harvestMessage: 'tree_chopped',
    destroyMessage: 'tree_cut_down',
    collectibleMaterial: 'wood',
    collectibleDescription: 'Freshly chopped wood, useful for crafting.',
  },

  stone: {
    type: 'stone',
    emoji: '🪨',
    actionVerb: 'mining',
    harvestInterval: 1500, // 1.5 seconds
    harvestRange: 80,
    defaultHealth: 6,
    harvestedByField: 'minedBy',
    lastHarvestField: 'lastChopTime', // Reusing same field for simplicity
    harvestMessage: 'stone_chopped',
    destroyMessage: 'stone_broken',
    collectibleMaterial: 'stone',
    collectibleDescription: 'Mined stone, useful for building and crafting.',
  },
};

/**
 * Get resource configuration by type
 * Optimized lookup with better error context
 */
export function getResourceConfig(type: string): ResourceConfig | null {
  const config = RESOURCE_CONFIGS[type];
  if (!config) {
    console.warn(
      `⚠️ Unknown resource type requested: ${type}. Available types: ${Object.keys(RESOURCE_CONFIGS).join(', ')}`
    );
  }
  return config || null;
}
