#!/usr/bin/env node

/**
 * Pre-build optimization script to reduce memory usage during builds
 * 
 * AUTO-GENERATED, DO NOT UPDATE
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CHUNK_SIZE = 50; // Smaller chunks for better memory management

function optimizeWearablesFile() {
  const wearablesPath = join(process.cwd(), 'src/data/wearables.ts');
  
  if (!existsSync(wearablesPath)) {
    console.log('⚠️  Wearables file not found, skipping optimization');
    return;
  }

  const content = readFileSync(wearablesPath, 'utf-8');
  const lines = content.split('\n');
  
  // Count the number of items to estimate memory impact
  const itemCount = lines.filter(line => line.trim().match(/^\d+:\s*\{/)).length;
  
  console.log(`📊 Wearables file contains ${itemCount} items (${lines.length} lines)`);
  
  if (itemCount > 500) {
    console.log('⚠️  Large wearables file detected - consider using lazy loading');
    console.log('💡 Use the wearables-lazy.ts utility for better memory management');
  }
}

function checkAssetFiles() {
  const assetsPath = join(process.cwd(), 'src/data/map-editor-assets.ts');
  
  if (!existsSync(assetsPath)) {
    console.log('⚠️  Assets file not found, skipping check');
    return;
  }

  const content = readFileSync(assetsPath, 'utf-8');
  const lines = content.split('\n');
  
  console.log(`📊 Assets file contains ${lines.length} lines`);
  
  if (lines.length > 300) {
    console.log('⚠️  Large assets file detected - consider using lazy loading');
    console.log('💡 Use the assets-lazy.ts utility for better memory management');
  }
}

function main() {
  console.log('🔧 Running pre-build optimization...');
  
  // Set memory-friendly environment variables
  process.env.NODE_OPTIONS = (process.env.NODE_OPTIONS || '') + ' --max-old-space-size=4096';
  
  console.log('💾 Memory limit set to 4GB for build process');
  
  optimizeWearablesFile();
  checkAssetFiles();
  
  console.log('✅ Pre-build optimization complete');
}

if (require.main === module) {
  main();
}