'use client';

import { useCallback, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { useSession } from './providers/SessionProvider';

export interface ApplyForAlphaProps {
  url?: string;
  className?: string;
  ctaLabel?: string;
}

export function ApplyForAlpha({
  url,
  className,
  ctaLabel = 'Retry Wallet Sign-In',
}: ApplyForAlphaProps) {
  const {
    hasActiveWallet,
    connectWallet,
    isConnecting,
    error,
    errorCode,
  } = useSession();
  const [localError, setLocalError] = useState<string | null>(null);

  const helpUrl =
    url ||
    (process.env.NEXT_PUBLIC_OWNERSHIP_HELP_URL as string | undefined) ||
    'https://wiki.aavegotchi.com/';

  const handleRetry = useCallback(async () => {
    if (!hasActiveWallet || isConnecting) {
      return;
    }
    setLocalError(null);
    try {
      await connectWallet();
    } catch (retryError) {
      setLocalError(
        retryError instanceof Error
          ? retryError.message
          : 'Failed to retry wallet sign-in.'
      );
    }
  }, [connectWallet, hasActiveWallet, isConnecting]);

  const handleOpenGuide = useCallback(() => {
    if (helpUrl.startsWith('/')) {
      window.location.href = helpUrl;
      return;
    }
    window.open(helpUrl, '_blank', 'noopener,noreferrer');
  }, [helpUrl]);

  return (
    <div
      className={cn(
        'w-full rounded-lg border border-yellow-400/30 bg-yellow-500/10 p-4 text-left',
        className
      )}
    >
      <div className="mb-1 text-sm font-semibold text-yellow-100">
        Aavegotchi Ownership Required
      </div>
      <p className="text-xs text-yellow-50/90">
        This wallet is not currently eligible to play. Own at least one
        Aavegotchi NFT, then sign in again.
      </p>
      <p className="mt-2 text-xs text-yellow-50/80">
        If ownership verification is temporarily unavailable, retry in a few
        minutes.
      </p>

      {error ? (
        <p className="mt-2 text-[11px] text-yellow-100/80">
          {errorCode === 'WALLET_NOT_ELIGIBLE' ? error : `Sign-in status: ${error}`}
        </p>
      ) : null}

      {localError ? (
        <p className="mt-2 text-[11px] text-red-200">{localError}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {hasActiveWallet ? (
          <Button
            type="button"
            className="h-9 rounded-md bg-yellow-100 text-black hover:bg-yellow-200"
            onClick={() => {
              void handleRetry();
            }}
            disabled={isConnecting}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            {isConnecting ? 'Retrying…' : ctaLabel}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-md border-yellow-100/40 text-yellow-50 hover:bg-yellow-100/10"
          onClick={handleOpenGuide}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Eligibility Guide
        </Button>
      </div>
    </div>
  );
}
