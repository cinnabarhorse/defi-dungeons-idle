#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

import { type WearableSlot } from '../data/wearables';

console.log('🔧 Generating shared files...');

interface FileConfig {
  name: string;
  needsCustomProcessing?: boolean;
}

// Simple file configurations - all files are in /data, paths are auto-generated
const FILES: FileConfig[] = [
  { name: 'abilities' },
  { name: 'difficulty-tiers' },
  { name: 'characters' },
  { name: 'archetypes' },
  { name: 'loot-table' },
  { name: 'chunksHelper' },
  { name: 'enemy-sprite-configs' },
  { name: 'items' },
  { name: 'enemies', needsCustomProcessing: true },
  { name: 'wearables' },
  { name: 'wearable-quality' },
  { name: 'weapons' },
  { name: 'spells' },
  { name: 'chunks' },
  { name: 'chunks-grass' },
  { name: 'chunks-staging' },
  { name: 'chunks-cyberkawaii' },
  { name: 'obstacles' },
  { name: 'game-config' },
  { name: 'default-map-files' },
];

const isMapChunkFile = (fileName: string): boolean =>
  fileName === 'chunks' || fileName.startsWith('chunks-');

function expandSlotsForValidation(slots: WearableSlot[]): string[] {
  const normalized: string[] = [];
  for (const slot of slots) {
    switch (slot) {
      case 'handRight':
        normalized.push('hand-right');
        break;
      case 'handLeft':
        normalized.push('hand-left');
        break;
      case 'none':
        break;
      default:
        normalized.push(slot);
        break;
    }
  }
  return normalized;
}

const HAND_SLOT_ORDER = ['hand-left', 'hand-right'] as const;

function assignEitherHandSlot(
  slotUsage: Map<string, string>,
  slug: string
): boolean {
  for (const slot of HAND_SLOT_ORDER) {
    if (!slotUsage.has(slot)) {
      slotUsage.set(slot, slug);
      return true;
    }
  }
  return false;
}

/**
 * Auto-generate paths for a file (all files are in /data now)
 */
function getPaths(fileName: string) {
  const root = path.join(__dirname, '..');
  const sourceDir = isMapChunkFile(fileName)
    ? path.join(root, 'data', 'maps')
    : path.join(root, 'data');
  return {
    source: path.join(sourceDir, `${fileName}.ts`),
    clientTarget: path.join(
      root,
      'apps',
      'client',
      'src',
      'data',
      `${fileName}.ts`
    ),
    // For map chunk files, also emit a raw TS source copy under apps/client/data/maps
    // so serverless API routes (running on Node) can read from the filesystem.
    clientFsMapsTarget: isMapChunkFile(fileName)
      ? path.join(root, 'apps', 'client', 'data', 'maps', `${fileName}.ts`)
      : null,
    serverTarget: path.join(
      root,
      'apps',
      'server',
      'src',
      'data',
      `${fileName}.ts`
    ),
  };
}

/**
 * Generate header comment
 */
function generateHeader(fileName: string, isClient: boolean): string {
  const side = isClient ? 'Client' : 'Server';
  const sourceDir = isMapChunkFile(fileName) ? '/data/maps' : '/data';
  const descriptions: Record<
    string,
    string | { client: string; server: string }
  > = {
    chunksHelper:
      'Helper functions for authoring chunks (e.g., floor(), fillRange(), constants).',
    abilities:
      'This file defines shared abilities and constructors; auto-synced to apps.',
    'difficulty-tiers':
      'This file is automatically synced to ensure consistency.',
    archetypes:
      'This file contains archetype definitions and defaults; auto-synced to apps.',
    characters: 'This file is automatically synced to ensure consistency.',
    'enemy-sprite-configs':
      'This file is automatically synced to ensure consistency.',
    items: 'This file contains item definitions for UI and gameplay.',
    enemies: {
      client:
        'This file contains lightweight enemy info for map editor and type definitions.',
      server:
        'This file contains full enemy stats for gameplay and AI systems.',
    },
    wearables:
      'This file contains wearable item definitions and trait modifiers.',
    'wearable-quality':
      'This file defines wearable quality labels and overrides shared by client and server.',
    weapons:
      'This file contains weapon types and definitions used by characters.',
    chunks:
      'This file contains map chunk definitions for procedural world generation.',
    'chunks-grass':
      'This file contains grass-themed map chunk definitions for procedural world generation.',
    'chunks-cyberkawaii':
      'This file contains cyberkawaii-themed map chunks for grass tier variety.',
    'chunks-dungeon':
      'This file contains dungeon-themed map chunk definitions for procedural world generation.',
    'chunks-staging':
      'This file contains staging map chunks for development and testing.',
    obstacles:
      'This file contains obstacle configurations for collision detection and rendering.',
    'game-config':
      'This file contains core game configuration values used by client and server.',
    'default-map-files':
      'This file lists default map file identifiers used by loaders.',
  };

  const desc = (descriptions as Record<string, any>)[fileName];
  const fallbackDesc = `This file is automatically synced from ${sourceDir}/${fileName}.ts.`;
  const description = desc
    ? typeof desc === 'string'
      ? desc
      : desc[isClient ? 'client' : 'server']
    : fallbackDesc;

  return `/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * ${side} ${fileName.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())} Data - Generated from ${sourceDir}/${fileName}.ts
 * ${description}
 *
 * To make changes, edit ${sourceDir}/${fileName}.ts and run: npm run generate:shared
 */

`;
}

/**
 * Process enemies file for client/server differences
 */
function processEnemiesFile(sourceContent: string, isClient: boolean): string {
  if (isClient) {
    return sourceContent
      .replace(/\/\/ Full enemy stats for server[\s\S]*?^}/gm, '')
      .replace(/\/\/ Enemy definitions - full data for server[\s\S]*?^};/gm, '')
      .replace(/export const ENEMY_DATA[\s\S]*?;[\t ]*\n?/gm, '')
      .replace(/CLIENT_ENEMY_TYPES/g, 'ENEMY_TYPES')
      .replace(/ENEMY_DATA/g, 'ENEMY_TYPES')
      .replace(/\n\n\n+/g, '\n\n');
  }

  return `import { ENEMY_SPRITE_CONFIGS, getAnimationDuration } from './enemy-sprite-configs';

${sourceContent
  .replace(/\/\/ Client-only lightweight data[\s\S]*?^};/gm, '')
  .replace(/export const CLIENT_ENEMY_TYPES[\s\S]*?;[\t ]*\n?/gm, '')
  .replace(/ENEMY_DATA/g, 'ENEMY_TYPES')
  .replace(/ServerEnemyStats/g, 'EnemyStats')}

/**
 * Get enemy stats by type
 */
export function getEnemyStats(enemyType: string): EnemyStats {
  const stats = ENEMY_TYPES[enemyType];
  if (!stats) {
    console.warn(\`Unknown enemy type: \${enemyType}, using slime as default\`);
    return ENEMY_TYPES.slime;
  }
  return { ...stats };
}

/**
 * Calculate animation duration in milliseconds from sprite configs
 */
export function getEnemyAnimationDuration(enemyType: string, animationType: string): number {
  const spriteConfig = ENEMY_SPRITE_CONFIGS[enemyType];
  if (!spriteConfig) {
    return 500;
  }
  return getAnimationDuration(spriteConfig, animationType);
}

/**
 * Create enemy spawn data with position
 */
export function createEnemySpawn(
  enemyType: string,
  x: number,
  y: number,
  overrides?: Partial<EnemyStats> & Record<string, any>
) {
  const baseStats = getEnemyStats(enemyType);
  const finalStats = { ...baseStats, ...overrides };
  return {
    x,
    y,
    type: enemyType,
    stats: { ...finalStats, homeX: x, homeY: y, isGuarding: true },
  };
}

export interface EnemyType {
  type: string;
  stats: EnemyStats;
}`;
}

/**
 * Strip unused fields from wearables interface and entries
 */
function processWearablesFile(sourceContent: string): string {
  let content = sourceContent;

  // Remove properties from the ItemTypes interface (semicolon-terminated lines)
  const interfaceFields = [
    'author',
    'description',
    'dimensions',
    'ghstPrice',
    'maxQuantity',
    'canPurchaseWithGhst',
    'canBeTransferred',
    'totalQuantity',
    'experienceBonus',
    'kinshipBonus',
  ];

  for (const field of interfaceFields) {
    const interfacePattern = new RegExp(`^\\s*${field}:.*;\\n?`, 'gm');
    content = content.replace(interfacePattern, '');
  }

  // Remove entry fields (comma-terminated)
  // Dimensions (object literal in one line)
  content = content.replace(/^[\t ]*dimensions:\s*\{[^\n]*\},?\n?/gm, '');

  // String properties
  content = content.replace(/^[\t ]*author:\s*(["'`]).*?\1,?\n?/gm, '');
  content = content.replace(/^[\t ]*description:\s*(["'`]).*?\1,?\n?/gm, '');

  // Boolean properties
  content = content.replace(
    /^[\t ]*canPurchaseWithGhst:\s*(true|false),?\n?/gm,
    ''
  );
  content = content.replace(
    /^[\t ]*canBeTransferred:\s*(true|false),?\n?/gm,
    ''
  );

  // Numeric properties
  content = content.replace(
    /^[\t ]*ghstPrice:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm,
    ''
  );
  content = content.replace(
    /^[\t ]*maxQuantity:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm,
    ''
  );
  content = content.replace(
    /^[\t ]*totalQuantity:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm,
    ''
  );
  content = content.replace(
    /^[\t ]*experienceBonus:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm,
    ''
  );
  content = content.replace(
    /^[\t ]*kinshipBonus:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm,
    ''
  );

  // Normalize excessive blank lines introduced by removals
  content = content.replace(/\n{3,}/g, '\n\n');

  return content;
}

/**
 * Generate server-local InventoryItem types from client types
 * Keeps the server self-contained without cross-app imports
 */
function generateServerInventoryTypes(): boolean {
  console.log('\n📄 Generating server inventory types...');
  const root = path.join(__dirname, '..');
  const clientTypesPath = path.join(
    root,
    'apps',
    'client',
    'src',
    'types',
    'inventory.ts'
  );
  const serverTypesPath = path.join(
    root,
    'apps',
    'server',
    'src',
    'types',
    'inventory.ts'
  );

  if (!fs.existsSync(clientTypesPath)) {
    console.error(`❌ Client inventory types not found: ${clientTypesPath}`);
    return false;
  }

  const header = `/**
* ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
*
* Server Inventory Types - Generated from apps/client/src/types/inventory.ts
* Keep the server self-contained; do not import client modules at runtime.
*
* To make changes, edit apps/client/src/types/inventory.ts and run: npm run generate:shared
*/

`;

  const content = fs.readFileSync(clientTypesPath, 'utf8');
  fs.mkdirSync(path.dirname(serverTypesPath), { recursive: true });
  fs.writeFileSync(serverTypesPath, header + content, 'utf8');
  console.log('✅ Generated:', path.relative(process.cwd(), serverTypesPath));
  return true;
}

function generateClientMessageTypes(): boolean {
  console.log('\n📄 Generating client message types...');
  const root = path.join(__dirname, '..');
  const serverTypesPath = path.join(
    root,
    'apps',
    'server',
    'src',
    'types',
    'messages.ts'
  );
  const clientTypesPath = path.join(
    root,
    'apps',
    'client',
    'src',
    'types',
    'messages.ts'
  );

  if (!fs.existsSync(serverTypesPath)) {
    console.error(`❌ Server message types not found: ${serverTypesPath}`);
    return false;
  }

  const header = `/**
* ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
*
* Client Message Types - Generated from apps/server/src/types/messages.ts
* Keep the client in sync with server→client message contracts.
*
* To make changes, edit apps/server/src/types/messages.ts and run: npm run generate:shared
*/

`;

  const content = fs.readFileSync(serverTypesPath, 'utf8');
  fs.mkdirSync(path.dirname(clientTypesPath), { recursive: true });
  fs.writeFileSync(clientTypesPath, header + content, 'utf8');
  console.log('✅ Generated:', path.relative(process.cwd(), clientTypesPath));
  return true;
}

/**
 * Process a single file
 */
function processFile(config: FileConfig): boolean {
  console.log(`\n📄 Processing ${config.name}...`);

  const paths = getPaths(config.name);

  if (!fs.existsSync(paths.source)) {
    console.error(`❌ Source file not found: ${paths.source}`);
    return false;
  }

  let sourceContent = fs.readFileSync(paths.source, 'utf8');

  // Remove original header comments
  if (['characters', 'enemies', 'items', 'wearables'].includes(config.name)) {
    sourceContent = sourceContent.replace(/^\/\*\*[\s\S]*?\*\/\s*\n/, '');
  }

  // Generate both client and server versions
  [
    { path: paths.clientTarget, isClient: true },
    { path: paths.serverTarget, isClient: false },
  ].forEach(({ path: targetPath, isClient }) => {
    // For client builds, do NOT emit map chunk files into src (keeps bundle lean)
    // but DO emit a copy into apps/client/data/maps for serverless fs access.
    if (isClient && isMapChunkFile(config.name)) {
      // Clean up any legacy src copy
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
          console.log(
            '🧹 Removed existing client map chunk file:',
            path.relative(process.cwd(), targetPath)
          );
        } catch (e) {
          console.warn(
            '⚠️ Failed to remove existing client map chunk file:',
            path.relative(process.cwd(), targetPath),
            '-',
            (e as Error).message
          );
        }
      }

      const mapsTarget = getPaths(config.name).clientFsMapsTarget!;
      fs.mkdirSync(path.dirname(mapsTarget), { recursive: true });
      const generatedContentForMaps =
        generateHeader(config.name, isClient) + sourceContent;
      fs.writeFileSync(mapsTarget, generatedContentForMaps, 'utf8');
      console.log(
        '✅ Generated (fs maps copy):',
        path.relative(process.cwd(), mapsTarget)
      );
      return;
    }

    let content = sourceContent;

    // Apply custom processing if needed
    if (config.needsCustomProcessing && config.name === 'enemies') {
      content = processEnemiesFile(sourceContent, isClient);
    }

    // Apply wearables stripping
    if (config.name === 'wearables') {
      content = processWearablesFile(content);
    }

    if (isMapChunkFile(config.name)) {
      content = content.replace(
        /import\s+\{([^}]+)\}\s+from\s+'\.\.\/(?:\.\/)?chunksHelper';?/g,
        (_match, imports) => `import {${imports}} from './chunksHelper';`
      );
    }

    // Generate and write file
    const generatedContent = generateHeader(config.name, isClient) + content;
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, generatedContent, 'utf8');
    console.log('✅ Generated:', path.relative(process.cwd(), targetPath));
  });

  return true;
}

/**
 * Main execution
 */
try {
  // validateEquipmentLoadouts();
  // validateWeaponDefinitions();
  const results = FILES.map(processFile);
  const typesOk = generateServerInventoryTypes();
  const messagesOk = generateClientMessageTypes();

  if (results.every(Boolean) && typesOk && messagesOk) {
    console.log('\n🎉 All shared files generated successfully!');
    console.log('\n📝 Remember to:');
    console.log('   - Only edit source files in /data/');
    console.log('   - Run "npm run generate:shared" after changes');
    console.log('   - Rebuild both apps after generation');
  } else {
    console.error('\n❌ Some files failed to generate');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error:', (error as Error).message);
  process.exit(1);
}
