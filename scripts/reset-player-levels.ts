/**
 * AUTO-GENERATED, DO NOT UPDATE
 *
 * Script to reset all player levels back to 1.
 *
 * Usage:
 *   # With environment loaded:
 *   pnpm --filter @gotchiverse/server exec tsx ../../scripts/reset-player-levels.ts --dry-run
 *   pnpm --filter @gotchiverse/server exec tsx ../../scripts/reset-player-levels.ts
 *
 *   # Or with inline DATABASE_URL:
 *   DATABASE_URL="postgres://..." tsx scripts/reset-player-levels.ts --dry-run
 *
 * Options:
 *   --dry-run   Show what would be reset without making changes
 */

import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerProgressionRow {
  id: string;
  wallet_address: string | null;
  username: string | null;
  level: number;
  total_xp: number;
  unspent_points: number;
}

interface ResetSummary {
  totalPlayers: number;
  playersToReset: number;
  playersAlreadyLevel1: number;
  totalXpCleared: bigint;
  totalPointsCleared: number;
  players: Array<{
    id: string;
    walletAddress: string | null;
    username: string | null;
    oldLevel: number;
    oldXp: bigint;
    oldPoints: number;
  }>;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function loadEnvCascade() {
  const repoRoot = path.resolve(__dirname, '..');
  const serverDir = path.resolve(repoRoot, 'apps', 'server');
  const cwdDir = process.cwd();

  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(serverDir, '.env.local'),
    path.join(cwdDir, '.env'),
    path.join(cwdDir, '.env.local'),
  ].filter(fileExists);

  for (const envPath of candidates) {
    loadEnv({ path: envPath, override: true });
  }
}

function createPool(): Pool {
  // Allow self-signed certificates
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.error('Error: DATABASE_URL or SUPABASE_DB_URL must be set.');
    console.error('');
    console.error('Example usage:');
    console.error(
      '  DATABASE_URL="<postgres-url>" tsx scripts/reset-player-levels.ts --dry-run'
    );
    process.exit(1);
  }

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function parseCliArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    console.error(`Unrecognized argument: ${arg}`);
    console.error('Usage: tsx reset-player-levels.ts [--dry-run]');
    process.exit(1);
  }

  return { dryRun };
}

async function fetchPlayersWithProgression(
  pool: Pool
): Promise<PlayerProgressionRow[]> {
  const result = await pool.query<PlayerProgressionRow>(`
    select
      id,
      wallet_address,
      username,
      coalesce(level, 1) as level,
      coalesce(total_xp, 0) as total_xp,
      coalesce(unspent_points, 0) as unspent_points
    from players
    order by level desc, total_xp desc
  `);
  return result.rows;
}

async function resetAllPlayerLevels(
  pool: Pool,
  dryRun: boolean
): Promise<ResetSummary> {
  const players = await fetchPlayersWithProgression(pool);

  const summary: ResetSummary = {
    totalPlayers: players.length,
    playersToReset: 0,
    playersAlreadyLevel1: 0,
    totalXpCleared: 0n,
    totalPointsCleared: 0,
    players: [],
  };

  // Identify players who need resetting
  for (const player of players) {
    const needsReset =
      player.level > 1 || player.total_xp > 0 || player.unspent_points > 0;

    if (!needsReset) {
      summary.playersAlreadyLevel1 += 1;
      continue;
    }

    summary.playersToReset += 1;
    summary.totalXpCleared += BigInt(player.total_xp);
    summary.totalPointsCleared += player.unspent_points;
    summary.players.push({
      id: player.id,
      walletAddress: player.wallet_address,
      username: player.username,
      oldLevel: player.level,
      oldXp: BigInt(player.total_xp),
      oldPoints: player.unspent_points,
    });
  }

  if (dryRun) {
    console.log('\n[DRY-RUN] Would reset the following players:\n');
    for (const p of summary.players) {
      const name = p.username || p.walletAddress || p.id;
      console.log(
        `  - ${name}: level ${p.oldLevel} → 1, xp ${p.oldXp} → 0, points ${p.oldPoints} → 0`
      );
    }
    return summary;
  }

  // Execute the reset
  if (summary.playersToReset > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Reset level/XP/points but PRESERVE unlocked_tiers and lick_tongue_count
      // (these are earned through Lick Tongue currency, not XP)
      const result = await client.query(
        `
        update players
        set
          level = 1,
          total_xp = 0,
          unspent_points = 0,
          stat_allocations = '{"energy":0,"aggression":0,"spookiness":0,"brainSize":0}'::jsonb,
          allocation_history = '[]'::jsonb,
          updated_at = now()
        where level > 1 or total_xp > 0 or unspent_points > 0
        returning id
        `
      );

      await client.query('COMMIT');
      console.log(`\nReset ${result.rowCount} player(s) to level 1.\n`);
      console.log('Note: unlocked_tiers and lick_tongue_count were preserved.\n');

      for (const p of summary.players) {
        const name = p.username || p.walletAddress || p.id;
        console.log(
          `  - ${name}: level ${p.oldLevel} → 1, xp ${p.oldXp} → 0, points ${p.oldPoints} → 0`
        );
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return summary;
}

async function main() {
  loadEnvCascade();
  const { dryRun } = parseCliArgs();

  const pool = createPool();

  try {
    console.log(
      dryRun
        ? '\n=== RESET PLAYER LEVELS (DRY-RUN) ===\n'
        : '\n=== RESET PLAYER LEVELS ===\n'
    );

    const summary = await resetAllPlayerLevels(pool, dryRun);

    console.log('\n--- Summary ---');
    console.log(`Total players in database: ${summary.totalPlayers}`);
    console.log(`Players already at level 1: ${summary.playersAlreadyLevel1}`);
    console.log(
      `Players ${dryRun ? 'to reset' : 'reset'}: ${summary.playersToReset}`
    );
    console.log(`Total XP cleared: ${Number(summary.totalXpCleared).toLocaleString()}`);
    console.log(`Total unspent points cleared: ${summary.totalPointsCleared}`);

    if (dryRun && summary.playersToReset > 0) {
      console.log(
        '\n[DRY-RUN] No changes were made. Run without --dry-run to apply.'
      );
    }
  } catch (error) {
    console.error('Reset failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
