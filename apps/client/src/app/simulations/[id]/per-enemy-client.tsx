'use client';

import { useMemo } from 'react';
import { useQueryState } from 'nuqs';
import { getCharacterById } from '../../../data/characters';
import { TierBadge } from './tier-badge';

interface MatchupSummary {
  characterId: string;
  enemyType: string;
  tierId: string;
  winRate: number;
  avgTimeToKillMs: number | null;
  avgTimeToDeathMs: number;
}

interface TierOption {
  id: string;
  name: string;
}

interface PerEnemyClientProps {
  summaries: MatchupSummary[];
  enemyOptions: string[];
  defaultEnemy: string;
  tierOptions: TierOption[];
  defaultTierId: string;
}

function fixed(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '0.0';
}

export default function PerEnemyClient({
  summaries,
  enemyOptions,
  defaultEnemy,
  tierOptions,
  defaultTierId,
}: PerEnemyClientProps) {
  const [enemy, setEnemy] = useQueryState('enemy', {
    defaultValue: defaultEnemy,
    shallow: false,
  });
  const [tierId, setTierId] = useQueryState('tier', {
    defaultValue: defaultTierId,
    shallow: false,
  });

  const rows = useMemo(() => {
    const selectedEnemy = enemy || defaultEnemy || enemyOptions[0] || '';
    const selectedTier = tierId || defaultTierId;
    const filtered = summaries.filter(
      (s) => s.enemyType === selectedEnemy && s.tierId === selectedTier
    );
    return filtered.sort((a, b) => {
      const aTtk =
        typeof a.avgTimeToKillMs === 'number' &&
        Number.isFinite(a.avgTimeToKillMs)
          ? a.avgTimeToKillMs
          : null;
      const bTtk =
        typeof b.avgTimeToKillMs === 'number' &&
        Number.isFinite(b.avgTimeToKillMs)
          ? b.avgTimeToKillMs
          : null;
      const aSort =
        a.winRate > 0 && aTtk !== null ? aTtk : Number.POSITIVE_INFINITY;
      const bSort =
        b.winRate > 0 && bTtk !== null ? bTtk : Number.POSITIVE_INFINITY;
      return aSort - bSort;
    });
  }, [summaries, enemy, defaultEnemy, enemyOptions, tierId, defaultTierId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="enemy" className="text-sm text-muted-foreground">
          Enemy
        </label>
        <select
          id="enemy"
          className="border rounded px-2 py-1 text-sm bg-background"
          value={enemy || defaultEnemy}
          onChange={(e) => setEnemy(e.target.value)}
        >
          {enemyOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        <label htmlFor="tier" className="text-sm text-muted-foreground">
          Tier
        </label>
        <select
          id="tier"
          className="border rounded px-2 py-1 text-sm bg-background"
          value={tierId || defaultTierId}
          onChange={(e) => setTierId(e.target.value)}
        >
          {tierOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r, i) => {
          const tier = getCharacterById(r.characterId)?.tier;
          return (
            <div
              key={`${r.characterId}-${r.tierId}-${i}`}
              className="border rounded p-3"
            >
              <div className="font-medium flex items-center gap-2">
                <span>{r.characterId}</span>
                <TierBadge tier={tier as any} />
                <span className="opacity-60">— {r.tierId}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                WR {fixed(r.winRate * 100)}% · TTK{' '}
                {r.winRate > 0 && typeof r.avgTimeToKillMs === 'number'
                  ? `${fixed(r.avgTimeToKillMs)} ms`
                  : '—'}{' '}
                · TTD{' '}
                {r.winRate > 0 && typeof r.avgTimeToDeathMs === 'number'
                  ? `${fixed(r.avgTimeToDeathMs)} ms`
                  : '—'}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No results for enemy.
          </div>
        )}
      </div>
    </div>
  );
}
