'use client';

import { useEffect, useRef } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-client';

export function usePlayerStream(
  playerId: string | null | undefined,
  walletAddress: string | null | undefined,
  onPlayersRowChange: () => void,
  shouldHydrateInitial: boolean,
  reloadKey?: string | number | boolean | null
) {
  const onChangeRef = useRef(onPlayersRowChange);
  onChangeRef.current = onPlayersRowChange;

  useEffect(() => {
    // Prevent tight feedback loops (DB change -> fetch -> DB touch -> change...)
    // and generally reduce spam when a single action triggers many DB writes.
    const MIN_REFRESH_INTERVAL_MS = 5_000;

    if (shouldHydrateInitial) {
      // Perform an initial hydrate only when session is valid.
      // This avoids spamming unauthenticated requests.
      (async () => {
        try {
          await Promise.resolve(onChangeRef.current());
        } catch {
          // ignore errors; we'll still attempt to subscribe when possible
        }
      })();
    }

    if (!playerId) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // Supabase not configured in this environment; skip live subscription
      // after the initial hydrate above.
      return;
    }

    let refreshTimeout: number | null = null;
    let active = true;
    let channel: any | null = null;
    let lastRefreshAt = 0;

    const schedule = () => {
      if (!active) return;
      if (typeof window === 'undefined') {
        onChangeRef.current();
        return;
      }
      const now = Date.now();
      const elapsed = now - lastRefreshAt;
      const delay = Math.max(0, MIN_REFRESH_INTERVAL_MS - elapsed);
      if (refreshTimeout != null) return;
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        lastRefreshAt = Date.now();
        onChangeRef.current();
      }, delay);
    };

    (async () => {
      if (!active) return;

    // Subscribe to live updates
      channel = supabase.channel(`players-${playerId}`);

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `id=eq.${playerId}`,
        },
        () => schedule()
      );

      if (walletAddress) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'deposits',
            filter: `depositor_address=eq.${walletAddress.toLowerCase()}`,
          },
          () => schedule()
        );
      }

      try {
        channel.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') schedule();
        });
      } catch {
        // ignore
      }
    })();

    return () => {
      active = false;
      if (refreshTimeout != null) {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }
      if (channel) {
        channel.unsubscribe().catch(() => {});
        supabase.removeChannel(channel);
      }
    };
  }, [playerId, walletAddress, reloadKey, shouldHydrateInitial]);
}
