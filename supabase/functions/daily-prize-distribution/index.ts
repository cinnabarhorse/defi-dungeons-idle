declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (
    handler: (req: Request) => Response | Promise<Response>
  ) => void;
};

/**
 * Daily Prize Distribution Edge Function
 *
 * Runs via Supabase Scheduled Edge Functions (cron) at ~UTC 00:20 daily.
 * Triggers the game server to distribute prizes for the previous day's
 * daily quest competition.
 *
 * Required environment variables:
 * - CRON_SECRET: Shared secret for authenticating with the game server
 * - GAME_SERVER_URL: Base URL of the game server (e.g., https://play.gotchiverse.io)
 * - DISCORD_WEBHOOK_URL: Discord webhook for notifications
 *
 * Schedule: 20 0 * * * (00:20 UTC daily)
 */

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

interface DistributionResult {
  date: string;
  success: boolean;
  tiersProcessed: number;
  prizesDistributed: number;
  prizesSkipped: number;
  prizesFailed: number;
  totalUsdcDistributed: number;
  totalGhstDistributed: number;
  errors: string[];
}

interface ServerResponse {
  ok: boolean;
  executionId?: string;
  result?: DistributionResult;
  error?: string;
}

interface SettlementResult {
  targetDate: string;
  settled: number;
  remainingUnsettled: number;
  success: boolean;
  errors: string[];
}

interface SettlementResponse {
  ok: boolean;
  executionId?: string;
  result?: SettlementResult;
  error?: string;
}

interface DistributionRequest {
  date?: string;
  dryRun?: boolean;
}

async function sendDiscordNotification(webhookUrl: string, content: string) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `Discord webhook failed: ${res.status} ${res.statusText} ${text}`
    );
    // Don't throw - notification failure shouldn't fail the job
  }
}

function formatDistributionMessage(
  result: DistributionResult,
  executionId?: string
): string {
  const timestamp = new Date().toISOString();
  const status = result.success ? '✅ SUCCESS' : '❌ FAILED';

  const lines = [
    `**Daily Quest Prize Distribution** ${status}`,
    `📅 Competition Date: ${result.date}`,
    `⏰ Executed: ${timestamp}`,
    '',
    `📊 **Summary**`,
    `• Tiers Processed: ${result.tiersProcessed}`,
    `• Prizes Distributed: ${result.prizesDistributed}`,
    `• Prizes Skipped: ${result.prizesSkipped}`,
    `• Prizes Failed: ${result.prizesFailed}`,
    '',
    `💰 **Totals**`,
    `• USDC: $${result.totalUsdcDistributed.toFixed(2)}`,
    `• GHST: ${result.totalGhstDistributed.toFixed(2)} GHST`,
  ];

  if (result.errors.length > 0) {
    lines.push('', `⚠️ **Errors (${result.errors.length})**`);
    // Limit to first 5 errors to avoid message being too long
    const errorsToShow = result.errors.slice(0, 5);
    errorsToShow.forEach((err) => lines.push(`• ${err}`));
    if (result.errors.length > 5) {
      lines.push(`• ... and ${result.errors.length - 5} more`);
    }
  }

  if (executionId) {
    lines.push('', `🔗 Execution ID: \`${executionId}\``);
  }

  return lines.join('\n');
}

async function runDistribution(
  input?: DistributionRequest
): Promise<{
  success: boolean;
  message: string;
}> {
  const cronSecret = getEnv('CRON_SECRET');
  const serverUrl = getEnv('GAME_SERVER_URL');
  const discordWebhookUrl = getEnv('DISCORD_WEBHOOK_URL');
  const dryRun = input?.dryRun === true;

  const settlementEndpoint = `${serverUrl}/api/internal/settle-competition-trades`;
  const endpoint = `${serverUrl}/api/internal/distribute-daily-prizes`;

  console.log(`Calling trade settlement endpoint: ${settlementEndpoint}`);

  const settlementResponse = await fetch(settlementEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      date: input?.date,
    }),
  });

  const settlementText = await settlementResponse.text();
  let settlementData: SettlementResponse | null = null;
  try {
    settlementData = settlementText
      ? (JSON.parse(settlementText) as SettlementResponse)
      : null;
  } catch {
    settlementData = null;
  }

  if (!settlementResponse.ok || !settlementData?.ok) {
    const contentType = settlementResponse.headers.get('content-type') ?? 'unknown';
    const snippet = settlementText.slice(0, 300);
    const errorMessage = settlementData?.error
      ? settlementData.error
      : `HTTP ${settlementResponse.status} (${contentType}) ${snippet}`;
    const failureMessage = [
      `**Daily Quest Trade Settlement** ❌ FAILED`,
      `⏰ Time: ${new Date().toISOString()}`,
      `❌ Error: ${errorMessage}`,
      settlementData?.executionId ? `🔗 Execution ID: \`${settlementData.executionId}\`` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!dryRun) {
      await sendDiscordNotification(discordWebhookUrl, failureMessage);
    }

    return { success: false, message: errorMessage };
  }

  if ((settlementData.result?.remainingUnsettled ?? 0) > 0) {
    const errorMessage = `Settlement incomplete: ${settlementData.result?.remainingUnsettled ?? 0} due runs remain`;
    const failureMessage = [
      `**Daily Quest Trade Settlement** ❌ INCOMPLETE`,
      `⏰ Time: ${new Date().toISOString()}`,
      `❌ Error: ${errorMessage}`,
      settlementData.executionId ? `🔗 Execution ID: \`${settlementData.executionId}\`` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!dryRun) {
      await sendDiscordNotification(discordWebhookUrl, failureMessage);
    }

    return { success: false, message: errorMessage };
  }

  console.log(`Calling prize distribution endpoint: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      date: input?.date,
      dryRun,
    }), // No specific date = yesterday
  });

  const responseText = await response.text();
  let data: ServerResponse | null = null;
  try {
    data = responseText ? (JSON.parse(responseText) as ServerResponse) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.ok) {
    const contentType = response.headers.get('content-type') ?? 'unknown';
    const snippet = responseText.slice(0, 300);
    const errorMessage = data?.error
      ? data.error
      : `HTTP ${response.status} (${contentType}) ${snippet}`;
    const failureMessage = [
      `**Daily Quest Prize Distribution** ❌ FAILED`,
      `⏰ Time: ${new Date().toISOString()}`,
      `❌ Error: ${errorMessage}`,
      data?.executionId ? `🔗 Execution ID: \`${data.executionId}\`` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (!dryRun) {
      await sendDiscordNotification(discordWebhookUrl, failureMessage);
    }

    return { success: false, message: errorMessage };
  }

  // Success - send notification
  if (data.result && !dryRun) {
    const message = formatDistributionMessage(data.result, data.executionId);
    await sendDiscordNotification(discordWebhookUrl, message);
  }

  // Also trigger the daily summary (runs, DAU, highest score)
  if (!dryRun) {
    await runDailySummary(serverUrl, cronSecret);
  }

  return {
    success: true,
    message: dryRun
      ? `Dry run simulated ${data.result?.prizesDistributed ?? 0} prizes`
      : `Distributed ${data.result?.prizesDistributed ?? 0} prizes`,
  };
}

/**
 * Trigger the daily summary Discord notification.
 * This sends a summary of runs completed, DAU, and highest score.
 * Failures are logged but don't fail the main job.
 */
async function runDailySummary(
  serverUrl: string,
  cronSecret: string
): Promise<void> {
  const endpoint = `${serverUrl}/api/internal/daily-summary`;

  console.log(`Calling daily summary endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`Daily summary failed: ${response.status} ${text}`);
    } else {
      console.log('Daily summary sent successfully');
    }
  } catch (err) {
    console.error('Daily summary error:', err);
    // Don't throw - summary failure shouldn't fail the main job
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let payload: DistributionRequest = {};

  if (req.method !== 'GET') {
    try {
      payload = (await req.json()) as DistributionRequest;
    } catch {
      payload = {};
    }
  }

  const dateParam = url.searchParams.get('date') ?? undefined;
  const dryRunParam = url.searchParams.get('dryRun');
  const dryRun =
    payload.dryRun === true ||
    dryRunParam === '1' ||
    dryRunParam === 'true';

  try {
    const result = await runDistribution({
      date: payload.date ?? dateParam,
      dryRun,
    });
    return new Response(
      JSON.stringify({ ok: result.success, message: result.message }),
      {
        status: result.success ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Prize distribution failed:', message);

    // Try to send Discord notification about the failure
    try {
      const discordWebhookUrl = Deno.env.get('DISCORD_WEBHOOK_URL');
      if (discordWebhookUrl) {
        await sendDiscordNotification(
          discordWebhookUrl,
          `**Daily Quest Prize Distribution** ❌ CRITICAL FAILURE\n⏰ Time: ${new Date().toISOString()}\n❌ Error: ${message}`
        );
      }
    } catch {
      // Ignore notification errors
    }

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
