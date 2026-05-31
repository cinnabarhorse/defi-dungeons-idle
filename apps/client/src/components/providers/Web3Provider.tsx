'use client';

import { ReactNode } from 'react';
import { ThirdwebProvider } from 'thirdweb/react';

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return <ThirdwebProvider>{children}</ThirdwebProvider>;
}
