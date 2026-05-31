declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (
    handler: (req: Request) => Response | Promise<Response>
  ) => void;
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

interface SnapshotRequest {
  date?: string;
}

interface SnapshotResult {
  date: string;
  blockNumber: number;
  baseHeadBlock: number;
  subgraphHeadBlock: number;
}

interface ServerResponse {
  ok: boolean;
  executionId?: string;
  result?: SnapshotResult;
  error?: string;
}

async function runSnapshot(input?: SnapshotRequest): Promise<{
  success: boolean;
  message: string;
}> {
  const cronSecret = getEnv('CRON_SECRET');
  const serverUrl = getEnv('GAME_SERVER_URL');

  const endpoint = `${serverUrl}/api/internal/daily-gotchi-snapshot`;

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

    return { success: false, message: errorMessage };
  }

  const result = data.result;
  return {
    success: true,
    message: result
      ? `Captured block ${result.blockNumber} for ${result.date}`
      : 'Snapshot captured',
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let payload: SnapshotRequest = {};

  if (req.method !== 'GET') {
    try {
      payload = (await req.json()) as SnapshotRequest;
    } catch {
      payload = {};
    }
  }

  const dateParam = url.searchParams.get('date') ?? undefined;

  try {
    const result = await runSnapshot({
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
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
