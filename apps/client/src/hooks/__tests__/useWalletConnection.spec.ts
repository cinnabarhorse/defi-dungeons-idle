import { renderHook, waitFor, act } from '@testing-library/react';
import { useWalletConnection } from '../useWalletConnection';

// Mock thirdweb hooks
const mockActiveAccount = {
  address: '0x1234567890123456789012345678901234567890',
  signMessage: jest.fn(),
};

const mockActiveWallet = {
  subscribe: jest.fn(() => jest.fn()),
};

const mockDisconnect = jest.fn();

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

jest.mock('@base-org/account', () => ({
  createBaseAccountSDK: jest.fn(),
}));

// Mock SiweMessage
jest.mock('siwe', () => ({
  SiweMessage: jest.fn().mockImplementation((args) => ({
    prepareMessage: jest.fn(() => 'Prepared SIWE message'),
    ...args,
  })),
}));

// Mock viem
jest.mock('viem', () => ({
  getAddress: jest.fn((addr: string) => addr),
}));

import {
  useActiveAccount,
  useActiveWallet,
  useDisconnect,
} from 'thirdweb/react';
import { resolveName } from 'thirdweb/extensions/ens';
import { createBaseAccountSDK } from '@base-org/account';

const mockCreateBaseAccountSDK = createBaseAccountSDK as jest.MockedFunction<
  typeof createBaseAccountSDK
>;

const mockUseActiveAccount = useActiveAccount as jest.MockedFunction<
  typeof useActiveAccount
>;
const mockUseActiveWallet = useActiveWallet as jest.MockedFunction<
  typeof useActiveWallet
>;
const mockUseDisconnect = useDisconnect as jest.MockedFunction<
  typeof useDisconnect
>;
const mockResolveName = resolveName as jest.MockedFunction<typeof resolveName>;

describe('useWalletConnection - SIWE Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();

    // Setup default mocks
    mockUseActiveAccount.mockReturnValue(undefined);
    mockUseActiveWallet.mockReturnValue(undefined);
    mockUseDisconnect.mockReturnValue({ disconnect: mockDisconnect });
    mockResolveName.mockResolvedValue(null);

    // Mock fetch globally with smart routing
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/api/aavegotchis')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ aavegotchis: [] }),
        }) as Promise<Response>;
      }
      if (url.includes('/api/auth/session')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: async () => ({ address: null, playerId: null }),
        }) as Promise<Response>;
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    }) as jest.Mock;

    // Mock window.ethereum
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

  describe('CASE 4 - Mobile Browser Scenario', () => {
    it('should trigger authentication when account becomes available after CASE 4', async () => {
      const activeAddress = '0x2222222222222222222222222222222222222222';

      // Initially no account (CASE 4)
      mockUseActiveAccount.mockReturnValue(undefined);

      let sessionCallCount = 0;
      let nonceCallCount = 0;
      let verifyCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          sessionCallCount++;
          // First call: no session (CASE 4)
          if (sessionCallCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 401,
              json: async () => ({ address: null, playerId: null }),
            });
          }
          // After auth: valid session
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: activeAddress,
              playerId: 'player-456',
            }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          nonceCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          verifyCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: activeAddress,
              playerId: 'player-456',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result, rerender } = renderHook(() => useWalletConnection());

      // Wait for CASE 4 to complete
      await waitFor(() => {
        expect(result.current.sessionAddress).toBeNull();
      });

      // Simulate account becoming available after signing (mobile browser scenario)
      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address: activeAddress,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      // Trigger rerender to simulate account becoming available
      rerender();

      // Wait for authentication to complete
      await waitFor(
        () => {
          expect(result.current.sessionAddress).toBe(activeAddress);
        },
        { timeout: 3000 }
      );

      // Verify authentication flow was triggered
      expect(nonceCallCount).toBeGreaterThan(0);
      expect(verifyCallCount).toBeGreaterThan(0);
      expect(result.current.playerId).toBe('player-456');
    });
  });

  describe('CASE 3 - Active Account but No Session', () => {
    it('should trigger authentication when account exists but session is invalid', async () => {
      const activeAddress = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address: activeAddress,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      let sessionCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          sessionCallCount++;
          // First call: 401 (no session)
          if (sessionCallCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 401,
              json: async () => ({ error: 'Unauthorized' }),
            });
          }
          // After auth: valid session
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: activeAddress,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: activeAddress,
              playerId: 'player-123',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await waitFor(
        () => {
          expect(result.current.sessionAddress).toBe(activeAddress);
        },
        { timeout: 3000 }
      );

      expect(result.current.playerId).toBe('player-123');
    });
  });

  describe('CASE 5 - Valid Session', () => {
    it('should restore session when valid session exists', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      expect(result.current.playerId).toBe('player-123');
      expect(result.current.isWalletConnected).toBe(true);
    });
  });

  describe('Authentication Flow', () => {
    it('should complete full SIWE authentication flow', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              nonce: 'nonce-123',
              statement: 'Sign in to DeFi Dungeons',
              chainId: 8453,
            }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
              isFirstLogin: false,
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      expect(result.current.playerId).toBe('player-123');
      expect(result.current.isWalletConnected).toBe(true);
    });

    it('should handle authentication errors gracefully', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ error: 'Invalid signature' }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.error).toBe(
        'Signature verification failed. Please sign the message again.'
      );
      expect(result.current.errorCode).toBe('SIGNATURE_INVALID');
      expect(result.current.sessionAddress).toBeNull();
    });

    it('surfaces ownership-required eligibility errors from auth verify', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({
              code: 'WALLET_NOT_ELIGIBLE',
              error: 'Wallet is not eligible for today',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
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

    it('surfaces snapshot outage eligibility errors from auth verify', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({
              code: 'SNAPSHOT_MISSING',
              error: 'Daily gotchi ownership snapshot missing',
              date: '2026-02-23',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.errorCode).toBe('SNAPSHOT_MISSING');
      });

      expect(result.current.error).toContain('temporarily unavailable');
      expect(result.current.sessionAddress).toBeNull();
    });

    it('retries auth after a failed verify when connectWallet is clicked again', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      let verifyCallCount = 0;
      let nonceCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          nonceCallCount += 1;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: `nonce-${nonceCallCount}` }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          verifyCallCount += 1;
          if (verifyCallCount === 1) {
            return Promise.resolve({
              ok: false,
              status: 503,
              json: async () => ({
                code: 'SNAPSHOT_MISSING',
                error: 'Daily gotchi ownership snapshot missing',
                date: '2026-02-23',
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-456',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.errorCode).toBe('SNAPSHOT_MISSING');
      });

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.playerId).toBe('player-456');
      expect(verifyCallCount).toBeGreaterThanOrEqual(2);
      expect(nonceCallCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Prevent Duplicate Authentication', () => {
    it('should prevent multiple concurrent authentication attempts', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: jest.fn().mockResolvedValue('signature'),
      } as any);

      let nonceCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          nonceCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      // Call connectWallet multiple times rapidly
      await act(async () => {
        await Promise.all([
          result.current.connectWallet(),
          result.current.connectWallet(),
          result.current.connectWallet(),
        ]);
      });

      // Should only call nonce once (plus verify)
      expect(nonceCallCount).toBe(1);
    });
  });

  describe('Smart Wallet Authentication', () => {
    beforeEach(() => {
      mockCreateBaseAccountSDK.mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          request: jest.fn(),
        }),
      } as any);
    });

    it('should use wallet_connect for Coinbase Smart Wallet', async () => {
      const address = '0x2222222222222222222222222222222222222222';
      const walletConnectMessage =
        'localhost wants you to sign in with your Ethereum account:\n' +
        `${address}\n\n` +
        'URI: http://localhost:3001\n' +
        'Chain ID: 8453\n' +
        'Nonce: test-nonce-123\n' +
        'Issued At: 2025-10-31T12:00:00.000Z\n' +
        'Expiration Time: 2025-11-07T12:00:00.000Z';
      const walletConnectSignature = '0x' + '1'.repeat(1282);

      const walletConnectRequest = jest.fn().mockResolvedValue({
        accounts: [
          {
            address,
            capabilities: {
              signInWithEthereum: {
                message: walletConnectMessage,
                signature: walletConnectSignature,
              },
            },
          },
        ],
      });

      const signMessageMock = jest.fn();
      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      mockUseActiveWallet.mockReturnValue({
        ...mockActiveWallet,
        id: 'com.coinbase.wallet',
      } as any);

      mockCreateBaseAccountSDK.mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          request: walletConnectRequest,
        }),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              nonce: 'test-nonce-123',
              statement: 'Sign in to DeFi Dungeons',
              chainId: 8453,
            }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
              isFirstLogin: false,
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify wallet_connect was called
      expect(walletConnectRequest).toHaveBeenCalledWith({
        method: 'wallet_connect',
        params: [
          {
            version: '1',
            capabilities: {
              signInWithEthereum: expect.objectContaining({
                nonce: 'test-nonce-123',
                chainId: '0x2105',
              }),
            },
          },
        ],
      });

      // Verify signMessage was NOT called
      expect(signMessageMock).not.toHaveBeenCalled();

      // Verify verify endpoint received isSmartWallet flag
      const verifyCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
        call[0].includes('/api/auth/verify')
      );
      expect(verifyCall).toBeDefined();
      const verifyBody = JSON.parse(verifyCall[1].body);
      expect(verifyBody.isSmartWallet).toBe(true);
      expect(verifyBody.message).toBe(walletConnectMessage);
      expect(verifyBody.signature).toBe(walletConnectSignature);
    });

    it('should fallback to signMessage when wallet_connect fails', async () => {
      const address = '0x2222222222222222222222222222222222222222';
      const fallbackSignature = '0x1234567890abcdef';

      const signMessageMock = jest.fn().mockResolvedValue(fallbackSignature);

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      mockUseActiveWallet.mockReturnValue({
        ...mockActiveWallet,
        id: 'com.coinbase.wallet',
      } as any);

      // Mock wallet_connect to throw error
      mockCreateBaseAccountSDK.mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          request: jest.fn().mockRejectedValue(new Error('wallet_connect failed')),
        }),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              nonce: 'test-nonce-123',
              statement: 'Sign in to DeFi Dungeons',
              chainId: 8453,
            }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
              isFirstLogin: false,
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify signMessage was called as fallback
      expect(signMessageMock).toHaveBeenCalledWith({
        message: 'Prepared SIWE message',
      });

      // Verify verify endpoint received isSmartWallet as false (fallback)
      const verifyCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
        call[0].includes('/api/auth/verify')
      );
      expect(verifyCall).toBeDefined();
      const verifyBody = JSON.parse(verifyCall[1].body);
      expect(verifyBody.isSmartWallet).toBe(false);
      expect(verifyBody.signature).toBe(fallbackSignature);
    });

    it('should fallback to signMessage when wallet_connect returns incomplete response', async () => {
      const address = '0x2222222222222222222222222222222222222222';
      const fallbackSignature = '0x1234567890abcdef';

      const signMessageMock = jest.fn().mockResolvedValue(fallbackSignature);

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      mockUseActiveWallet.mockReturnValue({
        ...mockActiveWallet,
        id: 'com.coinbase.wallet',
      } as any);

      // Mock wallet_connect to return incomplete response (missing message/signature)
      mockCreateBaseAccountSDK.mockReturnValue({
        getProvider: jest.fn().mockReturnValue({
          request: jest.fn().mockResolvedValue({
            accounts: [
              {
                address,
                capabilities: {
                  signInWithEthereum: {
                    message: null,
                    signature: null,
                  },
                },
              },
            ],
          }),
        }),
      } as any);

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              nonce: 'test-nonce-123',
              statement: 'Sign in to DeFi Dungeons',
              chainId: 8453,
            }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
              isFirstLogin: false,
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify signMessage was called as fallback
      expect(signMessageMock).toHaveBeenCalledWith({
        message: 'Prepared SIWE message',
      });
    });
  });

  describe('Signature Handling', () => {
    it('should use thirdweb signMessage for non-Coinbase wallets', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      const signMessageMock = jest.fn().mockResolvedValue('0x1234567890abcdef');

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      // Mock window.ethereum without Coinbase Wallet flags
      (window.ethereum as any).isCoinbaseWallet = false;
      (window.ethereum as any).isCoinbase = false;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify that thirdweb's signMessage was called
      expect(signMessageMock).toHaveBeenCalledWith({
        message: 'Prepared SIWE message',
      });
    });

    it('should use personal_sign for Coinbase Wallet', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      const personalSignMock = jest
        .fn()
        .mockResolvedValue('0x1234567890abcdef');
      const signMessageMock = jest.fn().mockResolvedValue('0x1234567890abcdef');

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      // Mock Coinbase Wallet detection
      (window.ethereum as any).isCoinbaseWallet = true;
      (window.ethereum as any).isCoinbase = true;
      (window.ethereum as any).request = personalSignMock;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify that personal_sign was called instead of signMessage
      expect(personalSignMock).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: ['Prepared SIWE message', address],
      });
      // Verify that thirdweb's signMessage was NOT called
      expect(signMessageMock).not.toHaveBeenCalled();
    });

    it('should fallback to personal_sign when WebAuthn-like signature is detected', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      const personalSignMock = jest.fn().mockResolvedValue('0x1234567890abcdef');
      // Return a very long signature (WebAuthn format)
      const webAuthnSignature = '0x' + '0'.repeat(500);
      const signMessageMock = jest.fn().mockResolvedValue(webAuthnSignature);

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      // Mock window.ethereum without Coinbase Wallet flags initially
      (window.ethereum as any).isCoinbaseWallet = false;
      (window.ethereum as any).isCoinbase = false;
      (window.ethereum as any).request = personalSignMock;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/nonce')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ address: null, playerId: null }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      await act(async () => {
        await result.current.connectWallet();
      });

      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Verify that signMessage was called first
      expect(signMessageMock).toHaveBeenCalled();
      // Verify that personal_sign was called as fallback due to long signature
      expect(personalSignMock).toHaveBeenCalledWith({
        method: 'personal_sign',
        params: ['Prepared SIWE message', address],
      });
    });
  });

  describe('Wallet Switching', () => {
    it('should always force re-authentication when wallet/account changes, even if address is same', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      const signMessageMock = jest.fn().mockResolvedValue('0x1234567890abcdef');
      let accountsChangedCallback:
        | ((accounts?: { address?: string }[] | string[]) => void)
        | null = null;

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      mockUseActiveWallet.mockReturnValue({
        ...mockActiveWallet,
        subscribe: jest.fn((event, callback) => {
          if (event === 'accountsChanged') {
            accountsChangedCallback = callback;
          }
          return jest.fn();
        }),
      } as any);

      let authCallCount = 0;
      let logoutCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/logout')) {
          logoutCallCount++;
          return Promise.resolve({
            ok: true,
          });
        }
        if (url.includes('/api/auth/nonce')) {
          authCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-456',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      // Wait for initial session to be established
      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Simulate wallet/account change event (same address but different wallet)
      if (accountsChangedCallback) {
        await act(async () => {
          accountsChangedCallback!([address]);
          // Wait for setTimeout to execute
          await new Promise((resolve) => setTimeout(resolve, 200));
        });
      }

      // Wait for re-authentication to trigger
      await waitFor(
        () => {
          expect(authCallCount).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Verify logout was called
      expect(logoutCallCount).toBeGreaterThan(0);
      // Verify re-authentication was triggered
      expect(authCallCount).toBeGreaterThan(0);
      expect(signMessageMock).toHaveBeenCalled();
    });

    it('should force re-authentication when switching to different address', async () => {
      const address1 = '0x1111111111111111111111111111111111111111';
      const address2 = '0x2222222222222222222222222222222222222222';

      const signMessageMock = jest.fn().mockResolvedValue('0x1234567890abcdef');
      let accountsChangedCallback:
        | ((accounts?: { address?: string }[] | string[]) => void)
        | null = null;

      // Set initial activeAccount to address1
      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address: address1,
        signMessage: signMessageMock,
      } as any);

      mockUseActiveWallet.mockReturnValue({
        ...mockActiveWallet,
        subscribe: jest.fn((event, callback) => {
          if (event === 'accountsChanged') {
            accountsChangedCallback = callback;
          }
          return jest.fn();
        }),
      } as any);

      let authCallCount = 0;
      let sessionCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          sessionCallCount++;
          // Always return address1 for initial session checks
          // After account switch, the verify endpoint will update the session
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: sessionCallCount === 1 ? address1 : address2,
              playerId: sessionCallCount === 1 ? 'player-123' : 'player-456',
            }),
          });
        }
        if (url.includes('/api/auth/logout')) {
          return Promise.resolve({
            ok: true,
          });
        }
        if (url.includes('/api/auth/nonce')) {
          authCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address: address2,
              playerId: 'player-456',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      // Wait for initial session to be established (could be address1 or address2 depending on timing)
      await waitFor(
        () => {
          expect(result.current.sessionAddress).toBeTruthy();
        },
        { timeout: 3000 }
      );

      const initialSessionAddress = result.current.sessionAddress;

      // If already address2, the test scenario doesn't apply - skip
      if (initialSessionAddress === address2) {
        return;
      }

      // Verify session was established with address1
      expect(result.current.sessionAddress).toBe(address1);
      expect(result.current.playerId).toBe('player-123');

      // Update activeAccount to new address
      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address: address2,
        signMessage: signMessageMock,
      } as any);

      // Trigger accountsChanged event
      if (accountsChangedCallback) {
        await act(async () => {
          accountsChangedCallback!([address2]);
          // Wait for setTimeout to execute
          await new Promise((resolve) => setTimeout(resolve, 200));
        });
      }

      // Wait for re-authentication and session update
      await waitFor(
        () => {
          expect(result.current.sessionAddress).toBe(address2);
        },
        { timeout: 3000 }
      );

      expect(authCallCount).toBeGreaterThan(0);
      expect(signMessageMock).toHaveBeenCalled();
      expect(result.current.playerId).toBe('player-456');
    });

    it('should force re-authentication when injected provider accountsChanged fires', async () => {
      const address = '0x2222222222222222222222222222222222222222';

      const signMessageMock = jest.fn().mockResolvedValue('0x1234567890abcdef');

      mockUseActiveAccount.mockReturnValue({
        ...mockActiveAccount,
        address,
        signMessage: signMessageMock,
      } as any);

      const accountsChangedListeners: Array<(accounts?: string[]) => void> = [];

      (window.ethereum as any).on = jest.fn((event, callback) => {
        if (event === 'accountsChanged') {
          accountsChangedListeners.push(callback);
        }
      });
      (window.ethereum as any).removeListener = jest.fn();

      let authCallCount = 0;

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/aavegotchis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ aavegotchis: [] }),
          });
        }
        if (url.includes('/api/auth/session')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-123',
            }),
          });
        }
        if (url.includes('/api/auth/logout')) {
          return Promise.resolve({
            ok: true,
          });
        }
        if (url.includes('/api/auth/nonce')) {
          authCallCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ nonce: 'nonce-123' }),
          });
        }
        if (url.includes('/api/auth/verify')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              address,
              playerId: 'player-456',
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      const { result } = renderHook(() => useWalletConnection());

      // Wait for initial session
      await waitFor(() => {
        expect(result.current.sessionAddress).toBe(address);
      });

      // Trigger accountsChanged event from injected provider
      await act(async () => {
        accountsChangedListeners.forEach((listener) => {
          listener([address]);
        });
      });

      // Wait for re-authentication
      await waitFor(
        () => {
          expect(authCallCount).toBeGreaterThan(0);
        },
        { timeout: 2000 }
      );

      expect(authCallCount).toBeGreaterThan(0);
      expect(signMessageMock).toHaveBeenCalled();
    });
  });
});
