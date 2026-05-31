'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/Dialog';
import { getAppServerBaseUrl } from '../../../lib/server-url';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

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
  allowAlreadyDistributed?: boolean;
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
  dryRun?: boolean;
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

interface AdminCronClientProps {
  initialExecutions: CronExecution[];
  initialStats: CronStats | null;
  initialLatest: CronExecution | null;
  initialError: string | null;
  initialJobName: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<CronExecution['status'], string> = {
  running: 'bg-blue-500/20 text-blue-200 animate-pulse',
  success: 'bg-emerald-500/20 text-emerald-200',
  failed: 'bg-red-500/20 text-red-200',
};

const STATUS_LABELS: Record<CronExecution['status'], string> = {
  running: '🔄 Running',
  success: '✅ Success',
  failed: '❌ Failed',
};

const JOB_OPTIONS = [
  {
    value: 'daily_prize_distribution',
    label: 'Daily Prize Distribution',
  },
  {
    value: 'daily_discord_summary',
    label: 'Daily Discord Summary',
  },
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCurrency(amount: number, symbol: string): string {
  if (amount === 0) return '-';
  return `${amount.toFixed(2)} ${symbol}`;
}

function truncateAddress(address: string): string {
  if (!address.startsWith('0x') || address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTierName(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

function getJobLabel(jobName: string): string {
  const match = JOB_OPTIONS.find((option) => option.value === jobName);
  return match?.label ?? jobName;
}

function buildCronUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function isSummaryResult(
  result: CronExecution['resultJson']
): result is SummaryResultJson {
  return Boolean(result && typeof (result as SummaryResultJson).runsCompleted === 'number');
}

function isDistributionResult(
  result: CronExecution['resultJson']
): result is ResultJson {
  return Boolean(result && Array.isArray((result as ResultJson).results));
}

function isDryRun(execution: CronExecution | null): boolean {
  if (!execution?.resultJson) return false;
  return Boolean((execution.resultJson as ResultJson | SummaryResultJson).dryRun);
}

const TIER_ORDER = ['normal', 'nightmare', 'hell'] as const;

// ────────────────────────────────────────────────────────────────────────────
// Fetcher
// ────────────────────────────────────────────────────────────────────────────

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export default function AdminCronClient({
  initialExecutions,
  initialStats,
  initialLatest,
  initialError,
  initialJobName,
}: AdminCronClientProps) {
  const baseUrl = getAppServerBaseUrl();
  const [error, setError] = useState<string | null>(initialError);
  const [jobName, setJobName] = useState(initialJobName);
  const [selectedExecution, setSelectedExecution] =
    useState<CronExecution | null>(null);
  const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);
  const [triggerDate, setTriggerDate] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [allowOverride, setAllowOverride] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [checkingDistribution, setCheckingDistribution] = useState(false);
  const [distributionExists, setDistributionExists] = useState<boolean | null>(null);
  const [checkedDate, setCheckedDate] = useState<string | null>(null);
  const isDistributionJob = jobName === 'daily_prize_distribution';
  const summaryResult =
    selectedExecution && isSummaryResult(selectedExecution.resultJson)
      ? selectedExecution.resultJson
      : null;
  const distributionResult =
    selectedExecution && isDistributionResult(selectedExecution.resultJson)
      ? selectedExecution.resultJson
      : null;
  const isExecutionDryRun = isDryRun(selectedExecution);

  const executionsUrl = useMemo(
    () =>
      buildCronUrl(baseUrl, '/api/admin/cron/executions', {
        limit: '50',
        jobName,
      }),
    [baseUrl, jobName]
  );

  const statsUrl = useMemo(
    () =>
      buildCronUrl(baseUrl, '/api/admin/cron/stats', {
        jobName,
      }),
    [baseUrl, jobName]
  );

  const executionsFallback =
    jobName === initialJobName ? { executions: initialExecutions } : undefined;
  const statsFallback =
    jobName === initialJobName
      ? { stats: initialStats as CronStats, latest: initialLatest }
      : undefined;

  // SWR for executions
  const { data: executionsData, mutate: mutateExecutions } = useSWR<{
    executions: CronExecution[];
  }>(executionsUrl, fetcher, {
    fallbackData: executionsFallback,
    refreshInterval: 30000, // Refresh every 30 seconds
  });

  // SWR for stats
  const { data: statsData, mutate: mutateStats } = useSWR<{
    stats: CronStats;
    latest: CronExecution | null;
  }>(statsUrl, fetcher, {
    fallbackData: statsFallback,
    refreshInterval: 30000,
  });

  const executions = executionsData?.executions ?? [];
  const stats = statsData?.stats;

  const handleRefresh = useCallback(() => {
    mutateExecutions();
    mutateStats();
  }, [mutateExecutions, mutateStats]);

  // Check if distribution already exists for the selected date
  const checkDistributionExists = useCallback(
    async (date: string) => {
      if (!isDistributionJob) return;
      setCheckingDistribution(true);
      try {
        const url = date
          ? `${baseUrl}/api/admin/cron/check-distribution?date=${encodeURIComponent(date)}`
          : `${baseUrl}/api/admin/cron/check-distribution`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setDistributionExists(data.alreadyDistributed);
          setCheckedDate(data.date);
        }
      } catch {
        // Ignore errors, allow user to proceed
        setDistributionExists(null);
      } finally {
        setCheckingDistribution(false);
      }
    },
    [baseUrl, isDistributionJob]
  );

  // Check distribution status when dialog opens or date changes
  useEffect(() => {
    if (triggerDialogOpen && isDistributionJob) {
      checkDistributionExists(triggerDate);
    } else {
      // Reset state when dialog closes
      setDistributionExists(null);
      setCheckedDate(null);
      setAllowOverride(false);
    }
  }, [triggerDialogOpen, triggerDate, checkDistributionExists, isDistributionJob]);

  useEffect(() => {
    setSelectedExecution(null);
    setError(null);
    setTriggerDialogOpen(false);
    setTriggerDate('');
    setDryRun(true);
    setAllowOverride(false);
    setDistributionExists(null);
    setCheckedDate(null);
  }, [jobName]);

  useEffect(() => {
    if (distributionExists && !allowOverride) {
      setDryRun(true);
    }
  }, [distributionExists, allowOverride]);

  const handleTrigger = useCallback(async () => {
    if (!isDistributionJob) return;
    setTriggering(true);
    setError(null);

    try {
      const res = await fetch(
        `${baseUrl}/api/admin/cron/trigger-distribution`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: triggerDate || undefined,
            dryRun,
            allowAlreadyDistributed: allowOverride,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to trigger distribution');
      } else {
        setTriggerDialogOpen(false);
        setTriggerDate('');
        handleRefresh();
      }
    } catch {
      setError('Failed to trigger distribution');
    } finally {
      setTriggering(false);
    }
  }, [baseUrl, triggerDate, dryRun, handleRefresh, isDistributionJob]);

  if (initialError && executions.length === 0) {
    return (
      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
        <p className="text-red-300">{initialError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              Total Runs
            </p>
            <p className="text-2xl font-bold text-white">
              {stats.totalExecutions}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
            <p className="text-xs text-emerald-400 uppercase tracking-wide">
              Successful
            </p>
            <p className="text-2xl font-bold text-emerald-200">
              {stats.successCount}
            </p>
          </div>
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
            <p className="text-xs text-red-400 uppercase tracking-wide">
              Failed
            </p>
            <p className="text-2xl font-bold text-red-200">
              {stats.failedCount}
            </p>
          </div>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
            <p className="text-xs text-blue-400 uppercase tracking-wide">
              Running
            </p>
            <p className="text-2xl font-bold text-blue-200">
              {stats.runningCount}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span className="text-xs text-slate-500 uppercase tracking-wide">Job</span>
          <select
            value={jobName}
            onChange={(event) => setJobName(event.target.value)}
            className="rounded bg-slate-800 border border-slate-600 px-2 py-1 text-sm text-white"
          >
            {JOB_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          Refresh
        </Button>
        {isDistributionJob && (
          <Button
            onClick={() => setTriggerDialogOpen(true)}
            variant="default"
            size="sm"
          >
            Trigger Distribution
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
          <p className="text-red-300">{error}</p>
        </div>
      )}

      {/* Executions Table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                Target
              </th>
              {isDistributionJob && (
                <>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                    Prizes
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                    USDC
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                    GHST
                  </th>
                </>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                Duration
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {executions.length === 0 ? (
              <tr>
                <td
                  colSpan={isDistributionJob ? 8 : 5}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No executions yet
                </td>
              </tr>
            ) : (
              executions.map((exec) => (
                <tr key={exec.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-300">
                    {formatDate(exec.startedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                        STATUS_STYLES[exec.status]
                      )}
                    >
                      {STATUS_LABELS[exec.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <span>
                      {exec.targetDate || 'yesterday'}
                    </span>
                    {isDryRun(exec) && (
                      <span className="ml-2 rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-200">
                        dry run
                      </span>
                    )}
                  </td>
                  {isDistributionJob && (
                    <>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {exec.prizesDistributed}
                        {exec.prizesFailed > 0 && (
                          <span className="text-red-400 ml-1">
                            ({exec.prizesFailed} failed)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatCurrency(exec.totalUsdc, 'USDC')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatCurrency(exec.totalGhst, 'GHST')}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right text-slate-400">
                    {formatDuration(exec.durationMs)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedExecution(exec)}
                      className="text-xs text-slate-400 hover:text-white underline"
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Execution Details Dialog */}
      <Dialog
        open={selectedExecution !== null}
        onOpenChange={(open) => !open && setSelectedExecution(null)}
      >
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Execution Details</DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedExecution?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedExecution && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-400">Started</p>
                  <p className="text-white">
                    {formatDate(selectedExecution.startedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Finished</p>
                  <p className="text-white">
                    {selectedExecution.finishedAt
                      ? formatDate(selectedExecution.finishedAt)
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Duration</p>
                  <p className="text-white">
                    {formatDuration(selectedExecution.durationMs)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Job</p>
                  <p className="text-white">
                    {getJobLabel(selectedExecution.jobName)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Mode</p>
                  <p className={clsx('text-white', isExecutionDryRun && 'text-yellow-300')}>
                    {isExecutionDryRun ? 'Dry run (no payouts)' : 'Live run'}
                  </p>
                </div>
              </div>

              {selectedExecution.jobName === 'daily_prize_distribution' && (
                <>
                  {isExecutionDryRun && (
                    <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                      Dry run: no withdrawals were created.
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Distributed</p>
                      <p className="text-xl font-bold text-emerald-400">
                        {selectedExecution.prizesDistributed}
                      </p>
                    </div>
                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Skipped</p>
                      <p className="text-xl font-bold text-yellow-400">
                        {selectedExecution.prizesSkipped}
                      </p>
                    </div>
                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Failed</p>
                      <p className="text-xl font-bold text-red-400">
                        {selectedExecution.prizesFailed}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Total USDC</p>
                      <p className="text-lg font-bold text-white">
                        ${selectedExecution.totalUsdc.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Total GHST</p>
                      <p className="text-lg font-bold text-white">
                        {selectedExecution.totalGhst.toFixed(2)} GHST
                      </p>
                    </div>
                  </div>
                </>
              )}

              {selectedExecution.jobName === 'daily_discord_summary' && summaryResult && (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded bg-slate-800 p-3">
                        <p className="text-slate-400 text-xs">Runs Completed</p>
                        <p className="text-lg font-bold text-white">
                          {summaryResult.runsCompleted.toLocaleString('en-US')}
                        </p>
                      </div>
                      <div className="rounded bg-slate-800 p-3">
                        <p className="text-slate-400 text-xs">Daily Active Users</p>
                        <p className="text-lg font-bold text-white">
                          {summaryResult.dau.toLocaleString('en-US')}
                        </p>
                      </div>
                      <div className="rounded bg-slate-800 p-3">
                        <p className="text-slate-400 text-xs">Competition Runs</p>
                        <p className="text-lg font-bold text-white">
                          {summaryResult.competitionRunsCompleted.toLocaleString('en-US')}
                        </p>
                      </div>
                      <div className="rounded bg-slate-800 p-3">
                        <p className="text-slate-400 text-xs">Competition DAU</p>
                        <p className="text-lg font-bold text-white">
                          {summaryResult.competitionDau.toLocaleString('en-US')}
                        </p>
                      </div>
                    </div>

                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Highest Score</p>
                      <p className="text-white">
                        {summaryResult.highestScore !== null
                          ? `${summaryResult.highestScore.toLocaleString('en-US')} by ${summaryResult.highestScorePlayer ?? 'Unknown'}`
                          : 'No scores recorded'}
                      </p>
                    </div>

                    <div className="rounded bg-slate-800 p-3">
                      <p className="text-slate-400 text-xs">Discord Sent</p>
                      <p className="text-white">
                        {summaryResult.discordSent ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>
                )}

              {selectedExecution.errorMessage && (
                <div className="rounded bg-red-500/10 border border-red-500/30 p-3">
                  <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                  <p className="text-sm text-red-200">
                    {selectedExecution.errorMessage}
                  </p>
                </div>
              )}

              {selectedExecution.errors &&
                selectedExecution.errors.length > 0 && (
                  <div className="rounded bg-red-500/10 border border-red-500/30 p-3">
                    <p className="text-xs text-red-400 font-medium mb-2">
                      Errors ({selectedExecution.errors.length})
                    </p>
                    <ul className="text-sm text-red-200 space-y-1">
                      {selectedExecution.errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {/* Player Results by Tier */}
              {selectedExecution.jobName === 'daily_prize_distribution' &&
                distributionResult &&
                distributionResult.results.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-white">
                      Prize Recipients
                    </p>
                    {TIER_ORDER.map((tier) => {
                      const tierResults = distributionResult.results
                        .filter((result) => result.tier === tier && result.success)
                        .sort((a, b) => a.position - b.position);

                      if (tierResults.length === 0) return null;

                      return (
                        <div
                          key={tier}
                          className="rounded bg-slate-800/50 border border-slate-700 p-3"
                        >
                          <p className="text-xs font-medium text-slate-300 mb-2">
                            {formatTierName(tier)}
                          </p>
                          <div className="space-y-1">
                            {tierResults.map((result) => (
                              <div
                                key={`${result.tier}-${result.position}`}
                                className="flex items-center justify-between text-sm"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-500 w-5">
                                    #{result.position}
                                  </span>
                                  <span
                                    className="text-slate-300"
                                    title={result.accountId}
                                  >
                                    {result.username || truncateAddress(result.accountId)}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    ({formatScore(result.finalScore)})
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="text-emerald-400">
                                    {result.ghstAmount.toFixed(2)} GHST
                                  </span>
                                  <span className="text-blue-400">
                                    ${result.usdcAmount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedExecution(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger Distribution Dialog */}
      {isDistributionJob && (
        <Dialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen}>
          <DialogContent className="bg-slate-900 border-slate-700">
            <DialogHeader>
              <DialogTitle className="text-white">
                Trigger Distribution
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Manually trigger prize distribution for a specific date.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Target Date (optional)
                </label>
                <input
                  type="date"
                  value={triggerDate}
                  onChange={(e) => setTriggerDate(e.target.value)}
                  className="w-full rounded bg-slate-800 border border-slate-600 px-3 py-2 text-white"
                  placeholder="Leave empty for yesterday"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty to distribute for yesterday
                  {checkedDate && ` (${checkedDate})`}
                </p>
              </div>

              {/* Distribution exists warning */}
              {checkingDistribution && (
                <div className="rounded bg-slate-800 border border-slate-600 p-3">
                  <p className="text-sm text-slate-400">Checking distribution status...</p>
                </div>
              )}

              {!checkingDistribution && distributionExists && (
                <div className="rounded bg-yellow-500/10 border border-yellow-500/30 p-3">
                  <p className="text-sm text-yellow-300">
                    ⚠️ A distribution has already been completed for{' '}
                    <strong>{checkedDate}</strong>.
                  </p>
                  <p className="text-xs text-yellow-400 mt-1">
                    Use override to rerun without the safety check.
                  </p>
                </div>
              )}

              {!checkingDistribution && distributionExists === false && (
                <div className="rounded bg-emerald-500/10 border border-emerald-500/30 p-3">
                  <p className="text-sm text-emerald-300">
                    ✓ No distribution found for <strong>{checkedDate}</strong>.
                    Ready to distribute.
                  </p>
                </div>
              )}

              {!checkingDistribution && distributionExists && (
                <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-3">
                  <input
                    type="checkbox"
                    id="allowOverride"
                    checked={allowOverride}
                    onChange={(e) => setAllowOverride(e.target.checked)}
                    className="mt-0.5 rounded border-red-400"
                  />
                  <label htmlFor="allowOverride" className="text-sm text-red-200">
                    Override already distributed check (allows rerun)
                  </label>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dryRun"
                  checked={
                    allowOverride
                      ? dryRun
                      : dryRun || distributionExists === true
                  }
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={distributionExists === true && !allowOverride}
                  className="rounded border-slate-600 disabled:opacity-50"
                />
                <label
                  htmlFor="dryRun"
                  className={clsx(
                    'text-sm',
                    distributionExists && !allowOverride
                      ? 'text-slate-500'
                      : 'text-slate-300'
                  )}
                >
                  Dry run (simulate only, don&apos;t distribute)
                  {distributionExists && !allowOverride
                    ? ' (required - already distributed)'
                    : ''}
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTriggerDialogOpen(false)}
                disabled={triggering}
              >
                Cancel
              </Button>
              <Button
                onClick={handleTrigger}
                disabled={triggering || checkingDistribution}
              >
                {triggering
                  ? 'Running...'
                  : checkingDistribution
                    ? 'Checking...'
                    : dryRun || (distributionExists && !allowOverride)
                      ? 'Simulate'
                      : 'Distribute'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

