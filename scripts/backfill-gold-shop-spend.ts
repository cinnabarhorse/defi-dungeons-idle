import fs from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { getPgPool } from '../apps/server/src/lib/db/client';
import { PORTAL_MAGE_SHOP } from '../apps/server/src/data/npc-shops/portalmage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BackfillOptions = {
  fromIso: string;
  toIso: string;
  dryRun: boolean;
  wallet: string | null;
  playerId: string | null;
  windowMinutes: number;
  limit: number | null;
};

type CandidateRow = {
  audit_id: string;
  player_id: string;
  item_name: string;
  delta: number;
  price: number;
  created_at: string;
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
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function normalizePlayerId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  return trimmed.length ? trimmed : null;
}

function parseDateInput(value: string, isEnd: boolean): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(value)) {
    return isEnd
      ? `${value}T23:59:59.999Z`
      : `${value}T00:00:00.000Z`;
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
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function buildShopPotionPriceMap() {
  const priceMap = new Map<string, number>();
  for (const item of PORTAL_MAGE_SHOP) {
    const currencyName = String(item.currency?.name ?? '').toLowerCase();
    if (currencyName !== 'gold') {
      continue;
    }
    const itemType = String(
      item.grant?.type ?? item.grant?.itemType ?? ''
    ).toLowerCase();
    if (itemType !== 'potion') {
      continue;
    }
    const name = String(item.grant?.name ?? '').trim();
    if (!name) {
      continue;
    }
    priceMap.set(name.toLowerCase(), Number(item.price) || 0);
  }
  return priceMap;
}

function parseArgs(): BackfillOptions {
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
        '  pnpm --filter @gotchiverse/server exec tsx ../../scripts/backfill-gold-shop-spend.ts [options]',
        '',
        'Options:',
        '  --from YYYY-MM-DD or ISO (default: 30 days ago)',
        '  --to YYYY-MM-DD or ISO (default: now)',
        '  --wallet 0x... (optional)',
        '  --player-id <uuid> (optional)',
        '  --window-minutes <n> (default: 5)',
        '  --limit <n> (optional)',
        '  --dry-run',
        '',
        'Notes:',
        '  - Uses potion audit entries without matching potion inventory events.',
        '  - Intended to backfill shop potion purchases (health/mana).',
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

  return {
    fromIso,
    toIso,
    dryRun: args.includes('--dry-run'),
    wallet: normalizeWallet(getValue('--wallet')),
    playerId: normalizePlayerId(getValue('--player-id')),
    windowMinutes: parseNumber(getValue('--window-minutes'), 5),
    limit: (() => {
      const raw = getValue('--limit');
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return null;
      return Math.floor(n);
    })(),
  };
}

async function main() {
  loadEnvCascade();
  const options = parseArgs();
  const priceMap = buildShopPotionPriceMap();
  const potionNames = Array.from(priceMap.keys());
  const potionPrices = potionNames.map((name) => priceMap.get(name) ?? 0);

  if (potionNames.length === 0) {
    console.error('No shop potion prices found. Aborting.');
    process.exit(1);
  }

  const pool = getPgPool();
  const client = await pool.connect();

  const limitClause = options.limit ? `limit ${options.limit}` : '';
  const windowMinutes = Math.max(1, Math.floor(options.windowMinutes));

  const selectionSql = `
    with price_map as (
      select * from unnest($3::text[], $4::int[]) as t(name, price)
    ),
    candidate as (
      select
        pa.id as audit_id,
        pa.player_id,
        pa.item_name,
        pa.action,
        pa.previous_quantity,
        pa.new_quantity,
        pa.created_at,
        pm.price,
        case
          when pa.action = 'insert' then coalesce(pa.new_quantity, 0)
          when pa.action = 'update' then coalesce(pa.new_quantity, 0) - coalesce(pa.previous_quantity, 0)
          else 0
        end as delta
      from player_inventory_potion_audit pa
      join price_map pm on lower(pa.item_name) = pm.name
      join players p on p.id = pa.player_id
      where pa.created_at >= $1::timestamptz
        and pa.created_at <= $2::timestamptz
        and ($5::uuid is null or pa.player_id = $5::uuid)
        and ($6::text is null or lower(p.wallet_address) = $6::text)
    ),
    filtered as (
      select *
      from candidate
      where delta > 0
        and price > 0
    ),
    unmatched as (
      select f.*
      from filtered f
      where not exists (
        select 1
        from player_inventory_events e
        where e.player_id = f.player_id
          and lower(trim(e.item_type)) = 'potion'
          and lower(trim(e.item_name)) = lower(trim(f.item_name))
          and e.delta = f.delta::int
          and e.created_at between f.created_at - ($7::int || ' minutes')::interval
                          and f.created_at + ($7::int || ' minutes')::interval
      )
        and not exists (
          select 1
          from player_inventory_events e
          where e.metadata->>'shopPotionAuditId' = f.audit_id::text
        )
      order by f.created_at asc
      ${limitClause}
    )
    select
      audit_id,
      player_id,
      item_name,
      delta::int as delta,
      price::int as price,
      created_at
    from unmatched;
  `;

  try {
    const candidates = await client.query<CandidateRow>(selectionSql, [
      options.fromIso,
      options.toIso,
      potionNames,
      potionPrices,
      options.playerId,
      options.wallet,
      windowMinutes,
    ]);

    if (candidates.rowCount === 0) {
      console.log('No missing shop purchases found for backfill.');
      return;
    }

    const totalPotions = candidates.rows.reduce(
      (sum, row) => sum + row.delta,
      0
    );
    const totalGold = candidates.rows.reduce(
      (sum, row) => sum + row.delta * row.price,
      0
    );
    const players = new Set(candidates.rows.map((row) => row.player_id));

    console.log(
      [
        'Backfill summary:',
        `- Range: ${options.fromIso} → ${options.toIso}`,
        `- Candidates: ${candidates.rowCount}`,
        `- Players: ${players.size}`,
        `- Potions: ${totalPotions}`,
        `- Gold spend: ${totalGold}`,
        options.limit ? `- Limit: ${options.limit}` : null,
        options.wallet ? `- Wallet filter: ${options.wallet}` : null,
        options.playerId ? `- Player filter: ${options.playerId}` : null,
        options.dryRun ? '- Mode: DRY RUN' : '- Mode: WRITE',
      ]
        .filter(Boolean)
        .join('\n')
    );

    if (options.dryRun) {
      return;
    }

    await client.query('BEGIN');

    const insertSql = `
      with price_map as (
        select * from unnest($3::text[], $4::int[]) as t(name, price)
      ),
      candidate as (
        select
          pa.id as audit_id,
          pa.player_id,
          pa.item_name,
          pa.action,
          pa.previous_quantity,
          pa.new_quantity,
          pa.created_at,
          pm.price,
          case
            when pa.action = 'insert' then coalesce(pa.new_quantity, 0)
            when pa.action = 'update' then coalesce(pa.new_quantity, 0) - coalesce(pa.previous_quantity, 0)
            else 0
          end as delta
        from player_inventory_potion_audit pa
        join price_map pm on lower(pa.item_name) = pm.name
        join players p on p.id = pa.player_id
        where pa.created_at >= $1::timestamptz
          and pa.created_at <= $2::timestamptz
          and ($5::uuid is null or pa.player_id = $5::uuid)
          and ($6::text is null or lower(p.wallet_address) = $6::text)
      ),
      filtered as (
        select *
        from candidate
        where delta > 0
          and price > 0
      ),
      unmatched as (
        select f.*
        from filtered f
        where not exists (
          select 1
          from player_inventory_events e
          where e.player_id = f.player_id
            and lower(trim(e.item_type)) = 'potion'
            and lower(trim(e.item_name)) = lower(trim(f.item_name))
            and e.delta = f.delta::int
            and e.created_at between f.created_at - ($7::int || ' minutes')::interval
                            and f.created_at + ($7::int || ' minutes')::interval
        )
          and not exists (
            select 1
            from player_inventory_events e
            where e.metadata->>'shopPotionAuditId' = f.audit_id::text
          )
        order by f.created_at asc
        ${limitClause}
      )
      insert into player_inventory_events (
        player_id,
        item_type,
        item_name,
        delta,
        reason,
        metadata,
        created_at
      )
      select
        player_id,
        'coin',
        'Gold',
        -(delta::int * price::int),
        'shop_purchase_backfill',
        jsonb_build_object(
          'backfill', true,
          'source', 'shop_potion_audit',
          'shopPotionAuditId', audit_id,
          'potionName', item_name,
          'potionDelta', delta::int,
          'pricePerPotion', price::int
        ),
        created_at
      from unmatched
      returning id;
    `;

    const inserted = await client.query(insertSql, [
      options.fromIso,
      options.toIso,
      potionNames,
      potionPrices,
      options.playerId,
      options.wallet,
      windowMinutes,
    ]);

    await client.query('COMMIT');

    console.log(`Inserted ${inserted.rowCount} gold spend events.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

void main();
