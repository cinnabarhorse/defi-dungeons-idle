#!/usr/bin/env node
/*
  Lowercase all sprite property values in TypeScript files under data/maps.
  Safe replace pattern: (sprite:)(quote)(value)(same quote)
*/

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targetDir = path.join(repoRoot, 'data', 'maps');

/**
 * Recursively walk a directory and return a list of .ts file paths.
 * @param {string} dir
 * @returns {string[]}
 */
function walkTsFiles(dir) {
  /** @type {string[]} */
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip typical ignored directories
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...walkTsFiles(full));
    } else if (entry.isFile()) {
      if (full.endsWith('.ts')) files.push(full);
    }
  }
  return files;
}

/**
 * Perform lowercase replacement on sprite values in the given content.
 * @param {string} content
 */
function lowercaseSpriteValues(content) {
  // Match: sprite: '...'
  // Groups: 1) prefix `sprite:` with whitespace, 2) quote char, 3) value, 4) same quote
  const re = /(\bsprite\s*:\s*)(['"`])([^'"`\\]*(?:\\.[^'"`\\]*)*)(\2)/g;
  return content.replace(re, (match, prefix, quote, value, suffixQuote) => {
    // Only lowercase the literal value between quotes
    const lower = value.toLowerCase();
    return `${prefix}${quote}${lower}${suffixQuote}`;
  });
}

function main() {
  if (!fs.existsSync(targetDir)) {
    console.error(`Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  const tsFiles = walkTsFiles(targetDir);
  let totalChangedFiles = 0;
  let totalReplacements = 0;

  for (const file of tsFiles) {
    const original = fs.readFileSync(file, 'utf8');
    const updated = lowercaseSpriteValues(original);
    if (updated !== original) {
      fs.writeFileSync(file, updated, 'utf8');
      totalChangedFiles++;
      // Approximate replacements by counting occurrences of `sprite:` after change
      const beforeCount = (original.match(/\bsprite\s*:\s*['"`]/g) || [])
        .length;
      const afterCount = (updated.match(/\bsprite\s*:\s*['"`]/g) || []).length;
      totalReplacements += Math.max(beforeCount, afterCount);
      console.log(`Updated: ${path.relative(repoRoot, file)}`);
    }
  }

  console.log(`\nLowercasing complete.`);
  console.log(`Files changed: ${totalChangedFiles}`);
  console.log(`Sprite entries processed (approx): ${totalReplacements}`);
}

main();
