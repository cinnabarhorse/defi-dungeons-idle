'use client';

import { useMemo } from 'react';
import { getCharacterById } from '../../data/characters';
import type { LeaderboardEntry } from '../../types/leaderboard';
import { useEnsNames } from '../../hooks/useEnsNames';

function shortenAddress(address: string | null | undefined) {
  if (!address || address.length < 10) return address ?? 'Unknown player';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ENS address normalization handled by useEnsNames hook

function formatCharacter(characterId: string | null) {
  if (!characterId) return { label: 'Unknown', subtitle: 'No character data' };
  if (characterId.startsWith('gotchi:')) {
    const gotchiId = characterId.split(':')[1] ?? '';
    const formatted = gotchiId ? `#${gotchiId}` : 'Owned Gotchi';
    return { label: `Gotchi ${formatted}`, subtitle: 'Owned Aavegotchi' };
  }
  const character = getCharacterById(characterId);
  if (character) {
    return {
      label: character.name,
      subtitle:
        character.characterClass || character.theme || 'Static character',
    };
  }
  return { label: characterId, subtitle: 'Custom character' };
}

function formatDifficulty(tier: string | null) {
  if (!tier) return null;
  const normalized = tier.replace(/_/g, ' ');
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatUsdc(baseUnits: number | undefined): string {
  if (baseUnits === undefined || baseUnits === 0) return '0';
  const usdc = baseUnits / 1_000_000;
  if (usdc < 0.01) return '<0.01';
  return usdc.toFixed(2).replace(/\.?0+$/, '');
}

function formatGhst(amount: number | undefined): string {
  if (amount === undefined || amount === 0) return '0';
  if (amount < 0.01) return '<0.01';
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

export interface LeaderboardProps {
  players: LeaderboardEntry[];
  error?: string | null;
  showCharacter?: boolean;
}

export function Leaderboard({ players, error, showCharacter = true }: LeaderboardProps) {
  const ensAddresses = useMemo(
    () => players.map((p) => p.walletAddress).filter(Boolean) as string[],
    [players]
  );
  const { ensByAddress } = useEnsNames(ensAddresses);

  if (error) {
    return (
      <div className="px-8 py-16 text-center text-sm text-red-300">
        <p className="font-medium">
          We couldn&apos;t load the leaderboard right now.
        </p>
        <p className="mt-2 text-xs text-red-200/80">{error}</p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="px-8 py-16 text-center text-white/70">
        <p className="text-lg font-medium">
          No adventurers are in the dungeon right now.
        </p>
        <p className="mt-2 text-sm text-white/60">
          Rally your party and start a run to claim the top of the board.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm">
        <thead>
          <tr className="bg-white/10 text-xs uppercase tracking-widest text-white/70">
            <th scope="col" className="px-6 py-4 font-semibold">
              Rank
            </th>
            <th scope="col" className="px-6 py-4 font-semibold">
              Player
            </th>
            <th scope="col" className="px-6 py-4 font-semibold">
              Level
            </th>
            {showCharacter ? (
              <th scope="col" className="px-6 py-4 font-semibold">
                Character
              </th>
            ) : null}
            <th scope="col" className="px-6 py-4 font-semibold">
              Difficulty
            </th>
            <th scope="col" className="px-6 py-4 font-semibold">
              USDC Earned
            </th>
            <th scope="col" className="px-6 py-4 font-semibold">
              GHST Earned
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {players.map((player, index) => {
            const character = formatCharacter(player.characterId);
            const difficultyLabel = formatDifficulty(player.difficultyTier);
            const ensName = ensByAddress[player.walletAddress] ?? null;
            const displayName =
              player.username ||
              ensName ||
              shortenAddress(player.walletAddress);
            const showSubtitle = player.username || ensName;
            return (
              <tr
                key={`${player.playerId}:${player.roomId ?? index}`}
                className="bg-slate-950/40 transition hover:bg-slate-900/60"
              >
                <td className="px-6 py-4 align-middle text-base font-semibold text-violet-200">
                  #{index + 1}
                </td>
                <td className="px-6 py-4 align-middle">
                  <div className="flex flex-col">
                    <span
                      className="font-medium text-white"
                      title={player.walletAddress}
                    >
                      {displayName}
                    </span>
                    {showSubtitle ? (
                      <span className="text-xs text-white/50">
                        {shortenAddress(player.walletAddress)}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 align-middle">
                  <span className="inline-flex items-center rounded-full border border-violet-400/60 bg-violet-500/20 px-3 py-1 text-sm font-semibold text-violet-100 shadow-inner">
                    Lv. {Math.max(1, Number(player.level) || 1)}
                  </span>
                </td>
                {showCharacter ? (
                  <td className="px-6 py-4 align-middle">
                    <div className="flex flex-col">
                      <span className="font-medium text-white">
                        {character.label}
                      </span>
                      <span className="text-xs text-white/60">
                        {character.subtitle}
                      </span>
                    </div>
                  </td>
                ) : null}
                <td className="px-6 py-4 align-middle">
                  {difficultyLabel ? (
                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/70">
                      {difficultyLabel}
                    </span>
                  ) : (
                    <span className="text-xs text-white/40">—</span>
                  )}
                </td>
                <td className="px-6 py-4 align-middle">
                  <span className="inline-flex items-center rounded-full border border-green-400/60 bg-green-500/20 px-3 py-1 text-sm font-semibold text-green-100 shadow-inner">
                    ${formatUsdc(player.totalUsdcEarnedBaseUnits)}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle">
                  <span className="inline-flex items-center rounded-full border border-fuchsia-400/60 bg-fuchsia-500/20 px-3 py-1 text-sm font-semibold text-fuchsia-100 shadow-inner">
                    {formatGhst(player.totalGhstEarned)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
