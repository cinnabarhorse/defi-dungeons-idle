import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Pool, type PoolClient } from 'pg';

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
if (!process.env.PGSSLMODE) {
  process.env.PGSSLMODE = 'no-verify';
}

type DbConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey?: string;
  postgresConnectionString: string;
  poolMax?: number;
  poolIdleTimeoutMs?: number;
  poolConnectionTimeoutMs?: number;
  poolMaxUses?: number;
};

let cachedConfig: DbConfig | undefined;
let supabaseClient: SupabaseClient | undefined;
let pgPool: Pool | undefined;

function resolveConfig(): DbConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
  const postgresConnectionString =
    process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not configured.');
  }
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  if (!postgresConnectionString) {
    throw new Error('SUPABASE_DB_URL or DATABASE_URL must be configured.');
  }

  const poolMax = process.env.DATABASE_POOL_MAX
    ? Number(process.env.DATABASE_POOL_MAX)
    : undefined;
  const poolIdleTimeoutMs = process.env.DATABASE_POOL_IDLE_MS
    ? Number(process.env.DATABASE_POOL_IDLE_MS)
    : undefined;
  const poolConnectionTimeoutMs = process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS
    ? Number(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS)
    : undefined;
  const poolMaxUses = process.env.DATABASE_POOL_MAX_USES
    ? Number(process.env.DATABASE_POOL_MAX_USES)
    : undefined;

  cachedConfig = {
    supabaseUrl,
    supabaseServiceRoleKey,
    supabaseAnonKey,
    postgresConnectionString,
    poolMax: Number.isFinite(poolMax) ? poolMax : undefined,
    poolIdleTimeoutMs: Number.isFinite(poolIdleTimeoutMs)
      ? poolIdleTimeoutMs
      : undefined,
    poolConnectionTimeoutMs: Number.isFinite(poolConnectionTimeoutMs)
      ? poolConnectionTimeoutMs
      : undefined,
    poolMaxUses: Number.isFinite(poolMaxUses) ? poolMaxUses : undefined,
  };
  return cachedConfig;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseClient) {
    const { supabaseUrl, supabaseServiceRoleKey } = resolveConfig();
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
}

export function getPgPool(): Pool {
  if (!pgPool) {
    const {
      postgresConnectionString,
      poolMax,
      poolIdleTimeoutMs,
      poolConnectionTimeoutMs,
      poolMaxUses,
    } = resolveConfig();
    pgPool = new Pool({
      connectionString: postgresConnectionString,
      ssl: { rejectUnauthorized: false },
      max: poolMax,
      idleTimeoutMillis: poolIdleTimeoutMs,
      connectionTimeoutMillis: poolConnectionTimeoutMs,
      maxUses: poolMaxUses,
    });

    // Prevent process crash on idle client errors (e.g., db restarts/pooler churn)
    pgPool.on('error', (error) => {
      const payload = {
        level: 'error',
        msg: 'pg_pool_error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      };
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(payload));
    });
  }
  return pgPool;
}

export async function runTransaction<T>(
  handler: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPgPool();

  function isTransientPgError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as any)?.code as string | undefined;
    if (!message && !code) return false;
    // Postgres/Supabase pooler transient signals
    if (
      code &&
      ['57P01', '57P02', '57P03', '08006', '08003', '08000'].includes(code)
    ) {
      return true;
    }
    const lower = message.toLowerCase();
    return (
      lower.includes('admin_shutdown') ||
      lower.includes('db_termination') ||
      lower.includes('server closed the connection') ||
      lower.includes('terminating connection due to administrator command') ||
      lower.includes('the database system is starting up') ||
      lower.includes('the database system is in recovery') ||
      lower.includes('connection terminated unexpectedly') ||
      lower.includes('connection reset by peer')
    );
  }

  let attempt = 0;
  const maxAttempts = 2; // one retry on transient failures
  // simple backoff sequence
  const backoffs = [0, 150];

  while (attempt < maxAttempts) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {}

      if (isTransientPgError(error) && attempt + 1 < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, backoffs[attempt + 1] || 100));
        attempt += 1;
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
  // Should never reach here
  throw new Error('Transaction failed after retries');
}
