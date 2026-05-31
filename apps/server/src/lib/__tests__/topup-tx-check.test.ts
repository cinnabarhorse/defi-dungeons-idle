process.env.DISCORD_USDC_TOPUP_WEBHOOK_URL = 'https://example.com/webhook';

import { checkPendingDeposits } from '../topup/tx-check';
import { depositsRepo, playersRepo } from '../db';
import { getPgPool } from '../db/client';

jest.mock('../db', () => ({
  depositsRepo: {
    updateDeposit: jest.fn(),
    creditDepositIfNotCredited: jest.fn(),
    getDepositByTxHash: jest.fn(),
    getGlobalStakedUnlockBalances: jest.fn(),
  },
  playersRepo: {
    getPlayerById: jest.fn(),
    getPlayerByWallet: jest.fn(),
  },
}));

jest.mock('../db/client', () => ({
  getPgPool: jest.fn(),
}));

describe('checkPendingDeposits credit flow', () => {
  const depositRow = {
    id: 'deposit-1',
    user_id: 'player-1',
    depositor_address: '0xabc1230000000000000000000000000000000000',
    token_symbol: 'USDC',
    amount: '12.5',
    tx_hash: '0x' + 'a'.repeat(64),
    tx_status: 'pending',
    points_minted: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPgPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [depositRow] }),
    });
    (depositsRepo.getGlobalStakedUnlockBalances as jest.Mock).mockResolvedValue({
      usdc: 0,
      gho: 0,
      total: 0,
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      username: 'alice',
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    }) as unknown as typeof fetch;
  });

  it('does not send a Discord message directly when a USDC deposit is credited', async () => {
    (depositsRepo.updateDeposit as jest.Mock).mockResolvedValue({
      txStatus: 'confirmed',
    });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue({
      tokenSymbol: 'USDC',
      amount: depositRow.amount,
      userId: depositRow.user_id,
      depositorAddress: depositRow.depositor_address,
    });

    await checkPendingDeposits(depositRow.user_id, depositRow.depositor_address, {
      verifyTransactionSender: jest.fn().mockResolvedValue(true),
      checkTransactionReceipt: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 123,
        blockTimestamp: 123456,
        depositId: '1',
        pointsMinted: '1000000',
        yieldAmount: '0',
        unlockAt: null,
      }),
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(depositsRepo.creditDepositIfNotCredited).toHaveBeenCalledWith(
      depositRow.id,
      '1000000'
    );
    expect(global.fetch).toHaveBeenCalledTimes(0);
  });

  it('does not send a Discord message directly if the deposit was already credited', async () => {
    (depositsRepo.updateDeposit as jest.Mock).mockResolvedValue({
      txStatus: 'confirmed',
    });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue(
      null
    );
    (depositsRepo.getDepositByTxHash as jest.Mock).mockResolvedValue({
      txStatus: 'credited',
      tokenSymbol: 'USDC',
      amount: depositRow.amount,
      userId: depositRow.user_id,
      depositorAddress: depositRow.depositor_address,
    });

    await checkPendingDeposits(depositRow.user_id, depositRow.depositor_address, {
      verifyTransactionSender: jest.fn().mockResolvedValue(true),
      checkTransactionReceipt: jest.fn().mockResolvedValue({
        status: 1,
        blockNumber: 123,
        blockTimestamp: 123456,
        depositId: '1',
        pointsMinted: '1000000',
        yieldAmount: '0',
        unlockAt: null,
      }),
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(global.fetch).toHaveBeenCalledTimes(0);
  });

  it('credits GHST deposits even when pointsMinted is 0', async () => {
    const ghstDepositRow = {
      ...depositRow,
      id: 'deposit-ghst-1',
      token_symbol: 'GHST',
      tx_hash: '0x' + 'b'.repeat(64),
    };
    (getPgPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [ghstDepositRow] }),
    });
    (depositsRepo.updateDeposit as jest.Mock).mockResolvedValue({
      txStatus: 'confirmed',
    });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue({
      tokenSymbol: 'GHST',
      amount: ghstDepositRow.amount,
      userId: ghstDepositRow.user_id,
      depositorAddress: ghstDepositRow.depositor_address,
    });

    await checkPendingDeposits(
      ghstDepositRow.user_id,
      ghstDepositRow.depositor_address,
      {
        verifyTransactionSender: jest.fn().mockResolvedValue(true),
        checkTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 123,
          blockTimestamp: 123456,
          depositId: '1',
          pointsMinted: '0',
          yieldAmount: '0',
          unlockAt: null,
        }),
      }
    );

    expect(depositsRepo.creditDepositIfNotCredited).toHaveBeenCalledWith(
      ghstDepositRow.id,
      '0'
    );
  });

  it('does not send a Discord message directly when a GHST deposit is credited', async () => {
    const ghstDepositRow = {
      ...depositRow,
      id: 'deposit-ghst-discord',
      token_symbol: 'GHST',
      amount: '42',
      tx_hash: '0x' + 'c'.repeat(64),
    };
    (getPgPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [ghstDepositRow] }),
    });
    (depositsRepo.updateDeposit as jest.Mock).mockResolvedValue({
      txStatus: 'confirmed',
    });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue({
      tokenSymbol: 'GHST',
      amount: ghstDepositRow.amount,
      userId: ghstDepositRow.user_id,
      depositorAddress: ghstDepositRow.depositor_address,
    });

    await checkPendingDeposits(
      ghstDepositRow.user_id,
      ghstDepositRow.depositor_address,
      {
        verifyTransactionSender: jest.fn().mockResolvedValue(true),
        checkTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 123,
          blockTimestamp: 123456,
          depositId: '2',
          pointsMinted: '0',
          yieldAmount: '0',
          unlockAt: null,
        }),
      }
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(global.fetch).toHaveBeenCalledTimes(0);
  });

  it('accepts ERC-4337 deposits when receipt depositor matches wallet', async () => {
    const aaDepositRow = {
      ...depositRow,
      id: 'deposit-ghst-aa',
      token_symbol: 'GHST',
      tx_hash: '0x' + 'e'.repeat(64),
    };
    (getPgPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [aaDepositRow] }),
    });
    (depositsRepo.updateDeposit as jest.Mock).mockResolvedValue({
      txStatus: 'confirmed',
    });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue({
      tokenSymbol: 'GHST',
      amount: aaDepositRow.amount,
      userId: aaDepositRow.user_id,
      depositorAddress: aaDepositRow.depositor_address,
    });

    const verifySender = jest.fn().mockResolvedValue(false);

    await checkPendingDeposits(
      aaDepositRow.user_id,
      aaDepositRow.depositor_address,
      {
        verifyTransactionSender: verifySender,
        checkTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 123,
          blockTimestamp: 123456,
          depositor: aaDepositRow.depositor_address,
          depositId: '4',
          pointsMinted: '0',
          yieldAmount: '0',
          unlockAt: null,
        }),
      }
    );

    expect(verifySender).not.toHaveBeenCalled();
    expect(depositsRepo.creditDepositIfNotCredited).toHaveBeenCalledWith(
      aaDepositRow.id,
      '0'
    );
    const failedCalls = (depositsRepo.updateDeposit as jest.Mock).mock.calls
      .map(([input]) => input)
      .filter(
        (input) =>
          input?.id === aaDepositRow.id && input?.txStatus === 'failed'
      );
    expect(failedCalls).toHaveLength(0);
  });

  it('promotes confirmed GHST deposits with pointsMinted=0 to credited', async () => {
    const confirmedGhstRow = {
      ...depositRow,
      id: 'deposit-ghst-confirmed-zero',
      token_symbol: 'GHST',
      tx_status: 'confirmed',
      points_minted: '0',
      tx_hash: '0x' + 'd'.repeat(64),
    };

    (getPgPool as jest.Mock).mockReturnValue({
      query: jest.fn().mockImplementation((sql: string) => {
        const normalized = sql.toLowerCase();
        // Simulate realistic DB filtering: if query only scans confirmed rows
        // when points_minted is null/empty, this deposit will be skipped.
        if (
          normalized.includes("points_minted is null or points_minted = ''")
        ) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [confirmedGhstRow] });
      }),
    });

    (depositsRepo.updateDeposit as jest.Mock)
      .mockResolvedValueOnce({ txStatus: 'confirmed' })
      .mockResolvedValueOnce({ txStatus: 'credited' });
    (depositsRepo.creditDepositIfNotCredited as jest.Mock).mockResolvedValue(
      null
    );

    await checkPendingDeposits(
      confirmedGhstRow.user_id,
      confirmedGhstRow.depositor_address,
      {
        verifyTransactionSender: jest.fn().mockResolvedValue(true),
        checkTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 123,
          blockTimestamp: 123456,
          depositId: '3',
          pointsMinted: '0',
          yieldAmount: '0',
          unlockAt: null,
        }),
      }
    );

    expect(depositsRepo.creditDepositIfNotCredited).toHaveBeenCalledWith(
      confirmedGhstRow.id,
      '0'
    );
    expect(depositsRepo.updateDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: confirmedGhstRow.id,
        txStatus: 'credited',
      })
    );
  });
});
