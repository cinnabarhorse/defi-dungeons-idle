import { act, renderHook, waitFor } from '@testing-library/react';
import { useWalletConnection } from '../useWalletConnection';

const mockActiveAccount = {
  address: '0x2222222222222222222222222222222222222222',
  signMessage: jest.fn(),
};

jest.mock('thirdweb/react', () => ({
  useActiveAccount: jest.fn(),
  useActiveWallet: jest.fn(),
  useDisconnect: jest.fn(),
}));

jest.mock('thirdweb/extensions/ens', () => ({
  resolveName: jest.fn(),
}));

jest.mock('../../lib/web3/config', () => ({
  thirdwebClient: {},
}));

jest.mock('../../lib/server-url', () => ({
  getAppServerBaseUrl: () => 'https://api.test.com',
}));

jest.mock('../../lib/fetch-dedupe', () => ({
  fetchDedupe: jest.fn(),
}));

jest.mock('@base-org/account', () => ({
  createBaseAccountSDK: jest.fn(),
}));

jest.mock('siwe', () => ({
  SiweMessage: jest.fn().mockImplementation((args) => ({
    prepareMessage: jest.fn(() => 'Prepared SIWE message'),
    ...args,
  })),
}));

jest.mock('viem', () => ({
  getAddress: jest.fn((addr: string) => addr),
}));

import {
  useActiveAccount,
  useActiveWallet,
  useDisconnect,
} from 'thirdweb/react';
import { fetchDedupe } from '../../lib/fetch-dedupe';

const mockUseActiveAccount = useActiveAccount as jest.MockedFunction<
  typeof useActiveAccount
>;
const mockUseActiveWallet = useActiveWallet as jest.MockedFunction<
  typeof useActiveWallet
>;
const mockUseDisconnect = useDisconnect as jest.MockedFunction<
  typeof useDisconnect
>;

function jsonResponse(body: unknown, init?: { status?: number }) {
  const response = {
    ok: (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300,
    status: init?.status ?? 200,
    json: async () => body,
    clone() {
      return jsonResponse(body, init);
    },
  };

  return response as unknown as Response;
}

describe('useWalletConnection snapshot eligibility errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    jest.useRealTimers();

    mockUseActiveAccount.mockReturnValue(mockActiveAccount as any);
    mockUseActiveWallet.mockReturnValue(undefined);
    mockUseDisconnect.mockReturnValue({
      disconnect: jest.fn(),
    } as any);

    (fetchDedupe as jest.Mock).mockResolvedValue(
      jsonResponse(
        { address: null, playerId: null },
        { status: 401 }
      )
    );

    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/auth/nonce')) {
        return Promise.resolve(jsonResponse({ nonce: 'nonce-123' }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as jest.Mock;

    Object.defineProperty(window, 'ethereum', {
      value: {
        request: jest.fn(),
        selectedAddress: null,
        on: jest.fn(),
        removeListener: jest.fn(),
        isCoinbaseWallet: false,
        isCoinbase: false,
      },
      writable: true,
    });
  });

  it('surfaces ownership-required errors from /api/auth/verify', async () => {
    mockActiveAccount.signMessage.mockResolvedValue('signature');
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/nonce')) {
        return Promise.resolve(jsonResponse({ nonce: 'nonce-123' }));
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'WALLET_NOT_ELIGIBLE',
              error: 'Wallet is not eligible for today',
            },
            { status: 403 }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useWalletConnection());

    await act(async () => {
      await result.current.connectWallet();
    });

    await waitFor(() => {
      expect(result.current.errorCode).toBe('WALLET_NOT_ELIGIBLE');
    });

    expect(result.current.error).toContain('not eligible today');
    expect(result.current.sessionAddress).toBeNull();
  });

  it('surfaces snapshot outages from /api/auth/verify', async () => {
    mockActiveAccount.signMessage.mockResolvedValue('signature');
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/nonce')) {
        return Promise.resolve(jsonResponse({ nonce: 'nonce-123' }));
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'SNAPSHOT_MISSING',
              error: 'Daily gotchi ownership snapshot missing',
              date: '2026-02-23',
            },
            { status: 503 }
          )
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useWalletConnection());

    await act(async () => {
      await result.current.connectWallet();
    });

    await waitFor(() => {
      expect(result.current.errorCode).toBe('SNAPSHOT_MISSING');
    });

    expect(result.current.error).toContain('temporarily unavailable');
    expect(result.current.error).toContain('2026-02-23');
    expect(result.current.sessionAddress).toBeNull();
  });

  it('keeps the session but marks play as disabled when auth succeeds for an ineligible wallet', async () => {
    mockActiveAccount.signMessage.mockResolvedValue('signature');
    let sessionFetchCount = 0;
    (fetchDedupe as jest.Mock).mockImplementation(() => {
      sessionFetchCount += 1;
      if (sessionFetchCount === 1) {
        return Promise.resolve(
          jsonResponse(
            { address: null, playerId: null },
            { status: 401 }
          )
        );
      }
      return Promise.resolve(
        jsonResponse({
          address: '0x2222222222222222222222222222222222222222',
          playerId: 'player-123',
          canPlayToday: false,
          playErrorCode: 'WALLET_NOT_ELIGIBLE',
          playError: 'Wallet is not eligible for today',
        })
      );
    });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/nonce')) {
        return Promise.resolve(jsonResponse({ nonce: 'nonce-123' }));
      }
      if (url.includes('/api/auth/verify')) {
        return Promise.resolve(
          jsonResponse({
            address: '0x2222222222222222222222222222222222222222',
            playerId: 'player-123',
            canPlayToday: false,
            playErrorCode: 'WALLET_NOT_ELIGIBLE',
            playError: 'Wallet is not eligible for today',
          })
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { result } = renderHook(() => useWalletConnection());

    await act(async () => {
      await result.current.connectWallet();
    });

    await waitFor(() => {
      expect(result.current.sessionAddress).toBe(
        '0x2222222222222222222222222222222222222222'
      );
    });

    expect((result.current as any).canPlayToday).toBe(false);
    expect((result.current as any).playErrorCode).toBe('WALLET_NOT_ELIGIBLE');
    expect((result.current as any).playError).toBe(
      'Wallet is not eligible for today'
    );
  });

  it('refreshes session eligibility while play is disabled', async () => {
    jest.useFakeTimers();
    mockUseActiveAccount.mockReturnValue(undefined as any);
    let sessionFetchCount = 0;
    (fetchDedupe as jest.Mock).mockImplementation(() => {
      sessionFetchCount += 1;
      if (sessionFetchCount <= 2) {
        return Promise.resolve(
          jsonResponse({
            address: '0x2222222222222222222222222222222222222222',
            playerId: 'player-123',
            canPlayToday: false,
            playErrorCode: 'WALLET_NOT_ELIGIBLE',
            playError: 'Wallet is not eligible for today',
          })
        );
      }
      return Promise.resolve(
        jsonResponse({
          address: '0x2222222222222222222222222222222222222222',
          playerId: 'player-123',
          canPlayToday: false,
          playErrorCode: 'WALLET_NOT_ELIGIBLE',
          playError: 'Wallet is not eligible for today',
          acquiredAfterSnapshot: true,
          playResetAt: '2026-03-23T00:00:00.000Z',
        })
      );
    });

    const { result } = renderHook(() => useWalletConnection());

    await waitFor(() => {
      expect(result.current.sessionAddress).toBe(
        '0x2222222222222222222222222222222222222222'
      );
    });

    expect((result.current as any).acquiredAfterSnapshot).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect((result.current as any).acquiredAfterSnapshot).toBe(true);
    });
    expect((result.current as any).playResetAt).toBe('2026-03-23T00:00:00.000Z');
  });
});
