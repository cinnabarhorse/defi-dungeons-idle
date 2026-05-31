'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cloneProfile,
  createDefaultProfile,
  getLevelProgress,
  sanitizeProfile,
  type LevelProgress,
  type ProgressionProfile,
} from '../lib/progression';
import { getAppServerBaseUrl } from '../lib/server-url';
import { TOPUP_DEPOSIT_CREDITED_EVENT } from '../lib/topup/events';
import type {
  ProgressionLevelLostMessage,
  ProgressionProfileMessage,
  ProgressionXpAwardMessage,
} from '../types/progression';

export interface UseProgressionResult {
  profile: ProgressionProfile;
  levelProgress: LevelProgress;
  isHydrated: boolean;
  profileVersion: number;
  profileId: string;
  rebirthCount: number;
  currentMaxLevel: number;
  absoluteMaxLevel: number;
  rebirthCost: number;
  unlockedTiers: string[];
  lickTongueCount: number;
  stakedUsdcBalance: number;
  stakedGhstBalance: number;
  accessibleDifficultyTiers: string[];
  unlockedCharacters: string[];
  refresh: (payload?: any) => Promise<void>;
  applyServerProfile: (message: ProgressionProfileMessage) => void;
  applyServerXpAward: (message: ProgressionXpAwardMessage) => void;
  applyServerLevelLoss: (message: ProgressionLevelLostMessage) => void;
  updateProfile: (
    updater: (current: ProgressionProfile) => ProgressionProfile
  ) => void;
  saveProfile: (
    profile: ProgressionProfile
  ) => Promise<ProgressionProfile | null>;
  resetProfile: () => Promise<ProgressionProfile | null>;
  deallocateAll: () => Promise<ProgressionProfile | null>;
  purchaseRebirth: () => Promise<ProgressionProfile>;
  unlockCharacter: (
    characterId: string
  ) => Promise<{
    unlockedCharacters: string[];
    lickTongueCount: number;
    selectedCharacterId: string | null;
  }>;
}

export function useProgression(
  playerId: string | null | undefined,
  options?: { skipInitialFetch?: boolean }
): UseProgressionResult {
  const [profile, setProfile] = useState<ProgressionProfile>(
    createDefaultProfile()
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [profileVersion, setProfileVersion] = useState(0);
  const [rebirthCount, setRebirthCount] = useState(0);
  const [currentMaxLevel, setCurrentMaxLevel] = useState(99);
  const [absoluteMaxLevel, setAbsoluteMaxLevel] = useState(199);
  const [rebirthCost, setRebirthCost] = useState(1000);
  const [unlockedTiers, setUnlockedTiers] = useState<string[]>(['normal']);
  const [lickTongueCount, setLickTongueCount] = useState(0);
  const [stakedUsdcBalance, setStakedUsdcBalance] = useState(0);
  const [stakedGhstBalance, setStakedGhstBalance] = useState(0);
  const [accessibleDifficultyTiers, setAccessibleDifficultyTiers] = useState<
    string[]
  >(['normal']);
  const [unlockedCharacters, setUnlockedCharacters] = useState<string[]>([]);
  const resolvedId = playerId ?? 'guest';
  const baseUrl = useMemo(() => getAppServerBaseUrl(), []);

  const progressionEndpoint = useMemo(() => {
    return baseUrl ? `${baseUrl}/api/player` : '/api/player';
  }, [baseUrl]);

  const progressionAllocateEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/progression/allocate`
      : '/api/player/progression/allocate';
  }, [baseUrl]);

  const progressionResetEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/progression/reset`
      : '/api/player/progression/reset';
  }, [baseUrl]);

  const progressionDeallocateEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/progression/deallocate`
      : '/api/player/progression/deallocate';
  }, [baseUrl]);

  const progressionRebirthEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/progression/rebirth`
      : '/api/player/progression/rebirth';
  }, [baseUrl]);

  const stakedBalanceEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/staked-balance`
      : '/api/player/staked-balance';
  }, [baseUrl]);

  const characterUnlockEndpoint = useMemo(() => {
    return baseUrl
      ? `${baseUrl}/api/player/unlocks/character`
      : '/api/player/unlocks/character';
  }, [baseUrl]);

  const applyRebirthMeta = useCallback((payload: any) => {
    const parsedRebirthCount = Number(payload?.rebirthCount);
    if (Number.isFinite(parsedRebirthCount)) {
      setRebirthCount(Math.max(0, Math.floor(parsedRebirthCount)));
    }

    const parsedCurrentMax = Number(payload?.currentMaxLevel);
    if (Number.isFinite(parsedCurrentMax)) {
      setCurrentMaxLevel(Math.max(1, Math.floor(parsedCurrentMax)));
    }

    const parsedAbsoluteMax = Number(payload?.absoluteMaxLevel);
    if (Number.isFinite(parsedAbsoluteMax)) {
      setAbsoluteMaxLevel(Math.max(1, Math.floor(parsedAbsoluteMax)));
    }

    const parsedRebirthCost = Number(payload?.rebirthCost);
    if (Number.isFinite(parsedRebirthCost)) {
      setRebirthCost(Math.max(0, Math.floor(parsedRebirthCost)));
    }
  }, []);

  const fetchStakedBalance = useCallback(async () => {
    if (!playerId) {
      setStakedUsdcBalance(0);
      setStakedGhstBalance(0);
      setAccessibleDifficultyTiers(['normal']);
      return;
    }

    try {
      const response = await fetch(stakedBalanceEndpoint, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        setStakedUsdcBalance(0);
        setStakedGhstBalance(0);
        setAccessibleDifficultyTiers(['normal']);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      const usdc = Number(payload?.usdc) || 0;
      const gho = Number(payload?.gho) || 0;
      const ghst = Number(payload?.ghst) || 0;
      const total = Number(payload?.total);
      const stakedBalance = Number.isFinite(total) ? total : usdc + gho;
      setStakedUsdcBalance(stakedBalance);
      setStakedGhstBalance(ghst);
      const accessible = Array.isArray(payload?.accessibleTiers)
        ? (payload.accessibleTiers as string[])
        : [];
      setAccessibleDifficultyTiers(
        accessible.length > 0 ? accessible : ['normal']
      );
    } catch (error) {
      console.warn('Failed to load staked balance', error);
      setStakedUsdcBalance(0);
      setStakedGhstBalance(0);
      setAccessibleDifficultyTiers(['normal']);
    }
  }, [playerId, stakedBalanceEndpoint]);

  const hydrateFromServer = useCallback(async () => {
    if (!playerId) {
      setProfile(createDefaultProfile());
      setIsHydrated(false);
      setRebirthCount(0);
      setCurrentMaxLevel(99);
      setAbsoluteMaxLevel(199);
      setRebirthCost(1000);
      setUnlockedTiers(['normal']);
      setLickTongueCount(0);
      setStakedUsdcBalance(0);
      setStakedGhstBalance(0);
      setAccessibleDifficultyTiers(['normal']);
      setUnlockedCharacters([]);
      return;
    }

    try {
      const [progressionResult, stakedResult] = await Promise.allSettled([
        fetch(progressionEndpoint, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch(stakedBalanceEndpoint, {
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);

      if (
        progressionResult.status === 'fulfilled' &&
        progressionResult.value.ok
      ) {
        const payload = await progressionResult.value.json();
        if (payload?.profile) {
          const parsedCurrentMax = Number(payload?.currentMaxLevel);
          const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
            ? Math.max(1, Math.floor(parsedCurrentMax))
            : currentMaxLevel;
          const sanitized = sanitizeProfile(payload.profile, effectiveMaxLevel);
          setProfile(sanitized);
          setProfileVersion((v) => v + 1);
          applyRebirthMeta(payload);
          const unlocked =
            Array.isArray(payload.unlockedTiers) &&
            payload.unlockedTiers.length > 0
              ? (payload.unlockedTiers as string[])
              : ['normal'];
          setUnlockedTiers(unlocked);
          setLickTongueCount(Number(payload.lickTongueCount) || 0);
          const unlockedChars =
            Array.isArray(payload.unlockedCharacters)
              ? (payload.unlockedCharacters as string[])
              : [];
          setUnlockedCharacters(unlockedChars);
        }
      }

      if (stakedResult.status === 'fulfilled' && stakedResult.value.ok) {
        const payload = await stakedResult.value.json().catch(() => ({}));
        const usdc = Number(payload?.usdc) || 0;
        const gho = Number(payload?.gho) || 0;
        const ghst = Number(payload?.ghst) || 0;
        const total = Number(payload?.total);
        const stakedBalance = Number.isFinite(total) ? total : usdc + gho;
        setStakedUsdcBalance(stakedBalance);
        setStakedGhstBalance(ghst);
        const accessible = Array.isArray(payload?.accessibleTiers)
          ? (payload.accessibleTiers as string[])
          : [];
        setAccessibleDifficultyTiers(
          accessible.length > 0 ? accessible : ['normal']
        );
      } else {
        setStakedUsdcBalance(0);
        setStakedGhstBalance(0);
        setAccessibleDifficultyTiers(['normal']);
      }
    } catch (error) {
      console.warn('Failed to load progression from server', error);
    } finally {
      setIsHydrated(true);
    }
  }, [
    applyRebirthMeta,
    currentMaxLevel,
    playerId,
    progressionEndpoint,
    stakedBalanceEndpoint,
  ]);

  useEffect(() => {
    if (!playerId) {
      setProfile(createDefaultProfile());
      setIsHydrated(false);
      setRebirthCount(0);
      setCurrentMaxLevel(99);
      setAbsoluteMaxLevel(199);
      setRebirthCost(1000);
      setUnlockedTiers(['normal']);
      setLickTongueCount(0);
      setStakedUsdcBalance(0);
      setStakedGhstBalance(0);
      setAccessibleDifficultyTiers(['normal']);
      setUnlockedCharacters([]);
      return;
    }
    if (!options?.skipInitialFetch) {
      setIsHydrated(false);
      void hydrateFromServer();
    }
  }, [playerId, hydrateFromServer, options?.skipInitialFetch]);

  useEffect(() => {
    if (!playerId || typeof window === 'undefined') return;

    const retryDelaysMs = [2000, 6000];
    const retryTimeoutIds = new Set<number>();

    const clearRetryTimeouts = () => {
      retryTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      retryTimeoutIds.clear();
    };

    const refreshStakedBalanceWithRetries = () => {
      clearRetryTimeouts();
      void fetchStakedBalance();
      for (const delayMs of retryDelaysMs) {
        const timeoutId = window.setTimeout(() => {
          retryTimeoutIds.delete(timeoutId);
          void fetchStakedBalance();
        }, delayMs);
        retryTimeoutIds.add(timeoutId);
      }
    };

    const handleTopupCredited = () => {
      refreshStakedBalanceWithRetries();
    };

    window.addEventListener(TOPUP_DEPOSIT_CREDITED_EVENT, handleTopupCredited);
    return () => {
      window.removeEventListener(
        TOPUP_DEPOSIT_CREDITED_EVENT,
        handleTopupCredited
      );
      clearRetryTimeouts();
    };
  }, [playerId, fetchStakedBalance]);

  // Expose explicit refresh; outer components can drive centralized updates
  const refresh = useCallback(
    async (payload?: any) => {
      if (payload && typeof payload === 'object') {
        try {
          const hasStakedPayload =
            payload.stakedUsdcBalance !== undefined ||
            payload.stakedGhstBalance !== undefined ||
            payload.usdc !== undefined ||
            payload.gho !== undefined ||
            payload.ghst !== undefined ||
            payload.total !== undefined ||
            Array.isArray(payload.accessibleTiers);
          const parsedCurrentMax = Number(payload?.currentMaxLevel);
          const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
            ? Math.max(1, Math.floor(parsedCurrentMax))
            : currentMaxLevel;
          if (payload.profile) {
            const sanitized = sanitizeProfile(payload.profile, effectiveMaxLevel);
            setProfile(sanitized);
            setProfileVersion((v) => v + 1);
          }
          applyRebirthMeta(payload);
          if (Array.isArray(payload.unlockedTiers)) {
            setUnlockedTiers(payload.unlockedTiers as string[]);
          }
          if (payload.lickTongueCount !== undefined) {
            setLickTongueCount(Number(payload.lickTongueCount) || 0);
          }
          if (payload.stakedUsdcBalance !== undefined) {
            setStakedUsdcBalance(Number(payload.stakedUsdcBalance) || 0);
          } else if (payload.total !== undefined) {
            setStakedUsdcBalance(Number(payload.total) || 0);
          } else if (payload.usdc !== undefined || payload.gho !== undefined) {
            const usdc = Number(payload.usdc) || 0;
            const gho = Number(payload.gho) || 0;
            setStakedUsdcBalance(usdc + gho);
          }
          if (payload.stakedGhstBalance !== undefined) {
            setStakedGhstBalance(Number(payload.stakedGhstBalance) || 0);
          } else if (payload.ghst !== undefined) {
            setStakedGhstBalance(Number(payload.ghst) || 0);
          }
          if (Array.isArray(payload.accessibleTiers)) {
            const accessible = payload.accessibleTiers as string[];
            setAccessibleDifficultyTiers(
              accessible.length > 0 ? accessible : ['normal']
            );
          }
          if (Array.isArray(payload.unlockedCharacters)) {
            setUnlockedCharacters(payload.unlockedCharacters as string[]);
          }
          setIsHydrated(true);
          if (!hasStakedPayload) {
            void fetchStakedBalance();
          }
          return;
        } catch {
          // fall through to fetch
        }
      }
      await hydrateFromServer();
    },
    [applyRebirthMeta, currentMaxLevel, fetchStakedBalance, hydrateFromServer]
  );

  const updateProfile = useCallback(
    (updater: (current: ProgressionProfile) => ProgressionProfile) => {
      setProfile((prev) => {
        const updated = sanitizeProfile(updater(prev), currentMaxLevel);
        return updated;
      });
      setProfileVersion((v) => v + 1);
    },
    [currentMaxLevel]
  );

  const applyServerProfile = useCallback(
    (message: ProgressionProfileMessage) => {
      const sanitized = sanitizeProfile(message.profile, currentMaxLevel);
      setProfile(sanitized);
      setProfileVersion((v) => v + 1);
    },
    [currentMaxLevel]
  );

  const applyServerXpAward = useCallback(
    (message: ProgressionXpAwardMessage) => {
      updateProfile((prev) => {
        const next = cloneProfile(prev);
        next.totalXp = Math.max(0, Math.floor(message.totalXp));
        next.level = Math.max(1, Math.floor(message.level));
        next.unspentPoints = Math.max(0, Math.floor(message.unspentPoints));
        if (message.stats) {
          next.stats = { ...message.stats };
        }
        if (Array.isArray(message.allocationHistory)) {
          next.allocationHistory = [...message.allocationHistory];
        }
        return next;
      });
    },
    [updateProfile]
  );

  const applyServerLevelLoss = useCallback(
    (message: ProgressionLevelLostMessage) => {
      updateProfile((prev) => {
        const next = cloneProfile(prev);
        next.totalXp = Math.max(0, Math.floor(message.totalXp));
        next.level = Math.max(1, Math.floor(message.level));
        next.unspentPoints = Math.max(0, Math.floor(message.unspentPoints));
        if (message.stats) {
          next.stats = { ...message.stats };
        }
        if (Array.isArray(message.allocationHistory)) {
          next.allocationHistory = [...message.allocationHistory];
        }
        return next;
      });
    },
    [updateProfile]
  );

  const levelProgress = useMemo(
    () => getLevelProgress(profile.totalXp, currentMaxLevel),
    [currentMaxLevel, profile]
  );

  const saveProfile = useCallback(
    async (nextProfile: ProgressionProfile) => {
      if (!playerId) {
        return null;
      }

      try {
        const response = await fetch(progressionAllocateEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            stats: nextProfile.stats,
            allocationHistory: nextProfile.allocationHistory,
          }),
        });

        if (!response.ok) {
          return null;
        }

        const payload = await response.json();
        const parsedCurrentMax = Number(payload?.currentMaxLevel);
        const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
          ? Math.max(1, Math.floor(parsedCurrentMax))
          : currentMaxLevel;
        const sanitized = payload?.profile
          ? sanitizeProfile(payload.profile, effectiveMaxLevel)
          : sanitizeProfile(nextProfile, effectiveMaxLevel);
        setProfile(sanitized);
        setProfileVersion((v) => v + 1);
        applyRebirthMeta(payload);
        if (
          Array.isArray(payload?.unlockedTiers) &&
          payload.unlockedTiers.length > 0
        ) {
          setUnlockedTiers(payload.unlockedTiers as string[]);
        }
        if (payload?.lickTongueCount !== undefined) {
          setLickTongueCount(Number(payload.lickTongueCount) || 0);
        }
        return sanitized;
      } catch (error) {
        console.warn('Failed to save progression profile', error);
        return null;
      }
    },
    [applyRebirthMeta, currentMaxLevel, playerId, progressionAllocateEndpoint]
  );

  const resetProfile = useCallback(async () => {
    if (!playerId) {
      return null;
    }
    try {
      const response = await fetch(progressionResetEndpoint, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      const parsedCurrentMax = Number(payload?.currentMaxLevel);
      const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
        ? Math.max(1, Math.floor(parsedCurrentMax))
        : currentMaxLevel;
      const sanitized = payload?.profile
        ? sanitizeProfile(payload.profile, effectiveMaxLevel)
        : createDefaultProfile();
      setProfile(sanitized);
      setProfileVersion((v) => v + 1);
      applyRebirthMeta(payload);
      if (
        Array.isArray(payload?.unlockedTiers) &&
        payload.unlockedTiers.length > 0
      ) {
        setUnlockedTiers(payload.unlockedTiers as string[]);
      }
      if (payload?.lickTongueCount !== undefined) {
        setLickTongueCount(Number(payload.lickTongueCount) || 0);
      }
      return sanitized;
    } catch (error) {
      console.warn('Failed to reset progression profile', error);
      return null;
    }
  }, [applyRebirthMeta, currentMaxLevel, playerId, progressionResetEndpoint]);

  const deallocateAll = useCallback(async () => {
    if (!playerId) {
      return null;
    }
    try {
      const response = await fetch(progressionDeallocateEndpoint, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      const parsedCurrentMax = Number(payload?.currentMaxLevel);
      const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
        ? Math.max(1, Math.floor(parsedCurrentMax))
        : currentMaxLevel;
      const sanitized = payload?.profile
        ? sanitizeProfile(payload.profile, effectiveMaxLevel)
        : createDefaultProfile();
      setProfile(sanitized);
      setProfileVersion((v) => v + 1);
      applyRebirthMeta(payload);
      if (
        Array.isArray(payload?.unlockedTiers) &&
        payload.unlockedTiers.length > 0
      ) {
        setUnlockedTiers(payload.unlockedTiers as string[]);
      }
      if (payload?.lickTongueCount !== undefined) {
        setLickTongueCount(Number(payload.lickTongueCount) || 0);
      }
      return sanitized;
    } catch (error) {
      console.warn('Failed to deallocate progression stats', error);
      return null;
    }
  }, [applyRebirthMeta, currentMaxLevel, playerId, progressionDeallocateEndpoint]);

  const purchaseRebirth = useCallback(async () => {
    if (!playerId) {
      const error = new Error('Player not linked to session');
      (error as any).status = 401;
      throw error;
    }

    try {
      const response = await fetch(progressionRebirthEndpoint, {
        method: 'POST',
        credentials: 'include',
      });

      const payload = await response
        .json()
        .catch(() => ({}) as Record<string, unknown>);

      if (!response.ok) {
        const error = new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Failed to complete rebirth'
        );
        (error as any).status = response.status;
        throw error;
      }

      const parsedCurrentMax = Number(payload?.currentMaxLevel);
      const effectiveMaxLevel = Number.isFinite(parsedCurrentMax)
        ? Math.max(1, Math.floor(parsedCurrentMax))
        : currentMaxLevel;
      const sanitized = payload?.profile
        ? sanitizeProfile(payload.profile, effectiveMaxLevel)
        : sanitizeProfile(createDefaultProfile(), effectiveMaxLevel);

      setProfile(sanitized);
      setProfileVersion((v) => v + 1);
      applyRebirthMeta(payload);
      if (
        Array.isArray(payload?.unlockedTiers) &&
        payload.unlockedTiers.length > 0
      ) {
        setUnlockedTiers(payload.unlockedTiers as string[]);
      }
      if (payload?.lickTongueCount !== undefined) {
        setLickTongueCount(Number(payload.lickTongueCount) || 0);
      }
      return sanitized;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to complete rebirth');
    }
  }, [
    applyRebirthMeta,
    currentMaxLevel,
    playerId,
    progressionRebirthEndpoint,
  ]);

  const unlockCharacter = useCallback(
    async (characterId: string) => {
      if (!playerId) {
        const error = new Error('Player not linked to session');
        (error as any).status = 401;
        throw error;
      }

      try {
        const response = await fetch(characterUnlockEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ characterId }),
        });

        const payload = await response
          .json()
          .catch(() => ({}) as Record<string, unknown>);

        if (Array.isArray(payload?.unlockedCharacters)) {
          setUnlockedCharacters(payload.unlockedCharacters as string[]);
        }
        if (payload?.lickTongueCount !== undefined) {
          setLickTongueCount(Number(payload.lickTongueCount) || 0);
        }

        if (!response.ok) {
          const error = new Error(
            typeof payload?.error === 'string'
              ? payload.error
              : 'Failed to unlock character'
          );
          (error as any).status = response.status;
          throw error;
        }

        return {
          unlockedCharacters: Array.isArray(payload?.unlockedCharacters)
            ? (payload.unlockedCharacters as string[])
            : [],
          lickTongueCount: Number(payload?.lickTongueCount) || 0,
          selectedCharacterId:
            typeof payload?.selectedCharacterId === 'string'
              ? (payload.selectedCharacterId as string)
              : null,
        };
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error('Failed to unlock character');
      }
    },
    [playerId, characterUnlockEndpoint]
  );

  return useMemo(
    () => ({
      profile,
      levelProgress,
      isHydrated,
      profileVersion,
      profileId: resolvedId,
      rebirthCount,
      currentMaxLevel,
      absoluteMaxLevel,
      rebirthCost,
      unlockedTiers,
      lickTongueCount,
      stakedUsdcBalance,
      stakedGhstBalance,
      accessibleDifficultyTiers,
      unlockedCharacters,
      refresh,
      applyServerProfile,
      applyServerXpAward,
      applyServerLevelLoss,
      updateProfile,
      saveProfile,
      resetProfile,
      deallocateAll,
      purchaseRebirth,
      unlockCharacter,
    }),
    [
      profile,
      levelProgress,
      isHydrated,
      profileVersion,
      resolvedId,
      rebirthCount,
      currentMaxLevel,
      absoluteMaxLevel,
      rebirthCost,
      unlockedTiers,
      lickTongueCount,
      stakedUsdcBalance,
      stakedGhstBalance,
      accessibleDifficultyTiers,
      unlockedCharacters,
      refresh,
      applyServerProfile,
      applyServerXpAward,
      applyServerLevelLoss,
      updateProfile,
      saveProfile,
      resetProfile,
      deallocateAll,
      purchaseRebirth,
      unlockCharacter,
    ]
  );
}
