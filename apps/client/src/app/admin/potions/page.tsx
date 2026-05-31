'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { useSession } from '../../../components/providers/SessionProvider';
import { Button } from '../../../components/ui/Button';

interface PotionCounts {
  healthPotions: number;
  manaPotions: number;
  playerUsername: string | null;
  playerWalletAddress: string | null;
}

interface PotionAuditEntry {
  id: string;
  player_id: string;
  item_type: string;
  item_name: string;
  previous_quantity: number | null;
  new_quantity: number | null;
  action: string;
  source: string | null;
  created_at: string;
}

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

export default function AdminPotionsPage() {
  const serverBaseUrl = useMemo(() => getAppServerBaseUrl(), []);
  const { hasValidSession, isSessionVerified } = useSession();

  const [playerId, setPlayerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [potionCounts, setPotionCounts] = useState<PotionCounts | null>(null);

  const [healthPotionsToCredit, setHealthPotionsToCredit] = useState(0);
  const [manaPotionsToCredit, setManaPotionsToCredit] = useState(0);
  const [crediting, setCrediting] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<PotionAuditEntry[]>([]);
  const [auditLimit, setAuditLimit] = useState(50);

  const canSearch = isSessionVerified && hasValidSession;

  const fetchPotionCounts = useCallback(async () => {
    if (!canSearch) return;
    if (!playerId.trim()) {
      setError('Enter a player ID');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    setPotionCounts(null);

    try {
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/potions`,
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
          .catch(() => ({ error: 'Failed to load potions' }));
        setError(payload.error || 'Failed to load potions');
        return;
      }

      const payload = await res.json();
      setPotionCounts({
        healthPotions: payload.healthPotions ?? 0,
        manaPotions: payload.manaPotions ?? 0,
        playerUsername: payload.playerUsername ?? null,
        playerWalletAddress: payload.playerWalletAddress ?? null,
      });
    } catch {
      setError('Failed to load potions');
    } finally {
      setLoading(false);
    }
  }, [canSearch, playerId, serverBaseUrl]);

  const handleCreditPotions = useCallback(async () => {
    if (!canSearch) return;
    if (!playerId.trim()) {
      setError('Enter a player ID first');
      return;
    }
    if (healthPotionsToCredit === 0 && manaPotionsToCredit === 0) {
      setError('Select at least one potion type to credit');
      return;
    }

    setCrediting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/potions/credit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            healthPotions: healthPotionsToCredit,
            manaPotions: manaPotionsToCredit,
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
          .catch(() => ({ error: 'Failed to credit potions' }));
        setError(payload.error || 'Failed to credit potions');
        return;
      }

      const payload = await res.json();

      setPotionCounts((prev) => ({
        ...prev,
        healthPotions:
          payload.totals?.healthPotions ?? prev?.healthPotions ?? 0,
        manaPotions: payload.totals?.manaPotions ?? prev?.manaPotions ?? 0,
        playerUsername: prev?.playerUsername ?? null,
        playerWalletAddress: prev?.playerWalletAddress ?? null,
      }));

      const parts: string[] = [];
      if (payload.credited?.healthPotions > 0) {
        parts.push(
          `${payload.credited.healthPotions} Health Potion${payload.credited.healthPotions > 1 ? 's' : ''}`
        );
      }
      if (payload.credited?.manaPotions > 0) {
        parts.push(
          `${payload.credited.manaPotions} Mana Potion${payload.credited.manaPotions > 1 ? 's' : ''}`
        );
      }
      setSuccess(`Credited ${parts.join(' and ')} successfully!`);
      setHealthPotionsToCredit(0);
      setManaPotionsToCredit(0);
    } catch {
      setError('Failed to credit potions');
    } finally {
      setCrediting(false);
    }
  }, [
    canSearch,
    playerId,
    healthPotionsToCredit,
    manaPotionsToCredit,
    serverBaseUrl,
  ]);

  const handleClear = useCallback(() => {
    setPlayerId('');
    setPotionCounts(null);
    setError(null);
    setSuccess(null);
    setHealthPotionsToCredit(0);
    setManaPotionsToCredit(0);
    setAuditRows([]);
    setAuditError(null);
    setAuditLimit(50);
  }, []);

  const fetchPotionAudit = useCallback(async () => {
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
        `${serverBaseUrl}/api/admin/players/${encodeURIComponent(playerId.trim())}/potions/audit?limit=${limit}`,
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
              Potion Credit Tool
            </h1>
            <p className="text-sm text-slate-400">
              Credit HP and Mana potions to players.
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
                      if (e.key === 'Enter') fetchPotionCounts();
                    }}
                  />
                </div>
                <Button onClick={fetchPotionCounts} disabled={loading}>
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

            {/* Player Info & Current Potions */}
            {potionCounts && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-300 mb-3">
                  Player Info
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                    <div className="text-xs text-slate-400 mb-1">Username</div>
                    <div className="text-slate-200">
                      {potionCounts.playerUsername || '—'}
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-900 bg-slate-900/40 p-3">
                    <div className="text-xs text-slate-400 mb-1">Wallet</div>
                    <div
                      className="text-slate-200"
                      title={potionCounts.playerWalletAddress || ''}
                    >
                      {shortenAddress(potionCounts.playerWalletAddress)}
                    </div>
                  </div>
                </div>

                <div className="text-sm font-medium text-slate-300 mb-3">
                  Current Potion Counts
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-md border border-emerald-900/50 bg-emerald-950/20 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <img
                        src="/icons/potions/health-potion.svg"
                        alt="Health Potion"
                        className="w-6 h-6"
                      />
                      <span className="text-xs uppercase tracking-wide text-emerald-400">
                        Health Potions
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-emerald-300">
                      {potionCounts.healthPotions}
                    </div>
                  </div>
                  <div className="rounded-md border border-blue-900/50 bg-blue-950/20 p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <img
                        src="/icons/potions/mana-potion.svg"
                        alt="Mana Potion"
                        className="w-6 h-6"
                      />
                      <span className="text-xs uppercase tracking-wide text-blue-400">
                        Mana Potions
                      </span>
                    </div>
                    <div className="text-3xl font-bold text-blue-300">
                      {potionCounts.manaPotions}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Credit Potions */}
            {potionCounts && (
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm font-medium text-slate-300 mb-3">
                  Credit Potions
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Health Potions to Credit
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                      value={healthPotionsToCredit}
                      onChange={(e) =>
                        setHealthPotionsToCredit(
                          Math.max(
                            0,
                            Math.min(1000, parseInt(e.target.value, 10) || 0)
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">
                      Mana Potions to Credit
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                      value={manaPotionsToCredit}
                      onChange={(e) =>
                        setManaPotionsToCredit(
                          Math.max(
                            0,
                            Math.min(1000, parseInt(e.target.value, 10) || 0)
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleCreditPotions}
                    disabled={
                      crediting ||
                      (healthPotionsToCredit === 0 && manaPotionsToCredit === 0)
                    }
                  >
                    {crediting ? 'Crediting…' : 'Credit Potions'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setHealthPotionsToCredit(0);
                      setManaPotionsToCredit(0);
                    }}
                  >
                    Reset
                  </Button>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Max 1000 potions per type per transaction.
                </div>
              </div>
            )}

            {/* Potion Audit */}
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                <div>
                  <div className="text-sm font-medium text-slate-300">
                    Potion Audit
                  </div>
                  <div className="text-xs text-slate-400">
                    Read potion inventory changes from the DB audit table.
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
                  onClick={fetchPotionAudit}
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
                        <th className="pb-2 pr-3">Action</th>
                        <th className="pb-2 pr-3">Item</th>
                        <th className="pb-2 pr-3">Prev</th>
                        <th className="pb-2 pr-3">Next</th>
                        <th className="pb-2 pr-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {formatTimestamp(row.created_at)}
                          </td>
                          <td className="py-2 pr-3 uppercase text-[10px] text-slate-400">
                            {row.action}
                          </td>
                          <td className="py-2 pr-3">
                            {row.item_name}
                          </td>
                          <td className="py-2 pr-3">
                            {row.previous_quantity ?? '—'}
                          </td>
                          <td className="py-2 pr-3">
                            {row.new_quantity ?? '—'}
                          </td>
                          <td className="py-2 pr-3">
                            {row.source || '—'}
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


