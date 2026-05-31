'use client';

import { useCallback, useMemo, useState } from 'react';
import { Badge, type BadgeProps } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/Table';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import {
  getContract,
  prepareContractCall,
  sendTransaction,
  waitForReceipt,
} from 'thirdweb';
import { base } from 'thirdweb/chains';
import { daysUntil } from '../../lib/topup/time';
import {
  formatAmount,
  formatDate,
  formatRelativeTime,
  formatTxHash,
  getExplorerTxUrl,
} from '../../lib/topup/format';
import {
  BASE_CHAIN_ID,
  DEADLINE_WINDOW_SECONDS,
  GAMEPOINTS_CONTRACT_ADDRESS,
} from '../../lib/topup/constants';
import { GAMEPOINTS_ABI } from '../../lib/topup/abi';
import { thirdwebClient } from '../../lib/web3/config';
import { toBigInt } from '../../lib/topup/bigint';
import type { TopupRecord, TopupStatus } from '../../types/topup';

const STATUS_VARIANTS: Record<TopupStatus, BadgeProps['variant']> = {
  pending: 'secondary',
  confirmed: 'default',
  credited: 'default',
  failed: 'destructive',
};

function isUnlockReady(unlockAt: string | null): boolean {
  if (!unlockAt) return false;
  const ts = new Date(unlockAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts <= Date.now();
}

export function TopupHistory({
  records,
  onWithdrawComplete,
}: {
  records: TopupRecord[];
  onWithdrawComplete?: () => void | Promise<void>;
}) {
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();

  const handleWithdraw = useCallback(
    async (record: TopupRecord) => {
      if (!activeAccount || !activeWallet) {
        alert('Connect your wallet to withdraw.');
        return;
      }

      if (!record.depositId) {
        alert('Deposit is still syncing on-chain. Try again shortly.');
        return;
      }

      if (!record.amountWei) {
        alert('Deposit amount is missing. Try again later.');
        return;
      }

      if (!isUnlockReady(record.unlockAt)) {
        alert('Deposit is still locked. Try again after the unlock date.');
        return;
      }

      if (record.status !== 'credited') {
        alert(
          'Deposit is not fully credited yet. Try again once status is credited.'
        );
        return;
      }

      setWithdrawingId(record.id);

      try {
        let chain = activeWallet.getChain();
        if (!chain || chain.id !== BASE_CHAIN_ID) {
          await activeWallet.switchChain(base);
          chain = activeWallet.getChain();
          if (!chain || chain.id !== BASE_CHAIN_ID) {
            throw new Error('Please switch to Base network to withdraw.');
          }
        }

        const amountWei = toBigInt(record.amountWei);
        if (amountWei <= 0n) {
          throw new Error('Deposit amount is zero.');
        }

        const minAmountOut = (amountWei * 9950n) / 10000n;
        const deadline = BigInt(
          Math.floor(Date.now() / 1000) + DEADLINE_WINDOW_SECONDS
        );

        const contract = getContract({
          client: thirdwebClient,
          chain: base,
          address: GAMEPOINTS_CONTRACT_ADDRESS,
          abi: GAMEPOINTS_ABI,
        });

        const tx = await prepareContractCall({
          contract,
          method: 'withdraw',
          params: [toBigInt(record.depositId), minAmountOut, deadline],
        });

        const result = await sendTransaction({
          account: activeAccount,
          transaction: tx,
        });

        await waitForReceipt({
          client: thirdwebClient,
          chain: base,
          transactionHash: result.transactionHash,
        });

        alert(
          `Withdrawal transaction confirmed. ${record.token} will appear in your wallet shortly.`
        );
        if (onWithdrawComplete) {
          try {
            await onWithdrawComplete();
          } catch (refreshError) {
            console.warn('Failed to refresh after withdrawal', refreshError);
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Withdraw failed', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Withdrawal failed. See console for details.';
        alert(message);
      } finally {
        setWithdrawingId(null);
      }
    },
    [activeAccount, activeWallet, onWithdrawComplete]
  );

  const withdrawingIdMemo = useMemo(() => withdrawingId, [withdrawingId]);

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          Recent lockups on Base.
        </p>
      </div>

      <Table className="hidden min-w-full md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Token</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Unlock</TableHead>
            <TableHead>Tx</TableHead>
            <TableHead className="text-right">Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => {
            const unlockInDays = daysUntil(record.unlockAt);
            const baseStatusLabel =
              record.status.charAt(0).toUpperCase() + record.status.slice(1);
            const statusLabel = record.withdrawn
              ? 'Withdrawn'
              : baseStatusLabel;
            const unlockHint = record.unlockAt
              ? unlockInDays > 0
                ? `in ${unlockInDays} day${unlockInDays === 1 ? '' : 's'}`
                : 'ready'
              : '';
            const isUnlocked =
              typeof unlockInDays === 'number' &&
              unlockInDays <= 0 &&
              Boolean(record.unlockAt);
            const canWithdraw =
              record.status === 'credited' &&
              !record.withdrawn &&
              Boolean(record.depositId && record.amountWei) &&
              isUnlocked;
            const isWithdrawing = withdrawingIdMemo === record.id;
            return (
              <TableRow key={record.id}>
                <TableCell>{record.token}</TableCell>
                <TableCell>
                  {formatAmount(record.amount, record.token)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{formatDate(record.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(record.createdAt)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{formatDate(record.unlockAt)}</span>
                    <span className="text-xs text-muted-foreground">
                      {unlockHint}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {record.txHash ? (
                    <a
                      href={getExplorerTxUrl(record.txHash, record.chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-xs"
                    >
                      {formatTxHash(record.txHash)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      record.withdrawn
                        ? 'default'
                        : STATUS_VARIANTS[record.status]
                    }
                  >
                    {statusLabel}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {canWithdraw ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isWithdrawing}
                      onClick={() => void handleWithdraw(record)}
                    >
                      {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="space-y-3 md:hidden">
        {records.map((record) => {
          const unlockInDays = daysUntil(record.unlockAt);
          const baseStatusLabel =
            record.status.charAt(0).toUpperCase() + record.status.slice(1);
          const statusLabel = record.withdrawn ? 'Withdrawn' : baseStatusLabel;
          const unlockHint = record.unlockAt
            ? unlockInDays > 0
              ? `Unlocks in ${unlockInDays} day${unlockInDays === 1 ? '' : 's'}`
              : 'Ready to claim'
            : 'Pending confirmation';
          const isUnlocked =
            typeof unlockInDays === 'number' &&
            unlockInDays <= 0 &&
            Boolean(record.unlockAt);
          const canWithdraw =
            record.status === 'credited' &&
            !record.withdrawn &&
            Boolean(record.depositId && record.amountWei) &&
            isUnlocked;
          const isWithdrawing = withdrawingIdMemo === record.id;
          return (
            <div
              key={record.id}
              className="rounded-xl border border-border bg-background/80 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{record.token}</div>
                <Badge variant={STATUS_VARIANTS[record.status]}>
                  {statusLabel}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span>{formatAmount(record.amount, record.token)}</span>
                <span className="text-muted-foreground">Created</span>
                <div className="flex flex-col">
                  <span>{formatDate(record.createdAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(record.createdAt)}
                  </span>
                </div>
                <span className="text-muted-foreground">Unlock</span>
                <span>{formatDate(record.unlockAt)}</span>
                <span className="text-muted-foreground">Tx</span>
                <span>
                  {record.txHash ? (
                    <a
                      href={getExplorerTxUrl(record.txHash, record.chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-xs"
                    >
                      {formatTxHash(record.txHash)}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                <span>{unlockHint}</span>
              </div>
              {canWithdraw ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isWithdrawing}
                    onClick={() => void handleWithdraw(record)}
                  >
                    {isWithdrawing ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
