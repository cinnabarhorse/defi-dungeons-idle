import path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';

// Ensure environment variables are loaded before importing the server
const cwd = process.cwd();
const serverDir = path.resolve(__dirname, '../../');
const repoRoot = path.resolve(__dirname, '../../../');

const envPaths = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(serverDir, '.env'),
  path.join(serverDir, '.env.local'),
  path.join(cwd, '.env'),
  path.join(cwd, '.env.local'),
];

for (const p of envPaths) {
  if (existsSync(p)) {
    // Load file-based env vars as defaults only; do not override
    // runtime-provided env (e.g., PORT=2999 for blue/green slots).
    dotenvConfig({ path: p, override: false });
  }
}

// Minimal diagnostics (do not print secrets)
const supabaseUrlLen = (process.env.SUPABASE_URL || '').trim().length;
// eslint-disable-next-line no-console
console.log(`[env] SUPABASE_URL length: ${supabaseUrlLen}`);

// Now import the server entry
import('./index');
