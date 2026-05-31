# Memory Optimization Guide

This document outlines the memory optimization changes made to resolve build failures (exit code 137 - Out of Memory).

## Problem

The client build was failing with exit code 137, indicating the Node.js process was killed due to memory exhaustion. The main causes were:

1. **Large Data Files**: The `wearables.ts` file contains 7,359 lines of item data
2. **Heavy Asset Loading**: Map editor assets with hundreds of sprites
3. **High-Resolution Processing**: SVG processing at 4x resolution
4. **No Memory Limits**: Build process had no explicit memory constraints

## Solutions Implemented

### 1. Memory Limits (`package.json`)
- Set Node.js memory limit to 4GB: `NODE_OPTIONS='--max-old-space-size=4096'`
- Added prebuild optimization step

### 2. Webpack Optimizations (`next.config.js`)
- **Code Splitting**: Split large data files into separate chunks
  - `wearables.ts` → `wearables` chunk
  - `map-editor-assets.ts` → `map-assets` chunk  
  - Sprite managers → `sprite-managers` chunk
- **Large Page Data**: Increased limit to 128KB

### 3. Lazy Loading Utilities
- **`wearables-lazy.ts`**: Load wearables data in chunks of 100 items
- **`assets-lazy.ts`**: Load asset categories on-demand
- Reduces initial bundle size and memory footprint

### 4. Pre-build Optimization (`scripts/prebuild-optimize.ts`)
- Analyzes file sizes before build
- Provides warnings for memory-intensive files
- Sets optimal environment variables

## Usage

### For Normal Builds
```bash
npm run build  # Includes prebuild optimization
```

### For Lazy-Loaded Wearables
```typescript
import { getWearableById, getWearablesByIds } from '../lib/wearables-lazy';

// Load single wearable
const wearable = await getWearableById(123);

// Load multiple wearables efficiently
const wearables = await getWearablesByIds([1, 2, 3, 100, 200]);
```

### For Lazy-Loaded Assets
```typescript
import { getAssetCategory, preloadEssentialCategories } from '../lib/assets-lazy';

// Load specific category
const floors = await getAssetCategory('floors');

// Preload essential categories
await preloadEssentialCategories();
```

## Monitoring

The prebuild script will warn you about potentially memory-intensive files:
- Wearables files with >500 items
- Asset files with >300 lines

## Best Practices

1. **Use Lazy Loading**: For large data files, prefer lazy loading utilities
2. **Monitor Bundle Size**: Keep an eye on chunk sizes in build output
3. **Clear Caches**: Use `clearWearableCache()` and `clearAssetCache()` when needed
4. **Optimize Images**: Consider WebP format and appropriate sizing

## Troubleshooting

If builds still fail:
1. Increase memory limit in `package.json`: `--max-old-space-size=6144` (6GB)
2. Check for circular dependencies in large files
3. Consider splitting very large files into multiple smaller ones
4. Use `npm run prebuild` separately to identify problematic files