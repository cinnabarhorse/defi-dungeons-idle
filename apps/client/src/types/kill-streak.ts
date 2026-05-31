export interface KillStreakProfileMessage {
  units: number;
  archetypeId?: string | null;
}

export interface KillStreakUpdatedMessage extends KillStreakProfileMessage {
  deltaUnits: number;
  source?: {
    type?: 'kill' | 'decay' | string;
    enemyId?: string;
    enemyType?: string;
    attackType?: string;
    classification?: string;
  };
}

export interface KillStreakResetMessage {
  reason?: string;
}
