'use client';

import { useEffect, useState } from 'react';
import { ConnectButton, useActiveAccount } from 'thirdweb/react';
import { resolveName } from 'thirdweb/extensions/ens';
import { useSession } from './providers/SessionProvider';
import {
  appName,
  supportedChains,
  supportedWallets,
  thirdwebClient,
} from '../lib/web3/config';
import { Button } from './ui/Button';

interface WalletConnectControlProps {
  variant?: 'desktop' | 'mobile' | 'landing';
}

export function WalletConnectControl({
  variant = 'desktop',
}: WalletConnectControlProps) {
  function formatAddress(address: string) {
    if (!address) {
      return '';
    }
    const start = address.slice(0, 6);
    const end = address.slice(-4);
    return `${start}...${end}`;
  }

  const connectClassName =
    variant === 'landing'
      ? 'h-11 min-h-11 max-h-11 px-6 text-base font-semibold uppercase tracking-[0.3em] bg-purple-600 hover:bg-purple-500 transition'
      : 'h-5 min-h-5 max-h-5 w-[120px] px-0 font-hud text-sm bg-transparent whitespace-nowrap overflow-hidden text-ellipsis';

  const connectStyle =
    variant === 'landing'
      ? {
          minWidth: 'fit-content',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: 'fit-content',
          height: 44,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 24,
          paddingRight: 24,
        }
      : {
          minWidth: 'fit-content',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: 'fit-content',
          height: 20,
          paddingTop: 0,
          paddingBottom: 0,
          paddingLeft: 10,
          paddingRight: 10,
        };

  const detailsClassName =
    variant === 'landing'
      ? 'h-11 min-h-11 max-h-11 leading-[44px] flex items-center overflow-hidden'
      : 'h-5 min-h-5 max-h-5 leading-[20px] flex items-center overflow-hidden';

  const detailsStyle = variant === 'landing' ? { height: 44 } : { height: 20 };

  return (
    <ConnectButton
      client={thirdwebClient}
      wallets={supportedWallets}
      chains={supportedChains}
      theme="dark"
      appMetadata={{ name: appName }}
      connectButton={{
        label: 'Connect Wallet',
        className: connectClassName,
        style: connectStyle,
      }}
      detailsButton={{
        className: detailsClassName,
        style: detailsStyle,
        render: function AddressOnly() {
          const session = useSession();
          const activeAccount = useActiveAccount();
          const [ensName, setEnsName] = useState<string | null>(
            session?.ensName || null
          );

          useEffect(() => {
            let cancelled = false;
            // Prefer already-resolved ENS from session context
            if (session?.ensName) return;
            setEnsName(null);
            const addr = activeAccount?.address;
            if (!addr) return;
            // Resolve ENS primary name for the connected address (if any)
            resolveName({ client: thirdwebClient, address: addr })
              .then((name) => {
                if (!cancelled) setEnsName(name ?? null);
              })
              .catch(() => {
                if (!cancelled) setEnsName(null);
              });
            return () => {
              cancelled = true;
            };
          }, [activeAccount?.address, session?.ensName]);

          const label = ensName || formatAddress(activeAccount?.address || '');
          return (
            <Button
              variant="ghost"
              size="sm"
              className={
                variant === 'landing'
                  ? 'bg-transparent hover:bg-transparent px-3 h-11 min-h-11 max-h-11 text-base uppercase tracking-[0.3em] whitespace-nowrap overflow-hidden text-ellipsis'
                  : 'font-hud bg-transparent hover:bg-transparent px-0 h-5 min-h-5 max-h-5 leading-[20px] text-sm w-fit whitespace-nowrap overflow-hidden text-ellipsis'
              }
            >
              {label || 'Connected'}
            </Button>
          );
        },
      }}
    />
  );
}
