// Scheduled weekly top-up of USDC and GHST loot pools
// Runs via Supabase Scheduled Edge Functions (cron)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LootCatalogRow {
  id: string;
  loot_type: string;
  chain_id: number;
  token_address: string | null;
  token_id: number | null;
  decimals: number | null;
  name: string | null;
  remaining: number | null;
  last_claimed: string | null;
  reloaded_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

async function sendDiscordNotification(webhookUrl: string, content: string) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Discord webhook failed: ${res.status} ${res.statusText} ${text}`
    );
  }
}

async function runTopUp() {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const discordWebhookUrl = getEnv('DISCORD_WEBHOOK_URL');

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Amounts to add (token units, not base units)
  const USDC_AMOUNT = 1000; // 1000 USDC
  const GHST_AMOUNT = 1000; // 1000 GHST

  const usdcName = 'USDC Airdrop';
  const ghstName = 'GHST Airdrop';

  // Increment USDC
  const { data: usdcRows, error: usdcErr } = await supabase.rpc(
    'increment_loot_remaining_by_name',
    { loot_name: usdcName, amount: USDC_AMOUNT }
  );
  if (usdcErr) throw usdcErr;
  const usdcUpdated = (
    Array.isArray(usdcRows) ? usdcRows[0] : usdcRows
  ) as LootCatalogRow | null;

  // Increment GHST
  const { data: ghstRows, error: ghstErr } = await supabase.rpc(
    'increment_loot_remaining_by_name',
    { loot_name: ghstName, amount: GHST_AMOUNT }
  );
  if (ghstErr) throw ghstErr;
  const ghstUpdated = (
    Array.isArray(ghstRows) ? ghstRows[0] : ghstRows
  ) as LootCatalogRow | null;

  const usdcRemaining = usdcUpdated?.remaining ?? null;
  const ghstRemaining = ghstUpdated?.remaining ?? null;

  const timestamp = new Date().toISOString();
  const messageLines = [
    `Weekly rewards pool top-up complete (UTC ${timestamp}).`,
    `+${USDC_AMOUNT} USDC, +${GHST_AMOUNT} GHST added to loot pools.`,
    usdcRemaining != null
      ? `USDC remaining: ${usdcRemaining}`
      : 'USDC remaining: (unknown)',
    ghstRemaining != null
      ? `GHST remaining: ${ghstRemaining}`
      : 'GHST remaining: (unknown)',
  ];

  await sendDiscordNotification(discordWebhookUrl, messageLines.join('\n'));

  return { usdcRemaining, ghstRemaining };
}

Deno.serve(async () => {
  try {
    const result = await runTopUp();
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
