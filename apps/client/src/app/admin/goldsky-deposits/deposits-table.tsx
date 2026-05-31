'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getContract,
  prepareContractCall,
  sendTransaction,
  waitForReceipt,
} from 'thirdweb';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { base } from 'thirdweb/chains';
import type { DecodedDeposit } from './types';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import {
  DEADLINE_WINDOW_SECONDS,
  GAMEPOINTS_CONTRACT_ADDRESS,
  TOKEN_BY_ADDRESS,
} from '../../../lib/topup/constants';
import { GAMEPOINTS_ABI } from '../../../lib/topup/abi';
import { thirdwebClient } from '../../../lib/web3/config';
import { toBigInt } from '../../../lib/topup/bigint';

function isUnlockReady(unlockAt?: string): boolean {
  if (!unlockAt) return false;
  const ts = new Date(unlockAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts <= Date.now();
}

export function GoldskyDepositsTable(props: { rows: DecodedDeposit[] }) {
  const [rows, setRows] = useState<DecodedDeposit[]>(props.rows);
  const [busyTx, setBusyTx] = useState<string | null>(null);
  const [withdrawingDepositId, setWithdrawingDepositId] = useState<
    string | null
  >(null);
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();

  useEffect(() => {
    setRows(props.rows);
  }, [props.rows]);

  async function load() {
    const baseUrl = getAppServerBaseUrl();
    const res = await fetch(
      `${baseUrl}/api/admin/goldsky/deposits/recent?limit=100`,
      {
        credentials: 'include',
        cache: 'no-store',
      }
    );
    if (res.ok) {
      const json = (await res.json()) as { rows: DecodedDeposit[] };
      setRows(json.rows || []);
    }
  }

  useEffect(() => {
    const id = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  async function backfill(txHash: string) {
    const baseUrl = getAppServerBaseUrl();
    setBusyTx(txHash);
    try {
      const res = await fetch(
        `${baseUrl}/api/admin/goldsky/deposits/backfill`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ txHash }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || 'Backfill failed');
      } else {
        await load();
      }
    } finally {
      setBusyTx(null);
    }
  }

  async function credit(txHash: string) {
    const baseUrl = getAppServerBaseUrl();
    setBusyTx(txHash);
    try {
      const res = await fetch(`${baseUrl}/api/admin/goldsky/deposits/credit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ txHash }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err?.error || 'Credit failed');
      } else {
        await load();
      }
    } finally {
      setBusyTx(null);
    }
  }

  async function withdrawDeposit(row: DecodedDeposit) {
    if (!activeAccount || !activeWallet) {
      alert('Connect your wallet to withdraw.');
      return;
    }

    const userAddress = activeAccount.address.toLowerCase();
    if (row.user.toLowerCase() !== userAddress) {
      alert('This deposit does not belong to your connected wallet.');
      return;
    }

    const tokenMeta = TOKEN_BY_ADDRESS[row.depositToken.toLowerCase()];
    if (!tokenMeta) {
      alert('Unsupported token for withdrawal.');
      return;
    }

    if (!isUnlockReady(row.unlockAt)) {
      alert('Deposit is still locked. Try again after the unlock time.');
      return;
    }

    setWithdrawingDepositId(row.depositId);

    try {
      let chain = activeWallet.getChain();
      if (!chain || chain.id !== 8453) {
        await activeWallet.switchChain(base);
        chain = activeWallet.getChain();
        if (!chain || chain.id !== 8453) {
          throw new Error('Please switch to Base network to withdraw.');
        }
      }

      const contract = getContract({
        client: thirdwebClient,
        chain: base,
        address: GAMEPOINTS_CONTRACT_ADDRESS,
        abi: GAMEPOINTS_ABI,
      });

      const amountWei = toBigInt(row.depositAmountRaw);
      const minAmountOut = (amountWei * 9950n) / 10000n;
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + DEADLINE_WINDOW_SECONDS
      );

      const tx = await prepareContractCall({
        contract,
        method: 'withdraw',
        params: [toBigInt(row.depositId), minAmountOut, deadline],
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
        `Withdrawal transaction confirmed. ${tokenMeta.symbol} will appear in your wallet shortly.`
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Withdraw failed', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Withdrawal failed. See console for details.';
      alert(message);
    } finally {
      setWithdrawingDepositId(null);
    }
  }

  const walletAddress = activeAccount?.address.toLowerCase() ?? null;
  const hasWallet = useMemo(() => Boolean(walletAddress), [walletAddress]);

  return (
    <div className="overflow-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="px-3 py-2">block</th>
            <th className="px-3 py-2">log_index</th>
            <th className="px-3 py-2">user</th>
            <th className="px-3 py-2">depositId</th>
            <th className="px-3 py-2">token</th>
            <th className="px-3 py-2">amount</th>
            <th className="px-3 py-2">points</th>
            <th className="px-3 py-2">unlockAt</th>
            <th className="px-3 py-2">status</th>
            <th className="px-3 py-2">withdraw</th>
            <th className="px-3 py-2">tx</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r) => {
            const isOwner =
              walletAddress && r.user.toLowerCase() === walletAddress;
            const isUnlocked = isUnlockReady(r.unlockAt);
            const tokenMeta = TOKEN_BY_ADDRESS[r.depositToken.toLowerCase()];
            const isSupportedToken = Boolean(tokenMeta);
            const canWithdraw = Boolean(
              isOwner && isUnlocked && isSupportedToken && hasWallet
            );
            const isWithdrawing = withdrawingDepositId === r.depositId;

            return (
              <tr
                key={`${r.blockNumber}-${r.logIndex}`}
                className="hover:bg-slate-900/40"
              >
                <td className="px-3 py-2 tabular-nums">{r.blockNumber}</td>
                <td className="px-3 py-2 tabular-nums">{r.logIndex}</td>
                <td className="px-3 py-2">
                  <code className="text-slate-300">
                    {r.user.slice(0, 8)}…{r.user.slice(-6)}
                  </code>
                </td>
                <td className="px-3 py-2 tabular-nums">{r.depositId}</td>
                <td className="px-3 py-2">
                  <code className="text-slate-300">
                    {r.depositToken.slice(0, 8)}…{r.depositToken.slice(-6)}
                  </code>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.depositAmount.toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {r.pointsMinted.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  {r.unlockAt ? new Date(r.unlockAt).toLocaleString() : '-'}
                </td>
                <td className="px-3 py-2">
                  {r.supabaseStatus === 'not_found' ? (
                    <button
                      className="underline text-slate-300 hover:text-white disabled:opacity-50"
                      disabled={busyTx === r.transactionHash}
                      onClick={() => {
                        if (confirm('Add this deposit to Supabase?')) {
                          void backfill(r.transactionHash);
                        }
                      }}
                    >
                      {busyTx === r.transactionHash ? 'adding…' : 'not_found'}
                    </button>
                  ) : (
                    <span
                      className={
                        r.supabaseStatus === 'credited'
                          ? 'text-green-400'
                          : r.supabaseStatus === 'confirmed'
                            ? 'text-blue-400'
                            : r.supabaseStatus === 'pending'
                              ? 'text-yellow-400'
                              : r.supabaseStatus === 'failed'
                                ? 'text-red-400'
                                : 'text-slate-400'
                      }
                    >
                      {r.supabaseStatus}
                    </span>
                  )}
                  {r.supabaseStatus === 'confirmed' ? (
                    <button
                      className="ml-2 underline text-slate-300 hover:text-white disabled:opacity-50"
                      disabled={busyTx === r.transactionHash}
                      onClick={() => void credit(r.transactionHash)}
                    >
                      {busyTx === r.transactionHash ? 'crediting…' : 'credit'}
                    </button>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  {canWithdraw ? (
                    <button
                      className="underline text-emerald-300 hover:text-emerald-100 disabled:opacity-50"
                      disabled={isWithdrawing}
                      onClick={() => void withdrawDeposit(r)}
                    >
                      {isWithdrawing ? 'withdrawing…' : 'withdraw'}
                    </button>
                  ) : (
                    <span className="text-slate-500">
                      {isOwner
                        ? isUnlocked
                          ? isSupportedToken
                            ? 'connect wallet'
                            : 'unsupported token'
                          : 'locked'
                        : '—'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={`https://basescan.org/tx/${r.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-blue-300 hover:text-blue-200"
                  >
                    <code className="text-inherit">
                      {r.transactionHash.slice(0, 10)}…
                      {r.transactionHash.slice(-8)}
                    </code>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
