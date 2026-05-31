const { config: dotenvConfig } = require('dotenv');
const path = require('path');

function loadEnvironment() {
  const rootDir = path.resolve(__dirname, '..', '..');
  const serverDir = path.resolve(rootDir, 'apps/server');
  const envPaths = [
    path.join(serverDir, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env'),
  ];
  for (const envPath of envPaths) {
    dotenvConfig({ path: envPath });
  }
}

const fs = require('fs');

function loadPg() {
  const searchPaths = [
    __dirname,
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', 'apps/server'),
  ];

  for (const base of searchPaths) {
    try {
      const resolved = require.resolve('pg', { paths: [base] });
      return require(resolved);
    } catch (error) {
      // continue searching other locations
    }
  }

  throw new Error(
    "The 'pg' package is required for seeding. Run `pnpm install` in the workspace."
  );
}

const { Pool } = loadPg();

function resolveDataPath(file) {
  return path.resolve(__dirname, '..', '..', 'data', file);
}

function createPool() {
  const connectionString =
    process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL or DATABASE_URL must be set to seed.');
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

async function seedLootCatalog(pool) {
  const lootPath = resolveDataPath('loot-catalog.json');
  if (!fs.existsSync(lootPath)) {
    console.warn('No loot catalog seed data found at', lootPath);
    return;
  }

  const payload = JSON.parse(fs.readFileSync(lootPath, 'utf8'));
  if (!Array.isArray(payload)) {
    console.warn('loot-catalog.json must export an array');
    return;
  }

  let created = 0;
  let updated = 0;

  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const name = item.name || 'Unnamed Loot';
    const lootType = item.lootType || 'virtual';
    const chainId = Number.isFinite(item.chainId) ? item.chainId : 8453;
    const tokenAddress = item.tokenAddress ?? null;
    const tokenId =
      item.tokenId == null ? null : Number.isFinite(item.tokenId) ? item.tokenId : null;
    const decimals =
      item.decimals == null
        ? null
        : Number.isFinite(item.decimals)
          ? item.decimals
          : null;
    const remaining =
      item.remaining == null
        ? null
        : Number.isFinite(item.remaining)
          ? item.remaining
          : null;
    const isActive = item.isActive === false ? false : true;
    const metadata = item.metadata ?? {};

    const existing = await pool.query(
      'select id from loot_catalog where name = $1 limit 1',
      [name]
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `insert into loot_catalog (
          loot_type,
          chain_id,
          token_address,
          token_id,
          decimals,
          name,
          remaining,
          is_active,
          metadata
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          lootType,
          chainId,
          tokenAddress,
          tokenId,
          decimals,
          name,
          remaining,
          isActive,
          metadata,
        ]
      );
      created += 1;
    } else {
      const lootId = existing.rows[0].id;
      await pool.query(
        `update loot_catalog
            set loot_type = $2,
                chain_id = $3,
                token_address = $4,
                token_id = $5,
                decimals = $6,
                name = $7,
                remaining = $8,
                is_active = $9,
                metadata = $10,
                updated_at = now()
          where id = $1`,
        [
          lootId,
          lootType,
          chainId,
          tokenAddress,
          tokenId,
          decimals,
          name,
          remaining,
          isActive,
          metadata,
        ]
      );
      updated += 1;
    }
  }

  console.log(
    `Loot catalog seed complete. Created ${created} entries, updated ${updated}.`
  );
}

async function main() {
  loadEnvironment();
  if (!process.env.PGSSLMODE) {
    process.env.PGSSLMODE = 'no-verify';
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  const pool = createPool();
  try {
    await seedLootCatalog(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
