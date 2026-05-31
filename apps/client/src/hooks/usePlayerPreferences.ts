import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaultCharacter } from '../lib/character-registry';
import type {
  AudioSettings,
  PlayerPreferencesSnapshot,
} from '../types/preferences';

interface PlayerPreferencesRecord {
  playerId: string;
  selectedCharacterId: string | null;
  selectedDifficultyTier: string | null;
  gotchiSpriteUrl: string | null;
  avatarId: string | null;
  audioSettings: AudioSettings;
  createdAt: string | null;
  updatedAt: string | null;
}

interface PreferencesResponsePayload {
  playerId?: string;
  preferences?: Partial<PlayerPreferencesRecord> & {
    playerId?: string;
  };
  effective?: Partial<PlayerPreferencesSnapshot>;
  defaults?: Partial<PlayerPreferencesSnapshot>;
}

const DEFAULT_CHARACTER_ID = getDefaultCharacter()?.id ?? 'coderdan';
const DEFAULT_DIFFICULTY_TIER = 'normal';

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 70,
  sfxVolume: 80,
  musicVolume: 60,
  muted: false,
};

const DEFAULT_SNAPSHOT: PlayerPreferencesSnapshot = {
  selectedCharacterId: DEFAULT_CHARACTER_ID,
  selectedDifficultyTier: DEFAULT_DIFFICULTY_TIER,
  gotchiSpriteUrl: null,
  avatarId: null,
  audioSettings: { ...DEFAULT_AUDIO_SETTINGS },
};

type HydrationStatus = 'idle' | 'hydrating' | 'hydrated';

const GUEST_PLAYER_KEY = 'guest';

const CACHE_NAMESPACE = 'dd-player-preferences';
const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedPayload {
  version: string;
  timestamp: number;
  payload: PreferencesResponsePayload;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn(
      'Local storage is unavailable for player preferences cache',
      error
    );
    return null;
  }
}

function getCacheKey(playerKey: string): string {
  return `${CACHE_NAMESPACE}:${CACHE_VERSION}:${playerKey}`;
}

function readCachedPayload(
  playerKey: string
): PreferencesResponsePayload | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getCacheKey(playerKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CachedPayload | null;
    if (!parsed || parsed.version !== CACHE_VERSION || !parsed.payload) {
      storage.removeItem(getCacheKey(playerKey));
      return null;
    }
    if (typeof parsed.timestamp !== 'number') {
      storage.removeItem(getCacheKey(playerKey));
      return null;
    }
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      storage.removeItem(getCacheKey(playerKey));
      return null;
    }
    return parsed.payload;
  } catch (error) {
    console.warn('Failed to read cached player preferences', error);
    return null;
  }
}

function persistCachedPayload(
  playerKey: string,
  payload: PreferencesResponsePayload
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    const record: CachedPayload = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      payload,
    };
    storage.setItem(getCacheKey(playerKey), JSON.stringify(record));
  } catch (error) {
    console.warn('Failed to cache player preferences', error);
  }
}

function removeCachedPayload(playerKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(getCacheKey(playerKey));
  } catch (error) {
    console.warn('Failed to remove cached player preferences', error);
  }
}

function getPlayerKey(playerId: string | null | undefined): string {
  return playerId ? `player:${playerId}` : GUEST_PLAYER_KEY;
}

function cloneSnapshot(
  snapshot: PlayerPreferencesSnapshot
): PlayerPreferencesSnapshot {
  return {
    selectedCharacterId: snapshot.selectedCharacterId,
    selectedDifficultyTier: snapshot.selectedDifficultyTier,
    gotchiSpriteUrl: snapshot.gotchiSpriteUrl,
    avatarId: snapshot.avatarId,
    audioSettings: { ...snapshot.audioSettings },
  };
}

function sanitizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAudioSettings(
  input: unknown,
  base: AudioSettings = DEFAULT_AUDIO_SETTINGS
): AudioSettings {
  const result: AudioSettings = { ...base };
  if (!input || typeof input !== 'object') {
    return result;
  }
  const data = input as Record<string, unknown>;
  const toNumber = (value: unknown, fallback: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return fallback;
  };
  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  if (Object.prototype.hasOwnProperty.call(data, 'masterVolume')) {
    result.masterVolume = clamp(
      toNumber(data.masterVolume, result.masterVolume)
    );
  }
  if (Object.prototype.hasOwnProperty.call(data, 'sfxVolume')) {
    result.sfxVolume = clamp(toNumber(data.sfxVolume, result.sfxVolume));
  }
  if (Object.prototype.hasOwnProperty.call(data, 'musicVolume')) {
    result.musicVolume = clamp(toNumber(data.musicVolume, result.musicVolume));
  }
  if (Object.prototype.hasOwnProperty.call(data, 'muted')) {
    const value = data.muted;
    if (typeof value === 'boolean') {
      result.muted = value;
    } else if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') result.muted = true;
      if (value.toLowerCase() === 'false') result.muted = false;
    }
  }

  return result;
}

function parseSnapshot(
  input: unknown,
  fallback: PlayerPreferencesSnapshot
): PlayerPreferencesSnapshot {
  if (!input || typeof input !== 'object') {
    return cloneSnapshot(fallback);
  }

  const data = input as Record<string, unknown>;
  const result = cloneSnapshot(fallback);

  const characterId = sanitizeString(data.selectedCharacterId);
  if (characterId) {
    result.selectedCharacterId = characterId;
  }

  const difficultyTier = sanitizeString(data.selectedDifficultyTier);
  if (difficultyTier) {
    result.selectedDifficultyTier = difficultyTier;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'gotchiSpriteUrl')) {
    const sprite = sanitizeString(data.gotchiSpriteUrl);
    result.gotchiSpriteUrl = sprite;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'avatarId')) {
    const avatar = sanitizeString(data.avatarId);
    result.avatarId = avatar;
  }

  result.audioSettings = sanitizeAudioSettings(
    (data as Record<string, unknown>).audioSettings,
    fallback.audioSettings
  );

  return result;
}

function parsePreferencesRecord(
  input: unknown,
  fallbackSnapshot: PlayerPreferencesSnapshot
): PlayerPreferencesRecord | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const data = input as Record<string, unknown>;
  const playerId = sanitizeString(data.playerId) ?? '';
  const selectedCharacterId = sanitizeString(data.selectedCharacterId);
  const selectedDifficultyTier = sanitizeString(data.selectedDifficultyTier);
  const gotchiSpriteUrl = sanitizeString(data.gotchiSpriteUrl);
  const avatarId = sanitizeString(data.avatarId);
  const audioSettings = sanitizeAudioSettings(
    data.audioSettings,
    fallbackSnapshot.audioSettings
  );

  return {
    playerId,
    selectedCharacterId,
    selectedDifficultyTier,
    gotchiSpriteUrl,
    avatarId,
    audioSettings,
    createdAt: sanitizeString(data.createdAt),
    updatedAt: sanitizeString(data.updatedAt),
  };
}

export interface UsePlayerPreferencesResult {
  preferences: PlayerPreferencesRecord | null;
  effectivePreferences: PlayerPreferencesSnapshot;
  defaults: PlayerPreferencesSnapshot;
  isHydrated: boolean;
  updatePreferences: (
    patch: Partial<PlayerPreferencesSnapshot> & {
      audioSettings?: Partial<AudioSettings>;
    }
  ) => Promise<boolean>;
  refresh: (payload?: PreferencesResponsePayload) => Promise<void>;
}

export function usePlayerPreferences(
  playerId: string | null | undefined,
  options?: { skipInitialFetch?: boolean }
): UsePlayerPreferencesResult {
  const [preferences, setPreferences] =
    useState<PlayerPreferencesRecord | null>(null);
  const [effectivePreferences, setEffectivePreferences] =
    useState<PlayerPreferencesSnapshot>(cloneSnapshot(DEFAULT_SNAPSHOT));
  const [defaults, setDefaults] = useState<PlayerPreferencesSnapshot>(
    cloneSnapshot(DEFAULT_SNAPSHOT)
  );
  const [hydrationState, setHydrationState] = useState<{
    status: HydrationStatus;
    playerKey: string;
  }>(() => ({
    status: 'idle',
    playerKey: getPlayerKey(playerId),
  }));

  const derivedPlayerKey = getPlayerKey(playerId);
  const latestPlayerKeyRef = useRef(derivedPlayerKey);
  latestPlayerKeyRef.current = derivedPlayerKey;
  const hasCacheHydratedRef = useRef(false);

  const baseUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/\/$/, ''),
    []
  );

  const endpoint = useMemo(() => {
    return baseUrl ? `${baseUrl}/api/player` : '/api/player';
  }, [baseUrl]);

  const applyPayload = useCallback(
    (
      payload: PreferencesResponsePayload | null | undefined,
      options?: { persist?: boolean; playerKey?: string }
    ) => {
      if (!payload) {
        return;
      }

      const defaultsSnapshot = parseSnapshot(
        payload.defaults,
        DEFAULT_SNAPSHOT
      );
      const effectiveSnapshot = parseSnapshot(
        payload.effective,
        defaultsSnapshot
      );
      const record = parsePreferencesRecord(
        payload.preferences,
        defaultsSnapshot
      );

      setDefaults(defaultsSnapshot);
      setEffectivePreferences(effectiveSnapshot);
      setPreferences(record);

      if (options?.persist && options.playerKey) {
        const persistable: PreferencesResponsePayload = {
          defaults: defaultsSnapshot,
          effective: effectiveSnapshot,
          preferences: record ?? undefined,
        };
        persistCachedPayload(options.playerKey, persistable);
      }
    },
    []
  );

  const hydrateFromServer = useCallback(async () => {
    const targetPlayerKey = getPlayerKey(playerId);

    if (!playerId) {
      setHydrationState({ status: 'hydrated', playerKey: targetPlayerKey });
      setPreferences(null);
      setDefaults(cloneSnapshot(DEFAULT_SNAPSHOT));
      setEffectivePreferences(cloneSnapshot(DEFAULT_SNAPSHOT));
      return;
    }

    setHydrationState((current) => {
      if (
        hasCacheHydratedRef.current &&
        current.playerKey === targetPlayerKey
      ) {
        return current;
      }
      return { status: 'hydrating', playerKey: targetPlayerKey };
    });

    try {
      const response = await fetch(endpoint, {
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        removeCachedPayload(targetPlayerKey);
        hasCacheHydratedRef.current = false;
        setPreferences(null);
        setDefaults(cloneSnapshot(DEFAULT_SNAPSHOT));
        setEffectivePreferences(cloneSnapshot(DEFAULT_SNAPSHOT));
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch preferences (${response.status})`);
      }

      const payload: PreferencesResponsePayload = await response.json();
      if (latestPlayerKeyRef.current !== targetPlayerKey) {
        return;
      }
      applyPayload(payload, { persist: true, playerKey: targetPlayerKey });
      hasCacheHydratedRef.current = true;
    } catch (error) {
      console.warn('Failed to load player preferences', error);
    } finally {
      setHydrationState((current) => {
        if (current.playerKey !== targetPlayerKey) {
          return current;
        }
        return { status: 'hydrated', playerKey: targetPlayerKey };
      });
    }
  }, [applyPayload, endpoint, playerId]);

  useEffect(() => {
    const playerKey = getPlayerKey(playerId);

    if (!playerId) {
      hasCacheHydratedRef.current = false;
      return;
    }

    const cached = readCachedPayload(playerKey);
    if (cached) {
      hasCacheHydratedRef.current = true;
      applyPayload(cached);
      setHydrationState({ status: 'hydrated', playerKey });
    } else {
      hasCacheHydratedRef.current = false;
    }
  }, [playerId, applyPayload]);

  useEffect(() => {
    if (!options?.skipInitialFetch) {
      void hydrateFromServer();
    }
  }, [hydrateFromServer, options?.skipInitialFetch]);

  // Realtime updates are handled centrally via usePlayerStream

  const updatePreferences = useCallback(
    async (
      patch: Partial<PlayerPreferencesSnapshot> & {
        audioSettings?: Partial<AudioSettings>;
      }
    ) => {
      if (!playerId) {
        return false;
      }
      const payload: Record<string, unknown> = {};

      if (Object.prototype.hasOwnProperty.call(patch, 'selectedCharacterId')) {
        payload.selectedCharacterId = patch.selectedCharacterId ?? null;
      }
      if (
        Object.prototype.hasOwnProperty.call(patch, 'selectedDifficultyTier')
      ) {
        payload.selectedDifficultyTier = patch.selectedDifficultyTier ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'gotchiSpriteUrl')) {
        payload.gotchiSpriteUrl = patch.gotchiSpriteUrl ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'avatarId')) {
        payload.avatarId = patch.avatarId ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'audioSettings')) {
        payload.audioSettings = {
          ...(patch.audioSettings ?? {}),
        };
      }

      if (Object.keys(payload).length === 0) {
        return true;
      }

      try {
        const response = await fetch(endpoint, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`Failed to update preferences (${response.status})`);
        }

        const data: PreferencesResponsePayload = await response.json();
        applyPayload(data, {
          persist: true,
          playerKey: latestPlayerKeyRef.current,
        });
        return true;
      } catch (error) {
        console.warn('Failed to update player preferences', error);
        return false;
      }
    },
    [applyPayload, endpoint, playerId]
  );

  const refresh = useCallback(
    async (payload?: PreferencesResponsePayload) => {
      if (payload) {
        applyPayload(payload, { persist: true, playerKey: derivedPlayerKey });
        setHydrationState({ status: 'hydrated', playerKey: derivedPlayerKey });
        return;
      }
      await hydrateFromServer();
    },
    [applyPayload, derivedPlayerKey, hydrateFromServer]
  );

  return {
    preferences,
    effectivePreferences,
    defaults,
    isHydrated:
      hydrationState.status === 'hydrated' &&
      hydrationState.playerKey === derivedPlayerKey,
    updatePreferences,
    refresh,
  };
}
