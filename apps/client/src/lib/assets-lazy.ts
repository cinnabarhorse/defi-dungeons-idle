/**
 * Lazy-loaded asset categories to reduce initial bundle size
 */

import type { AssetCategories } from '../types/map-editor';

// Cache for loaded asset categories
const assetCache = new Map<string, any>();

export async function getAssetCategory(categoryName: keyof AssetCategories): Promise<any> {
  if (assetCache.has(categoryName)) {
    return assetCache.get(categoryName);
  }

  // Dynamically import the full asset data only when needed
  const { ASSET_CATEGORIES } = await import('../data/map-editor-assets');
  const category = ASSET_CATEGORIES[categoryName];
  
  assetCache.set(categoryName, category);
  return category;
}

export async function getAllAssetCategories(): Promise<AssetCategories> {
  const { ASSET_CATEGORIES } = await import('../data/map-editor-assets');
  return ASSET_CATEGORIES;
}

// Preload specific categories that are likely to be used immediately
export async function preloadEssentialCategories(): Promise<void> {
  const essentialCategories = ['floors', 'characters', 'enemies'] as const;
  
  await Promise.all(
    essentialCategories.map(category => getAssetCategory(category))
  );
}

export function clearAssetCache(): void {
  assetCache.clear();
}