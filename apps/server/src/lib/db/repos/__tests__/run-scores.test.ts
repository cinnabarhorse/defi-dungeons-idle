import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getPgPool } from '../../client';
import { getAllRuns, getRunsByPlayerId } from '../run-scores';

jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

type MockRunRow = {
  game_player_id: string;
  game_id: string;
  player_id: string;
  character_id: string | null;
  joined_at: string | null;
  left_at: string | null;
  kills: number;
  deaths: number;
  damage_dealt: number;
  damage_taken: number;
  coins_collected: number;
  usdc_earned_base_units: string;
  xp_gained: string;
  level_before: number | null;
  level_after: number | null;
  game_player_metadata: unknown;
  difficulty_tier: string | null;
  region: string | null;
  game_started_at: string | null;
  game_ended_at: string | null;
  game_status: string | null;
  game_metadata: unknown;
  floor_reached: number | null;
  score: number | null;
  score_completed_at: string | null;
  score_duration_ms: number | null;
  valid_for_high_score: boolean | null;
  player_wallet_address: string | null;
  player_username: string | null;
  score_metadata: unknown;
};

type MockPlayerRunRow = {
  game_player_id: string;
  game_id: string;
  player_id: string;
  character_id: string | null;
  joined_at: string | null;
  left_at: string | null;
  kills: number;
  deaths: number;
  damage_dealt: number;
  damage_taken: number;
  coins_collected: number;
  usdc_earned_base_units: string;
  xp_gained: string;
  level_before: number | null;
  level_after: number | null;
  game_player_metadata: unknown;
  difficulty_tier: string | null;
  region: string | null;
  game_started_at: string | null;
  game_ended_at: string | null;
  game_status: string | null;
  game_metadata: unknown;
  floor_reached: number | null;
  score: number | null;
  score_completed_at: string | null;
  score_duration_ms: number | null;
  valid_for_high_score: boolean | null;
  score_metadata: unknown;
};

type MockTradeRunRow = {
  account_id: string;
  run_id: string;
  token: 'BTC' | 'ETH' | 'GHST';
  direction: 'long' | 'short';
  risk_leverage: string | number;
};

function createRunRow(overrides: Partial<MockRunRow> = {}): MockRunRow {
  return {
    game_player_id: '11111111-1111-1111-1111-111111111111',
    game_id: '22222222-2222-2222-2222-222222222222',
    player_id: '33333333-3333-3333-3333-333333333333',
    character_id: 'coderdan',
    joined_at: '2026-02-26T10:00:00.000Z',
    left_at: '2026-02-26T10:01:00.000Z',
    kills: 12,
    deaths: 0,
    damage_dealt: 1000,
    damage_taken: 100,
    coins_collected: 50,
    usdc_earned_base_units: '0',
    xp_gained: '100',
    level_before: 1,
    level_after: 2,
    game_player_metadata: {},
    difficulty_tier: 'hell',
    region: 'us-east',
    game_started_at: '2026-02-26T10:00:00.000Z',
    game_ended_at: '2026-02-26T10:01:00.000Z',
    game_status: 'ended',
    game_metadata: {},
    floor_reached: 20,
    score: 1000,
    score_completed_at: '2026-02-26T10:01:00.000Z',
    score_duration_ms: 60000,
    valid_for_high_score: true,
    player_wallet_address: null,
    player_username: null,
    score_metadata: {},
    ...overrides,
  };
}

function createPlayerRunRow(
  overrides: Partial<MockPlayerRunRow> = {}
): MockPlayerRunRow {
  return {
    game_player_id: '11111111-1111-1111-1111-111111111111',
    game_id: '22222222-2222-2222-2222-222222222222',
    player_id: '33333333-3333-3333-3333-333333333333',
    character_id: 'coderdan',
    joined_at: '2026-02-26T10:00:00.000Z',
    left_at: '2026-02-26T10:01:00.000Z',
    kills: 12,
    deaths: 1,
    damage_dealt: 1000,
    damage_taken: 100,
    coins_collected: 50,
    usdc_earned_base_units: '0',
    xp_gained: '100',
    level_before: 1,
    level_after: 2,
    game_player_metadata: {},
    difficulty_tier: 'hell',
    region: 'us-east',
    game_started_at: '2026-02-26T10:00:00.000Z',
    game_ended_at: '2026-02-26T10:01:00.000Z',
    game_status: 'ended',
    game_metadata: {},
    floor_reached: 20,
    score: 1000,
    score_completed_at: '2026-02-26T10:01:00.000Z',
    score_duration_ms: 60000,
    valid_for_high_score: true,
    score_metadata: {},
    ...overrides,
  };
}

function mockGetAllRunsQueries(
  runRow: MockRunRow,
  tradeRows: MockTradeRunRow[] = []
) {
  const query = jest
    .fn()
    .mockResolvedValueOnce({ rows: [{ total: '1' }] })
    .mockResolvedValueOnce({ rows: [runRow] })
    .mockResolvedValueOnce({ rows: [] }) // ghst
    .mockResolvedValueOnce({ rows: [] }) // lick tongues
    .mockResolvedValueOnce({ rows: [] }) // usdc
    .mockResolvedValueOnce({ rows: tradeRows }) // competition trade runs
    .mockResolvedValueOnce({ rows: [] }) // daily quest leaderboard
    .mockResolvedValueOnce({ rows: [] }); // competition attunements

  (getPgPool as jest.Mock).mockReturnValue({ query });
}

function mockGetRunsByPlayerQueries(
  runRow: MockPlayerRunRow,
  attunementRows: Array<{ game_id: string }> = [],
  leaderboardRows: Array<{ game_id: string; final_score: string }> = [],
  tradeRows: MockTradeRunRow[] = []
) {
  const query = jest
    .fn()
    .mockResolvedValueOnce({ rows: [{ total: '1' }] })
    .mockResolvedValueOnce({ rows: [runRow] })
    .mockResolvedValueOnce({ rows: [] }) // ghst
    .mockResolvedValueOnce({ rows: [] }) // lick tongues
    .mockResolvedValueOnce({ rows: [] }) // usdc
    .mockResolvedValueOnce({ rows: tradeRows }) // competition trade runs
    .mockResolvedValueOnce({ rows: attunementRows }) // competition attunements
    .mockResolvedValueOnce({ rows: leaderboardRows }); // daily quest leaderboard

  (getPgPool as jest.Mock).mockReturnValue({ query });
}

describe('run-scores leverage extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to game metadata leverage when score/player metadata is missing it', async () => {
    mockGetAllRunsQueries(
      createRunRow({
        score_metadata: {},
        game_player_metadata: {},
        game_metadata: { leverage: { total: '7.5' } },
      })
    );

    const result = await getAllRuns({ limit: 50, offset: 0 });

    expect(result.total).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.leverageTotal).toBe(7.5);
  });

  it('parses leverageTotal from string metadata fields', async () => {
    mockGetAllRunsQueries(
      createRunRow({
        score_metadata: { leverageTotal: '12' },
      })
    );

    const result = await getAllRuns({ limit: 50, offset: 0 });

    expect(result.runs[0]?.leverageTotal).toBe(12);
  });

  it('includes leverage breakdown for competition trade runs', async () => {
    const row = createRunRow({
      score_metadata: { leverageTotal: '9' },
    });
    mockGetAllRunsQueries(row, [
      {
        account_id: row.player_id,
        run_id: row.game_id,
        token: 'GHST',
        direction: 'long',
        risk_leverage: '4',
      },
    ]);

    const result = await getAllRuns({ limit: 50, offset: 0 });

    expect(result.runs[0]).toMatchObject({
      leverageTotal: 9,
      legacyLeverage: 5,
      tradeRunLeverage: 4,
      tradeRunToken: 'GHST',
      tradeRunDirection: 'long',
    });
  });
});

describe('getRunsByPlayerId competition fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks a run as competition when attunement exists even without dailyRuns score metadata', async () => {
    const row = createPlayerRunRow({
      score_metadata: {},
    });
    mockGetRunsByPlayerQueries(row, [{ game_id: row.game_id }]);

    const result = await getRunsByPlayerId({
      playerId: row.player_id,
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.dailyRuns?.isHighStakes).toBe(true);
  });

  it('treats 1x trade leverage as zero additive leverage in player run breakdown', async () => {
    const row = createPlayerRunRow({
      score_metadata: { leverageTotal: '7' },
    });
    mockGetRunsByPlayerQueries(
      row,
      [],
      [],
      [
        {
          account_id: row.player_id,
          run_id: row.game_id,
          token: 'BTC',
          direction: 'short',
          risk_leverage: '1',
        },
      ]
    );

    const result = await getRunsByPlayerId({
      playerId: row.player_id,
      limit: 50,
      offset: 0,
    });

    expect(result.runs[0]).toMatchObject({
      leverageTotal: 7,
      legacyLeverage: 7,
      tradeRunLeverage: 0,
      tradeRunToken: 'BTC',
      tradeRunDirection: 'short',
    });
  });
});
