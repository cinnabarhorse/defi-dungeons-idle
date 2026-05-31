import {
  canManuallySettleTradeRun,
  computeTradeMultiplier,
  computeTradeSettlement,
  getAdditiveTradingCompetitionLeverage,
  getCompetitionCloseCutoffMs,
  getCompetitionSettlementDeadlineMs,
  getTradeExtendedCloseAtIso,
  getTradeCloseAtIso,
  getTradeCloseAtMs,
  isTradeRunUpdatable,
  isTradeRunExtendable,
  getRewardLeverageMultiplier,
  getRiskLeverageMultiplier,
} from '../trading-game';
import { GAME_CONFIG } from '../../data/game-config';

describe('trading-game', () => {
  const originalTradingGameEnabled = process.env.TRADING_GAME_ENABLED;
  const originalLegacyTradingGameEnabled = process.env.TRADING_GAME_ENABLE;
  const originalTradingSettlementEnabled = (GAME_CONFIG as any).trading
    ?.settlementEnabled;

  function setTradingEnabled(enabled: boolean) {
    if (!(GAME_CONFIG as any).trading || typeof (GAME_CONFIG as any).trading !== 'object') {
      (GAME_CONFIG as any).trading = {};
    }
    (GAME_CONFIG as any).trading.settlementEnabled = enabled;
  }

  afterEach(() => {
    process.env.TRADING_GAME_ENABLED = originalTradingGameEnabled;
    process.env.TRADING_GAME_ENABLE = originalLegacyTradingGameEnabled;
    if (originalTradingSettlementEnabled === undefined) {
      delete (GAME_CONFIG as any).trading?.settlementEnabled;
    } else {
      setTradingEnabled(Boolean(originalTradingSettlementEnabled));
    }
  });

  it('computes long trade multiplier correctly', () => {
    const result = computeTradeMultiplier({
      direction: 'long',
      riskLeverage: 2,
      entryPriceUsd: 100,
      exitPriceUsd: 110,
    });

    expect(result.delta).toBeCloseTo(0.1);
    expect(result.tradeMultiplier).toBeCloseTo(1.2);
  });

  it('computes short trade multiplier correctly', () => {
    const result = computeTradeMultiplier({
      direction: 'short',
      riskLeverage: 3,
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });

    expect(result.delta).toBeCloseTo(0.1);
    expect(result.tradeMultiplier).toBeCloseTo(1.3);
  });

  it('clamps multiplier to minimum bound', () => {
    const result = computeTradeMultiplier({
      direction: 'long',
      riskLeverage: 20,
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });

    expect(result.tradeMultiplier).toBe(0.25);
  });

  it('clamps multiplier to maximum bound', () => {
    const result = computeTradeMultiplier({
      direction: 'long',
      riskLeverage: 20,
      entryPriceUsd: 100,
      exitPriceUsd: 130,
    });

    expect(result.tradeMultiplier).toBe(4);
  });

  it('computes settlement raw and final score deterministically', () => {
    const result = computeTradeSettlement({
      baseScore: 1000,
      timeMultiplier: 1.5,
      direction: 'long',
      riskLeverage: 2,
      entryPriceUsd: 100,
      exitPriceUsd: 110,
    });

    expect(result.tradeMultiplier).toBeCloseTo(1.2);
    expect(result.rawScore).toBe(1200);
    expect(result.finalScore).toBe(1800);
  });

  it('computes close timestamp as a fixed 15 minute epoch', () => {
    const victoryAt = Date.parse('2026-02-19T23:59:00.000Z');
    const closeAtMs = getTradeCloseAtMs(victoryAt);
    const closeAtIso = getTradeCloseAtIso(victoryAt);
    expect(closeAtMs).toBe(Date.parse('2026-02-20T00:14:00.000Z'));
    expect(closeAtIso).toBe('2026-02-20T00:14:00.000Z');
  });

  it('uses closeAt timestamp for manual closeability checks', () => {
    const closeAtIso = '2026-02-20T00:14:00.000Z';

    expect(
      canManuallySettleTradeRun({
        closeAtIso,
        nowMs: Date.parse('2026-02-20T00:14:00.000Z'),
      })
    ).toBe(true);

    expect(
      canManuallySettleTradeRun({
        closeAtIso,
        nowMs: Date.parse('2026-02-20T00:15:00.000Z'),
      })
    ).toBe(false);
  });

  it('enforces update window and max updates', () => {
    expect(
      isTradeRunUpdatable({
        state: 'unsettled',
        closeAtIso: '2026-02-20T00:14:00.000Z',
        updateCount: 0,
        nowMs: Date.parse('2026-02-20T00:13:59.000Z'),
      })
    ).toBe(true);
    expect(
      isTradeRunUpdatable({
        state: 'unsettled',
        closeAtIso: '2026-02-20T00:14:00.000Z',
        updateCount: 1,
        nowMs: Date.parse('2026-02-20T00:10:00.000Z'),
      })
    ).toBe(false);
    expect(
      isTradeRunUpdatable({
        state: 'unsettled',
        closeAtIso: '2026-02-20T00:14:00.000Z',
        updateCount: 0,
        nowMs: Date.parse('2026-02-20T00:14:00.000Z'),
      })
    ).toBe(false);
  });

  it('extends close timestamp by one 15 minute window', () => {
    expect(
      getTradeExtendedCloseAtIso({
        closeAtIso: '2026-02-20T00:05:00.000Z',
      })
    ).toBe('2026-02-20T00:20:00.000Z');
  });

  it('enforces extend window and end-of-day cutoff', () => {
    expect(
      isTradeRunExtendable({
        state: 'unsettled',
        closeAtIso: '2026-02-19T23:40:00.000Z',
        competitionDate: '2026-02-19',
        nowMs: Date.parse('2026-02-19T23:39:59.000Z'),
      })
    ).toBe(true);

    expect(
      isTradeRunExtendable({
        state: 'unsettled',
        closeAtIso: '2026-02-19T23:50:00.000Z',
        competitionDate: '2026-02-19',
        nowMs: Date.parse('2026-02-19T23:49:00.000Z'),
      })
    ).toBe(false);

    expect(
      isTradeRunExtendable({
        state: 'settled_close',
        closeAtIso: '2026-02-20T00:05:00.000Z',
        competitionDate: '2026-02-19',
        nowMs: Date.parse('2026-02-20T00:04:00.000Z'),
      })
    ).toBe(false);
  });

  it('accepts Date-like competition date inputs for deadline checks', () => {
    expect(getCompetitionSettlementDeadlineMs(new Date('2026-02-19T00:00:00.000Z'))).toBe(
      Date.parse('2026-02-20T00:20:00.000Z')
    );

    expect(getCompetitionSettlementDeadlineMs('2026-02-19T14:33:00.000Z')).toBe(
      Date.parse('2026-02-20T00:20:00.000Z')
    );

    expect(getCompetitionCloseCutoffMs(new Date(2026, 1, 27, 0, 0, 0))).toBe(
      Date.parse('2026-02-27T23:59:00.000Z')
    );
  });

  it('keeps risk leverage active for competition trade runs', () => {
    setTradingEnabled(true);

    expect(
      getRiskLeverageMultiplier(
        { dailyQuestActive: true },
        7
      )
    ).toBe(7);
  });

  it('keeps reward leverage active for competition trade runs', () => {
    setTradingEnabled(true);

    expect(
      getRewardLeverageMultiplier(
        { dailyQuestActive: true },
        7
      )
    ).toBe(7);
  });

  it('keeps reward leverage for non-trading gameplay', () => {
    setTradingEnabled(false);

    expect(
      getRewardLeverageMultiplier(
        { dailyQuestActive: true },
        7
      )
    ).toBe(7);
  });

  it('adds trade leverage on top of gameplay leverage for settlement runs', () => {
    expect(
      getAdditiveTradingCompetitionLeverage({
        gameplayLeverage: 20,
        tradeLeverage: 2,
      })
    ).toBe(22);
    expect(
      getAdditiveTradingCompetitionLeverage({
        gameplayLeverage: 20,
        tradeLeverage: 1,
      })
    ).toBe(20);
  });
});
