'use client';

import { useEffect, useState } from 'react';
import { getContract, readContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { thirdwebClient } from '../lib/web3/config';
import { GAMEPOINTS_CONTRACT_ADDRESS } from '../lib/topup/constants';
import { ERC20_ABI } from '../lib/topup/abi';
import { formatUnits } from 'viem';

// Aave interest-generating GHO token address on Base
const GHO_TOKEN_ADDRESS = '0x067ae75628177fd257c2b1e500993e1a0babcbd1';
const GHO_DECIMALS = 18;

export function useTotalPrincipalLocked() {
  const [totalPrincipal, setTotalPrincipal] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTotalPrincipal() {
      try {
        setIsLoading(true);
        setError(null);

        const ghoContract = getContract({
          client: thirdwebClient,
          chain: base,
          address: GHO_TOKEN_ADDRESS,
          abi: ERC20_ABI,
        });

        const balance = (await readContract({
          contract: ghoContract,
          method: 'balanceOf',
          params: [GAMEPOINTS_CONTRACT_ADDRESS],
        })) as bigint;

        if (cancelled) return;

        // Format with 18 decimals (GHO uses 18 decimals)
        const formatted = formatUnits(balance, GHO_DECIMALS);
        setTotalPrincipal(formatted);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch GHO balance:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to fetch GHO balance')
        );
        setTotalPrincipal(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchTotalPrincipal();

    // Refresh every 30 seconds
    const interval = setInterval(fetchTotalPrincipal, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { totalPrincipal, isLoading, error };
}
