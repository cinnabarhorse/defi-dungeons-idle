import { getPgPool } from '../../client';
import {
  createUnsettledTradeRun,
  listDueUnsettledTradeRunDates,
  listOpenTradeRunsForAccount,
} from '../competition-trade-runs';

jest.mock('../../client', () => ({
  getPgPool: jest.fn(),
}));

const baseLegacyRow = {
  id: 'trade-1',
  competition_date: '2026-02-19',
  difficulty_id: 'normal',
  account_id: 'player-1',
  run_id: 'run-1',
  base_score: 1000,
  time_multiplier: '1.5',
  token: 'BTC',
  direction: 'long',
  risk_leverage: '2',
  entry_price_usd: '100',
  entry_sampled_at: '2026-02-19T20:00:00.000Z',
  close_at: '2026-02-19T20:15:00.000Z',
  update_count: 0,
  state: 'unsettled',
  settle_reason: null,
  settle_price_usd: null,
  settled_at: null,
  trade_multiplier: null,
  final_score: null,
  oracle_meta: {},
  created_at: '2026-02-19T20:00:00.000Z',
  updated_at: '2026-02-19T20:00:00.000Z',
};

describe('competition trade runs repo compatibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to legacy open-runs query when close_at is missing', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('column "close_at" does not exist'), {
          code: '42703',
        })
      )
      .mockResolvedValueOnce({ rows: [baseLegacyRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const runs = await listOpenTradeRunsForAccount('player-1', 10);

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain(
      "entry_sampled_at + interval '15 minutes'"
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('run-1');
    expect(runs[0].closeAt).toBe('2026-02-19T20:15:00.000Z');
    expect(runs[0].updateCount).toBe(0);
  });

  it('falls back to legacy insert when close_at/update_count columns are missing', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('column "close_at" does not exist'), {
          code: '42703',
        })
      )
      .mockResolvedValueOnce({ rows: [baseLegacyRow] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const created = await createUnsettledTradeRun({
      competitionDate: '2026-02-19',
      difficultyId: 'normal',
      accountId: 'player-1',
      runId: 'run-1',
      baseScore: 1000,
      timeMultiplier: 1.5,
      token: 'BTC',
      direction: 'long',
      riskLeverage: 2,
      entryPriceUsd: 100,
      entrySampledAt: '2026-02-19T20:00:00.000Z',
      closeAt: '2026-02-19T20:15:00.000Z',
      oracleMeta: {},
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain(
      "entry_sampled_at + interval '15 minutes'"
    );
    expect(created.runId).toBe('run-1');
    expect(created.closeAt).toBe('2026-02-19T20:15:00.000Z');
    expect(created.updateCount).toBe(0);
  });

  it('lists legacy due unsettled competition dates when close_at is missing', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('column "close_at" does not exist'), {
          code: '42703',
        })
      )
      .mockResolvedValueOnce({
        rows: [
          { competition_date: '2026-02-19' },
          { competition_date: new Date(2026, 1, 20, 0, 0, 0) },
        ],
      });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const dates = await listDueUnsettledTradeRunDates(
      '2026-02-20T00:00:00.000Z',
      10
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][0])).toContain(
      "entry_sampled_at + interval '15 minutes'"
    );
    expect(dates).toEqual(['2026-02-19', '2026-02-20']);
  });

  it('normalizes Date competition_date values to yyyy-mm-dd without timezone drift', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          ...baseLegacyRow,
          competition_date: new Date(2026, 1, 27, 0, 0, 0),
        },
      ],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const runs = await listOpenTradeRunsForAccount('player-1', 10);

    expect(runs).toHaveLength(1);
    expect(runs[0].competitionDate).toBe('2026-02-27');
  });
});
