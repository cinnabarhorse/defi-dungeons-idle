declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (
    handler: (req: Request) => Response | Promise<Response>
  ) => void;
};

/**
 * Daily Summary Edge Function
 *
 * Runs via Supabase Scheduled Edge Functions (cron) at UTC 00:10 daily.
 * Triggers the game server to send a Discord summary of the previous day's
 * activity (runs completed, DAU, highest score).
 *
 * Required environment variables:
 * - CRON_SECRET: Shared secret for authenticating with the game server
 * - GAME_SERVER_URL: Base URL of the game server (e.g., https://play.gotchiverse.io)
 *
 * Schedule: 10 0 * * * (00:10 UTC daily)
 */

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

interface ServerResponse {
  ok: boolean;
  executionId?: string;
  result?: {
    date: string;
    success: boolean;
    runsCompleted: number;
    dau: number;
    competitionRunsCompleted: number;
    competitionDau: number;
    highestScore: number | null;
    highestScorePlayer: string | null;
    discordSent: boolean;
    error?: string;
  };
  error?: string;
}

async function runSummary(
  input?: { date?: string }
): Promise<{
  success: boolean;
  message: string;
}> {
  const cronSecret = getEnv('CRON_SECRET');
  const serverUrl = getEnv('GAME_SERVER_URL');

  const endpoint = `${serverUrl}/api/internal/daily-summary`;

  console.log(`Calling daily summary endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        date: input?.date,
      }),
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

      console.error(`Daily summary failed: ${errorMessage}`);

      return { success: false, message: errorMessage };
    }

    const result = data.result;
    if (result) {
      console.log('Daily summary completed successfully', {
        date: result.date,
        runsCompleted: result.runsCompleted,
        dau: result.dau,
        discordSent: result.discordSent,
      });
    }

    return {
      success: true,
      message: result?.discordSent
        ? `Daily summary sent for ${result.date}`
        : `Daily summary processed for ${result?.date ?? 'unknown date'}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Daily summary error:', message);
    return { success: false, message };
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let payload: { date?: string } = {};

  if (req.method !== 'GET') {
    try {
      payload = (await req.json()) as SummaryRequest;
    } catch {
      payload = {};
    }
  }

  const dateParam = url.searchParams.get('date') ?? undefined;

  try {
    const result = await runSummary({
      date: payload.date ?? dateParam,
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
    console.error('Daily summary failed:', message);

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
