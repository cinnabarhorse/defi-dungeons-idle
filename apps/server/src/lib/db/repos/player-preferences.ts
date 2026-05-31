import { getPgPool } from '../client';
import type { PlayerPreferencesRecord } from '../types';

const DEFAULT_AUDIO_SETTINGS: PlayerPreferencesRecord['audioSettings'] = {
  masterVolume: 70,
  sfxVolume: 80,
  musicVolume: 60,
  muted: false,
};

// Table is merged into players; compatibility view exists during rollout

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function sanitizeAudioSettings(
  input: unknown,
  base: PlayerPreferencesRecord['audioSettings'] = DEFAULT_AUDIO_SETTINGS
): PlayerPreferencesRecord['audioSettings'] {
  const result: PlayerPreferencesRecord['audioSettings'] = {
    ...DEFAULT_AUDIO_SETTINGS,
    ...base,
  };

  if (!input || typeof input !== 'object') {
    return result;
  }

  const maybeNumber = (value: unknown, fallback: number) => {
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

  const maybeBoolean = (value: unknown, fallback: boolean) => {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
    return fallback;
  };

  const mapLike = input as Record<string, unknown>;
  if ('masterVolume' in mapLike) {
    result.masterVolume = clamp(
      maybeNumber(mapLike.masterVolume, result.masterVolume),
      0,
      100
    );
  }
  if ('sfxVolume' in mapLike) {
    result.sfxVolume = clamp(
      maybeNumber(mapLike.sfxVolume, result.sfxVolume),
      0,
      100
    );
  }
  if ('musicVolume' in mapLike) {
    result.musicVolume = clamp(
      maybeNumber(mapLike.musicVolume, result.musicVolume),
      0,
      100
    );
  }
  if ('muted' in mapLike) {
    result.muted = maybeBoolean(mapLike.muted, result.muted);
  }

  return result;
}

function sanitizeText(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function mapRow(row: any): PlayerPreferencesRecord {
  return {
    playerId: row.player_id || row.id,
    selectedCharacterId: sanitizeText(row.selected_character_id),
    selectedDifficultyTier: sanitizeText(row.selected_difficulty_tier),
    gotchiSpriteUrl: sanitizeText(row.gotchi_sprite_url),
    avatarId: sanitizeText(row.avatar_id),
    audioSettings: sanitizeAudioSettings(row.audio_settings ?? undefined),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getPreferences(
  playerId: string
): Promise<PlayerPreferencesRecord | null> {
  const pool = getPgPool();
  const result = await pool.query(
    `select
       p.id,
       p.selected_character_id,
       p.selected_difficulty_tier,
       p.gotchi_sprite_url,
       p.avatar_id,
       p.audio_settings,
       p.created_at,
       p.updated_at
     from players p
     where p.id = $1
     limit 1`,
    [playerId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return mapRow(result.rows[0]);
}

export interface UpsertPreferencesInput {
  playerId: string;
  selectedCharacterId?: string | null;
  selectedDifficultyTier?: string | null;
  gotchiSpriteUrl?: string | null;
  avatarId?: string | null;
  audioSettings?: unknown;
}

export async function upsertPreferences(
  input: UpsertPreferencesInput
): Promise<PlayerPreferencesRecord> {
  const pool = getPgPool();
  const audioSettings = sanitizeAudioSettings(input.audioSettings);
  const query = `
    update players
       set selected_character_id = $2,
           selected_difficulty_tier = $3,
           gotchi_sprite_url = $4,
           avatar_id = $5,
           audio_settings = $6::jsonb,
           updated_at = now()
     where id = $1
     returning id,
               selected_character_id,
               selected_difficulty_tier,
               gotchi_sprite_url,
               avatar_id,
               audio_settings,
               created_at,
               updated_at
  `;

  const params = [
    input.playerId,
    sanitizeText(input.selectedCharacterId),
    sanitizeText(input.selectedDifficultyTier),
    sanitizeText(input.gotchiSpriteUrl),
    sanitizeText(input.avatarId),
    JSON.stringify(audioSettings),
  ];

  const result = await pool.query(query, params);
  return mapRow(result.rows[0]);
}

export interface UpdatePreferencesPatch {
  selectedCharacterId?: string | null;
  selectedDifficultyTier?: string | null;
  gotchiSpriteUrl?: string | null;
  avatarId?: string | null;
  audioSettings?: unknown;
}

export async function updatePreferences(
  playerId: string,
  patch: UpdatePreferencesPatch
): Promise<PlayerPreferencesRecord> {
  const existing = await getPreferences(playerId);

  const mergedAudio =
    patch.audioSettings !== undefined
      ? sanitizeAudioSettings(patch.audioSettings, existing?.audioSettings)
      : (existing?.audioSettings ?? DEFAULT_AUDIO_SETTINGS);

  return upsertPreferences({
    playerId,
    selectedCharacterId:
      patch.selectedCharacterId !== undefined
        ? sanitizeText(patch.selectedCharacterId)
        : (existing?.selectedCharacterId ?? null),
    selectedDifficultyTier:
      patch.selectedDifficultyTier !== undefined
        ? sanitizeText(patch.selectedDifficultyTier)
        : (existing?.selectedDifficultyTier ?? null),
    gotchiSpriteUrl:
      patch.gotchiSpriteUrl !== undefined
        ? sanitizeText(patch.gotchiSpriteUrl)
        : (existing?.gotchiSpriteUrl ?? null),
    avatarId:
      patch.avatarId !== undefined
        ? sanitizeText(patch.avatarId)
        : (existing?.avatarId ?? null),
    audioSettings: mergedAudio,
  });
}

export { DEFAULT_AUDIO_SETTINGS };
