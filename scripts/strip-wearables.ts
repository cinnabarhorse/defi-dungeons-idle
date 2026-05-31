import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const target = path.join(root, 'data', 'wearables.ts');

let content = fs.readFileSync(target, 'utf8');

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
content = content.replace(/^[\t ]*dimensions:\s*\{[^\n]*\},?\n?/gm, '');
content = content.replace(/^[\t ]*author:\s*(["']).*?\1,?\n?/gm, '');
content = content.replace(/^[\t ]*description:\s*(["']).*?\1,?\n?/gm, '');
content = content.replace(
  /^[\t ]*canPurchaseWithGhst:\s*(true|false),?\n?/gm,
  ''
);
content = content.replace(/^[\t ]*canBeTransferred:\s*(true|false),?\n?/gm, '');
content = content.replace(/^[\t ]*ghstPrice:\s*[-+]?\d+(?:\.\d+)?,?\n?/gm, '');
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

fs.writeFileSync(target, content);

console.log(
  'Stripped unused fields from',
  path.relative(process.cwd(), target)
);
