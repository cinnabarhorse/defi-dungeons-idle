'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from './SessionProvider';
import { useProgression } from '../../hooks/useProgression';
import { useKillStreak } from '../../hooks/useKillStreak';
import { usePlayerStream } from '../../hooks/usePlayerStream';
import { getAppServerBaseUrl } from '../../lib/server-url';
import { fetchDedupe } from '../../lib/fetch-dedupe';
import type {
  AudioSettings,
  PlayerPreferencesSnapshot,
} from '../../types/preferences';
import { useEquipment } from '../../hooks/useEquipment';
import { useInventory } from '../../hooks/useInventory';
import { useGotchiSprites } from '../../hooks/useGotchiSprites';

interface PlayerContextValue {
  // Preferences
  preferenceDefaults: PlayerPreferencesSnapshot;
  effectivePreferences: PlayerPreferencesSnapshot;
  arePreferencesHydrated: boolean;
  isAuthorized: boolean;
  isProgressionHydrated: ReturnType<typeof useProgression>['isHydrated'];
  unlockCharacter: ReturnType<typeof useProgression>['unlockCharacter'];
  updatePlayerPreferences: (
    patch: Partial<PlayerPreferencesSnapshot> & {
      audioSettings?: Partial<AudioSettings>;
    }
  ) => Promise<boolean>;

  // Progression
  progressionProfile: ReturnType<typeof useProgression>['profile'];
  progressionLevelProgress: ReturnType<typeof useProgression>['levelProgress'];
  rebirthCount: ReturnType<typeof useProgression>['rebirthCount'];
  currentMaxLevel: ReturnType<typeof useProgression>['currentMaxLevel'];
  absoluteMaxLevel: ReturnType<typeof useProgression>['absoluteMaxLevel'];
  rebirthCost: ReturnType<typeof useProgression>['rebirthCost'];
  unlockedDifficultyTiers: ReturnType<typeof useProgression>['unlockedTiers'];
  unlockedCharacters: ReturnType<typeof useProgression>['unlockedCharacters'];
  lickTongueCount: ReturnType<typeof useProgression>['lickTongueCount'];
  stakedUsdcBalance: ReturnType<typeof useProgression>['stakedUsdcBalance'];
  stakedGhstBalance: ReturnType<typeof useProgression>['stakedGhstBalance'];
  accessibleDifficultyTiers: ReturnType<
    typeof useProgression
  >['accessibleDifficultyTiers'];

  applyServerProfile: ReturnType<typeof useProgression>['applyServerProfile'];
  applyServerXpAward: ReturnType<typeof useProgression>['applyServerXpAward'];
  applyServerLevelLoss: ReturnType<
    typeof useProgression
  >['applyServerLevelLoss'];
  updateProgressionProfile: ReturnType<typeof useProgression>['updateProfile'];
  saveProgressionProfile: ReturnType<typeof useProgression>['saveProfile'];
  resetProgressionProfile: ReturnType<typeof useProgression>['resetProfile'];
  deallocateAllStats: ReturnType<typeof useProgression>['deallocateAll'];
  purchaseRebirth: ReturnType<typeof useProgression>['purchaseRebirth'];
  refreshProgression: ReturnType<typeof useProgression>['refresh'];
  killStreakState: ReturnType<typeof useKillStreak>['state'];
  isKillStreakHydrated: ReturnType<typeof useKillStreak>['isHydrated'];
  applyKillStreakProfile: ReturnType<typeof useKillStreak>['applyProfile'];
  applyKillStreakUpdate: ReturnType<typeof useKillStreak>['applyUpdate'];
  applyKillStreakReset: ReturnType<typeof useKillStreak>['applyReset'];

  // Equipment
  equipment: ReturnType<typeof useEquipment>;

  // Inventory
  inventory: ReturnType<typeof useInventory>;

  // Gotchi Sprites
  gotchiSprites: ReturnType<typeof useGotchiSprites> & {
    byId: Record<
      number,
      ReturnType<typeof useGotchiSprites>['entries'][number]
    >;
  };
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 70,
  sfxVolume: 80,
  musicVolume: 60,
  muted: false,
};

const DEFAULT_PREF_SNAPSHOT: PlayerPreferencesSnapshot = {
  selectedCharacterId: 'coderdan',
  selectedDifficultyTier: 'normal',
  gotchiSpriteUrl: null,
  avatarId: null,
  audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
};

export function PlayerProvider({ children }: { children: ReactNode }) {
  const {
    hasValidSession,
    isSessionVerified,
    playerId,
    walletAddress,
  } = useSession();

  const canLoadPlayerData = Boolean(hasValidSession && isSessionVerified);
  const scopedPlayerId = canLoadPlayerData ? playerId : null;

  const [effectivePreferences, setEffectivePreferences] =
    useState<PlayerPreferencesSnapshot>({ ...DEFAULT_PREF_SNAPSHOT });
  const [preferenceDefaults, setPreferenceDefaults] =
    useState<PlayerPreferencesSnapshot>({ ...DEFAULT_PREF_SNAPSHOT });
  const [arePreferencesHydrated, setArePreferencesHydrated] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const baseUrl = useMemo(() => getAppServerBaseUrl(), []);
  const preferencesEndpoint = useMemo(
    () => `${baseUrl}/api/player/preferences`,
    [baseUrl]
  );
  const characterSelectEndpoint = useMemo(
    () => `${baseUrl}/api/player/character/select`,
    [baseUrl]
  );

  const {
    profile: progressionProfile,
    levelProgress: progressionLevelProgress,
    isHydrated: isProgressionHydrated,
    rebirthCount,
    currentMaxLevel,
    absoluteMaxLevel,
    rebirthCost,
    applyServerProfile,
    applyServerXpAward,
    applyServerLevelLoss,
    updateProfile: updateProgressionProfile,
    saveProfile: saveProgressionProfile,
    resetProfile: resetProgressionProfile,
    deallocateAll: deallocateAllStats,
    purchaseRebirth,
    unlockedTiers: unlockedDifficultyTiers,
    unlockedCharacters,
    lickTongueCount,
    stakedUsdcBalance,
    stakedGhstBalance,
    accessibleDifficultyTiers,
    refresh: refreshProgression,
    unlockCharacter,
  } = useProgression(scopedPlayerId, { skipInitialFetch: true });
  const {
    state: killStreakState,
    isHydrated: isKillStreakHydrated,
    applyProfile: applyKillStreakProfile,
    applyUpdate: applyKillStreakUpdate,
    applyReset: applyKillStreakReset,
    reset: resetKillStreakState,
  } = useKillStreak();

  const equipment = useEquipment(
    scopedPlayerId,
    hasValidSession && isSessionVerified
  );
  const inventory = useInventory(
    scopedPlayerId,
    hasValidSession && isSessionVerified
  );
  const gotchiSpritesRaw = useGotchiSprites(isAuthorized, baseUrl);
  const gotchiSprites = useMemo(
    () => ({
      ...gotchiSpritesRaw,
      byId: gotchiSpritesRaw.entries.reduce(
        (acc, entry) => {
          acc[entry.id] = entry;
          return acc;
        },
        {} as Record<number, (typeof gotchiSpritesRaw.entries)[number]>
      ),
    }),
    [gotchiSpritesRaw]
  );

  const updatePlayerPreferences = useCallback(
    async (
      patch: Partial<PlayerPreferencesSnapshot> & {
        audioSettings?: Partial<AudioSettings>;
      }
    ) => {
      if (!scopedPlayerId) return false;
      const hasCharacterUpdate = Object.prototype.hasOwnProperty.call(
        patch,
        'selectedCharacterId'
      );
      const hasSpriteUpdate = Object.prototype.hasOwnProperty.call(
        patch,
        'gotchiSpriteUrl'
      );

      const characterValue = hasCharacterUpdate
        ? (patch.selectedCharacterId ?? null)
        : undefined;

      if (hasCharacterUpdate && characterValue !== null) {
        const payload: Record<string, unknown> = {
          characterId: characterValue,
        };
        if (hasSpriteUpdate)
          payload.gotchiSpriteUrl = patch.gotchiSpriteUrl ?? null;

        try {
          const res = await fetch(characterSelectEndpoint, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) return false;
          const data = await res.json();
          const nextDefaults = {
            ...DEFAULT_PREF_SNAPSHOT,
            ...(data?.defaults || {}),
          } as PlayerPreferencesSnapshot;
          const nextEffective = {
            ...nextDefaults,
            ...(data?.effective || {}),
          } as PlayerPreferencesSnapshot;
          setPreferenceDefaults(nextDefaults);
          setEffectivePreferences(nextEffective);
          setArePreferencesHydrated(true);
          if (Array.isArray(data?.unlockedCharacters)) {
            void refreshProgression({
              unlockedCharacters: data.unlockedCharacters,
            });
          }
          return true;
        } catch {
          return false;
        }
      }

      const payload: Record<string, unknown> = {};
      if (hasCharacterUpdate) payload.selectedCharacterId = null;
      if (Object.prototype.hasOwnProperty.call(patch, 'selectedDifficultyTier'))
        payload.selectedDifficultyTier = patch.selectedDifficultyTier ?? null;
      if (hasSpriteUpdate)
        payload.gotchiSpriteUrl = patch.gotchiSpriteUrl ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, 'avatarId'))
        payload.avatarId = patch.avatarId ?? null;
      if (Object.prototype.hasOwnProperty.call(patch, 'audioSettings'))
        payload.audioSettings = { ...(patch.audioSettings ?? {}) };

      if (Object.keys(payload).length === 0) return true;
      try {
        const res = await fetch(preferencesEndpoint, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) return false;
        const data = await res.json();
        const nextDefaults = {
          ...DEFAULT_PREF_SNAPSHOT,
          ...(data?.defaults || {}),
        } as PlayerPreferencesSnapshot;
        const nextEffective = {
          ...nextDefaults,
          ...(data?.effective || {}),
        } as PlayerPreferencesSnapshot;
        setPreferenceDefaults(nextDefaults);
        setEffectivePreferences(nextEffective);
        setArePreferencesHydrated(true);
        if (Array.isArray(data?.unlockedCharacters)) {
          void refreshProgression({
            unlockedCharacters: data.unlockedCharacters,
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [
      characterSelectEndpoint,
      preferencesEndpoint,
      refreshProgression,
      scopedPlayerId,
    ]
  );

  // Central player data bootstrap and refresh
  usePlayerStream(
    scopedPlayerId,
    walletAddress,
    async () => {
      if (!hasValidSession || !isSessionVerified) {
        return;
      }

      try {
        const endpoint = `${baseUrl}/api/player`;
        const res = await fetchDedupe(endpoint, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const payload = await res.json();

        setIsAuthorized(Boolean(payload?.isAuthorized));

        const nextDefaults = {
          ...DEFAULT_PREF_SNAPSHOT,
          ...(payload?.defaults || {}),
        } as PlayerPreferencesSnapshot;
        const nextEffective = {
          ...nextDefaults,
          ...(payload?.effective || {}),
        } as PlayerPreferencesSnapshot;
        setPreferenceDefaults(nextDefaults);
        setEffectivePreferences(nextEffective);
        setArePreferencesHydrated(true);

        // Apply progression from payload, respecting in-run stale checks
        if (payload?.profile) {
          await refreshProgression(payload);
        }

      } catch {
        // ignore
      }
    },
    hasValidSession && isSessionVerified,
    scopedPlayerId
  );

  // Ensure preferences clear when session absent
  useEffect(() => {
    if (!scopedPlayerId || !isSessionVerified) {
      setPreferenceDefaults({ ...DEFAULT_PREF_SNAPSHOT });
      setEffectivePreferences({ ...DEFAULT_PREF_SNAPSHOT });
      setArePreferencesHydrated(false);
      setIsAuthorized(false);
      resetKillStreakState();
    }
  }, [scopedPlayerId, isSessionVerified, resetKillStreakState]);

  const value: PlayerContextValue = useMemo(
    () => ({
      preferenceDefaults,
      effectivePreferences,
      arePreferencesHydrated,
      isAuthorized,
      isProgressionHydrated,
      unlockCharacter,
      updatePlayerPreferences,
      progressionProfile,
      progressionLevelProgress,
      rebirthCount,
      currentMaxLevel,
      absoluteMaxLevel,
      rebirthCost,
      unlockedDifficultyTiers,
      unlockedCharacters,
      lickTongueCount,
      stakedUsdcBalance,
      stakedGhstBalance,
      accessibleDifficultyTiers,
      applyServerProfile,
      applyServerXpAward,
      applyServerLevelLoss,
      updateProgressionProfile,
      saveProgressionProfile,
      resetProgressionProfile,
      deallocateAllStats,
      purchaseRebirth,
      refreshProgression,
      killStreakState,
      isKillStreakHydrated,
      applyKillStreakProfile,
      applyKillStreakUpdate,
      applyKillStreakReset,

      equipment,
      inventory,
      gotchiSprites,
    }),
    [
      preferenceDefaults,
      effectivePreferences,
      arePreferencesHydrated,
      isAuthorized,
      isProgressionHydrated,
      unlockCharacter,
      updatePlayerPreferences,
      progressionProfile,
      progressionLevelProgress,
      rebirthCount,
      currentMaxLevel,
      absoluteMaxLevel,
      rebirthCost,
      unlockedDifficultyTiers,
      unlockedCharacters,
      lickTongueCount,
      stakedUsdcBalance,
      stakedGhstBalance,
      accessibleDifficultyTiers,
      applyServerProfile,
      applyServerXpAward,
      applyServerLevelLoss,
      updateProgressionProfile,
      saveProgressionProfile,
      resetProgressionProfile,
      deallocateAllStats,
      purchaseRebirth,
      refreshProgression,
      killStreakState,
      isKillStreakHydrated,
      applyKillStreakProfile,
      applyKillStreakUpdate,
      applyKillStreakReset,
      equipment,
      inventory,
      gotchiSprites,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return ctx;
}
