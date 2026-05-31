'use client';

import { useCallback, useMemo, useState } from 'react';
import type {
  KillStreakProfileMessage,
  KillStreakResetMessage,
  KillStreakUpdatedMessage,
} from '../types/kill-streak';

export interface KillStreakState {
  units: number;
  archetypeId: string | null;
  isActive: boolean;
  lastUpdateAt: number;
}

export interface UseKillStreakResult {
  state: KillStreakState;
  isHydrated: boolean;
  applyProfile: (message: KillStreakProfileMessage) => void;
  applyUpdate: (message: KillStreakUpdatedMessage) => void;
  applyReset: (message: KillStreakResetMessage) => void;
  reset: () => void;
}

const DEFAULT_STATE: KillStreakState = {
  units: 0,
  archetypeId: null,
  isActive: false,
  lastUpdateAt: 0,
};

const __DEV__ = process.env.NODE_ENV !== 'production';
// Mirror server-side cap to prevent UI desync
const STREAK_UNIT_CAP = 9999;

function normalizeUnits(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const floored = Math.floor(parsed);
  if (floored <= 0) return 0;
  return Math.min(STREAK_UNIT_CAP, Math.max(0, floored));
}

function buildStateFromMessage(
  message: KillStreakProfileMessage,
  previous: KillStreakState | null = null
): KillStreakState {
  // Prefer server timestamp when available to avoid applying stale updates
  const rawUpdatedAt = (message as any)?.updatedAt;
  const updatedAt =
    typeof rawUpdatedAt === 'number' && Number.isFinite(rawUpdatedAt)
      ? rawUpdatedAt
      : null;

  if (previous && updatedAt != null && updatedAt < previous.lastUpdateAt) {
    if (__DEV__) {
      // Optional warning in development to surface invalid payloads
      // eslint-disable-next-line no-console
      console.warn('[KillStreak] Dropped stale update', {
        updatedAt,
        prevLastUpdateAt: previous.lastUpdateAt,
        message,
      });
    }
    return previous;
  }

  const rawUnits = (message as any)?.units;
  const parsedUnits = Number(rawUnits);
  if (!Number.isFinite(parsedUnits) || parsedUnits < 0) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[KillStreak] Dropped invalid update (units)', {
        units: rawUnits,
        message,
      });
    }
    return previous ?? DEFAULT_STATE;
  }

  const units = normalizeUnits(parsedUnits);
  const archetypeId =
    typeof message.archetypeId === 'string'
      ? message.archetypeId
      : (previous?.archetypeId ?? null);

  return {
    units,
    archetypeId,
    isActive: units > 0 && !!archetypeId,
    lastUpdateAt: updatedAt ?? Date.now(),
  };
}

export function useKillStreak(): UseKillStreakResult {
  const [state, setState] = useState<KillStreakState>(DEFAULT_STATE);
  const [isHydrated, setIsHydrated] = useState(false);

  const applyProfile = useCallback((message: KillStreakProfileMessage) => {
    if (!message) return;
    setState((prev) => buildStateFromMessage(message, prev));
    setIsHydrated(true);
  }, []);

  const applyUpdate = useCallback((message: KillStreakUpdatedMessage) => {
    if (!message) return;
    setState((prev) => buildStateFromMessage(message, prev));
    setIsHydrated(true);
  }, []);

  const applyReset = useCallback((message: KillStreakResetMessage) => {
    setState((prev) => ({
      ...DEFAULT_STATE,
      archetypeId: prev.archetypeId,
      lastUpdateAt: Date.now(),
    }));
    setIsHydrated(true);
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
    setIsHydrated(false);
  }, []);

  const memoizedState = useMemo(() => state, [state]);

  return useMemo(
    () => ({
      state: memoizedState,
      isHydrated,
      applyProfile,
      applyUpdate,
      applyReset,
      reset,
    }),
    [memoizedState, isHydrated, applyProfile, applyUpdate, applyReset, reset]
  );
}
