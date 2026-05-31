export interface DailyRunsTier {
  usdcStakedGte: number;
  dailyRuns: number;
}

export interface DailyRunsStatus {
  date: string;
  resetAtUtc: string;
  usdcStaked: number;
  ghoStaked?: number;
  /**
   * GHST staked for DeFi Dungeons reward-eligibility. (UI uses this for the USDC/GHST switch.)
   */
  ghstStaked?: number;
  totalStaked?: number;
  allowedRuns: number;
  usedRuns: number;
  remainingRuns: number;
  tiers: DailyRunsTier[];
}

export interface DailyRunsExhaustedPayload {
  code: 'DAILY_RUNS_EXHAUSTED';
  resetAtUtc: string;
  allowedRuns: number;
  usedRuns: number;
  usdcStaked: number;
  ghoStaked?: number;
  totalStaked?: number;
}
