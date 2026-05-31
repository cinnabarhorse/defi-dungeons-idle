'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SiweMessage } from 'siwe';
import { getAddress as viemGetAddress } from 'viem';
import {
  useActiveAccount,
  useActiveWallet,
  useDisconnect,
} from 'thirdweb/react';
import { resolveName } from 'thirdweb/extensions/ens';
import { createBaseAccountSDK } from '@base-org/account';
import { thirdwebClient } from '../lib/web3/config';
import { getAppServerBaseUrl } from '../lib/server-url';
import { fetchDedupe } from '../lib/fetch-dedupe';
import { mapAuthVerifyError } from '../lib/session-errors';

const SERVER_BASE_URL = getAppServerBaseUrl();
const SIWE_DOMAIN =
  process.env.NEXT_PUBLIC_SIWE_DOMAIN ||
  (typeof window !== 'undefined' ? window.location.hostname : 'aavegotchi.com');
const SIWE_URI = process.env.NEXT_PUBLIC_SIWE_URI;
const SESSION_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
const LAST_WALLET_STORAGE_KEY = 'dd:last-wallet-address';
const PLAY_ELIGIBILITY_REFRESH_MS = 30_000;

function safeWindow(): Window | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window;
}

function getStoredLastWallet(): string | null {
  const win = safeWindow();
  if (!win) return null;
  try {
    const value = win.localStorage.getItem(LAST_WALLET_STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch (error) {
    console.warn('Unable to read last wallet address from storage', error);
    return null;
  }
}

function persistLastWallet(address: string | null) {
  const win = safeWindow();
  if (!win) return;
  try {
    if (!address) {
      win.localStorage.removeItem(LAST_WALLET_STORAGE_KEY);
    } else {
      win.localStorage.setItem(LAST_WALLET_STORAGE_KEY, address);
    }
  } catch (error) {
    console.warn('Unable to persist last wallet address', error);
  }
}

function toChecksumAddress(value: string): string {
  try {
    return viemGetAddress(value as any);
  } catch {
    // Fallback: return original if viem rejects; server will still checksum
    return value;
  }
}

export function useWalletConnection() {
  const activeAccount = useActiveAccount();

  const activeWallet = useActiveWallet();

  console.log('ACTIVE ACCOUNT', activeAccount?.address);

  const { disconnect } = useDisconnect();

  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [canPlayToday, setCanPlayToday] = useState<boolean | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [playErrorCode, setPlayErrorCode] = useState<string | null>(null);
  const [acquiredAfterSnapshot, setAcquiredAfterSnapshot] = useState(false);
  const [playResetAt, setPlayResetAt] = useState<string | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lastKnownWalletAddress, setLastKnownWalletAddress] = useState<
    string | null
  >(() => getStoredLastWallet());
  const [ensName, setEnsName] = useState<string | null>(null);
  const authInFlightRef = useRef(false);
  const lastAttemptedAddressRef = useRef<string | null>(null);
  const lastAuthenticatedAddressRef = useRef<string | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);
  const devLoginAttemptedRef = useRef(false);

  // DEV MODE: Auto-login when ?dev=true is in the URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (devLoginAttemptedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') !== 'true') return;

    devLoginAttemptedRef.current = true;
    setIsDevMode(true);

    (async () => {
      try {
        console.log('[DEV MODE] Attempting dev login...');
        const response = await fetch(`${SERVER_BASE_URL}/api/auth/dev-login`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!response.ok) {
          console.error('[DEV MODE] Dev login failed:', response.status);
          return;
        }

        const data = await response.json();
        console.log('[DEV MODE] Dev login success:', data);

        setSessionAddress(data.address);
        setPlayerId(data.playerId);
        lastAuthenticatedAddressRef.current = data.address;
      } catch (err) {
        console.error('[DEV MODE] Dev login error:', err);
      }
    })();
  }, []);

  const logoutServerSession = useCallback(async () => {
    try {
      await fetch(`${SERVER_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Failed to log out', err);
    }
  }, []);

  const updateKnownWallet = useCallback((address: string | null) => {
    const normalized = toChecksumAddress(address ?? '');
    if (normalized) {
      setLastKnownWalletAddress(normalized);
      persistLastWallet(normalized);
      // Kick off ENS resolution in background; result stored in context
      try {
        resolveName({ client: thirdwebClient, address: normalized as any })
          .then((name) => setEnsName(name ?? null))
          .catch(() => setEnsName(null));
      } catch {
        setEnsName(null);
      }
    } else {
      persistLastWallet(null);
      setLastKnownWalletAddress(null);
      setEnsName(null);
    }
  }, []);

  const isCheckingSessionRef = useRef(false);
  const activeAccountAddressRef = useRef<string | undefined>(
    activeAccount?.address
  );

  // Ref to hold authenticateWithServer to avoid circular dependency
  const authenticateWithServerRef = useRef<
    ((address: string, options?: { force?: boolean }) => Promise<void>) | null
  >(null);

  const applyPlayEligibility = useCallback(
    (payload: {
      canPlayToday?: boolean | null;
      playError?: string | null;
      playErrorCode?: string | null;
      acquiredAfterSnapshot?: boolean | null;
      playResetAt?: string | null;
    } | null | undefined) => {
      setCanPlayToday(
        typeof payload?.canPlayToday === 'boolean' ? payload.canPlayToday : null
      );
      setPlayError(
        typeof payload?.playError === 'string' ? payload.playError : null
      );
      setPlayErrorCode(
        typeof payload?.playErrorCode === 'string' ? payload.playErrorCode : null
      );
      setAcquiredAfterSnapshot(payload?.acquiredAfterSnapshot === true);
      setPlayResetAt(
        typeof payload?.playResetAt === 'string' ? payload.playResetAt : null
      );
    },
    []
  );

  // Keep ref in sync with latest activeAccount
  useEffect(() => {
    activeAccountAddressRef.current = activeAccount?.address;
  }, [activeAccount?.address]);

  const fetchExistingSession = useCallback(async () => {
    console.log('FETCH EXISTING SESSION');

    if (isCheckingSessionRef.current) {
      console.log('SESSION CHECKING (SKIPPED)');
      return;
    }

    isCheckingSessionRef.current = true;
    setIsCheckingSession(true);

    try {
      // Do not hydrate from localStorage for auth truth; rely on server cookie

      let response: Response | null = null;

      try {
        response = await fetchDedupe(`${SERVER_BASE_URL}/api/auth/session`, {
          credentials: 'include',
        });

        console.log('FETCH EXISTING SESSION RESPONSE', response);
      } catch (error) {
        // Network error: treat as no session and exit early
        console.error('Network error fetching session', error);
        setSessionAddress(null);
        setPlayerId(null);
        applyPlayEligibility(null);
        return;
      }

      if (!response) {
        setSessionAddress(null);
        setPlayerId(null);
        applyPlayEligibility(null);
        return;
      }

      // If server refused connection or returned non-JSON, guard parsing
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      console.log('DATA', data);

      const checksumSessionAddress = toChecksumAddress(data?.address ?? '');

      console.log('SESSION ADDRESS', checksumSessionAddress);

      // Use ref to get the LATEST activeAccount address, not the stale closure value
      const currentActiveAddress = activeAccountAddressRef.current;
      const checksumActiveAddress = currentActiveAddress
        ? toChecksumAddress(currentActiveAddress)
        : null;
      console.log('ACTIVE ACCOUNT ADDRESS', currentActiveAddress);
      console.log('CHECKSUM ACTIVE ADDRESS', checksumActiveAddress);

      //Case 1: Session exists and user is logged, but user is connected to a different account.
      // Compare checksummed addresses to avoid case-sensitive mismatches
      if (
        checksumActiveAddress &&
        checksumSessionAddress &&
        checksumSessionAddress !== checksumActiveAddress
      ) {
        console.log('CASE 1');

        console.log('DATA ADDRESS', data.address);
        console.log('ACTIVE ACCOUNT ADDRESS', currentActiveAddress);

        console.log('RESET SESSION DUE TO INVALID ACCOUNT');
        setSessionAddress(null);
        setPlayerId(null);
        setError(null);
        setErrorCode(null);
        applyPlayEligibility(null);
        lastAttemptedAddressRef.current = null;
        console.log('AUTHING NEW ACCOUNT WITH SERVER', checksumActiveAddress);
        await logoutServerSession();
        if (checksumActiveAddress && authenticateWithServerRef.current) {
          authenticateWithServerRef
            .current(checksumActiveAddress, { force: true })
            .catch((err) => {
              console.error('Failed to authenticate wallet', err);
            });
        }
        return;
      }

      //Case 2: There was a previous session, but user is not yet connected.
      else if (checksumSessionAddress && !currentActiveAddress) {
        console.log('CASE 2');

        const normalized = toChecksumAddress(data.address);
        setSessionAddress(normalized);
        updateKnownWallet(normalized);
        setPlayerId(data.playerId);
        applyPlayEligibility(data);

        console.log('set auth address', normalized);
        console.log('set known wallet', normalized);
      }

      //Case 3: Active account exists but no valid session (401/403). Re-auth needed.
      else if (currentActiveAddress && !response?.ok) {
        console.log('CASE 3');

        setSessionAddress(null);
        applyPlayEligibility(null);

        if (
          !authInFlightRef.current &&
          lastAttemptedAddressRef.current !== currentActiveAddress &&
          authenticateWithServerRef.current
        ) {
          authenticateWithServerRef
            .current(currentActiveAddress, { force: true })
            .catch((err) => {
              console.error('Failed to authenticate wallet', err);
            });
        }
      }

      //Case 4: No session found and no active account.
      else if (sessionAddress === null && !currentActiveAddress) {
        console.log('CASE 4');

        setSessionAddress(null);
        setPlayerId(null);
        applyPlayEligibility(null);
      }

      //Case 5: Session is valid and user is connected to the right account.
      else {
        console.log('CASE 5');

        const normalized = toChecksumAddress(data.address ?? '');

        setSessionAddress(normalized);
        updateKnownWallet(normalized);
        applyPlayEligibility(data);

        if (typeof data.playerId === 'string' && data.playerId) {
          setPlayerId(data.playerId);
        } else {
          setPlayerId(null);
        }
      }
    } catch (err) {
      console.error('Failed to restore session', err);
      setPlayerId(null);
    } finally {
      isCheckingSessionRef.current = false;
      setIsCheckingSession(false);
    }
    // Note: We intentionally don't include activeAccount?.address in deps
    // because we use activeAccountAddressRef.current to get the latest value.
    // authenticateWithServer is accessed via ref to avoid circular dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyPlayEligibility, logoutServerSession, sessionAddress, updateKnownWallet]);

  type SignOverride = (message: string) => Promise<string>;

  const authenticateWithServer = useCallback(
    async (
      address: string,
      options?: { signOverride?: SignOverride; force?: boolean }
    ) => {
      console.log('AUTHING WITH SERVER', address);

      if (!activeAccount) {
        return;
      }

      const currentCheckum = toChecksumAddress(address);

      console.log('CURRENT CHECKUM', currentCheckum);

      // Never run multiple concurrent auth flows
      if (authInFlightRef.current) {
        return;
      }
      if (!options?.force) {
        if (
          lastAttemptedAddressRef.current === currentCheckum ||
          lastAuthenticatedAddressRef.current === currentCheckum
        ) {
          return;
        }
      }

      lastAttemptedAddressRef.current = currentCheckum;
      authInFlightRef.current = true;
      setIsAuthenticating(true);
      setError(null);
      setErrorCode(null);

      try {
        console.log('fetching nonce');
        const nonceResponse = await fetch(`${SERVER_BASE_URL}/api/auth/nonce`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });

        if (!nonceResponse.ok) {
          throw new Error('Failed to fetch nonce');
        }

        const nonceData: {
          nonce: string;
          statement?: string;
          chainId?: number;
        } = await nonceResponse.json();

        const expiration = new Date(
          Date.now() + SESSION_EXPIRATION_MS
        ).toISOString();

        const message = new SiweMessage({
          domain: SIWE_DOMAIN,
          // Always supply a checksummed address to avoid SIWE checksum mismatch
          address: currentCheckum,
          statement:
            nonceData.statement || 'Sign in to DeFi Dungeons with your wallet.',
          uri:
            SIWE_URI ||
            (typeof window !== 'undefined' ? window.location.origin : ''),
          version: '1',
          chainId: nonceData.chainId ?? 8453,
          nonce: nonceData.nonce,
          expirationTime: expiration,
        });

        let preparedMessage = message.prepareMessage();

        if (!activeAccount) {
          throw new Error('No wallet connected');
        }

        let signature: string | null = null;
        let isSmartWallet = false;
        let isCoinbaseSmartWallet = false;

        isCoinbaseSmartWallet = activeWallet?.id === 'com.coinbase.wallet';

        console.log('isCoinbaseSmartWallet', isCoinbaseSmartWallet);

        if (isCoinbaseSmartWallet) {
          let usedWalletConnect = false;
          try {
            const baseAccountSDK = createBaseAccountSDK({
              appName: 'DeFi Dungeons',
            });
            const provider = baseAccountSDK.getProvider();

            if (provider?.request) {
              try {
                await provider.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: '0x2105' }],
                });
              } catch (switchErr: unknown) {
                if (
                  typeof switchErr === 'object' &&
                  switchErr !== null &&
                  'code' in switchErr &&
                  switchErr.code !== 4902 &&
                  switchErr.code !== 4001
                ) {
                  console.warn('Failed to switch to Base chain', switchErr);
                }
              }
            }

            const walletConnectResponse = (await provider?.request?.({
              method: 'wallet_connect',
              params: [
                {
                  version: '1',
                  capabilities: {
                    signInWithEthereum: {
                      nonce: nonceData.nonce,
                      chainId: '0x2105',
                      domain: SIWE_DOMAIN,
                      uri:
                        SIWE_URI ||
                        (typeof window !== 'undefined'
                          ? window.location.origin
                          : ''),
                      expirationTime: expiration,
                      issuedAt: new Date().toISOString(),
                    },
                  },
                },
              ],
            })) as {
              accounts: Array<{
                address: string;
                capabilities: {
                  signInWithEthereum: {
                    message: string;
                    signature: string;
                  };
                };
              }>;
            };

            const account = walletConnectResponse?.accounts?.[0];
            const { address: walletConnectAddress } = account || {};
            const { message, signature: walletConnectSignature } =
              account?.capabilities?.signInWithEthereum || {};

            if (message && walletConnectSignature && walletConnectAddress) {
              preparedMessage = String(message);
              signature = walletConnectSignature;
              isSmartWallet = true;
              usedWalletConnect = true;
            }
          } catch (wcErr) {
            console.warn('wallet_connect not supported, falling back', wcErr);
          }

          if (!usedWalletConnect) {
            signature = await activeAccount.signMessage({
              message: preparedMessage,
            });
            isSmartWallet = false;
          }
        } else {
          signature = await activeAccount.signMessage({
            message: preparedMessage,
          });
        }

        if (signature && signature.length > 200) {
          const sigHex = signature.toLowerCase();
          if (
            sigHex.includes('776562617574686e') ||
            sigHex.includes('6368616c6c656e6765') ||
            sigHex.includes('coinbase')
          ) {
            isSmartWallet = true;
          }
        }

        if (!signature) {
          throw new Error('Wallet did not return a signature');
        }

        const verifyResponse = await fetch(
          `${SERVER_BASE_URL}/api/auth/verify`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              message: preparedMessage,
              signature,
              isSmartWallet: isSmartWallet || isCoinbaseSmartWallet,
            }),
          }
        );

        if (!verifyResponse.ok) {
          const details = await verifyResponse.json().catch(() => null);
          const mapped = mapAuthVerifyError(details, verifyResponse.status);
          console.error('SIWE verify failed', {
            status: verifyResponse.status,
            error: details,
            mappedMessage: mapped.message,
            mappedCode: mapped.code,
          });

          const authError = new Error(mapped.message) as Error & {
            code?: string | null;
          };
          authError.code = mapped.code;
          throw authError;
        }

        const session: {
          address?: string | null;
          playerId?: string | null;
          isFirstLogin?: boolean;
          canPlayToday?: boolean | null;
          playError?: string | null;
          playErrorCode?: string | null;
          acquiredAfterSnapshot?: boolean | null;
          playResetAt?: string | null;
        } = await verifyResponse.json();

        console.log('NEW SESSION', session);

        const resolvedAddress = session.address
          ? toChecksumAddress(session.address)
          : currentCheckum;

        console.log('RESOLVED ADDRESS', resolvedAddress);

        setSessionAddress(resolvedAddress);
        updateKnownWallet(resolvedAddress);
        lastAuthenticatedAddressRef.current = resolvedAddress;
        setError(null);
        setErrorCode(null);
        applyPlayEligibility(session);

        if (typeof session.playerId === 'string' && session.playerId) {
          setPlayerId(session.playerId);
        }

        if (session.isFirstLogin) {
          try {
            const ev = new CustomEvent('dd-toast', {
              detail: {
                type: 'success',
                message:
                  'Welcome! Your daily runs reset each day at 00:00 UTC.',
              },
            });
            window.dispatchEvent(ev);
          } catch {}
        }
      } catch (err) {
        console.error('Failed to authenticate wallet', err);
        setError(
          err instanceof Error ? err.message : 'Failed to authenticate wallet'
        );
        applyPlayEligibility(null);
        setErrorCode(
          err &&
            typeof err === 'object' &&
            'code' in err &&
            typeof (err as { code?: unknown }).code === 'string'
            ? ((err as { code: string }).code ?? null)
            : null
        );
      } finally {
        authInFlightRef.current = false;
        setIsAuthenticating(false);
      }
    },
    [activeAccount, activeWallet, applyPlayEligibility, updateKnownWallet]
  );

  // Keep ref in sync with authenticateWithServer
  useEffect(() => {
    authenticateWithServerRef.current = authenticateWithServer;
  }, [authenticateWithServer]);

  const disconnectWallet = useCallback(async () => {
    console.log('DISCONNECTING WALLET');
    await logoutServerSession();

    setSessionAddress(null);
    setPlayerId(null);
    setError(null);
    setErrorCode(null);
    applyPlayEligibility(null);
    lastAttemptedAddressRef.current = null;
    lastAuthenticatedAddressRef.current = null;
    updateKnownWallet(null);

    try {
      if (activeWallet) {
        await disconnect(activeWallet);
      }
    } catch (err) {
      console.error('Failed to disconnect wallet', err);
    }
  }, [activeWallet, applyPlayEligibility, disconnect]);

  useEffect(() => {
    // Reset the checking ref when address changes so we can re-check
    isCheckingSessionRef.current = false;

    fetchExistingSession().catch((err) => {
      console.error('Failed to restore session', err);
    });
  }, [activeAccount?.address, fetchExistingSession]);

  useEffect(() => {
    if (
      activeAccount?.address &&
      !sessionAddress &&
      !isCheckingSession &&
      !authInFlightRef.current &&
      lastAttemptedAddressRef.current !== activeAccount.address
    ) {
      console.log('Account available after CASE 4, triggering authentication');
      authenticateWithServer(activeAccount.address, { force: true }).catch(
        (err) => {
          console.error('Failed to authenticate wallet after sign', err);
        }
      );
    }
  }, [
    activeAccount?.address,
    sessionAddress,
    isCheckingSession,
    authenticateWithServer,
  ]);

  useEffect(() => {
    if (!sessionAddress || canPlayToday !== false) {
      return;
    }

    const refreshPlayEligibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (authInFlightRef.current) {
        return;
      }
      fetchExistingSession().catch((err) => {
        console.error('Failed to refresh play eligibility', err);
      });
    };

    const intervalId = window.setInterval(
      refreshPlayEligibility,
      PLAY_ELIGIBILITY_REFRESH_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshPlayEligibility();
      }
    };

    window.addEventListener('focus', refreshPlayEligibility);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshPlayEligibility);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canPlayToday, fetchExistingSession, sessionAddress]);

  useEffect(() => {
    const unsubscribe = activeWallet?.subscribe(
      'accountsChanged',
      (accounts?: { address?: string }[] | string[]) => {
        console.log('accountsChanged event');

        const first = Array.isArray(accounts)
          ? typeof accounts[0] === 'string'
            ? (accounts[0] as string)
            : (accounts[0] as { address?: string })?.address
          : undefined;
        const nextAddress = first;
        if (!nextAddress) {
          return;
        }

        const nextChecksum = toChecksumAddress(nextAddress);
        updateKnownWallet(nextChecksum);

        // Always force re-authentication when wallet/account changes
        // Reset session to ensure UI gates until re-verified
        setSessionAddress(null);
        setPlayerId(null);
        setError(null);
        setErrorCode(null);
        applyPlayEligibility(null);

        lastAttemptedAddressRef.current = null;
        lastAuthenticatedAddressRef.current = null;

        const checksum = toChecksumAddress(nextAddress);
        setTimeout(() => {
          console.log('authenticating with server (accountChanged)', checksum);

          logoutServerSession()
            .catch(() => {})
            .finally(() => {
              authenticateWithServer(checksum, { force: true }).catch((err) => {
                console.error('Authentication error (accountChanged)', err);
              });
            });
        }, 150);
      }
    );

    return () => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch {
        // no-op
      }
    };
  }, [
    activeWallet,
    applyPlayEligibility,
    sessionAddress,
    authenticateWithServer,
    updateKnownWallet,
    logoutServerSession,
  ]);

  const connectWallet = useCallback(async () => {
    if (!activeAccount?.address) {
      throw new Error('No active wallet connected');
    }

    // User-initiated retries should always attempt a fresh auth flow.
    await authenticateWithServer(activeAccount.address, { force: true });
  }, [activeAccount?.address, authenticateWithServer]);

  const hasActiveWallet = Boolean(activeAccount?.address) || isDevMode;
  const hasValidSession = Boolean(sessionAddress);
  const isSessionSynced = (() => {
    // In dev mode, session is always synced if we have a session
    if (isDevMode && sessionAddress) return true;

    const a = sessionAddress ?? '';
    const b = activeAccount?.address || lastKnownWalletAddress || '';
    if (!a || !b) return false;
    // Normalize both to checksum format for comparison
    const checksumA = toChecksumAddress(a);
    const checksumB = toChecksumAddress(b);
    return checksumA === checksumB;
  })();

  return useMemo(
    () => ({
      isWalletConnected: hasValidSession,
      walletAddress: sessionAddress || activeAccount?.address || '',
      sessionAddress,
      isConnecting: isAuthenticating,
      connectWallet,
      disconnectWallet,
      error,
      errorCode,
      canPlayToday,
      playError,
      playErrorCode,
      acquiredAfterSnapshot,
      playResetAt,
      hasActiveWallet,
      hasValidSession,
      isSessionVerified:
        sessionAddress !== null && sessionAddress !== undefined,
      isSessionSynced,
      playerId,
      lastKnownWalletAddress,
      ensName,
    }),
    [
      hasValidSession,
      sessionAddress,
      activeAccount?.address,
      isAuthenticating,
      connectWallet,
      disconnectWallet,
      error,
      errorCode,
      canPlayToday,
      playError,
      playErrorCode,
      acquiredAfterSnapshot,
      playResetAt,
      hasActiveWallet,
      isSessionSynced,
      playerId,
      lastKnownWalletAddress,
      ensName,
    ]
  );
}
