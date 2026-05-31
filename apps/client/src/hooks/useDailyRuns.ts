import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearFetchDedupeCache, fetchDedupe } from '../lib/fetch-dedupe';
import { getAppServerBaseUrl } from '../lib/server-url';
import type { DailyRunsStatus } from '../types/daily-runs';
import { TOPUP_DEPOSIT_CREDITED_EVENT } from '../lib/topup/events';

export function useDailyRuns(playerId: string | null | undefined) {
  const [data, setData] = useState<DailyRunsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = useMemo(() => getAppServerBaseUrl(), []);
  const endpoint = useMemo(() => `${baseUrl}/api/player/daily-runs`, [baseUrl]);

  const refresh = useCallback(async () => {
    if (!playerId) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchDedupe(endpoint, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: 'Failed to load daily runs' }));
        throw new Error(payload?.error || 'Failed to load daily runs');
      }

      const payload = (await response.json()) as DailyRunsStatus;
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load daily runs');
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, playerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!playerId || typeof window === 'undefined') return;

    const retryTimers = new Set<number>();
    const handleTopupCredited = () => {
      clearFetchDedupeCache();
      void refresh();
      const timerId = window.setTimeout(() => {
        retryTimers.delete(timerId);
        clearFetchDedupeCache();
        void refresh();
      }, 2000);
      retryTimers.add(timerId);
    };

    window.addEventListener(TOPUP_DEPOSIT_CREDITED_EVENT, handleTopupCredited);
    return () => {
      for (const timerId of retryTimers) {
        window.clearTimeout(timerId);
      }
      retryTimers.clear();
      window.removeEventListener(
        TOPUP_DEPOSIT_CREDITED_EVENT,
        handleTopupCredited
      );
    };
  }, [playerId, refresh]);

  return { data, isLoading, error, refresh };
}
