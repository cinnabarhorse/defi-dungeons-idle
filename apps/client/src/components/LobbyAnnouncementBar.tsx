'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

interface LobbyAnnouncementBarProps {
  id: string;
  message: string;
  linkHref: string;
  linkLabel: string;
}

export function LobbyAnnouncementBar({
  id,
  message,
  linkHref,
  linkLabel,
}: LobbyAnnouncementBarProps) {
  const storageKey = useMemo(
    () => `dd-dismissed-announcement:${id}`,
    [id]
  );
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(storageKey) === '1';
  });

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(storageKey, '1');
  }, [storageKey]);

  if (dismissed) {
    return null;
  }

  return (
    <div
      data-testid="lobby-announcement-bar"
      className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(249,115,22,0.12),rgba(255,255,255,0.05))] px-4 py-3 text-sm text-amber-50 shadow-[0_10px_30px_rgba(251,191,36,0.12)]"
    >
      <div className="min-w-0 flex-1 leading-tight">
        <span>{message} </span>
        <Link
          href={linkHref}
          className="font-semibold underline decoration-2 underline-offset-4 transition hover:text-white"
        >
          {linkLabel}
        </Link>
      </div>
      <button
        type="button"
        aria-label="Dismiss announcement"
        onClick={handleDismiss}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/10 text-amber-50/80 transition hover:bg-black/20 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
