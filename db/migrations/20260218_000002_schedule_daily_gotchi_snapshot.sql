-- Schedule Daily Gotchi Snapshot Edge Function
-- Runs at UTC 00:00 daily and captures a snapshot block for ownership gating.
--
-- Prerequisites:
-- 1. pg_cron extension must be enabled
-- 2. pg_net extension must be enabled
-- 3. CRON_SECRET must be available to the edge function environment
-- 4. GAME_SERVER_URL must be available to the edge function environment

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedule existing job if it exists (idempotent)
select cron.unschedule('daily-gotchi-snapshot') where exists (
  select 1 from cron.job where jobname = 'daily-gotchi-snapshot'
);

-- Schedule at 00:00 UTC daily
select cron.schedule(
  'daily-gotchi-snapshot',
  '0 0 * * *',
  $body$
select net.http_post(
  url := 'https://bnshvshhmddyedmxoqtg.supabase.co/functions/v1/daily-gotchi-snapshot',
  headers := jsonb_build_object(
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object(),
  timeout_milliseconds := 30000
) as request_id;
$body$
);
