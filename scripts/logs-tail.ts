import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { gunzip as gunzipCallback } from 'zlib';
import { promisify } from 'util';
import {
  serverLogIndexRepo,
  getSupabaseAdminClient,
  type ServerLogIndexRecord,
} from '../apps/server/src/lib/db';
import { DEBUG_LOG_BUCKET } from '../apps/server/src/lib/logging/log-schema';

const gunzip = promisify(gunzipCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CliArgs = {
  gameId: string;
  sinceMs: number;
  follow: boolean;
  pollIntervalMs: number;
};

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function loadEnvCascade() {
  const repoRoot = path.resolve(__dirname, '..');
  const serverDir = path.join(repoRoot, 'apps', 'server');
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(serverDir, '.env.local'),
  ].filter(fileExists);
  for (const candidate of candidates) {
    loadEnv({ path: candidate, override: true });
  }
}

function parseDuration(value: string | undefined): number {
  if (!value) {
    return 15 * 60 * 1000;
  }
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] || 'm';
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };
  return amount * (multipliers[unit] || 60_000);
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let gameId: string | null = null;
  let sinceMs = 15 * 60 * 1000;
  let follow = false;
  let pollIntervalMs = 10_000;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--game' || arg === '-g') {
      gameId = args[i + 1] || null;
      i += 1;
    } else if (arg === '--since') {
      sinceMs = parseDuration(args[i + 1]);
      i += 1;
    } else if (arg === '--follow' || arg === '-f') {
      follow = true;
    } else if (arg === '--interval') {
      pollIntervalMs = Number(args[i + 1]) || pollIntervalMs;
      i += 1;
    }
  }

  if (!gameId) {
    throw new Error('Missing required --game argument');
  }

  return {
    gameId,
    sinceMs,
    follow,
    pollIntervalMs: Math.max(2000, pollIntervalMs),
  };
}

async function fetchShardBuffer(storagePath: string): Promise<Buffer> {
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage
    .from(DEBUG_LOG_BUCKET)
    .download(storagePath);
  if (result.error || !result.data) {
    throw new Error(
      `Failed to download shard ${storagePath}: ${result.error?.message || 'unknown error'}`
    );
  }
  const arrayBuffer = await result.data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function printShards(
  shards: ServerLogIndexRecord[],
  printed: Set<string>
) {
  const sorted = shards
    .filter((shard) => !printed.has(shard.storagePath))
    .sort((a, b) => a.tsStart.localeCompare(b.tsStart));

  for (const shard of sorted) {
    const compressed = await fetchShardBuffer(shard.storagePath);
    const decompressed = await gunzip(compressed);
    process.stdout.write(decompressed);
    printed.add(shard.storagePath);
  }
}

async function main() {
  loadEnvCascade();
  const options = parseCliArgs();
  const printedPaths = new Set<string>();

  const initialFrom = new Date(Date.now() - options.sinceMs).toISOString();
  let cursor = initialFrom;

  while (true) {
    const shards = await serverLogIndexRepo.listShardsForGame({
      gameId: options.gameId,
      from: cursor,
    });
    if (shards.length > 0) {
      await printShards(shards, printedPaths);
      const latest = shards.reduce((acc, shard) => {
        return shard.tsEnd > acc ? shard.tsEnd : acc;
      }, cursor);
      cursor = latest;
    }
    if (!options.follow) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs));
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[logs:tail] failed', error);
  process.exit(1);
});
