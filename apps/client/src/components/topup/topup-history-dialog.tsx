'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog';
import { TopupHistory } from './history';
import { useSession } from '../providers/SessionProvider';
import { usePlayer } from '../providers/PlayerProvider';
import { fetchDeposits } from '../../lib/topup/api';
import { mapDepositToTopupRecord } from '../../lib/topup/mappers';
import type { TopupRecord } from '../../types/topup';
import type { ButtonProps } from '../ui/Button';

export interface TopupHistoryDialogProps {
  triggerLabel?: string;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  triggerClassName?: string;
}

export function TopupHistoryDialog({
  triggerLabel = 'Topup History',
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
}: TopupHistoryDialogProps) {
  const { hasValidSession } = useSession();
  const { refreshProgression } = usePlayer();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<TopupRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!hasValidSession) {
      setHistoryRecords([]);
      return;
    }

    setIsLoadingHistory(true);
    try {
      const deposits = await fetchDeposits();
      const records = deposits.map(mapDepositToTopupRecord);
      setHistoryRecords(records);
    } catch (error) {
      console.error('Failed to load topup history', error);
      setHistoryRecords([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [hasValidSession]);

  const handleWithdrawComplete = useCallback(async () => {
    try {
      await refreshProgression();
    } finally {
      await loadHistory();
    }
  }, [loadHistory, refreshProgression]);

  useEffect(() => {
    if (isHistoryOpen) {
      void loadHistory();
    }
  }, [isHistoryOpen, loadHistory]);

  if (!hasValidSession) return null;

  return (
    <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Topup History</DialogTitle>
        </DialogHeader>
        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Loading history…</p>
          </div>
        ) : historyRecords.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">No deposits found.</p>
          </div>
        ) : (
          <TopupHistory
            records={historyRecords}
            onWithdrawComplete={handleWithdrawComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
