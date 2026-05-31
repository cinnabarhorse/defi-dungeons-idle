export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

export interface PlayerPreferencesSnapshot {
  selectedCharacterId: string | null;
  selectedDifficultyTier: string;
  gotchiSpriteUrl: string | null;
  avatarId: string | null;
  audioSettings: AudioSettings;
}
