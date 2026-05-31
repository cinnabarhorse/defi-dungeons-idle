const { config: dotenvConfig } = require('dotenv');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED =
  process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '0';
process.env.PGSSLMODE = process.env.PGSSLMODE ?? 'no-verify';

let Pool;
try {
  ({ Pool } = require('pg'));
} catch (error) {
  const serverPgPath = path.resolve(__dirname, '..', 'apps/server/node_modules/pg');
  ({ Pool } = require(serverPgPath));
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

function loadEnvironment() {
  const rootDir = path.resolve(__dirname, '..');
  const serverDir = path.resolve(rootDir, 'apps/server');
  const envPaths = [
    path.join(serverDir, '.env.local'),
    path.join(serverDir, '.env'),
    path.join(rootDir, '.env.local'),
    path.join(rootDir, '.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      dotenvConfig({ path: envPath });
    }
  }
}

function resolveConnectionString() {
  const direct = process.env.SUPABASE_DB_URL?.trim();
  const fallback = process.env.DATABASE_URL?.trim();
  const nonPooling = process.env.SUPABASE_DB_URL_NON_POOLING?.trim();

  const connectionString = nonPooling || direct || fallback;
  if (!connectionString) {
    throw new Error(
      'Missing SUPABASE_DB_URL (or SUPABASE_DB_URL_NON_POOLING / DATABASE_URL) for migrations.'
    );
  }
  return connectionString;
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    create table if not exists schema_migrations (
      id serial primary key,
      name text unique not null,
      run_on timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('select name from schema_migrations order by name asc');
  return new Set(result.rows.map((row) => row.name));
}

async function listMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function applyMigration(pool, name, sql) {
  const client = await pool.connect();
  
  // Check if this migration contains ALTER TYPE commands
  // These cannot run inside a transaction
  const isEnumMigration = /alter\s+type.*add\s+value/i.test(sql);
  
  try {
    if (isEnumMigration) {
      // Run enum migrations outside transaction
      console.log(`⚠️ Running enum migration ${name} outside transaction`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      console.log(`✅ Applied migration ${name}`);
    } else {
      // Normal migrations run in transaction
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`✅ Applied migration ${name}`);
    }
  } catch (error) {
    if (!isEnumMigration) {
      await client.query('ROLLBACK');
    }
    console.error(`❌ Migration ${name} failed`);
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  loadEnvironment();

  const connectionString = resolveConnectionString();
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = await listMigrationFiles();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(filePath, 'utf8');
      if (!sql.trim()) {
        console.log(`⚠️ Skipping empty migration ${file}`);
        await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        continue;
      }

      await applyMigration(pool, file, sql);
    }

    console.log('🎉 Migrations up to date');
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
