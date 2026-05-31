import type {
  LevelProgress,
  ProgressionProfile,
  StatAllocation,
  StatKey,
} from '../lib/progression';

export interface ProgressionProfileMessage {
  profile: ProgressionProfile;
  source?: string;
}

export interface ProgressionXpAwardMessage {
  amount: number;
  totalXp: number;
  level: number;
  levelUps: number;
  unspentPoints: number;
  stats?: StatAllocation;
  allocationHistory?: StatKey[];
  levelProgress?: LevelProgress;
  source?: {
    enemyId?: string;
    enemyType?: string;
    attackType?: string;
    classification?: string;
  };
}

export interface ProgressionLevelLostMessage extends ProgressionXpAwardMessage {
  levelsLost: number;
  cause?: string;
}
