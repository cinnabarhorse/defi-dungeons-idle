import fs from 'fs';
import path from 'path';
import url from 'url';
import { toRuntimeJson } from '../apps/server/src/data/npc-dialogues/types';

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const dialoguesDir = path.join(
    rootDir,
    'apps',
    'server',
    'src',
    'data',
    'npc-dialogues'
  );

  if (!fs.existsSync(dialoguesDir)) {
    throw new Error(`Dialogue directory not found: ${dialoguesDir}`);
  }

  // Discover TS dialogue definition files in the folder (exclude helper/types files)
  const files = fs
    .readdirSync(dialoguesDir)
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.d.ts') &&
        f !== 'types.ts' &&
        f !== 'index.ts'
    );

  if (files.length === 0) {
    console.warn('No TS dialogue files found to generate.');
    return;
  }

  for (const file of files) {
    const fullPath = path.join(dialoguesDir, file);
    const fileUrl = url.pathToFileURL(fullPath).href;
    // eslint-disable-next-line no-await-in-loop
    const mod = await import(fileUrl);
    const spec =
      mod.default ||
      mod.dialogue ||
      mod.npcDialogue ||
      mod.spec ||
      null;
    if (!spec) {
      console.warn(`Skip ${file}: no default or named 'dialogue' export found.`);
      continue;
    }

    const json = toRuntimeJson(spec);
    const outName = `${path.basename(file, '.ts')}.json`;
    const outPath = path.join(dialoguesDir, outName);
    fs.writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
    console.log(`Wrote ${path.relative(rootDir, outPath)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});













