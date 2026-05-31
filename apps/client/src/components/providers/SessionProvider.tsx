'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useWalletConnection } from '../../hooks/useWalletConnection';

export interface SessionContextValue {
  isWalletConnected: boolean;
  walletAddress: string;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  error: string | null;
  errorCode: string | null;
  canPlayToday: boolean | null;
  playError: string | null;
  playErrorCode: string | null;
  acquiredAfterSnapshot: boolean;
  playResetAt: string | null;
  hasActiveWallet: boolean;
  hasValidSession: boolean;
  isSessionVerified: boolean;
  isSessionSynced: boolean;
  playerId: string | null;
  lastKnownWalletAddress: string | null;
  ensName: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const value = useWalletConnection();
  return (
    <SessionContext.Provider value={value as any}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
