'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { mapApiKeyCreateError } from '../../../lib/session-errors';

export interface ApiKeyListItem {
  id: string;
  name: string | null;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  authSuccessCount: number;
  roomJoinCount: number;
}

interface ApiKeysClientProps {
  initialKeys: ApiKeyListItem[];
  initialError?: string | null;
  featureEnabled: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ApiKeysClient({
  initialKeys,
  initialError = null,
  featureEnabled,
}: ApiKeysClientProps) {
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initialKeys);
  const [nameInput, setNameInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialError);
  const [error, setError] = useState<string | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [revealedPrefix, setRevealedPrefix] = useState<string | null>(null);
  const baseUrl = getAppServerBaseUrl();

  const activeKeys = useMemo(
    () => keys.filter((key) => !key.revokedAt).length,
    [keys]
  );

  async function refreshKeys() {
    const response = await fetch(`${baseUrl}/api/auth/api-keys`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to load API keys');
    }
    setKeys(Array.isArray(data?.keys) ? (data.keys as ApiKeyListItem[]) : []);
  }

  async function handleCreate() {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    setNotice(null);
    setRevealedApiKey(null);
    setRevealedPrefix(null);

    try {
      const response = await fetch(`${baseUrl}/api/auth/api-keys`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ name: nameInput.trim() || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const mapped = mapApiKeyCreateError(data, response.status);
        throw new Error(mapped.message);
      }

      await refreshKeys();
      setRevealedApiKey(typeof data?.apiKey === 'string' ? data.apiKey : null);
      setRevealedPrefix(
        typeof data?.key?.keyPrefix === 'string'
          ? data.key.keyPrefix
          : typeof data?.keyPrefix === 'string'
            ? data.keyPrefix
            : null
      );
      setNameInput('');
      setNotice('API key created. Copy it now, this is the only time it is shown.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (revokingId) return;
    const confirmed = window.confirm('Revoke this API key? This cannot be undone.');
    if (!confirmed) return;

    setRevokingId(id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${baseUrl}/api/auth/api-keys/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to revoke key');
      }
      await refreshKeys();
      setNotice('API key revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopySecret() {
    if (!revealedApiKey) return;
    try {
      await navigator.clipboard.writeText(revealedApiKey);
      setNotice('API key copied to clipboard.');
    } catch {
      setError('Failed to copy API key. Copy it manually.');
    }
  }

  if (!featureEnabled) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-sm text-white/70">
          API keys are currently disabled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-white">Create API Key</h2>
        <p className="mt-1 text-xs text-white/60">
          Requires wallet ownership of at least one Aavegotchi. API-key room
          joins still require at least 1000 USDC and 1000 GHST staked. Active
          keys: {activeKeys}
        </p>
        <p className="mt-1 text-xs text-white/50">
          If ownership verification is temporarily unavailable, wait a few
          minutes and retry key creation.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={nameInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setNameInput(event.target.value)}
            placeholder="Optional key name"
            maxLength={64}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="bg-white text-black hover:bg-white/90"
          >
            {isCreating ? 'Creating…' : 'Create key'}
          </Button>
        </div>
      </section>

      {revealedApiKey ? (
        <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
          <h3 className="text-sm font-semibold text-amber-100">
            One-time API key reveal
          </h3>
          <p className="mt-1 text-xs text-amber-50/80">
            This value is shown once. Store it securely.
          </p>
          {revealedPrefix ? (
            <p className="mt-2 text-xs text-amber-50/70">Prefix: {revealedPrefix}</p>
          ) : null}
          <pre className="mt-3 overflow-x-auto rounded-lg border border-amber-50/20 bg-black/30 p-3 text-xs text-amber-50">
            {revealedApiKey}
          </pre>
          <Button
            onClick={handleCopySecret}
            size="sm"
            className="mt-3 bg-amber-100 text-black hover:bg-amber-200"
          >
            Copy API key
          </Button>
        </section>
      ) : null}

      {notice ? (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Your API Keys</h2>
        </div>
        {keys.length === 0 ? (
          <div className="px-4 py-6 text-sm text-white/60">
            No API keys yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {keys.map((key) => {
              const revoked = Boolean(key.revokedAt);
              return (
                <li key={key.id} className="px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-white">
                          {key.name || 'Unnamed key'}
                        </p>
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/70">
                          {key.keyPrefix}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            revoked
                              ? 'bg-red-500/20 text-red-200'
                              : 'bg-emerald-500/20 text-emerald-200'
                          }`}
                        >
                          {revoked ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-white/60 sm:grid-cols-2">
                        <span>Created: {formatDate(key.createdAt)}</span>
                        <span>Last used: {formatDate(key.lastUsedAt)}</span>
                        <span>Auth success: {key.authSuccessCount.toLocaleString()}</span>
                        <span>Room joins: {key.roomJoinCount.toLocaleString()}</span>
                      </div>
                    </div>
                    <div>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={revoked || revokingId === key.id}
                        onClick={() => void handleRevoke(key.id)}
                      >
                        {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
