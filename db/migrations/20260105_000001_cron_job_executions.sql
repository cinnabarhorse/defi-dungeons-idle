-- Cron Job Execution Logs
-- Tracks all scheduled job executions for monitoring and debugging

create table if not exists cron_job_executions (
  id uuid primary key default gen_random_uuid(),
  
  -- Job identification
  job_name text not null,                    -- e.g., 'daily_prize_distribution'
  target_date date,                          -- For date-specific jobs like prize distribution
  
  -- Timing
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,                       -- Calculated on completion
  
  -- Status
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  
  -- Results summary (for prize distribution)
  prizes_distributed integer default 0,
  prizes_skipped integer default 0,
  prizes_failed integer default 0,
  total_usdc numeric(12,6) default 0,
  total_ghst numeric(12,6) default 0,
  tiers_processed integer default 0,
  
  -- Error tracking
  error_message text,
  errors jsonb,                              -- Array of error messages
  
  -- Full result JSON for debugging
  result_json jsonb,
  
  -- Tracking
  created_at timestamptz not null default now()
);

-- Indexes for querying execution history
create index if not exists idx_cron_job_executions_job_name_started
  on cron_job_executions (job_name, started_at desc);

create index if not exists idx_cron_job_executions_status
  on cron_job_executions (status) where status = 'running';

create index if not exists idx_cron_job_executions_target_date
  on cron_job_executions (target_date desc) where target_date is not null;


