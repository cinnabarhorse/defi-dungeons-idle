'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../components/providers/SessionProvider';
import { getSupabaseBrowserClient } from '../lib/supabase-client';
import type { TopupRecord } from '../types/topup';
import { mapDepositToTopupRecord } from '../lib/topup/mappers';
import { fetchDeposits as fetchDepositsApi } from '../lib/topup/api';

interface FetchOptions {
  silent?: boolean;
}

interface UseTopupDepositsResult {
  records: TopupRecord[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasSession: boolean;
}

const REFRESH_DELAY_MS = 150;

export function useTopupDeposits(): UseTopupDepositsResult {
  const { hasValidSession, playerId, walletAddress } = useSession();
  const [records, setRecords] = useState<TopupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(() => hasValidSession);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadDeposits = useCallback(
    async (options: FetchOptions = {}) => {
      if (!hasValidSession) {
        abortRef.current?.abort();
        abortRef.current = null;
        setRecords([]);
        setError(null);
        setIsLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options.silent) {
        setIsLoading(true);
      }

      try {
        const list = await fetchDepositsApi(controller.signal);
        setRecords(list.map(mapDepositToTopupRecord));
        setError(null);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          return;
        }
        setError('Failed to load deposits');
      } finally {
        if (!options.silent) {
          setIsLoading(false);
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [hasValidSession]
  );

  useEffect(() => {
    if (!hasValidSession) {
      setRecords([]);
      setError(null);
      setIsLoading(false);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    let active = true;
    let refreshTimeout: number | null = null;

    const schedule = (delay: number, silent: boolean) => {
      if (!active) return;
      if (typeof window === 'undefined') {
        loadDeposits({ silent }).catch(() => {});
        return;
      }
      if (refreshTimeout != null) return;
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        loadDeposits({ silent }).catch(() => {});
      }, delay);
    };

    loadDeposits({ silent: false }).catch(() => {});

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return () => {
        active = false;
        if (refreshTimeout != null) {
          if (typeof window !== 'undefined') {
            window.clearTimeout(refreshTimeout);
          }
        }
      };
    }

    const normalizedAddress = walletAddress?.toLowerCase() ?? null;
    const filter = playerId
      ? `user_id=eq.${playerId}`
      : normalizedAddress
        ? `depositor_address=eq.${normalizedAddress}`
        : null;

    if (!filter) {
      return () => {
        active = false;
        if (refreshTimeout != null && typeof window !== 'undefined') {
          window.clearTimeout(refreshTimeout);
        }
      };
    }

    const channelName = `deposits-${playerId ?? normalizedAddress}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposits',
          filter,
        },
        () => schedule(REFRESH_DELAY_MS, true)
      );

    try {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          schedule(REFRESH_DELAY_MS, true);
        }
      });
    } catch {
      // ignore subscription errors; we'll rely on manual refresh
    }

    return () => {
      active = false;
      if (refreshTimeout != null && typeof window !== 'undefined') {
        window.clearTimeout(refreshTimeout);
      }
      abortRef.current?.abort();
      abortRef.current = null;
      try {
        channel.unsubscribe().catch(() => {});
        supabase.removeChannel(channel);
      } catch {
        // ignore errors during cleanup
      }
    };
  }, [loadDeposits, hasValidSession, playerId, walletAddress]);

  const refresh = useCallback(async () => {
    await loadDeposits({ silent: false });
  }, [loadDeposits]);

  return {
    records,
    isLoading,
    error,
    refresh,
    hasSession: hasValidSession,
  };
}
