import {
  claimDepositDiscordNotification,
  creditDepositIfNotCredited,
  listRecentCreditedUsdcDeposits,
  releaseDepositDiscordNotificationClaim,
  updateDeposit,
} from '../repos/deposits';
import { getPgPool } from '../client';
import { notifyUsdcTopupFromDeposit } from '../../topup/discord';

jest.mock('../client', () => ({
  getPgPool: jest.fn(),
}));

jest.mock('../../topup/discord', () => ({
  notifyUsdcTopupFromDeposit: jest.fn(),
}));

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'deposit-1',
    user_id: 'player-1',
    chain_id: 8453,
    contract_address: '0xcontract',
    depositor_address: '0xabc1230000000000000000000000000000000000',
    token_address: '0xtoken',
    token_symbol: 'USDC',
    amount: '12.5',
    amount_wei: '12500000',
    tx_hash: '0x' + 'a'.repeat(64),
    tx_status: 'pending',
    deposit_id: null,
    yield_amount: null,
    points_minted: null,
    unlock_at: null,
    auto_renew: false,
    expires_at: null,
    created_at: null,
    updated_at: null,
    withdrawn: false,
    withdrawal_tx: null,
    ...overrides,
  };
}

describe('deposits repo discord notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (notifyUsdcTopupFromDeposit as jest.Mock).mockResolvedValue(undefined);
  });

  it('does not notify directly when txStatus transitions to credited', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [buildRow({ tx_status: 'confirmed' })] })
      .mockResolvedValueOnce({ rows: [buildRow({ tx_status: 'credited' })] });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    await updateDeposit({ id: 'deposit-1', txStatus: 'credited' });

    expect(notifyUsdcTopupFromDeposit).not.toHaveBeenCalled();
  });

  it('does not notify when already credited', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [buildRow({ tx_status: 'credited' })] })
      .mockResolvedValueOnce({ rows: [buildRow({ tx_status: 'credited' })] });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    await updateDeposit({ id: 'deposit-1', txStatus: 'credited' });

    expect(notifyUsdcTopupFromDeposit).not.toHaveBeenCalled();
  });

  it('does not notify directly when creditDepositIfNotCredited succeeds', async () => {
    const query = jest
      .fn()
      // creditDepositIfNotCredited() update returning *
      .mockResolvedValueOnce({
        rows: [buildRow({ tx_status: 'credited', points_minted: '100' })],
      });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    await creditDepositIfNotCredited('deposit-1', '100');

    expect(notifyUsdcTopupFromDeposit).not.toHaveBeenCalled();
  });

  it('does not notify directly when GHST transitions to credited', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [buildRow({ tx_status: 'confirmed' })] })
      .mockResolvedValueOnce({
        rows: [buildRow({ tx_status: 'credited', token_symbol: 'GHST' })],
      });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    await updateDeposit({ id: 'deposit-1', txStatus: 'credited' });

    expect(notifyUsdcTopupFromDeposit).not.toHaveBeenCalled();
  });
});

describe('deposits repo discord notification claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not notify when tx hash has already been notified', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          claimed_ids: ['deposit-2'],
          had_previous_notified: true,
        },
      ],
    });

    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await claimDepositDiscordNotification({
      depositId: 'deposit-2',
      txHash: `0x${'a'.repeat(64)}`,
    });

    expect(result).toEqual({
      claimedIds: ['deposit-2'],
      shouldNotify: false,
    });
  });

  it('falls back to id claim when tx hash is missing', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [{ id: 'deposit-3' }],
    });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    const result = await claimDepositDiscordNotification({
      depositId: 'deposit-3',
      txHash: null,
    });

    expect(result).toEqual({
      claimedIds: ['deposit-3'],
      shouldNotify: true,
    });
  });

  it('releases claimed deposits for retry when sending fails', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    await releaseDepositDiscordNotificationClaim([
      'deposit-1',
      'deposit-1',
      'deposit-2',
    ]);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('set discord_notified_at = null'),
      [['deposit-1', 'deposit-2']]
    );
  });
});

describe('deposits repo listRecentCreditedUsdcDeposits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes GHO in the token filter for Discord notifications', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [] });
    (getPgPool as jest.Mock).mockReturnValue({ query });

    await listRecentCreditedUsdcDeposits('2026-02-06T00:00:00.000Z', 200);

    const [, params] = query.mock.calls[0] ?? [];
    expect(params?.[2]).toEqual(
      expect.arrayContaining(['USDC', 'GHO', 'GHST'])
    );
  });
});
