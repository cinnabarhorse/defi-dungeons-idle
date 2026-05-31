import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('createWithdrawalTransaction', () => {
  const ORIGINAL_ENV = process.env;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.THIRDWEB_SECRET_KEY;
    delete process.env.THIRDWEB_SERVER_WALLET;
    delete process.env.THIRDWEB_TRANSACTIONS_URL;
    delete process.env.THIRDWEB_STATUS_POLL_TIMEOUT_MS;
    delete process.env.THIRDWEB_STATUS_POLL_INTERVAL_MS;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it('throws when amount is zero or negative', async () => {
    const { createWithdrawalTransaction } = await import('../tx-creator');

    await expect(
      createWithdrawalTransaction({
        to: '0x000000000000000000000000000000000000dEaD',
        amount: 0n,
      })
    ).rejects.toThrow('Withdrawal amount must be greater than zero');

    await expect(
      createWithdrawalTransaction({
        to: '0x000000000000000000000000000000000000dEaD',
        amount: -1n,
      })
    ).rejects.toThrow('Withdrawal amount must be greater than zero');
  });

  it('throws when recipient address is invalid', async () => {
    const { createWithdrawalTransaction } = await import('../tx-creator');

    await expect(
      createWithdrawalTransaction({
        to: 'not-an-address',
        amount: 1n,
      })
    ).rejects.toThrow('Invalid recipient wallet address');
  });

  it('throws when Thirdweb Transactions API env is not configured', async () => {
    const { createWithdrawalTransaction } = await import('../tx-creator');

    await expect(
      createWithdrawalTransaction({
        to: '0x000000000000000000000000000000000000dEaD',
        amount: 1n,
      })
    ).rejects.toThrow(
      'Thirdweb Transactions API is not configured (set THIRDWEB_SECRET_KEY and THIRDWEB_SERVER_WALLET)'
    );
  });

  it('uses the Thirdweb "fromAddress" request field first when creating transactions', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';

    const txHash = `0x${'1'.repeat(64)}`;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transactionHash: txHash }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBe(txHash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.thirdweb.com/v1/transactions');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.fromAddress).toBe(
      '0x000000000000000000000000000000000000dEaD'
    );
    expect(body.from).toBeUndefined();
  });

  it('falls back to "from" when the "fromAddress" request is rejected', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';

    const txHash = `0x${'2'.repeat(64)}`;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        text: async () => 'invalid sender field',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactionHash: txHash }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBe(txHash);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstInit.body)) as Record<
      string,
      unknown
    >;
    expect(firstBody.fromAddress).toBe(
      '0x000000000000000000000000000000000000dEaD'
    );
    expect(firstBody.from).toBeUndefined();

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondInit.body)) as Record<
      string,
      unknown
    >;
    expect(secondBody.fromAddress).toBeUndefined();
    expect(secondBody.from).toBe(
      '0x000000000000000000000000000000000000dEaD'
    );
  });

  it('falls back to "from" when "fromAddress" returns no transaction hash', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';

    const txHash = `0x${'3'.repeat(64)}`;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { queued: true } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ transactionHash: txHash }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBe(txHash);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const firstBody = JSON.parse(String(firstInit.body)) as Record<
      string,
      unknown
    >;
    expect(firstBody.fromAddress).toBe(
      '0x000000000000000000000000000000000000dEaD'
    );
    expect(firstBody.from).toBeUndefined();

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondBody = JSON.parse(String(secondInit.body)) as Record<
      string,
      unknown
    >;
    expect(secondBody.fromAddress).toBeUndefined();
    expect(secondBody.from).toBe(
      '0x000000000000000000000000000000000000dEaD'
    );
  });

  it('keeps queued transactionId without retrying sender field', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';
    process.env.THIRDWEB_STATUS_POLL_TIMEOUT_MS = '1';
    process.env.THIRDWEB_STATUS_POLL_INTERVAL_MS = '1';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { transactionIds: ['tw-queued-1'] } }),
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ result: { status: 'queued' } }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBeNull();
    expect(result.transactionId).toBe('tw-queued-1');
    const postCalls = fetchMock.mock.calls.filter(([, init]) => {
      return (init as RequestInit)?.method === 'POST';
    });
    expect(postCalls).toHaveLength(1);
  });

  it('does not fail queued transaction when status is SUBMITTED with empty error object', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';
    process.env.THIRDWEB_STATUS_POLL_TIMEOUT_MS = '1';
    process.env.THIRDWEB_STATUS_POLL_INTERVAL_MS = '1';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { transactionIds: ['tw-queued-err'] } }),
      })
      .mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({ result: { status: 'SUBMITTED', error: {} } }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBeNull();
    expect(result.transactionId).toBe('tw-queued-err');
  });

  it('resolves queued transactionId to txHash via status lookup', async () => {
    process.env.THIRDWEB_SECRET_KEY = 'test-secret-key';
    process.env.THIRDWEB_SERVER_WALLET =
      '0x000000000000000000000000000000000000dEaD';
    process.env.THIRDWEB_STATUS_POLL_TIMEOUT_MS = '500';
    process.env.THIRDWEB_STATUS_POLL_INTERVAL_MS = '1';

    const txHash = `0x${'4'.repeat(64)}`;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { transactionIds: ['tw-queued-2'] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            result: {
              status: 'submitted',
              transactionHash: txHash,
            },
          }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createWithdrawalTransaction } = await import('../tx-creator');

    const result = await createWithdrawalTransaction({
      to: '0x000000000000000000000000000000000000bEEF',
      amount: 1n,
    });

    expect(result.txHash).toBe(txHash);
    expect(result.transactionId).toBe('tw-queued-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
