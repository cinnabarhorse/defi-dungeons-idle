export interface LeaderboardEntry {
  playerId: string;
  walletAddress: string;
  username: string | null;
  level: number;
  characterId: string | null;
  joinedAt: string | null;
  difficultyTier: string | null;
  roomId: string | null;
  totalUsdcEarnedBaseUnits?: number;
  totalGhstEarned?: number;
}

export interface LeaderboardResponse {
  players?: LeaderboardEntry[];
}


