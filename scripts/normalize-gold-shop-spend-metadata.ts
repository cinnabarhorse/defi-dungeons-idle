import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool } from '../apps/server/src/lib/db/client';
import { PORTAL_MAGE_SHOP } from '../apps/server/src/data/npc-shops/portalmage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Options = {
  fromIso: string;
  toIso: string;
  dryRun: boolean;
  wallet: string | null;
  playerId: string | null;
  limit: number | null;
  sampleSize: number;
};

type CandidateRow = {
  id: string;
  player_id: string;
  wallet_address: string | null;
  created_at: string;
  delta: number;
  metadata: unknown;
};

type ShopPotionEntry = {
  id: string;
  label: string;
  price: number;
};

type CanonicalSpendItem = {
  itemId: string;
  itemName: string;
  quantity: number;
  price: number;
  total: number;
};

type UpdatePlan = {
  id: string;
  nextMetadata: Record<string, unknown>;
  sample: {
    id: string;
    createdAt: string;
    walletAddress: string | null;
    oldPotionName: string | null;
    oldShopItemId: string | null;
    newShopItemId: string;
    quantity: number;
    price: number;
    total: number;
  };
};

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
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizePlayerId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

function parseDateInput(value: string, isEnd: boolean): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(value)) {
    return isEnd ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed.toISOString();
}

function parseNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const getValue = (flag: string) => {
    const index = args.indexOf(flag);
    if (index === -1 || index + 1 >= args.length) return null;
    return args[index + 1];
  };

  if (args.includes('--help')) {
    console.log(
      [
        'Usage:',
        '  pnpm --filter @gotchiverse/server exec tsx ../../scripts/normalize-gold-shop-spend-metadata.ts [options]',
        '',
        'Options:',
        '  --from YYYY-MM-DD or ISO (default: 30 days ago)',
        '  --to YYYY-MM-DD or ISO (default: now)',
        '  --wallet 0x... (optional)',
        '  --player-id <uuid> (optional)',
        '  --limit <n> (optional)',
        '  --sample-size <n> (default: 20)',
        '  --write (persist updates; default is dry-run)',
        '',
        'Notes:',
        '  - Targets reason=shop_purchase_backfill where metadata.source=shop_potion_audit.',
        '  - Rewrites metadata to canonical shop item IDs (e.g. health_potion).',
      ].join('\n')
    );
    process.exit(0);
  }

  const now = new Date();
  const defaultTo = now.toISOString();
  const defaultFrom = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const fromArg = getValue('--from');
  const toArg = getValue('--to');
  const fromIso = fromArg ? parseDateInput(fromArg, false) : defaultFrom;
  const toIso = toArg ? parseDateInput(toArg, true) : defaultTo;

  const writeMode = args.includes('--write');

  return {
    fromIso,
    toIso,
    dryRun: !writeMode,
    wallet: normalizeWallet(getValue('--wallet')),
    playerId: normalizePlayerId(getValue('--player-id')),
    limit: (() => {
      const raw = getValue('--limit');
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.floor(n);
    })(),
    sampleSize: Math.max(1, Math.floor(parseNumber(getValue('--sample-size'), 20))),
  };
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toPositiveInt(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(1, Math.floor(numeric));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArrayOfRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function sameString(value: unknown, expected: string): boolean {
  return String(value ?? '').trim().toLowerCase() === expected.trim().toLowerCase();
}

function sameInt(value: unknown, expected: number): boolean {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  return Math.floor(parsed) === Math.floor(expected);
}

function itemMatchesCanonical(
  item: Record<string, unknown> | null,
  canonical: CanonicalSpendItem
) {
  if (!item) return false;
  return (
    sameString(item.itemId, canonical.itemId) &&
    sameString(item.itemName, canonical.itemName) &&
    sameInt(item.quantity, canonical.quantity) &&
    sameInt(item.price, canonical.price) &&
    sameInt(item.total, canonical.total)
  );
}

function metadataAlreadyCanonical(
  metadata: Record<string, unknown>,
  canonical: CanonicalSpendItem
): boolean {
  const items = asArrayOfRecords(metadata.items);
  const purchases = asArrayOfRecords(metadata.purchases);
  const firstItem = items[0] ?? null;
  const firstPurchase = purchases[0] ?? null;

  return (
    sameString(metadata.source, 'shop_potion_audit') &&
    sameString(metadata.shopItemId, canonical.itemId) &&
    sameString(metadata.shopItemName, canonical.itemName) &&
    sameString(metadata.potionName, canonical.itemName) &&
    sameInt(metadata.potionDelta, canonical.quantity) &&
    sameInt(metadata.pricePerPotion, canonical.price) &&
    sameInt(metadata.quantity, canonical.quantity) &&
    sameInt(metadata.price, canonical.price) &&
    items.length === 1 &&
    purchases.length === 1 &&
    itemMatchesCanonical(firstItem, canonical) &&
    itemMatchesCanonical(firstPurchase, canonical)
  );
}

function buildPotionCatalog() {
  const byId = new Map<string, ShopPotionEntry>();
  const byName = new Map<string, ShopPotionEntry>();

  for (const item of PORTAL_MAGE_SHOP) {
    const currencyName = String(item.currency?.name ?? '').toLowerCase();
    if (currencyName !== 'gold') continue;

    const grantType = String(
      item.grant?.type ?? item.grant?.itemType ?? ''
    ).toLowerCase();
    if (grantType !== 'potion') continue;

    const itemId = String(item.id ?? '').trim();
    const label = String(item.label ?? item.grant?.name ?? '').trim();
    if (!itemId || !label) continue;

    const entry: ShopPotionEntry = {
      id: itemId,
      label,
      price: Math.max(1, Math.floor(Number(item.price) || 0)),
    };

    byId.set(itemId.toLowerCase(), entry);
    byName.set(label.toLowerCase(), entry);
    byName.set(String(item.grant?.name ?? '').trim().toLowerCase(), entry);
  }

  return { byId, byName };
}

function resolveCatalogEntry(
  metadata: Record<string, unknown>,
  catalog: ReturnType<typeof buildPotionCatalog>
): ShopPotionEntry | null {
  const shopItemId = toString(metadata.shopItemId);
  if (shopItemId) {
    const byId = catalog.byId.get(shopItemId.toLowerCase());
    if (byId) return byId;
  }

  const items = asArrayOfRecords(metadata.items);
  const purchases = asArrayOfRecords(metadata.purchases);
  const first = items[0] ?? purchases[0] ?? null;
  if (first) {
    const firstItemId = toString(first.itemId);
    if (firstItemId) {
      const byItemId = catalog.byId.get(firstItemId.toLowerCase());
      if (byItemId) return byItemId;
    }
  }

  const nameCandidates = [
    toString(metadata.potionName),
    toString(metadata.shopItemName),
    first ? toString(first.itemName ?? first.name ?? first.label) : null,
    first ? toString(first.itemId) : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of nameCandidates) {
    const byName = catalog.byName.get(candidate.toLowerCase());
    if (byName) return byName;
  }

  return null;
}

function buildCanonicalSpendItem(
  metadata: Record<string, unknown>,
  delta: number,
  entry: ShopPotionEntry
): CanonicalSpendItem {
  const absDelta = Math.max(0, Math.floor(Math.abs(Number(delta) || 0)));
  const items = asArrayOfRecords(metadata.items);
  const purchases = asArrayOfRecords(metadata.purchases);
  const first = items[0] ?? purchases[0] ?? null;

  let quantity =
    toPositiveInt(metadata.potionDelta) ??
    toPositiveInt(metadata.quantity) ??
    (first ? toPositiveInt(first.quantity) : null);

  let price =
    toPositiveInt(metadata.pricePerPotion) ??
    toPositiveInt(metadata.price) ??
    (first ? toPositiveInt(first.price) : null) ??
    entry.price;

  if (!quantity && absDelta > 0 && price > 0) {
    quantity = Math.max(1, Math.floor(absDelta / price));
  }
  if (!quantity) {
    quantity = 1;
  }

  let total = absDelta;
  if (total <= 0) {
    total =
      (first ? toPositiveInt(first.total) : null) ??
      Math.max(1, quantity * Math.max(1, price));
  }

  if ((!price || price <= 0) && quantity > 0) {
    price = Math.max(1, Math.floor(total / quantity) || entry.price || 1);
  }

  return {
    itemId: entry.id,
    itemName: entry.label,
    quantity,
    price,
    total,
  };
}

function normalizeMetadata(
  metadata: Record<string, unknown>,
  spendItem: CanonicalSpendItem
): Record<string, unknown> {
  const next = { ...metadata };
  next.source = 'shop_potion_audit';
  next.shopItemId = spendItem.itemId;
  next.shopItemName = spendItem.itemName;
  next.quantity = spendItem.quantity;
  next.price = spendItem.price;
  next.potionName = spendItem.itemName;
  next.potionDelta = spendItem.quantity;
  next.pricePerPotion = spendItem.price;
  next.items = [spendItem];
  next.purchases = [spendItem];
  return next;
}

async function main() {
  loadEnvCascade();
  const options = parseArgs();
  const catalog = buildPotionCatalog();
  const pool = getPgPool();
  const client = await pool.connect();

  try {
    const selectionSql = `
      select
        e.id,
        e.player_id,
        p.wallet_address,
        e.created_at,
        e.delta::numeric as delta,
        e.metadata
      from player_inventory_events e
      join players p on p.id = e.player_id
      where e.reason = 'shop_purchase_backfill'
        and e.created_at >= $1::timestamptz
        and e.created_at <= $2::timestamptz
        and ($3::uuid is null or e.player_id = $3::uuid)
        and ($4::text is null or lower(p.wallet_address) = $4::text)
        and coalesce(lower(e.metadata->>'source'), '') = 'shop_potion_audit'
      order by e.created_at asc
      limit coalesce($5::int, 2147483647)
    `;

    const rows = await client.query<CandidateRow>(selectionSql, [
      options.fromIso,
      options.toIso,
      options.playerId,
      options.wallet,
      options.limit,
    ]);

    const plans: UpdatePlan[] = [];
    const unknownNameCounts = new Map<string, number>();
    let invalidMetadataCount = 0;
    let alreadyCanonicalCount = 0;

    for (const row of rows.rows) {
      const metadata = asRecord(row.metadata);
      if (!metadata) {
        invalidMetadataCount += 1;
        continue;
      }

      const entry = resolveCatalogEntry(metadata, catalog);
      if (!entry) {
        const fallbackName =
          toString(metadata.potionName) ??
          toString(metadata.shopItemName) ??
          toString(metadata.items) ??
          'unknown';
        unknownNameCounts.set(
          fallbackName,
          (unknownNameCounts.get(fallbackName) ?? 0) + 1
        );
        continue;
      }

      const spendItem = buildCanonicalSpendItem(metadata, row.delta, entry);
      const nextMetadata = normalizeMetadata(metadata, spendItem);

      if (metadataAlreadyCanonical(metadata, spendItem)) {
        alreadyCanonicalCount += 1;
        continue;
      }

      plans.push({
        id: row.id,
        nextMetadata,
        sample: {
          id: row.id,
          createdAt: row.created_at,
          walletAddress: row.wallet_address,
          oldPotionName: toString(metadata.potionName),
          oldShopItemId: toString(metadata.shopItemId),
          newShopItemId: spendItem.itemId,
          quantity: spendItem.quantity,
          price: spendItem.price,
          total: spendItem.total,
        },
      });
    }

    const totalRows = rows.rowCount ?? rows.rows.length;
    const summary = [
      'Normalization summary:',
      `- Range: ${options.fromIso} -> ${options.toIso}`,
      `- Candidate rows: ${totalRows}`,
      `- Update-ready rows: ${plans.length}`,
      `- Already canonical: ${alreadyCanonicalCount}`,
      `- Invalid metadata rows: ${invalidMetadataCount}`,
      `- Unmapped rows: ${Array.from(unknownNameCounts.values()).reduce((a, b) => a + b, 0)}`,
      options.limit ? `- Limit: ${options.limit}` : null,
      options.wallet ? `- Wallet filter: ${options.wallet}` : null,
      options.playerId ? `- Player filter: ${options.playerId}` : null,
      options.dryRun ? '- Mode: DRY RUN' : '- Mode: WRITE',
    ]
      .filter(Boolean)
      .join('\n');

    console.log(summary);

    if (unknownNameCounts.size > 0) {
      const topUnknown = Array.from(unknownNameCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      console.log('\nTop unmapped metadata names:');
      for (const [name, count] of topUnknown) {
        console.log(`- ${name}: ${count}`);
      }
    }

    if (plans.length > 0) {
      const sample = plans.slice(0, options.sampleSize).map((plan) => plan.sample);
      console.log('\nSample normalized rows:');
      console.log(JSON.stringify(sample, null, 2));
    }

    if (options.dryRun) {
      return;
    }

    if (plans.length === 0) {
      console.log('No updates required.');
      return;
    }

    await client.query('BEGIN');
    try {
      for (const plan of plans) {
        await client.query(
          `
            update player_inventory_events
               set metadata = $2::jsonb
             where id = $1::uuid
          `,
          [plan.id, JSON.stringify(plan.nextMetadata)]
        );
      }
      await client.query('COMMIT');
      console.log(`Updated ${plans.length} rows.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

void main().catch((error) => {
  console.error('Normalization failed:', error);
  process.exit(1);
});
