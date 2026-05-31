import type { PoolClient, QueryResult } from 'pg';
import { getPgPool } from '../client';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CronJobExecutionRow {
  id: string;
  job_name: string;
  target_date: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: 'running' | 'success' | 'failed';
  prizes_distributed: number;
  prizes_skipped: number;
  prizes_failed: number;
  total_usdc: string;
  total_ghst: string;
  tiers_processed: number;
  error_message: string | null;
  errors: string[] | null;
  result_json: unknown;
  created_at: string;
}

export interface CronJobExecutionRecord {
  id: string;
  jobName: string;
  targetDate: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: 'running' | 'success' | 'failed';
  prizesDistributed: number;
  prizesSkipped: number;
  prizesFailed: number;
  totalUsdc: number;
  totalGhst: number;
  tiersProcessed: number;
  errorMessage: string | null;
  errors: string[] | null;
  resultJson: unknown;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function mapRow(row: CronJobExecutionRow): CronJobExecutionRecord {
  return {
    id: row.id,
    jobName: row.job_name,
    targetDate: row.target_date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    status: row.status,
    prizesDistributed: row.prizes_distributed ?? 0,
    prizesSkipped: row.prizes_skipped ?? 0,
    prizesFailed: row.prizes_failed ?? 0,
    totalUsdc: parseFloat(row.total_usdc) || 0,
    totalGhst: parseFloat(row.total_ghst) || 0,
    tiersProcessed: row.tiers_processed ?? 0,
    errorMessage: row.error_message,
    errors: row.errors,
    resultJson: row.result_json,
    createdAt: row.created_at,
  };
}

function getPool(client?: PoolClient) {
  return client ?? getPgPool();
}

// ────────────────────────────────────────────────────────────────────────────
// Create execution record (called when job starts)
// ────────────────────────────────────────────────────────────────────────────

export interface CreateExecutionInput {
  jobName: string;
  targetDate?: string;
  client?: PoolClient;
}

export async function createExecution(
  input: CreateExecutionInput
): Promise<CronJobExecutionRecord> {
  const pool = getPool(input.client);
  const query = `
    insert into cron_job_executions (job_name, target_date, status)
    values ($1, $2, 'running')
    returning *
  `;
  const result: QueryResult<CronJobExecutionRow> = await pool.query(query, [
    input.jobName,
    input.targetDate ?? null,
  ]);
  return mapRow(result.rows[0]);
}

// ────────────────────────────────────────────────────────────────────────────
// Complete execution (called when job finishes)
// ────────────────────────────────────────────────────────────────────────────

export interface CompleteExecutionInput {
  id: string;
  success: boolean;
  prizesDistributed?: number;
  prizesSkipped?: number;
  prizesFailed?: number;
  totalUsdc?: number;
  totalGhst?: number;
  tiersProcessed?: number;
  errorMessage?: string;
  errors?: string[];
  resultJson?: unknown;
  client?: PoolClient;
}

export async function completeExecution(
  input: CompleteExecutionInput
): Promise<CronJobExecutionRecord | null> {
  const pool = getPool(input.client);
  const query = `
    update cron_job_executions
    set
      finished_at = now(),
      duration_ms = extract(epoch from (now() - started_at)) * 1000,
      status = $2,
      prizes_distributed = coalesce($3, prizes_distributed),
      prizes_skipped = coalesce($4, prizes_skipped),
      prizes_failed = coalesce($5, prizes_failed),
      total_usdc = coalesce($6, total_usdc),
      total_ghst = coalesce($7, total_ghst),
      tiers_processed = coalesce($8, tiers_processed),
      error_message = $9,
      errors = $10::jsonb,
      result_json = $11::jsonb
    where id = $1
    returning *
  `;
  const result: QueryResult<CronJobExecutionRow> = await pool.query(query, [
    input.id,
    input.success ? 'success' : 'failed',
    input.prizesDistributed ?? null,
    input.prizesSkipped ?? null,
    input.prizesFailed ?? null,
    input.totalUsdc ?? null,
    input.totalGhst ?? null,
    input.tiersProcessed ?? null,
    input.errorMessage ?? null,
    input.errors ? JSON.stringify(input.errors) : null,
    input.resultJson ? JSON.stringify(input.resultJson) : null,
  ]);
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Query executions
// ────────────────────────────────────────────────────────────────────────────

export interface ListExecutionsInput {
  jobName?: string;
  status?: 'running' | 'success' | 'failed';
  limit?: number;
  offset?: number;
}

export async function listExecutions(
  input: ListExecutionsInput = {}
): Promise<CronJobExecutionRecord[]> {
  const pool = getPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input.jobName) {
    conditions.push(`job_name = $${params.length + 1}`);
    params.push(input.jobName);
  }

  if (input.status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(input.status);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const query = `
    select *
    from cron_job_executions
    ${where}
    order by started_at desc
    limit ${limit}
    offset ${offset}
  `;

  const result: QueryResult<CronJobExecutionRow> = await pool.query(query, params);
  return result.rows.map(mapRow);
}

export async function getExecutionById(
  id: string
): Promise<CronJobExecutionRecord | null> {
  const pool = getPool();
  const result: QueryResult<CronJobExecutionRow> = await pool.query(
    `select * from cron_job_executions where id = $1 limit 1`,
    [id]
  );
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

export async function getLatestExecution(
  jobName: string
): Promise<CronJobExecutionRecord | null> {
  const pool = getPool();
  const result: QueryResult<CronJobExecutionRow> = await pool.query(
    `select * from cron_job_executions where job_name = $1 order by started_at desc limit 1`,
    [jobName]
  );
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Stats
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutionStats {
  totalExecutions: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export async function getExecutionStats(
  jobName: string
): Promise<ExecutionStats> {
  const pool = getPool();
  const result = await pool.query<{
    total_executions: string;
    success_count: string;
    failed_count: string;
    running_count: string;
    last_success_at: string | null;
    last_failure_at: string | null;
  }>(
    `
    select
      count(*)::int as total_executions,
      count(*) filter (where status = 'success')::int as success_count,
      count(*) filter (where status = 'failed')::int as failed_count,
      count(*) filter (where status = 'running')::int as running_count,
      max(finished_at) filter (where status = 'success') as last_success_at,
      max(finished_at) filter (where status = 'failed') as last_failure_at
    from cron_job_executions
    where job_name = $1
    `,
    [jobName]
  );

  const row = result.rows[0];
  return {
    totalExecutions: parseInt(row.total_executions) || 0,
    successCount: parseInt(row.success_count) || 0,
    failedCount: parseInt(row.failed_count) || 0,
    runningCount: parseInt(row.running_count) || 0,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
  };
}


