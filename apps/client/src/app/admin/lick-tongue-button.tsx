'use client';

import { useCallback, useMemo, useState } from 'react';
import { Plus, Check, AlertCircle } from 'lucide-react';
import { getAppServerBaseUrl } from '../../lib/server-url';

export function LickTongueTopUpButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const baseUrl = useMemo(() => getAppServerBaseUrl(), []);

  const handleTopUp = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setResult(null);

    try {
      const endpoint = `${baseUrl}/api/player/lick-tongues/top-up`;
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        setResult({
          success: false,
          message: error.error || 'Failed to top up',
        });
        return;
      }

      const payload = await res.json();
      setResult({
        success: true,
        message: `+${payload.delta} tongues (total: ${payload.lickTongueCount})`,
      });
    } catch {
      setResult({
        success: false,
        message: 'Network error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, isLoading]);

  return (
    <button
      type="button"
      onClick={handleTopUp}
      disabled={isLoading}
      className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition disabled:opacity-60 disabled:cursor-wait"
    >
      <div className="flex items-center gap-3">
        <Plus className="h-5 w-5 text-slate-300" aria-hidden />
        <div className="text-lg font-semibold">
          {isLoading ? 'Adding...' : 'Add Lick Tongues'}
        </div>
      </div>
      <div className="text-sm text-slate-400">
        {result ? (
          <span
            className={`flex items-center gap-1 ${result.success ? 'text-green-400' : 'text-red-400'}`}
          >
            {result.success ? (
              <Check className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {result.message}
          </span>
        ) : (
          'Dev tool: Add +100 Lick Tongues to your account.'
        )}
      </div>
    </button>
  );
}



