/**
* ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
*
* Server Inventory Types - Generated from apps/client/src/types/inventory.ts
* Keep the server self-contained; do not import client modules at runtime.
*
* To make changes, edit apps/client/src/types/inventory.ts and run: npm run generate:shared
*/

export interface InventoryItem {
  id: string;
  inventoryItemId?: string;
  instanceId?: string;
  name: string;
  type: 'coin' | 'potion' | 'weapon' | 'material' | 'wearable';
  quantity: number;
  color: string;
  description?: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  // Wearable-specific properties
  wearableId?: number;
  wearableSlug?: string;
  slot?: string;
  imageUrl?: string;
  stats?: {
    AGG?: number;
    NRG?: number;
    SPK?: number;
    BRN?: number;
  };
  quality?: 'broken' | 'budget' | 'average' | 'excellent' | 'flawless';
  qualityScore?: number;
  durabilityScore?: number;
  // For items with custom sprites
  spriteId?: number;
  // Potion-specific properties
  potionTier?: number; // 1, 2, or 3 for health potions
  // USDC-specific properties
  usdcAmount?: number; // Actual USDC value for usdc_coin type
  probability?: number; // Probability of getting this reward
  expectedValue?: number; // Expected value from difficulty tier
}

export interface DroppedItem {
  id: string;
  x: number;
  y: number;
  item: InventoryItem;
}
