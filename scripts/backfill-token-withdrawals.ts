import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool } from '../apps/server/src/lib/db/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RawRunRow = {
  game_id: string;
  usdc_earned_base_units: string | number;
  joined_at: string | null;
  left_at: string | null;
  run_score_id: string | null;
  run_score_completed_at: string | null;
  run_score_value: number | null;
};

const DEFAULT_SOURCE = 'backfill_game_run';
const MIN_BASE_UNITS = 1n;
const USDC_DECIMALS = 1_000_000n;

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

function normalizeWallet(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.toLowerCase();
}

function formatAmountFromBaseUnits(baseUnits: bigint): string {
  if (baseUnits === 0n) {
    return '0';
  }
  const integerPart = baseUnits / USDC_DECIMALS;
  const fractionalPart = baseUnits % USDC_DECIMALS;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalString = fractionalPart
    .toString()
    .padStart(USDC_DECIMALS.toString().length - 1, '0')
    .replace(/0+$/, '');

  return `${integerPart.toString()}.${fractionalString}`;
}

async function main() {
  loadEnvCascade();

  const walletArg =
    normalizeWallet(process.argv[2]) ??
    normalizeWallet(process.env.BACKFILL_WALLET);

  if (!walletArg) {
    console.error(
      'Usage: pnpm --filter @gotchiverse/server exec tsx ../../scripts/backfill-token-withdrawals.ts <wallet-address>'
    );
    console.error(
      'Or set BACKFILL_WALLET=0x... in your environment before running.'
    );
    process.exit(1);
  }

  const pool = getPgPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const playerRes = await client.query<{ id: string; wallet_address: string }>(
      `
        select id, wallet_address
          from players
         where lower(wallet_address) = $1
         limit 1
      `,
      [walletArg]
    );

    if (playerRes.rowCount === 0) {
      console.error(
        `No player found with wallet address ${walletArg}. Aborting.`
      );
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const player = playerRes.rows[0];
    const playerId = player.id;

    const existingRes = await client.query<{ game_id: string | null }>(
      `
        select distinct game_id
          from token_withdrawals
         where player_id = $1
      `,
      [playerId]
    );

    const existingGameIds = new Set(
      existingRes.rows
        .map((row) => row.game_id)
        .filter((gameId): gameId is string => Boolean(gameId))
    );

    const runsRes = await client.query<RawRunRow>(
      `
        select
          gp.game_id,
          gp.usdc_earned_base_units,
          gp.joined_at,
          gp.left_at,
          rs.id as run_score_id,
          rs.completed_at as run_score_completed_at,
          rs.score as run_score_value
        from game_players gp
        left join run_scores rs
          on rs.game_id = gp.game_id
         and rs.player_id = gp.player_id
        where gp.player_id = $1
          and gp.usdc_earned_base_units > 0
        order by coalesce(rs.completed_at, gp.left_at, gp.joined_at) asc
      `,
      [playerId]
    );

    if (runsRes.rowCount === 0) {
      console.log(
        `Player ${player.wallet_address} (${playerId}) has no runs with earned USDC. Nothing to backfill.`
      );
      await client.query('ROLLBACK');
      return;
    }

    const insertedIds: string[] = [];
    const skippedExisting: string[] = [];
    const skippedZero: string[] = [];

    for (const row of runsRes.rows) {
      const gameId = row.game_id;
      if (!gameId) {
        continue;
      }

      if (existingGameIds.has(gameId)) {
        skippedExisting.push(gameId);
        continue;
      }

      const baseUnitsRaw = row.usdc_earned_base_units;
      let baseUnits: bigint;
      try {
        baseUnits = BigInt(baseUnitsRaw);
      } catch {
        console.warn(
          `Unable to parse usdc_earned_base_units for game ${gameId}: ${baseUnitsRaw}`
        );
        continue;
      }

      if (baseUnits < MIN_BASE_UNITS) {
        skippedZero.push(gameId);
        continue;
      }

      const amount = formatAmountFromBaseUnits(baseUnits);
      const receivedAt =
        row.run_score_completed_at ??
        row.left_at ??
        row.joined_at ??
        new Date().toISOString();

      const metadata = {
        backfill: true,
        script: 'backfill-token-withdrawals',
        gameId,
        runScoreId: row.run_score_id,
        runScore: row.run_score_value,
        source: DEFAULT_SOURCE,
      };

      const insertRes = await client.query<{ id: string }>(
        `
          insert into token_withdrawals (
            player_id,
            currency,
            amount,
            amount_base_units,
            source,
            game_id,
            status,
            received_at,
            metadata
          )
          values ($1, 'USDC', $2, $3, $4, $5, 'received', $6::timestamptz, $7::jsonb)
          returning id
        `,
        [
          playerId,
          amount,
          baseUnits.toString(),
          DEFAULT_SOURCE,
          gameId,
          receivedAt,
          JSON.stringify(metadata),
        ]
      );

      insertedIds.push(insertRes.rows[0].id);
    }

    await client.query('COMMIT');

    console.log(
      `Backfill complete for wallet ${player.wallet_address} (player_id=${playerId}).`
    );
    console.log(`Inserted ${insertedIds.length} token withdrawals.`);
    if (insertedIds.length > 0) {
      for (const id of insertedIds) {
        console.log(`  - inserted withdrawal ${id}`);
      }
    }

    if (skippedExisting.length > 0) {
      console.log(
        `Skipped ${skippedExisting.length} runs because a withdrawal already exists for game_id:`
      );
      for (const gameId of skippedExisting) {
        console.log(`  - ${gameId}`);
      }
    }

    if (skippedZero.length > 0) {
      console.log(
        `Skipped ${skippedZero.length} runs with < ${MIN_BASE_UNITS} base units earned:`
      );
      for (const gameId of skippedZero) {
        console.log(`  - ${gameId}`);
      }
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
