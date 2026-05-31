'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  User,
  Shield,
  Package,
  History,
  Coins,
  KeyRound,
  Edit2,
  Check,
  X,
  Star,
} from 'lucide-react';
import { usePlayer } from '../../components/providers/PlayerProvider';
import { useSession } from '../../components/providers/SessionProvider';
import { ADMIN_ADDRESS } from '../../lib/constants';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { getAppServerBaseUrl } from '../../lib/server-url';

interface MeViewProps {
  showApiKeysLink?: boolean;
}

export function MeView({ showApiKeysLink = false }: MeViewProps) {
  const { progressionProfile } = usePlayer();
  const { hasValidSession, walletAddress, playerId } = useSession();
  const hasUnspent = (progressionProfile?.unspentPoints ?? 0) > 0;
  const isAdmin = walletAddress?.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  const canSeeApiKeysLink = showApiKeysLink || isAdmin;
  const [username, setUsername] = useState<string | null>(null);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [isLoadingUsername, setIsLoadingUsername] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = getAppServerBaseUrl();
  const playerEndpoint = baseUrl ? `${baseUrl}/api/player` : '/api/player';
  const usernameEndpoint = baseUrl
    ? `${baseUrl}/api/player/username`
    : '/api/player/username';

  useEffect(() => {
    if (!hasValidSession || !playerId) return;

    async function fetchUsername() {
      setIsLoadingUsername(true);
      try {
        const res = await fetch(playerEndpoint, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setUsername(data.username ?? null);
        }
      } catch (error) {
        console.error('Failed to fetch username', error);
      } finally {
        setIsLoadingUsername(false);
      }
    }

    void fetchUsername();
  }, [hasValidSession, playerId, playerEndpoint]);

  useEffect(() => {
    if (isEditingUsername && usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, [isEditingUsername]);

  const handleStartEditUsername = () => {
    setUsernameInput(username ?? '');
    setIsEditingUsername(true);
  };

  const handleCancelEditUsername = () => {
    setIsEditingUsername(false);
    setUsernameInput('');
  };

  const handleSaveUsername = async () => {
    if (isSavingUsername) return;

    setIsSavingUsername(true);
    try {
      const newUsername = usernameInput.trim() || null;
      const res = await fetch(usernameEndpoint, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername }),
      });

      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ error: 'Failed to update username' }));
        alert(error.error || 'Failed to update username');
        return;
      }

      const data = await res.json();
      setUsername(data.username ?? null);
      setIsEditingUsername(false);
      setUsernameInput('');
    } catch (error) {
      console.error('Failed to save username', error);
      alert('Failed to update username');
    } finally {
      setIsSavingUsername(false);
    }
  };

  return (
    <nav
      aria-label="Me actions"
      className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"
    >
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <User className="h-4 w-4 text-white/70" />
          <label className="text-xs font-medium text-white/70">Username</label>
        </div>
        {isEditingUsername ? (
          <div className="flex items-center gap-2">
            <Input
              ref={usernameInputRef}
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Enter username"
              maxLength={50}
              disabled={isSavingUsername}
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleSaveUsername();
                } else if (e.key === 'Escape') {
                  handleCancelEditUsername();
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveUsername}
              disabled={isSavingUsername}
              className="text-white hover:text-white hover:bg-white/10"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEditUsername}
              disabled={isSavingUsername}
              className="text-white hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white flex-1">
              {isLoadingUsername ? (
                <span className="text-white/40">Loading...</span>
              ) : username ? (
                username
              ) : (
                <span className="text-white/40">No username set</span>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStartEditUsername}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <Link
        href="/me/inventory"
        className="flex items-center gap-4 px-4 py-4 border-b border-white/10 hover:bg-white/10 transition"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Package className="h-5 w-5 text-white/70" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium">Inventory</div>
          <div className="text-xs text-white/60">View your items</div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/50" />
      </Link>

      <Link
        href="/me/tokens"
        className="flex items-center gap-4 px-4 py-4 border-b border-white/10 hover:bg-white/10 transition"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Coins className="h-5 w-5 text-white/70" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium">Withdraw Tokens</div>
          <div className="text-xs text-white/60">
            View and withdraw earned GHST and USDC
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/50" />
      </Link>

      <Link
        href="/me/runs"
        className="flex items-center gap-4 px-4 py-4 border-b border-white/10 hover:bg-white/10 transition"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <History className="h-5 w-5 text-white/70" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium">My Runs</div>
          <div className="text-xs text-white/60">View your dungeon runs</div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/50" />
      </Link>

      {canSeeApiKeysLink ? (
        <Link
          href="/me/api-keys"
          className="flex items-center gap-4 px-4 py-4 border-b border-white/10 hover:bg-white/10 transition"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
            <KeyRound className="h-5 w-5 text-white/70" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium">API Keys</div>
            <div className="text-xs text-white/60">
              Create and revoke automation API keys
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-white/50" />
        </Link>
      ) : null}

      {isAdmin ? (
        <>
          <Link
            href="/admin"
            className="flex items-center gap-4 px-4 py-4 border-b border-white/10 hover:bg-white/10 transition"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
              <Shield className="h-5 w-5 text-white/70" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">Admin</div>
              <div className="text-xs text-white/60">
                Maps and Database tools
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-white/50" />
          </Link>
        </>
      ) : null}

      <Link
        href="/me/allocate-stats"
        className="flex items-center gap-4 px-4 py-4 hover:bg-white/10 transition"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10">
          <Star className="h-5 w-5 text-white/70" />
        </span>
        <div className="flex-1">
          <div className="text-sm font-medium flex items-center gap-2">
            <span>Allocate Stats</span>
            {hasUnspent ? (
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-pink-400" />
            ) : null}
          </div>
          <div className="text-xs text-white/60">Assign level-up points</div>
        </div>
        <ChevronRight className="h-4 w-4 text-white/50" />
      </Link>
    </nav>
  );
}
