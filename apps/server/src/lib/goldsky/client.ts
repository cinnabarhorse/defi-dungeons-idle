import { Pool, type PoolClient } from 'pg';

let goldskyPool: Pool | undefined;

interface GoldskyPoolOptions {
  poolMax?: number;
  poolIdleTimeoutMs?: number;
  poolConnectionTimeoutMs?: number;
  poolMaxUses?: number;
}

function resolveGoldskyUrl(): string {
  const url =
    process.env.GOLDSKY_DEPOSITS_DB_URL ||
    process.env.GOLDSKY_POSTGRES_URL ||
    process.env.GOLDSKY_DB_URL ||
    '';
  if (!url) {
    throw new Error(
      'GOLDSKY_DEPOSITS_DB_URL (or GOLDSKY_POSTGRES_URL / GOLDSKY_DB_URL) is not configured.'
    );
  }
  return url.trim();
}

function resolvePoolOptions(): GoldskyPoolOptions {
  const poolMax = process.env.GOLDSKY_POOL_MAX
    ? Number(process.env.GOLDSKY_POOL_MAX)
    : undefined;
  const poolIdleTimeoutMs = process.env.GOLDSKY_POOL_IDLE_MS
    ? Number(process.env.GOLDSKY_POOL_IDLE_MS)
    : undefined;
  const poolConnectionTimeoutMs = process.env.GOLDSKY_POOL_CONNECT_TIMEOUT_MS
    ? Number(process.env.GOLDSKY_POOL_CONNECT_TIMEOUT_MS)
    : undefined;
  const poolMaxUses = process.env.GOLDSKY_POOL_MAX_USES
    ? Number(process.env.GOLDSKY_POOL_MAX_USES)
    : undefined;
  return {
    poolMax: Number.isFinite(poolMax) ? poolMax : undefined,
    poolIdleTimeoutMs: Number.isFinite(poolIdleTimeoutMs)
      ? poolIdleTimeoutMs
      : undefined,
    poolConnectionTimeoutMs: Number.isFinite(poolConnectionTimeoutMs)
      ? poolConnectionTimeoutMs
      : undefined,
    poolMaxUses: Number.isFinite(poolMaxUses) ? poolMaxUses : undefined,
  };
}

export function getGoldskyDepositsPool(): Pool {
  if (!goldskyPool) {
    // Prefer permissive SSL defaults for hosted Postgres providers
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }
    if (!process.env.PGSSLMODE) {
      process.env.PGSSLMODE = 'no-verify';
    }
    const connectionString = resolveGoldskyUrl();
    const { poolMax, poolIdleTimeoutMs, poolConnectionTimeoutMs, poolMaxUses } =
      resolvePoolOptions();
    goldskyPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeoutMs,
      connectionTimeoutMillis: poolConnectionTimeoutMs,
      maxUses: poolMaxUses,
    });
    goldskyPool.on('error', (error) => {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'goldsky_pg_pool_error',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        })
      );
    });
  }
  return goldskyPool;
}

export async function runGoldskyTransaction<T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getGoldskyDepositsPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}









