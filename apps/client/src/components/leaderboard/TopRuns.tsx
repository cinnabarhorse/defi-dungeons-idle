'use client';

import { useMemo } from 'react';
import { getCharacterById } from '../../data/characters';
import { useEnsNames } from '../../hooks/useEnsNames';

interface Run {
  id: string;
  gameId: string;
  playerId: string;
  playerWalletAddress?: string | null;
  playerUsername?: string | null;
  score: number | null;
  difficultyTier: string | null;
  completedAt: string | null;
  durationMs: number | null;
  kills: number | null;
  xpEarned: number | null;
  validForHighScore: boolean;
  characterId: string | null;
  lickTonguesCollected: number;
  deaths: number | null;
  damageDealt: number | null;
  damageTaken: number | null;
  coinsCollected: number | null;
  usdcEarned: number | null;
  levelBefore: number | null;
  levelAfter: number | null;
  status: 'completed' | 'abandoned' | 'game_ended' | 'in_progress';
  region: string | null;
}

export interface TopRunsProps {
  runs: Run[];
  error?: string | null;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatNumber(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString();
}

function formatUSDC(value: number | null): string {
  if (value == null || value === 0) return '—';
  const usdc = value / 1_000_000;
  return `$${usdc.toFixed(2)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '—';
  }
}

function formatCharacter(characterId: string | null): string {
  if (!characterId) return '—';
  if (characterId.startsWith('gotchi:')) {
    const gotchiId = characterId.split(':')[1] ?? '';
    return gotchiId ? `Gotchi #${gotchiId}` : 'Owned Gotchi';
  }
  const character = getCharacterById(characterId);
  if (character) return character.name;
  return characterId;
}

function formatRegion(regionId: string | null): string {
  if (!regionId) return '—';
  const regionMap: Record<string, string> = {
    'us-east': 'US East',
    'us-west': 'US West',
    'eu-west': 'Europe West',
    'ap-southeast': 'Asia Pacific',
  };
  return regionMap[regionId] || regionId;
}

function shortenAddress(address: string | null | undefined): string {
  if (!address) return '—';
  const start = address.slice(0, 6);
  const end = address.slice(-4);
  return `${start}…${end}`;
}

export function TopRuns({ runs, error }: TopRunsProps) {
  const ensAddresses = useMemo(
    () => runs.map((r) => r.playerWalletAddress).filter(Boolean) as string[],
    [runs]
  );
  const { ensByAddress } = useEnsNames(ensAddresses);

  if (error) {
    return (
      <div className="px-8 py-16 text-center text-sm text-red-300">
        <p className="font-medium">We couldn&apos;t load top runs right now.</p>
        <p className="mt-2 text-xs text-red-200/80">{error}</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="px-8 py-16 text-center text-white/70">
        <p className="text-lg font-medium">No runs found.</p>
        <p className="mt-2 text-sm text-white/60">
          Complete a dungeon run to claim the top of the board.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead>
          <tr className="bg-white/10 text-xs uppercase tracking-widest text-white/70">
            <th className="px-6 py-4 font-semibold">Rank</th>
            <th className="px-6 py-4 font-semibold">Player</th>
            <th className="px-6 py-4 font-semibold">Character</th>
            <th className="px-6 py-4 font-semibold">Difficulty / Region</th>
            <th className="px-6 py-4 text-right font-semibold">Duration</th>
            <th className="px-6 py-4 text-right font-semibold">Score</th>
            <th className="px-6 py-4 text-right font-semibold">Kills</th>
            <th className="px-6 py-4 text-right font-semibold">👅 Tongues</th>
            <th className="px-6 py-4 text-right font-semibold">XP</th>
            <th className="px-6 py-4 text-right font-semibold">Coins</th>
            <th className="px-6 py-4 text-right font-semibold">USDC</th>
            <th className="px-6 py-4 text-right font-semibold">Deaths</th>
            <th className="px-6 py-4 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {runs.map((run, index) => {
            const displayName =
              run.playerUsername ||
              (run.playerWalletAddress &&
                ensByAddress[run.playerWalletAddress]) ||
              shortenAddress(run.playerWalletAddress);
            return (
              <tr
                key={`${run.id}:${run.gameId}:${index}`}
                className="bg-slate-950/40 transition hover:bg-slate-900/60"
              >
                <td className="px-6 py-4 align-middle text-base font-semibold text-violet-200">
                  #{index + 1}
                </td>
                <td className="px-6 py-4 align-middle">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">
                      {displayName}
                    </span>
                    {run.playerWalletAddress ? (
                      <span className="text-xs text-white/50">
                        {shortenAddress(run.playerWalletAddress)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 align-middle">
                  {formatCharacter(run.characterId)}
                </td>
                <td className="px-6 py-4 align-middle">
                  <div className="flex flex-col">
                    <span className="text-white/90">
                      {run.difficultyTier || '—'}
                    </span>
                    <span className="text-xs text-white/60">
                      {formatRegion(run.region)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatDuration(run.durationMs)}
                </td>
                <td className="px-6 py-4 align-middle text-right font-semibold text-white">
                  {formatNumber(run.score)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatNumber(run.kills)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatNumber(run.lickTonguesCollected)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatNumber(run.xpEarned)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatNumber(run.coinsCollected)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatUSDC(run.usdcEarned)}
                </td>
                <td className="px-6 py-4 align-middle text-right">
                  {formatNumber(run.deaths)}
                </td>
                <td className="px-6 py-4 align-middle">
                  {formatDate(run.completedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
