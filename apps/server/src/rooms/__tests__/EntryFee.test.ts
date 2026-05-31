import { markEntryFeesNonRefundable, refundEntryFee, trackEntryFeeCharge } from '../EntryFee';

jest.mock('../../lib/db', () => {
  return {
    gamePlayersRepo: {
      getByGameAndPlayer: jest.fn(),
      applyStats: jest.fn(),
    },
  };
});

const { gamePlayersRepo } = jest.requireMock('../../lib/db') as {
  gamePlayersRepo: {
    getByGameAndPlayer: jest.Mock;
    applyStats: jest.Mock;
  };
};

describe('EntryFee ledger helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trackEntryFeeCharge ignores invalid input and stores floored cents for valid charges', () => {
    const room: any = { entryFeeLedger: new Map<string, any>() };

    trackEntryFeeCharge(room, '', 100, null, true);
    trackEntryFeeCharge(room, 'p1', 0, null, true);
    trackEntryFeeCharge(room, 'p1', -5, null, true);
    expect(room.entryFeeLedger.size).toBe(0);

    trackEntryFeeCharge(room, 'p1', 199.9, '2026-01-30T03:18:00.000Z', true);
    expect(room.entryFeeLedger.get('p1')).toEqual({
      amountCents: 199,
      chargedAtIso: '2026-01-30T03:18:00.000Z',
      refundable: true,
    });
  });

  it('markEntryFeesNonRefundable flips only refundable entries', () => {
    const room: any = {
      entryFeeLedger: new Map<string, any>([
        ['p1', { amountCents: 100, chargedAtIso: 't1', refundable: true }],
        ['p2', { amountCents: 100, chargedAtIso: 't2', refundable: false }],
      ]),
    };

    markEntryFeesNonRefundable(room);

    expect(room.entryFeeLedger.get('p1').refundable).toBe(false);
    expect(room.entryFeeLedger.get('p2').refundable).toBe(false);
  });

  it('refundEntryFee deletes refundable ledger entries and records refund metadata when a game is active', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-30T03:18:00.000Z'));

    const room: any = {
      entryFeeLedger: new Map<string, any>([
        ['p1', { amountCents: 100, chargedAtIso: 'charged', refundable: true }],
      ]),
      currentGameId: 'game-1',
    };

    gamePlayersRepo.getByGameAndPlayer.mockResolvedValue({ id: 'gp-1' });
    gamePlayersRepo.applyStats.mockResolvedValue(undefined);

    const ok = await refundEntryFee(room, 'p1', 'disconnect', { extra: 'meta' });

    expect(ok).toBe(true);
    expect(room.entryFeeLedger.has('p1')).toBe(false);

    expect(gamePlayersRepo.getByGameAndPlayer).toHaveBeenCalledWith('game-1', 'p1');
    expect(gamePlayersRepo.applyStats).toHaveBeenCalledWith({
      gamePlayerId: 'gp-1',
      metadata: expect.objectContaining({
        entryFeeRefunded: true,
        entryFeeRefundedAt: '2026-01-30T03:18:00.000Z',
        entryFeeRefundReason: 'disconnect',
        extra: 'meta',
      }),
    });

    jest.useRealTimers();
  });

  it('refundEntryFee still refunds locally when there is no currentGameId (no DB writes)', async () => {
    const room: any = {
      entryFeeLedger: new Map<string, any>([
        ['p1', { amountCents: 100, chargedAtIso: 'charged', refundable: true }],
      ]),
      currentGameId: null,
    };

    const ok = await refundEntryFee(room, 'p1', 'timeout');

    expect(ok).toBe(true);
    expect(room.entryFeeLedger.has('p1')).toBe(false);
    expect(gamePlayersRepo.getByGameAndPlayer).not.toHaveBeenCalled();
    expect(gamePlayersRepo.applyStats).not.toHaveBeenCalled();
  });

  it('refundEntryFee returns true even if recording refund metadata fails', async () => {
    const room: any = {
      entryFeeLedger: new Map<string, any>([
        ['p1', { amountCents: 100, chargedAtIso: 'charged', refundable: true }],
      ]),
      currentGameId: 'game-1',
    };

    gamePlayersRepo.getByGameAndPlayer.mockRejectedValue(new Error('db down'));

    const ok = await refundEntryFee(room, 'p1', 'manual');

    expect(ok).toBe(true);
    expect(room.entryFeeLedger.has('p1')).toBe(false);
  });
});
