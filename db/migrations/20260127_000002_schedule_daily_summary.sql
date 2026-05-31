-- Schedule Daily Summary Edge Function
-- Runs at UTC 00:10 daily to send Discord summary of previous day's activity
--
-- Prerequisites:
-- 1. pg_cron extension must be enabled
-- 2. pg_net extension must be enabled  
-- 3. CRON_SECRET must be stored in Supabase Vault (see instructions below)
-- 4. GAME_SERVER_URL environment variable must be set in Edge Function
--
-- To store CRON_SECRET in Vault:
-- 1. Go to Supabase Dashboard → Settings → Vault
-- 2. Create a new secret named 'cron_secret'
-- 3. Set the value to your CRON_SECRET
--
-- To get the secret value in SQL:
-- SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';

-- Enable required extensions if not already enabled
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Unschedule existing job if it exists (idempotent)
select cron.unschedule('daily-summary') where exists (
  select 1 from cron.job where jobname = 'daily-summary'
);

-- Schedule the daily summary function
-- Runs at 00:10 UTC daily (10 minutes after midnight)
-- Using $body$ tag to avoid conflicts with dashboard dollar-quoting
select cron.schedule(
  'daily-summary',
  '10 0 * * *', -- 00:10 UTC daily
  $body$
select net.http_post(
  url := 'https://bnshvshhmddyedmxoqtg.supabase.co/functions/v1/daily-summary',
  headers := jsonb_build_object(
    'Content-Type', 'application/json'
  ),
  body := jsonb_build_object(),
  timeout_milliseconds := 30000
) as request_id;
$body$
);

-- Note: The CRON_SECRET authentication is handled by the Edge Function itself
-- which reads it from environment variables. The Edge Function then uses it
-- to authenticate with the game server.
