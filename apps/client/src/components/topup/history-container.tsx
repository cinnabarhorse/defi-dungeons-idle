'use client';

import { useCallback } from 'react';
import { TopupHistory } from './history';
import { Button } from '../ui/Button';
import { useTopupDeposits } from '../../hooks/useTopupDeposits';
import { usePlayer } from '../providers/PlayerProvider';

export function TopupHistoryContainer() {
  const { records, isLoading, error, refresh, hasSession } = useTopupDeposits();
  const { refreshProgression } = usePlayer();

  const handleRetry = useCallback(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const handleWithdrawComplete = useCallback(async () => {
    try {
      await refreshProgression();
    } finally {
      await refresh();
    }
  }, [refresh, refreshProgression]);

  return (
    <div className="space-y-3">
      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{error}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleRetry}
            className="h-7"
          >
            Retry
          </Button>
        </div>
      ) : null}

      <TopupHistory
        records={hasSession ? records : []}
        onWithdrawComplete={handleWithdrawComplete}
      />

      {!hasSession ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Connect your wallet to view on-chain deposit history.
        </div>
      ) : null}

      {hasSession && !isLoading && !error && records.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No deposits yet. Your on-chain lockups will appear here.
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading deposits…</p>
      ) : null}
    </div>
  );
}
