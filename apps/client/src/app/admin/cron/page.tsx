import { cookies } from 'next/headers';
import AdminCronClient from './cron-client';
import { getAppServerBaseUrl } from '../../../lib/server-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DEFAULT_JOB_NAME = 'daily_prize_distribution';

interface PrizeResult {
  date: string;
  tier: 'normal' | 'nightmare' | 'hell';
  position: number;
  accountId: string;
  username: string | null;
  finalScore: number;
  usdcAmount: number;
  ghstAmount: number;
  success: boolean;
  error?: string;
}

interface ResultJson {
  date: string;
  success: boolean;
  results: PrizeResult[];
  dryRun?: boolean;
  triggeredBy?: string;
}

interface SummaryResultJson {
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
}

interface CronExecution {
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
  resultJson: ResultJson | SummaryResultJson | null;
  createdAt: string;
}

interface CronStats {
  totalExecutions: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

interface InitialData {
  executions: CronExecution[];
  stats: CronStats | null;
  latest: CronExecution | null;
  error: string | null;
}

async function fetchInitialData(): Promise<InitialData> {
  const baseUrl = getAppServerBaseUrl();
  const cookieHeader = (await cookies()).toString();
  const headers = cookieHeader ? { cookie: cookieHeader } : undefined;

  const result: InitialData = {
    executions: [],
    stats: null,
    latest: null,
    error: null,
  };

  try {
    // Fetch executions
    const execRes = await fetch(
      `${baseUrl}/api/admin/cron/executions?limit=50&jobName=${DEFAULT_JOB_NAME}`,
      { method: 'GET', headers, cache: 'no-store' }
    );

    if (execRes.status === 401) {
      result.error = 'Unauthorized. Sign in with an admin wallet.';
      return result;
    }

    if (execRes.status === 403) {
      result.error = 'Forbidden. Wallet not on admin allowlist.';
      return result;
    }

    if (execRes.ok) {
      const execPayload = await execRes.json();
      result.executions = execPayload.executions ?? [];
    }

    // Fetch stats
    const statsRes = await fetch(
      `${baseUrl}/api/admin/cron/stats?jobName=${DEFAULT_JOB_NAME}`,
      {
      method: 'GET',
      headers,
      cache: 'no-store',
      }
    );

    if (statsRes.ok) {
      const statsPayload = await statsRes.json();
      result.stats = statsPayload.stats ?? null;
      result.latest = statsPayload.latest ?? null;
    }
  } catch {
    result.error = 'Failed to load cron data.';
  }

  return result;
}

export default async function AdminCronPage() {
  const data = await fetchInitialData();

  return (
    <main className="min-h-screen-safe bg-slate-950 text-slate-100 font-mono p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Admin · Cron Jobs
          </h1>
          <p className="text-sm text-slate-400">
            Review cron executions and recent outcomes
          </p>
        </div>
        <AdminCronClient
          initialExecutions={data.executions}
          initialStats={data.stats}
          initialLatest={data.latest}
          initialError={data.error}
          initialJobName={DEFAULT_JOB_NAME}
        />
      </div>
    </main>
  );
}

