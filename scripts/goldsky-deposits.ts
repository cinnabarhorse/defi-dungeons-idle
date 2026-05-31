import { Pool } from 'pg';

function getGoldskyUrl(): string {
  const url =
    process.env.GOLDSKY_DEPOSITS_DB_URL ||
    process.env.GOLDSKY_POSTGRES_URL ||
    process.env.GOLDSKY_DB_URL ||
    '';
  if (!url) {
    throw new Error(
      'Set GOLDSKY_DEPOSITS_DB_URL (or GOLDSKY_POSTGRES_URL / GOLDSKY_DB_URL) to your Goldsky Hosted Postgres connection string.'
    );
  }
  return url.trim();
}

async function main(): Promise<void> {
  // Permissive SSL to work with hosted Postgres providers
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  if (!process.env.PGSSLMODE) {
    process.env.PGSSLMODE = 'no-verify';
  }
  const pool = new Pool({
    connectionString: getGoldskyUrl(),
    ssl: { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const ping = await client.query(
      `select now() as now, current_database() as db, current_user as usr`
    );
    console.log('[goldsky] connected:', ping.rows[0]);

    const sample = await client.query(
      `select * from public.deposits order by block_number desc, log_index desc limit 10`
    );
    console.log(`[goldsky] recent deposits (${sample.rowCount})`);
    console.table(sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[goldsky-deposits] failed', err);
  process.exitCode = 1;
});









