import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool } from '../apps/server/src/lib/db/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RawEconomyRow = {
  id: string;
  amount_text: string;
  source: string | null;
  game_id: string | null;
  loot_distribution_id: string | null;
  metadata: unknown;
  created_at: string | null;
};

type PlayerRecord = {
  id: string;
  wallet_address: string | null;
};

type BackfillOptions = {
  dryRun: boolean;
};

type PlayerSummary = {
  playerId: string;
  walletAddress: string | null;
  insertedCount: number;
  wouldInsertCount: number;
  skippedExisting: number;
  skippedZero: number;
  skippedInvalid: number;
  totalBaseUnits: bigint;
};

const MIN_BASE_UNITS = 1n;
const GHST_DECIMALS = 18;
const GHST_DECIMAL_FACTOR = BigInt(10) ** BigInt(GHST_DECIMALS);
const BASE_CHAIN_ID = 8453;

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

function normalizeDecimalInput(value: string | number | null | undefined): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : '0';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '0';
    }
    return value.toString();
  }
  return '0';
}

function resolveGhstContractAddress(): string {
  return (
    process.env.GHST_CONTRACT_ADDRESS ||
    process.env.GHST_CONTRACT_ADDRESS_BASE ||
    '0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB'
  );
}

function formatAmountFromBaseUnits(baseUnits: bigint): string {
  const negative = baseUnits < 0n;
  const absolute = negative ? -baseUnits : baseUnits;
  const integerPart = absolute / GHST_DECIMAL_FACTOR;
  const fractionalPart = absolute % GHST_DECIMAL_FACTOR;
  const prefix = negative ? '-' : '';
  if (fractionalPart === 0n) {
    return `${prefix}${integerPart.toString()}`;
  }
  const fractionalString = fractionalPart
    .toString()
    .padStart(GHST_DECIMALS, '0')
    .replace(/0+$/, '');
  return `${prefix}${integerPart.toString()}.${fractionalString}`;
}

function parseAmountToBaseUnits(value: string): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0n;
  }
  const negative = trimmed.startsWith('-');
  const sanitized = negative ? trimmed.slice(1) : trimmed;
  if (!sanitized) {
    return 0n;
  }
  const [integerPartRaw, fractionalRaw = ''] = sanitized.split('.');
  const integerPart =
    integerPartRaw && integerPartRaw.length > 0 ? BigInt(integerPartRaw) : 0n;
  const normalizedFractional = fractionalRaw.replace(/[^0-9]/g, '');
  const fractionalPadded = normalizedFractional
    .slice(0, GHST_DECIMALS)
    .padEnd(GHST_DECIMALS, '0');
  const fractionalPart =
    fractionalPadded.length > 0 ? BigInt(fractionalPadded) : 0n;
  const result = integerPart * GHST_DECIMAL_FACTOR + fractionalPart;
  return negative ? -result : result;
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseCliArgs(): {
  runAll: boolean;
  dryRun: boolean;
  wallet: string | null;
} {
  const args = process.argv.slice(2);
  let runAll = false;
  let dryRun = false;
  let walletArg: string | null = null;

  for (const arg of args) {
    if (arg === '--all') {
      runAll = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (!walletArg) {
      walletArg = normalizeWallet(arg);
      continue;
    }
    console.error(`Unrecognized extra argument: ${arg}`);
    process.exit(1);
  }

  if (runAll && walletArg) {
    console.error('Cannot specify both a wallet address and --all.');
    process.exit(1);
  }

  if (!runAll && !walletArg) {
    walletArg = normalizeWallet(process.env.BACKFILL_WALLET);
  }

  if (!runAll && !walletArg) {
    console.error(
      'Usage: pnpm --filter @gotchiverse/server exec tsx ../../scripts/backfill-ghst-token-withdrawals.ts <wallet-address> [--dry-run]'
    );
    console.error(
      'Or run with --all to process every player with GHST earnings.'
    );
    process.exit(1);
  }

  return { runAll, dryRun, wallet: walletArg };
}

async function fetchPlayerByWallet(
  pool: ReturnType<typeof getPgPool>,
  wallet: string
): Promise<PlayerRecord | null> {
  const result = await pool.query<PlayerRecord>(
    `
      select id, wallet_address
        from players
       where lower(wallet_address) = $1
       limit 1
    `,
    [wallet]
  );
  return result.rows[0] ?? null;
}

async function fetchCandidatePlayers(
  pool: ReturnType<typeof getPgPool>
): Promise<PlayerRecord[]> {
  const result = await pool.query<PlayerRecord>(
    `
      select distinct p.id, p.wallet_address
        from players p
        inner join economy_transactions et
          on et.player_id = p.id
       where et.currency = 'GHST'
         and et.amount > 0
       order by p.id asc
    `
  );
  return result.rows;
}

async function backfillPlayer(
  pool: ReturnType<typeof getPgPool>,
  player: PlayerRecord,
  ghstContractAddress: string,
  options: BackfillOptions
): Promise<PlayerSummary> {
  const client = await pool.connect();
  const summary: PlayerSummary = {
    playerId: player.id,
    walletAddress: player.wallet_address,
    insertedCount: 0,
    wouldInsertCount: 0,
    skippedExisting: 0,
    skippedZero: 0,
    skippedInvalid: 0,
    totalBaseUnits: 0n,
  };

  const transactional = !options.dryRun;

  try {
    if (transactional) {
      await client.query('BEGIN');
    }

    const existingWithdrawalsRes = await client.query<{
      economy_transaction_id: string | null;
    }>(
      `
        select economy_transaction_id
          from token_withdrawals
         where player_id = $1
           and currency = 'GHST'
           and economy_transaction_id is not null
      `,
      [player.id]
    );
    const existingEconomyIds = new Set(
      existingWithdrawalsRes.rows
        .map((row) => row.economy_transaction_id)
        .filter((id): id is string => Boolean(id))
    );

    const economyRes = await client.query<RawEconomyRow>(
      `
        select
          id,
          amount::text as amount_text,
          source,
          game_id,
          loot_distribution_id,
          metadata,
          created_at
        from economy_transactions
        where player_id = $1
          and currency = 'GHST'
          and amount > 0
        order by created_at asc
      `,
      [player.id]
    );

    if (economyRes.rowCount === 0) {
      if (transactional) {
        await client.query('ROLLBACK');
      }
      return summary;
    }

    for (const row of economyRes.rows) {
      if (existingEconomyIds.has(row.id)) {
        summary.skippedExisting += 1;
        continue;
      }

      const amountInput = normalizeDecimalInput(row.amount_text);
      let baseUnits: bigint;
      try {
        baseUnits = parseAmountToBaseUnits(amountInput);
      } catch (error) {
        console.warn(
          `Unable to parse GHST amount for economy_transaction ${row.id}:`,
          error
        );
        summary.skippedInvalid += 1;
        continue;
      }

      if (baseUnits < MIN_BASE_UNITS) {
        summary.skippedZero += 1;
        continue;
      }

      const amountDisplay = formatAmountFromBaseUnits(baseUnits);
      const receivedAt = row.created_at ?? new Date().toISOString();
      const metadata = {
        ...toMetadataRecord(row.metadata),
        backfill: true,
        script: 'backfill-ghst-token-withdrawals',
        economyTransactionId: row.id,
      };
      const source =
        typeof row.source === 'string' && row.source.trim().length > 0
          ? row.source
          : 'backfill_ghst';

      if (options.dryRun) {
        summary.wouldInsertCount += 1;
        summary.totalBaseUnits += baseUnits;
        existingEconomyIds.add(row.id);
        continue;
      }

      const insertRes = await client.query<{ id: string }>(
        `
          insert into token_withdrawals (
            player_id,
            currency,
            amount,
            amount_base_units,
            source,
            game_id,
            loot_distribution_id,
            economy_transaction_id,
            status,
            received_at,
            metadata,
            chain_id,
            token_contract_address
          )
          values (
            $1,
            'GHST',
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'received',
            $8::timestamptz,
            $9::jsonb,
            $10,
            $11
          )
          returning id
        `,
        [
          player.id,
          amountDisplay,
          baseUnits.toString(),
          source,
          row.game_id,
          row.loot_distribution_id,
          row.id,
          receivedAt,
          JSON.stringify(metadata),
          BASE_CHAIN_ID,
          ghstContractAddress,
        ]
      );

      existingEconomyIds.add(row.id);
      summary.insertedCount += 1;
      summary.totalBaseUnits += baseUnits;
      console.log(
        `  - inserted withdrawal ${insertRes.rows[0].id} for economy ${row.id}`
      );
    }

    if (transactional) {
      await client.query('COMMIT');
    }
    return summary;
  } catch (error) {
    if (transactional) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}

function logSummary(result: PlayerSummary, options: BackfillOptions) {
  const label = options.dryRun ? '[DRY-RUN]' : '';
  const amountDisplay = formatAmountFromBaseUnits(result.totalBaseUnits);
  console.log(
    `${label} Player ${result.walletAddress ?? result.playerId}: amount=${amountDisplay} GHST ` +
      `inserted=${result.insertedCount} (wouldInsert=${result.wouldInsertCount}) ` +
      `skippedExisting=${result.skippedExisting} skippedZero=${result.skippedZero} skippedInvalid=${result.skippedInvalid}`
  );
}

async function main() {
  loadEnvCascade();
  const ghstContractAddress = resolveGhstContractAddress();
  const { runAll, dryRun, wallet } = parseCliArgs();

  const pool = getPgPool();
  const options: BackfillOptions = { dryRun };

  try {
    if (runAll) {
      console.log(
        dryRun
          ? 'Running GHST backfill in DRY-RUN mode for all players with GHST earnings...'
          : 'Running GHST backfill for all players with GHST earnings...'
      );
      const players = await fetchCandidatePlayers(pool);
      if (players.length === 0) {
        console.log('No players found with GHST earnings.');
        return;
      }
      console.log(`Found ${players.length} player(s) to process.`);
      let grandInserted = 0;
      let grandWouldInsert = 0;
      let grandBaseUnits = 0n;
      for (const player of players) {
        const result = await backfillPlayer(
          pool,
          player,
          ghstContractAddress,
          options
        );
        logSummary(result, options);
        grandInserted += result.insertedCount;
        grandWouldInsert += result.wouldInsertCount;
        grandBaseUnits += result.totalBaseUnits;
      }
      const grandAmount = formatAmountFromBaseUnits(grandBaseUnits);
      const label = dryRun ? '[DRY-RUN]' : '';
      console.log(
        `${label} Totals: amount=${grandAmount} GHST inserted=${grandInserted} ` +
          `(wouldInsert=${grandWouldInsert}) players=${players.length}`
      );
      return;
    }

    if (!wallet) {
      throw new Error('Wallet address is required when not using --all.');
    }

    const player = await fetchPlayerByWallet(pool, wallet);
    if (!player) {
      console.error(`No player found with wallet address ${wallet}. Aborting.`);
      process.exit(1);
    }

    console.log(
      dryRun
        ? `Running GHST backfill in DRY-RUN mode for wallet ${player.wallet_address ?? player.id}`
        : `Running GHST backfill for wallet ${player.wallet_address ?? player.id}`
    );
    const result = await backfillPlayer(
      pool,
      player,
      ghstContractAddress,
      options
    );
    logSummary(result, options);
    console.log(
      `${options.dryRun ? '[DRY-RUN] ' : ''}Single-player total amount=${formatAmountFromBaseUnits(result.totalBaseUnits)} GHST`
    );
  } catch (error) {
    console.error('GHST backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
