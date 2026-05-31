'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { useSession } from '../../../components/providers/SessionProvider';
import { Button } from '../../../components/ui/Button';

interface CurrencyCounts {
  gold: number;
  lickTongues: number;
  playerUsername: string | null;
  playerWalletAddress: string | null;
}

interface CurrencyAuditEntry {
  id: string;
  item_type: string;
  item_name: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const MAX_GOLD_CREDIT = 100000;
const MAX_LICK_TONGUE_CREDIT = 1000;

function shortenAddress(address: string | null | undefined): string {
  if (!address) return '—';
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}…${end}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDelta(value: number | null | undefined): string {
  const safeValue = Number(value) || 0;
  if (safeValue > 0) return `+${safeValue}`;
  return `${safeValue}`;
}

function getMetadataSource(metadata: Record<string, unknown> | null): string {
  if (!metadata || typeof metadata !== 'object') return '—';
  const source = metadata.source;
  if (typeof source === 'string' && source.trim()) {
    return source;
  }
  return '—';
}

export default function AdminCurrencyPage() {
  const serverBaseUrl = useMemo(() => getAppServerBaseUrl(), []);
  const { hasValidSession, isSessionVerified } = useSession();

  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currencyCounts, setCurrencyCounts] = useState<CurrencyCounts | null>(
    null
  );

  const [goldToCredit, setGoldToCredit] = useState(0);
  const [lickTonguesToCredit, setLickTonguesToCredit] = useState(0);
  const [crediting, setCrediting] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<CurrencyAuditEntry[]>([]);
  const [auditLimit, setAuditLimit] = useState(50);

  const canSearch = isSessionVerified && hasValidSession;

  const fetchCurrencyCounts = useCallback(async () => {
    if (!canSearch) return;
    if (!playerId.trim()) {
      setError('Enter a player ID');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setCurrencyCounts(null);

    try {
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/currency`,
        { credentials: 'include' }
      );

      if (res.status === 401) {
        setError('Unauthorized');
        return;
      }
      if (res.status === 403) {
        setError('Forbidden: wallet not on admin allowlist');
        return;
      }
      if (res.status === 404) {
        setError('Player not found');
        return;
      }
      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ error: 'Failed to load currency' }));
        setError(payload.error || 'Failed to load currency');
        return;
      }

      const payload = await res.json();
      setCurrencyCounts({
        gold: payload.gold ?? 0,
        lickTongues: payload.lickTongues ?? 0,
        playerUsername: payload.playerUsername ?? null,
        playerWalletAddress: payload.playerWalletAddress ?? null,
      });
    } catch {
      setError('Failed to load currency');
    } finally {
      setLoading(false);
    }
  }, [canSearch, playerId, serverBaseUrl]);

  const handleCreditCurrency = useCallback(async () => {
    if (!canSearch) return;
    if (!playerId.trim()) {
      setError('Enter a player ID first');
      return;
    }
    if (goldToCredit === 0 && lickTonguesToCredit === 0) {
      setError('Select at least one currency to credit');
      return;
    }

    setCrediting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/currency/credit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gold: goldToCredit,
            lickTongues: lickTonguesToCredit,
          }),
        }
      );

      if (res.status === 401) {
        setError('Unauthorized');
        return;
      }
      if (res.status === 403) {
        setError('Forbidden: wallet not on admin allowlist');
        return;
      }
      if (res.status === 404) {
        setError('Player not found');
        return;
      }
      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ error: 'Failed to credit currency' }));
        setError(payload.error || 'Failed to credit currency');
        return;
      }

      const payload = await res.json();

      setCurrencyCounts((prev) => ({
        ...prev,
        gold: payload.totals?.gold ?? prev?.gold ?? 0,
        lickTongues: payload.totals?.lickTongues ?? prev?.lickTongues ?? 0,
        playerUsername: prev?.playerUsername ?? null,
        playerWalletAddress: prev?.playerWalletAddress ?? null,
      }));

      const parts: string[] = [];
      if (payload.credited?.gold > 0) {
        parts.push(`${payload.credited.gold} Gold`);
      }
      if (payload.credited?.lickTongues > 0) {
        parts.push(
          `${payload.credited.lickTongues} Lick Tongue${payload.credited.lickTongues > 1 ? 's' : ''}`
        );
      }
      setSuccess(`Credited ${parts.join(' and ')} successfully!`);
      setGoldToCredit(0);
      setLickTonguesToCredit(0);
    } catch {
      setError('Failed to credit currency');
    } finally {
      setCrediting(false);
    }
  }, [
    canSearch,
    playerId,
    goldToCredit,
    lickTonguesToCredit,
    serverBaseUrl,
  ]);

  const handleClear = useCallback(() => {
    setPlayerId('');
    setCurrencyCounts(null);
    setError(null);
    setSuccess(null);
    setGoldToCredit(0);
    setLickTonguesToCredit(0);
    setAuditRows([]);
    setAuditError(null);
    setAuditLimit(50);
  }, []);

  const fetchAudit = useCallback(async () => {
    if (!canSearch) return;
    if (!playerId.trim()) {
      setAuditError('Enter a player ID');
      return;
    }

    setAuditLoading(true);
    setAuditError(null);
    setAuditRows([]);

    const limit = Math.max(1, Math.min(200, Math.floor(auditLimit || 50)));

    try {
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/currency/audit?limit=${limit}`,
        { credentials: 'include' }
      );

      if (res.status === 401) {
        setAuditError('Unauthorized');
        return;
      }
      if (res.status === 403) {
        setAuditError('Forbidden: wallet not on admin allowlist');
        return;
      }
      if (res.status === 404) {
        setAuditError('Player not found');
        return;
      }
      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ error: 'Failed to load audit logs' }));
        setAuditError(payload.error || 'Failed to load audit logs');
        return;
      }

      const payload = await res.json();
      setAuditRows(payload.rows || []);
    } catch {
      setAuditError('Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  }, [auditLimit, canSearch, playerId, serverBaseUrl]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono">
      <header className="border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">
              Gold + Lick Tongue Credit Tool
            </h1>
            <p className="text-sm text-slate-400">
              Credit Gold and Lick Tongues to players.
            </p>
          </div>
          <div className="text-xs text-slate-400">
            <Link href="/admin" className="hover:text-white">
              Back to Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6">
        {!isSessionVerified ? (
          <div className="text-sm text-slate-400">Verifying session…</div>
        ) : !hasValidSession ? (
          <div className="text-sm text-slate-300">
            Connect wallet to access admin tools.
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {/* Player Lookup */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="text-sm font-medium text-slate-300 mb-3">
                Player Lookup
              </div>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-slate-400">
                    Player ID
                  </label>
                  <input
                    className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                    placeholder="Enter player UUID"
                    value={playerId}
                    onChange={(e) => setPlayerId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') fetchCurrencyCounts();
                    }}
                  />
                </div>
                <Button onClick={fetchCurrencyCounts} disabled={loading}>
                  {loading ? 'Loading…' : 'Lookup'}
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              </div>

              {error && (
                <div className="mt-3 text-sm text-red-400">{error}</div>
              )}
              {success && (
                <div className="mt-3 text-sm text-emerald-400">{success}</div>
              )}
            </div>

            {/* Player Info & Current Currency */}
            {currencyCounts && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-300 mb-3">
                  Player Info
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                    <div className="text-xs text-slate-400 mb-1">Username</div>
                    <div className="text-slate-200">
                      {currencyCounts.playerUsername || '—'}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                    <div className="text-xs text-slate-400 mb-1">Wallet</div>
                    <div
                      className="text-slate-200"
                      title={currencyCounts.playerWalletAddress || ''}
                    >
                      {shortenAddress(currencyCounts.playerWalletAddress)}
                    </div>
                  </div>
                </div>

                <div className="text-sm font-medium text-slate-300 mb-3">
                  Current Balances
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-4 text-center">
                    <div className="text-xs uppercase tracking-wide text-amber-400 mb-2">
                      Gold
                    </div>
                    <div className="text-3xl font-bold text-amber-300">
                      {currencyCounts.gold}
                    </div>
                  </div>
                  <div className="rounded-md border border-pink-900/50 bg-pink-950/20 p-4 text-center">
                    <div className="text-xs uppercase tracking-wide text-pink-400 mb-2">
                      Lick Tongues
                    </div>
                    <div className="text-3xl font-bold text-pink-300">
                      {currencyCounts.lickTongues}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Credit Currency */}
            {currencyCounts && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-300 mb-3">
                  Credit Currency
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Gold to Credit
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={MAX_GOLD_CREDIT}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                      value={goldToCredit}
                      onChange={(e) =>
                        setGoldToCredit(
                          Math.max(
                            0,
                            Math.min(
                              MAX_GOLD_CREDIT,
                              parseInt(e.target.value, 10) || 0
                            )
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Lick Tongues to Credit
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={MAX_LICK_TONGUE_CREDIT}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                      value={lickTonguesToCredit}
                      onChange={(e) =>
                        setLickTonguesToCredit(
                          Math.max(
                            0,
                            Math.min(
                              MAX_LICK_TONGUE_CREDIT,
                              parseInt(e.target.value, 10) || 0
                            )
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleCreditCurrency}
                    disabled={
                      crediting ||
                      (goldToCredit === 0 && lickTonguesToCredit === 0)
                    }
                  >
                    {crediting ? 'Crediting…' : 'Credit Currency'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGoldToCredit(0);
                      setLickTonguesToCredit(0);
                    }}
                  >
                    Reset
                  </Button>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Max {MAX_GOLD_CREDIT} Gold and {MAX_LICK_TONGUE_CREDIT} Lick
                  Tongues per transaction.
                </div>
              </div>
            )}

            {/* Currency Audit */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                <div>
                  <div className="text-sm font-medium text-slate-300">
                    Currency Audit
                  </div>
                  <div className="text-xs text-slate-400">
                    Read Gold and Lick Tongue changes from inventory events.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Rows</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={auditLimit}
                    onChange={(event) =>
                      setAuditLimit(Number(event.target.value) || 50)
                    }
                    className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <Button
                  onClick={fetchAudit}
                  disabled={!canSearch || auditLoading}
                  className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                >
                  {auditLoading ? 'Loading…' : 'Load Audit Log'}
                </Button>
                {auditError && (
                  <span className="text-xs text-red-400">{auditError}</span>
                )}
              </div>

              {auditRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-200">
                    <thead>
                      <tr className="text-left text-slate-400">
                        <th className="pb-2 pr-3">Time</th>
                        <th className="pb-2 pr-3">Item</th>
                        <th className="pb-2 pr-3">Delta</th>
                        <th className="pb-2 pr-3">Reason</th>
                        <th className="pb-2 pr-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {formatTimestamp(row.created_at)}
                          </td>
                          <td className="py-2 pr-3">{row.item_name}</td>
                          <td className="py-2 pr-3">
                            {formatDelta(row.delta)}
                          </td>
                          <td className="py-2 pr-3 uppercase text-[10px] text-slate-400">
                            {row.reason}
                          </td>
                          <td className="py-2 pr-3">
                            {getMetadataSource(row.metadata)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  {auditLoading
                    ? 'Loading audit log...'
                    : 'No audit rows loaded.'}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
