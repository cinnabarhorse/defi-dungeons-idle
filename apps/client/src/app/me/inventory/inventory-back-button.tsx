'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface InventoryBackButtonProps {
  className?: string;
  fallbackHref?: string;
}

export function InventoryBackButton({
  className,
  fallbackHref = '/me',
}: InventoryBackButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    // Prefer the user's actual navigation history (e.g. from the game, stats, etc).
    // Fall back to /me for direct-entry tabs (no in-app history).
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }, [router, fallbackHref]);

  return (
    <button type="button" className={className} onClick={handleBack}>
      ← Back
    </button>
  );
}

