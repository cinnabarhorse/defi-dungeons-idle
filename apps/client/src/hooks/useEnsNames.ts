'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveName } from 'thirdweb/extensions/ens';
import { thirdwebClient } from '../lib/web3/config';
import { getAddress as viemGetAddress } from 'viem';

function toViemAddress(value: string): `0x${string}` | null {
  try {
    return viemGetAddress(value as any);
  } catch {
    return null;
  }
}

export interface UseEnsNamesResult {
  ensByAddress: Record<string, string | null>;
  isResolving: boolean;
}

export function useEnsNames(
  addressesInput: Array<string | null | undefined>
): UseEnsNamesResult {
  const [ensByAddress, setEnsByAddress] = useState<Record<string, string | null>>({});
  const [isResolving, setIsResolving] = useState(false);

  const addresses = useMemo(() => {
    const set = new Set<string>();
    for (const a of addressesInput) {
      if (a) set.add(a);
    }
    return Array.from(set);
  }, [addressesInput]);

  useEffect(() => {
    const toResolve = addresses.filter((addr) => !(addr in ensByAddress));
    if (toResolve.length === 0) return;

    let cancelled = false;
    setIsResolving(true);
    (async () => {
      await Promise.allSettled(
        toResolve.map((addr) => {
          const viemAddr = toViemAddress(addr);
          if (!viemAddr) {
            if (!cancelled) {
              setEnsByAddress((prev) =>
                prev[addr] !== undefined ? prev : { ...prev, [addr]: null }
              );
            }
            return Promise.resolve(null);
          }
          return resolveName({ client: thirdwebClient, address: viemAddr })
            .then((name) => {
              if (cancelled) return;
              setEnsByAddress((prev) =>
                prev[addr] !== undefined ? prev : { ...prev, [addr]: name ?? null }
              );
            })
            .catch(() => {
              if (cancelled) return;
              setEnsByAddress((prev) =>
                prev[addr] !== undefined ? prev : { ...prev, [addr]: null }
              );
            });
        })
      );
      if (!cancelled) setIsResolving(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [addresses, ensByAddress]);

  return { ensByAddress, isResolving };
}
