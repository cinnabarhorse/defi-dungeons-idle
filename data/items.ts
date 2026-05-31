/**
 * Item Types - Single Source of Truth
 * This file contains item definitions used by both client and server
 */

export interface ItemStats {
  itemType: string;
  name: string;
  type: 'potion' | 'material' | 'weapon' | 'coin' | 'wearable';
  description: string;
  color: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  minQuantity?: number;
  maxQuantity?: number;
  wearableId?: number;
  healAmount?: number;
  damage?: number;
  value?: number;
  spriteId?: number;
  potionTier?: number; // 1, 2, or 3 for health potions
}

// Item drop rates for random generation (server-only)
export const ITEM_DROP_RATES = {
  coin: 0.3,
  potion: 0.15,
  material: 0.1,
  weapon: 0.05,
  wearable: 0.4,
} as const;

// Item colors for display (used by client components)
export const ITEM_COLORS = {
  coin: '#FFD700',
  potion: '#FF69B4',
  weapon: '#8A2BE2',
  material: '#32CD32',
  wearable: '#9370DB',
  usdc_coin: '#2775CA',
} as const;

// Item definitions
export const ITEM_TYPES: Record<string, ItemStats> = {
  // Tier 1 Health Potion (10% max HP, min 50)
  health_potion: {
    itemType: 'health_potion',
    name: 'Health Potion',
    type: 'potion',
    description: 'Restores health when consumed',
    color: '#ff6b6b',
    rarity: 'common',
    minQuantity: 1,
    maxQuantity: 1,
    healAmount: 50,
    spriteId: 126,
    potionTier: 1,
  },
  // Tier 2 Health Potion (25% max HP)
  greater_health_potion: {
    itemType: 'greater_health_potion',
    name: 'Greater Healing Potion',
    type: 'potion',
    description: 'Restores a moderate amount of health when consumed',
    color: '#ff4757',
    rarity: 'uncommon',
    minQuantity: 1,
    maxQuantity: 1,
    healAmount: 125, // Default for 500 HP player
    spriteId: 127,
    potionTier: 2,
  },
  // Tier 3 Health Potion (50% max HP)
  ultra_health_potion: {
    itemType: 'ultra_health_potion',
    name: 'Ultra Healing Potion',
    type: 'potion',
    description: 'Restores a large amount of health when consumed',
    color: '#ff1744',
    rarity: 'rare',
    minQuantity: 1,
    maxQuantity: 1,
    healAmount: 250, // Default for 500 HP player
    spriteId: 129,
    potionTier: 3,
  },
  mana_potion: {
    itemType: 'mana_potion',
    name: 'Mana Potion',
    type: 'potion',
    description: 'Restores mana when consumed',
    color: '#4dabf7',
    rarity: 'common',
    minQuantity: 1,
    maxQuantity: 1,
    healAmount: 50,
    spriteId: 128,
  },
  wood: {
    itemType: 'wood',
    name: 'Wood',
    type: 'material',
    description: 'Basic crafting material from trees',
    color: '#8b4513',
    rarity: 'common',
    minQuantity: 1,
    maxQuantity: 5,
    value: 2,
  },
  stone: {
    itemType: 'stone',
    name: 'Stone',
    type: 'material',
    description: 'Sturdy crafting material',
    color: '#708090',
    rarity: 'common',
    minQuantity: 1,
    maxQuantity: 3,
    value: 5,
  },
  // iron_ore: {
  //   itemType: 'iron_ore',
  //   name: 'Iron Ore',
  //   type: 'material',
  //   description: 'Valuable metal ore for crafting',
  //   color: '#696969',
  //   rarity: 'uncommon',
  //   minQuantity: 1,
  //   maxQuantity: 2,
  //   value: 10,
  // },
  // gem: {
  //   itemType: 'gem',
  //   name: 'Gem',
  //   type: 'material',
  //   description: 'Precious gem for advanced crafting',
  //   color: '#ff1493',
  //   rarity: 'rare',
  //   minQuantity: 1,
  //   maxQuantity: 1,
  //   value: 50,
  // },

  gold_coin: {
    itemType: 'gold_coin',
    name: 'Gold',
    type: 'coin',
    description: 'Common currency of the Gotchiverse',
    color: '#ffd700',
    rarity: 'rare',
    minQuantity: 1,
    maxQuantity: 3,
    value: 100,
  },
  usdc_coin: {
    itemType: 'usdc_coin',
    name: 'USDC Coin',
    type: 'coin',
    description: 'Real USDC cryptocurrency earned from treasure chests',
    color: '#2775CA',
    rarity: 'legendary',
    minQuantity: 1,
    maxQuantity: 1,
    value: 1000,
  },

  lick_tongue: {
    itemType: 'lick_tongue',
    name: 'Lick Tongue',
    type: 'material',
    description:
      'A rare tongue dropped by defeated enemies. Used to unlock higher difficulty tiers.',
    color: '#ff69b4',
    rarity: 'rare',
    minQuantity: 1,
    maxQuantity: 1,
    value: 1000,
    spriteId: 378,
  },
};

/**
 * Get item stats by type
 */
export function getItemStats(itemType: string): ItemStats {
  // Safety check: ensure ITEM_TYPES is loaded
  if (!ITEM_TYPES || typeof ITEM_TYPES !== 'object') {
    console.warn(
      `ITEM_TYPES not loaded yet for item type: ${itemType}, using health_potion as default`
    );
    // Return a minimal fallback if ITEM_TYPES isn't loaded
    return {
      itemType: 'health_potion',
      name: 'Health Potion',
      type: 'potion',
      description: 'Restores health when consumed',
      color: '#ff6b6b',
      rarity: 'common',
      minQuantity: 1,
      maxQuantity: 1,
      healAmount: 50,
      spriteId: 126,
    };
  }
  
  // Normalize itemType (trim and lowercase for comparison)
  const normalizedItemType = itemType?.trim().toLowerCase();
  
  // Check if itemType is a category name first (before checking ITEM_TYPES)
  const validCategories: ItemStats['type'][] = ['coin', 'potion', 'weapon', 'material', 'wearable'];
  const isCategory = normalizedItemType && validCategories.includes(normalizedItemType as ItemStats['type']);
  
  if (isCategory) {
    // Return a sensible default item for this category
    switch (normalizedItemType) {
      case 'coin':
        return ITEM_TYPES.gold_coin;
      case 'potion':
        return ITEM_TYPES.health_potion;
      case 'material':
        return ITEM_TYPES.wood;
      case 'wearable':
        // For wearables, return a generic wearable item structure
        return {
          itemType: 'wearable',
          name: 'Wearable',
          type: 'wearable',
          description: 'Equipment item',
          color: ITEM_COLORS.wearable,
          rarity: 'common',
        };
      case 'weapon':
        // For weapons, return a generic weapon item structure
        return {
          itemType: 'weapon',
          name: 'Weapon',
          type: 'weapon',
          description: 'Combat weapon',
          color: ITEM_COLORS.weapon,
          rarity: 'common',
        };
      default:
        return ITEM_TYPES.health_potion;
    }
  }
  
  // Check if it's a specific item type
  const stats = ITEM_TYPES[normalizedItemType] || ITEM_TYPES[itemType];
  if (stats) {
    return { ...stats }; // Return a copy to prevent mutations
  }
  
  // If it's neither a category nor a known item type, warn and return default
  console.warn(
    `Unknown item type: ${itemType}, using health_potion as default`
  );
  return ITEM_TYPES.health_potion;
}

/**
 * Get all available item categories
 */
export function getAllItemCategories(): ItemStats['type'][] {
  const categories = new Set<ItemStats['type']>();
  Object.values(ITEM_TYPES).forEach((item) => categories.add(item.type));
  return Array.from(categories);
}

/**
 * Get all item types of a specific category
 */
export function getItemTypesByCategory(category: ItemStats['type']): string[] {
  return Object.keys(ITEM_TYPES).filter(
    (itemType) => ITEM_TYPES[itemType].type === category
  );
}

/**
 * Get random item type from a specific category
 */
export function getRandomItemType(category?: ItemStats['type']): string {
  let availableTypes: string[];

  if (category) {
    availableTypes = getItemTypesByCategory(category);
  } else {
    availableTypes = Object.keys(ITEM_TYPES);
  }

  return availableTypes[Math.floor(Math.random() * availableTypes.length)];
}

/**
 * Generate random item type based on drop rates
 */
export function generateRandomItemType(): string {
  const random = Math.random();

  if (random < ITEM_DROP_RATES.weapon) {
    return getRandomItemType('weapon');
  } else if (random < ITEM_DROP_RATES.weapon + ITEM_DROP_RATES.material) {
    return getRandomItemType('material');
  } else if (
    random <
    ITEM_DROP_RATES.weapon + ITEM_DROP_RATES.material + ITEM_DROP_RATES.potion
  ) {
    return getRandomItemType('potion');
  } else if (
    random <
    ITEM_DROP_RATES.weapon +
      ITEM_DROP_RATES.material +
      ITEM_DROP_RATES.potion +
      ITEM_DROP_RATES.wearable
  ) {
    return getRandomItemType('wearable');
  } else {
    return getRandomItemType('coin');
  }
}

/**
 * Generate item data with random quantity based on item stats
 */
export function generateItemData(itemType: string): any {
  const stats = getItemStats(itemType);
  const quantity =
    stats.minQuantity && stats.maxQuantity
      ? Math.floor(
          Math.random() * (stats.maxQuantity - stats.minQuantity + 1)
        ) + stats.minQuantity
      : 1;

  const itemData = {
    type: stats.type,
    name: stats.name,
    quantity,
    color: stats.color,
    description: stats.description,
    rarity: stats.rarity,
  };

  // Add specific fields based on item type
  if (stats.wearableId !== undefined) {
    (itemData as any).wearableId = stats.wearableId;
  }

  if (stats.spriteId !== undefined) {
    (itemData as any).spriteId = stats.spriteId;
  }

  // Add potionTier for health potions
  if (stats.potionTier !== undefined) {
    (itemData as any).potionTier = stats.potionTier;
  }

  return itemData;
}
