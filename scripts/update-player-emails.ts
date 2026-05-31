/**
 * Bulk update player emails from a Typeform CSV export.
 *
 * Usage:
 *   pnpm --filter @gotchiverse/server exec tsx ../../scripts/update-player-emails.ts --csv ./data/typeform.csv --dry-run
 *   pnpm --filter @gotchiverse/server exec tsx ../../scripts/update-player-emails.ts --csv ./data/typeform.csv
 *   pnpm --filter @gotchiverse/server exec tsx ../../scripts/update-player-emails.ts --csv ./data/typeform.csv --export ./data/email-wallets.csv
 *
 * Options:
 *   --csv <path>    Path to the Typeform CSV export
 *   --dry-run       Show what would change without updating
 *   --overwrite     Replace existing email_address values
 *   --export <path> Write extracted wallet/email pairs to CSV
 *   --ens-map <path> JSON map of ENS → address overrides
 *
 * Notes:
 *   - ENS names in the wallet column are resolved via Ethereum mainnet.
 */

import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliArgs {
  csvPath: string;
  dryRun: boolean;
  overwrite: boolean;
  exportPath: string | null;
  ensOverridesPath: string | null;
}

interface CsvEntry {
  walletAddress: string;
  emailAddress: string;
  rowIndex: number;
}

interface ExistingPlayer {
  wallet_address: string;
  email_address: string | null;
}

interface UpdatePlan {
  toUpdate: CsvEntry[];
  missingPlayers: CsvEntry[];
  skippedExisting: CsvEntry[];
  invalidRows: Array<{ rowIndex: number; reason: string }>;
  duplicateWallets: Array<{ walletAddress: string; emails: string[] }>;
}

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http('https://cloudflare-eth.com'),
});

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
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  if (!connectionString) {
    console.error('Error: DATABASE_URL or SUPABASE_DB_URL must be set.');
    console.error('');
    console.error('Example usage:');
    console.error(
      '  DATABASE_URL="<postgres-url>" tsx scripts/update-player-emails.ts --csv ./data/typeform.csv --dry-run'
    );
    process.exit(1);
  }

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  let csvPath = '';
  let dryRun = false;
  let overwrite = false;
  let exportPath: string | null = null;
  let ensOverridesPath: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--csv') {
      csvPath = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }
    if (arg === '--export') {
      exportPath = args[i + 1] || '';
      i += 1;
      continue;
    }
    if (arg === '--ens-map') {
      ensOverridesPath = args[i + 1] || '';
      i += 1;
      continue;
    }
    console.error(`Unrecognized argument: ${arg}`);
    console.error(
      'Usage: tsx update-player-emails.ts --csv <path> [--dry-run] [--overwrite] [--export <path>] [--ens-map <path>]'
    );
    process.exit(1);
  }

  if (!csvPath) {
    console.error('Error: --csv <path> is required.');
    process.exit(1);
  }

  return { csvPath, dryRun, overwrite, exportPath, ensOverridesPath };
}

function normalizeWallet(address: string | null | undefined): string {
  if (!address) return '';
  return String(address).trim().toLowerCase();
}

function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

function extractWallet(rawWallet: string): string {
  const match = rawWallet.match(/0x[a-fA-F0-9]{40}/);
  if (!match) return '';
  return normalizeWallet(match[0]);
}

function extractEnsNames(rawWallet: string): string[] {
  if (!rawWallet) return [];
  const matches = rawWallet.match(/[a-z0-9][a-z0-9-_.]{1,}\.[a-z0-9.-]+/gi);
  if (!matches) return [];
  return Array.from(new Set(matches.map((name) => name.trim().toLowerCase())));
}

async function resolveEnsAddress(name: string): Promise<string | null> {
  try {
    const resolved = await ensClient.getEnsAddress({ name });
    return resolved ? normalizeWallet(resolved) : null;
  } catch {
    return null;
  }
}

async function resolveEnsCandidates(
  names: string[],
  cache: Map<string, string | null>,
  overrides: Map<string, string>
): Promise<string> {
  for (const name of names) {
    if (overrides.has(name)) {
      return overrides.get(name) ?? '';
    }
    if (cache.has(name)) {
      const cached = cache.get(name);
      if (cached) return cached;
      continue;
    }
    const resolved = await resolveEnsAddress(name);
    cache.set(name, resolved);
    if (resolved) return resolved;
  }
  return '';
}


function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell);
      cell = '';
      if (char === ',' ) {
        continue;
      }
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function findHeaderIndex(headers: string[], needle: string): number {
  const normalizedNeedle = needle.trim().toLowerCase();
  return headers.findIndex((header) =>
    header.trim().toLowerCase().includes(normalizedNeedle)
  );
}

async function buildEmailMap(
  rows: string[][],
  ensOverrides: Map<string, string>
): Promise<UpdatePlan> {
  const plan: UpdatePlan = {
    toUpdate: [],
    missingPlayers: [],
    skippedExisting: [],
    invalidRows: [],
    duplicateWallets: [],
  };

  if (rows.length === 0) {
    return plan;
  }

  const [header, ...body] = rows;
  const emailIndex = findHeaderIndex(header, 'email address');
  const walletIndex = findHeaderIndex(header, 'wallet address');

  if (emailIndex === -1 || walletIndex === -1) {
    throw new Error(
      'CSV headers must include columns for "email address" and "wallet address".'
    );
  }

  const walletToEmails = new Map<string, Set<string>>();
  const walletToEntry = new Map<string, CsvEntry>();
  const ensCache = new Map<string, string | null>();

  for (let idx = 0; idx < body.length; idx += 1) {
    const row = body[idx];
    const rowIndex = idx + 2; // +1 for header, +1 for 1-based rows
    const rawEmail = row[emailIndex] || '';
    const rawWallet = row[walletIndex] || '';
    const emailAddress = normalizeEmail(rawEmail);
    let walletAddress = extractWallet(rawWallet);
    if (!walletAddress) {
      const ensNames = extractEnsNames(rawWallet);
      if (ensNames.length > 0) {
        walletAddress = await resolveEnsCandidates(
          ensNames,
          ensCache,
          ensOverrides
        );
      }
    }

    if (!emailAddress || !walletAddress) {
      const reason = !emailAddress
        ? 'missing email'
        : 'missing wallet address';
      plan.invalidRows.push({ rowIndex, reason });
      continue;
    }

    if (!walletToEmails.has(walletAddress)) {
      walletToEmails.set(walletAddress, new Set());
    }
    walletToEmails.get(walletAddress)?.add(emailAddress);

    walletToEntry.set(walletAddress, { walletAddress, emailAddress, rowIndex });
  }

  for (const [walletAddress, emails] of walletToEmails.entries()) {
    if (emails.size > 1) {
      plan.duplicateWallets.push({
        walletAddress,
        emails: Array.from(emails.values()),
      });
    }
  }

  plan.toUpdate = Array.from(walletToEntry.values());
  return plan;
}

function logList(label: string, values: string[]) {
  const max = 25;
  const display = values.slice(0, max);
  if (display.length === 0) return;
  console.log(`\n${label} (${values.length}):`);
  for (const value of display) {
    console.log(`  - ${value}`);
  }
  if (values.length > max) {
    console.log(`  ...and ${values.length - max} more`);
  }
}

async function buildUpdatePlan(
  pool: Pool,
  entries: CsvEntry[],
  overwrite: boolean
): Promise<UpdatePlan> {
  const plan: UpdatePlan = {
    toUpdate: [],
    missingPlayers: [],
    skippedExisting: [],
    invalidRows: [],
    duplicateWallets: [],
  };

  if (entries.length === 0) return plan;

  const wallets = entries.map((entry) => entry.walletAddress);
  const result = await pool.query<ExistingPlayer>(
    'select wallet_address, email_address from players where wallet_address = any($1)',
    [wallets]
  );

  const existingMap = new Map(
    result.rows.map((row) => [row.wallet_address, row.email_address])
  );

  for (const entry of entries) {
    const existingEmail = existingMap.get(entry.walletAddress);
    if (!existingMap.has(entry.walletAddress)) {
      plan.missingPlayers.push(entry);
      continue;
    }
    if (!overwrite && existingEmail && existingEmail.trim().length > 0) {
      plan.skippedExisting.push(entry);
      continue;
    }
    plan.toUpdate.push(entry);
  }

  return plan;
}

async function applyUpdates(
  pool: Pool,
  entries: CsvEntry[],
  overwrite: boolean
) {
  if (entries.length === 0) {
    return 0;
  }

  const walletAddresses = entries.map((entry) => entry.walletAddress);
  const emailAddresses = entries.map((entry) => entry.emailAddress);

  const whereClause = overwrite
    ? 'players.wallet_address = data.wallet_address'
    : `players.wallet_address = data.wallet_address
       and (players.email_address is null or players.email_address = '')`;

  const result = await pool.query(
    `
      update players
         set email_address = data.email_address,
             updated_at = now()
        from (
          select * from unnest($1::text[], $2::text[]) as t(wallet_address, email_address)
        ) data
       where ${whereClause}
    `,
    [walletAddresses, emailAddresses]
  );

  return result.rowCount ?? 0;
}

async function main() {
  loadEnvCascade();
  const { csvPath, dryRun, overwrite, exportPath, ensOverridesPath } =
    parseCliArgs();

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(csvText);
  const ensOverrides = new Map<string, string>();
  if (ensOverridesPath) {
    const overridesText = fs.readFileSync(ensOverridesPath, 'utf-8');
    const overrides = JSON.parse(overridesText) as Record<string, string>;
    for (const [name, address] of Object.entries(overrides)) {
      const normalizedName = name.trim().toLowerCase();
      const normalizedAddress = normalizeWallet(address);
      if (!normalizedName || !normalizedAddress) continue;
      ensOverrides.set(normalizedName, normalizedAddress);
    }
  }

  const initialPlan = await buildEmailMap(rows, ensOverrides);

  if (initialPlan.invalidRows.length > 0) {
    const invalidLines = initialPlan.invalidRows.map(
      (row) => `row ${row.rowIndex} (${row.reason})`
    );
    logList('Invalid CSV rows', invalidLines);
  }

  if (initialPlan.duplicateWallets.length > 0) {
    const duplicates = initialPlan.duplicateWallets.map(
      (entry) => `${entry.walletAddress}: ${entry.emails.join(', ')}`
    );
    logList('Duplicate wallets with multiple emails', duplicates);
  }

  if (exportPath) {
    const lines = [
      'wallet_address,email_address',
      ...initialPlan.toUpdate.map(
        (entry) => `${entry.walletAddress},${entry.emailAddress}`
      ),
    ];
    fs.writeFileSync(exportPath, `${lines.join('\n')}\n`);
    console.log(`\nWrote extracted pairs to ${exportPath}`);
  }

  const pool = createPool();
  try {
    const plan = await buildUpdatePlan(
      pool,
      initialPlan.toUpdate,
      overwrite
    );

    logList(
      'Missing players (wallets not found)',
      plan.missingPlayers.map((entry) => entry.walletAddress)
    );

    logList(
      'Skipped (already has email_address)',
      plan.skippedExisting.map((entry) => entry.walletAddress)
    );

    console.log('\n--- Summary ---');
    console.log(`CSV rows parsed: ${rows.length - 1}`);
    console.log(`Valid entries: ${initialPlan.toUpdate.length}`);
    console.log(`Missing players: ${plan.missingPlayers.length}`);
    console.log(`Skipped existing: ${plan.skippedExisting.length}`);
    console.log(`Updates ${dryRun ? 'to apply' : 'applied'}: ${plan.toUpdate.length}`);

    if (dryRun) {
      console.log('\n[DRY-RUN] No changes were made.');
      return;
    }

    const updated = await applyUpdates(pool, plan.toUpdate, overwrite);
    console.log(`\nUpdated ${updated} player record(s).`);
  } catch (error) {
    console.error('Update failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
