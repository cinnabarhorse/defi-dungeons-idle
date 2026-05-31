import { getPgPool } from '../client';

export interface ActiveLeaderboardRow {
  player_id: string;
  wallet_address: string;
  username: string | null;
  level: number | null;
  character_id: string | null;
  joined_at: string | null;
  difficulty_tier: string | null;
  room_id: string | null;
  highest_score: number | null;
  total_usdc_earned_base_units: string | null;
  total_ghst_earned: string | null;
}

export interface ActiveLeaderboardEntry {
  playerId: string;
  walletAddress: string;
  username: string | null;
  level: number;
  characterId: string | null;
  joinedAt: string | null;
  difficultyTier: string | null;
  roomId: string | null;
  highestScore: number;
  totalUsdcEarnedBaseUnits: number;
  totalGhstEarned: number;
}

function mapRow(row: ActiveLeaderboardRow): ActiveLeaderboardEntry {
  return {
    playerId: row.player_id,
    walletAddress: row.wallet_address,
    username: row.username,
    level: Math.max(1, Number(row.level) || 1),
    characterId: row.character_id,
    joinedAt: row.joined_at,
    difficultyTier: row.difficulty_tier,
    roomId: row.room_id,
    highestScore: Math.max(0, Number(row.highest_score) || 0),
    totalUsdcEarnedBaseUnits: Number(row.total_usdc_earned_base_units) || 0,
    totalGhstEarned: Number(row.total_ghst_earned) || 0,
  };
}

export interface GetPlayersLeaderboardOptions {
  limit?: number;
  sortBy?: 'level' | 'usdc';
}

export async function getPlayersLeaderboard(
  options: GetPlayersLeaderboardOptions = {}
): Promise<ActiveLeaderboardEntry[]> {
  const pool = getPgPool();
  const limit =
    Number.isFinite(options.limit) && options.limit! > 0
      ? Math.min(Math.floor(options.limit!), 500)
      : 100;

  const sortBy = options.sortBy ?? 'usdc';

  // Use separate queries for safety (PostgreSQL doesn't support parameterized ORDER BY)
  const result = await pool.query<ActiveLeaderboardRow>(
    sortBy === 'level'
      ? `select
           p.id as player_id,
           p.wallet_address,
           p.username,
           coalesce(p.level, 1) as level,
           p.selected_character_id as character_id,
           null::timestamptz as joined_at,
           p.selected_difficulty_tier as difficulty_tier,
           null::text as room_id,
           coalesce(p.highest_score, 0) as highest_score,
           coalesce(usdc_stats.total_usdc_earned_base_units, 0)::bigint as total_usdc_earned_base_units,
           coalesce(ghst_stats.total_ghst_earned, 0)::numeric as total_ghst_earned
         from players p
         left join (
           select 
             player_id,
             sum(usdc_earned_base_units) as total_usdc_earned_base_units
           from game_players
           group by player_id
         ) usdc_stats on usdc_stats.player_id = p.id
         left join (
           select
             player_id,
             sum(amount)::numeric as total_ghst_earned
           from economy_transactions
           where currency = 'GHST'
             and amount > 0
           group by player_id
         ) ghst_stats on ghst_stats.player_id = p.id
        order by coalesce(p.level, 1) desc, p.updated_at asc nulls last
        limit $1`
      : `select
           p.id as player_id,
           p.wallet_address,
           p.username,
           coalesce(p.level, 1) as level,
           p.selected_character_id as character_id,
           null::timestamptz as joined_at,
           p.selected_difficulty_tier as difficulty_tier,
           null::text as room_id,
           coalesce(p.highest_score, 0) as highest_score,
           coalesce(usdc_stats.total_usdc_earned_base_units, 0)::bigint as total_usdc_earned_base_units,
           coalesce(ghst_stats.total_ghst_earned, 0)::numeric as total_ghst_earned
         from players p
         left join (
           select 
             player_id,
             sum(usdc_earned_base_units) as total_usdc_earned_base_units
           from game_players
           group by player_id
         ) usdc_stats on usdc_stats.player_id = p.id
         left join (
           select
             player_id,
             sum(amount)::numeric as total_ghst_earned
           from economy_transactions
           where currency = 'GHST'
             and amount > 0
           group by player_id
         ) ghst_stats on ghst_stats.player_id = p.id
         order by coalesce(usdc_stats.total_usdc_earned_base_units, 0) desc, p.updated_at asc nulls last
         limit $1`,
    [limit]
  );

  return result.rows.map(mapRow);
}
