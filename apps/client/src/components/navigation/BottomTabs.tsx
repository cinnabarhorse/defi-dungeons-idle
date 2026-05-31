'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Tabs } from '../ui/Tabs';
import { Home, Trophy, User } from 'lucide-react';
import { useSession } from '../providers/SessionProvider';
import { usePlayer } from '../providers/PlayerProvider';

type MainTab = 'play' | 'rank' | 'me';

export function BottomTabs() {
  const pathname = usePathname();
  const [hideForGame, setHideForGame] = useState(false);
  const { hasActiveWallet, hasValidSession } = useSession();
  const { progressionProfile } = usePlayer();

  // Hide bottom tabs when the game container is mounted (in-play view)
  useEffect(() => {
    if (typeof window === 'undefined' || !document?.body) return;

    const evaluate = () => {
      const gameEl = document.getElementById('game-container');
      setHideForGame(Boolean(gameEl));
    };

    // Initial check
    evaluate();

    // Observe DOM changes to catch transition between lobby <-> game
    const observer = new MutationObserver(() => evaluate());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Only show tabs on exact top-level routes
  const shouldShowOnRoute = useMemo(() => {
    const cleaned = (() => {
      if (!pathname) return '/';
      const trimmed = pathname.replace(/\/+$/, '');
      return trimmed.length === 0 ? '/' : trimmed;
    })();
    const allowed = new Set(['/', '/play', '/leaderboard', '/me']);
    return allowed.has(cleaned);
  }, [pathname]);

  const current: MainTab = useMemo(() => {
    if (!pathname) return 'play';
    if (pathname.startsWith('/me')) return 'me';
    if (pathname.startsWith('/leaderboard')) return 'rank';
    // Treat "/" and "/play" as Play
    return 'play';
  }, [pathname]);

  const hasSessionOrWallet = hasActiveWallet || hasValidSession;

  if (hideForGame || !hasSessionOrWallet || !shouldShowOnRoute) {
    return null;
  }

  return (
    <Tabs
      value={current}
      onValueChange={() => {}}
      items={[
        { value: 'play', label: 'Play', icon: Home, href: '/play' },
        { value: 'rank', label: 'Rank', icon: Trophy, href: '/leaderboard' },
        {
          value: 'me',
          label: 'Me',
          icon: User,
          href: '/me',
          showBadge: (progressionProfile?.unspentPoints ?? 0) > 0,
        },
      ]}
    />
  );
}
