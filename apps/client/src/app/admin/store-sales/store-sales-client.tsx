'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAppServerBaseUrl } from '../../../lib/server-url';

export interface StoreSaleItemRow {
  transactionId: string;
  playerId: string;
  playerUsername: string | null;
  createdAt: string | null;
  itemType: string;
  itemName: string;
  quantity: number;
  payout: number;
  quality: string | null;
  rarity: string | null;
}

export interface DailyAllocation {
  dailyCap: number;
  soldThatDay: number;
  remainingThatDay: number;
}

export interface StoreSalesPayload {
  date: string;
  dailyAllocation: DailyAllocation;
  sales: StoreSaleItemRow[];
}

function getTodayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatGold(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface StoreSalesClientProps {
  initialDate: string;
  initialData: StoreSalesPayload | null;
  initialError: string | null;
}

export default function StoreSalesClient({
  initialDate,
  initialData,
  initialError,
}: StoreSalesClientProps) {
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState<StoreSalesPayload | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const fetchForDate = useCallback(async (bucketDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = getAppServerBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/admin/store-sales?date=${encodeURIComponent(bucketDate)}`,
        { credentials: 'include' }
      );
      const payload = (await res.json().catch(() => null)) as
        | StoreSalesPayload
        | { error?: string }
        | null;
      if (!res.ok || !payload || 'error' in payload) {
        const message =
          payload && 'error' in payload
            ? (payload as { error: string }).error
            : 'Failed to load store sales.';
        setError(message);
        setData(null);
        return;
      }
      setData(payload as StoreSalesPayload);
    } catch {
      setError('Failed to load store sales. Try refreshing.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date === initialDate) {
      setData(initialData ?? null);
      setError(initialError ?? null);
      return;
    }
    void fetchForDate(date);
  }, [date, fetchForDate, initialDate, initialData, initialError]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setDate(value);
    }
  };

  const allocation = data?.dailyAllocation;
  const sales = data?.sales ?? [];
  const hasSales = sales.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label
            htmlFor="store-sales-date"
            className="text-sm font-medium text-slate-400"
          >
            Date (UTC)
          </label>
          <input
            id="store-sales-date"
            type="date"
            value={date}
            onChange={handleDateChange}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <button
          type="button"
          onClick={() => void fetchForDate(date)}
          disabled={loading}
          className="rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : allocation ? (
        <>
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">
              Daily gold allocation — {data?.date ?? date}
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Daily cap</dt>
                <dd className="font-mono text-slate-200">
                  {formatGold(allocation.dailyCap)} gold
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Sold that day</dt>
                <dd className="font-mono text-slate-200">
                  {formatGold(allocation.soldThatDay)} gold
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Remaining that day</dt>
                <dd className="font-mono text-amber-200">
                  {formatGold(allocation.remainingThatDay)} gold
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-800">
            <h2 className="border-b border-slate-800 bg-slate-900/50 px-4 py-3 text-sm font-semibold text-slate-300">
              Wearables & equipment sold to store
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/50 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      Time (UTC)
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">Player</th>
                    <th className="px-3 py-2 text-left font-semibold">Item</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Quality
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Rarity
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Gold
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {!hasSales ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-6 text-center text-slate-400"
                      >
                        {loading
                          ? 'Loading…'
                          : 'No sales to the store for this day.'}
                      </td>
                    </tr>
                  ) : (
                    sales.map((row, idx) => (
                      <tr
                        key={`${row.transactionId}-${idx}`}
                        className="hover:bg-slate-900/40"
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                          {formatDateTime(row.createdAt)}
                        </td>
                        <td className="px-3 py-2 text-slate-200">
                          {row.playerUsername?.trim() || (
                            <span className="font-mono text-xs text-slate-400">
                              {row.playerId}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-200">
                          {row.itemName}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.quality ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {row.rarity ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300">
                          {row.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-100">
                          {formatGold(row.payout)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : null}
    </div>
  );
}
