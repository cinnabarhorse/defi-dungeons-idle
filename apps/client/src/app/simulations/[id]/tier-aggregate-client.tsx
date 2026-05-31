'use client';

import { useMemo } from 'react';
import { useQueryState } from 'nuqs';
import { getCharacterById } from '../../../data/characters';
import { TierBadge } from './tier-badge';

interface AggRow {
  characterId: string;
  tierId: string;
  avgWinRate: number;
  avgTimeToKillMs: number | null;
  avgTimeToDeathMs: number;
}

interface TierOption {
  id: string;
  name: string;
}

interface TierAggregateClientProps {
  agg: AggRow[];
  tierOptions: TierOption[];
  defaultTierId: string;
}

export default function TierAggregateClient({
  agg,
  tierOptions,
  defaultTierId,
}: TierAggregateClientProps) {
  const [tierId, setTierId] = useQueryState('tier', {
    defaultValue: defaultTierId,
    shallow: false,
  });

  const displayRows = useMemo(() => {
    const filtered = agg.filter((a) => a.tierId === tierId);
    return filtered.sort((a, b) => {
      const aTtd = Number.isFinite(a.avgTimeToDeathMs)
        ? a.avgTimeToDeathMs
        : Number.POSITIVE_INFINITY;
      const bTtd = Number.isFinite(b.avgTimeToDeathMs)
        ? b.avgTimeToDeathMs
        : Number.POSITIVE_INFINITY;
      return aTtd - bTtd;
    });
  }, [agg, tierId]);

  function fixed(n: number): string {
    return Number.isFinite(n) ? n.toFixed(1) : '0.0';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="tier" className="text-sm text-muted-foreground">
          Tier
        </label>
        <select
          id="tier"
          className="border rounded px-2 py-1 text-sm bg-background"
          value={tierId}
          onChange={(e) => setTierId(e.target.value)}
        >
          {tierOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayRows.map((a, idx) => (
          <div key={`${a.characterId}-${idx}`} className="border rounded p-3">
            <div className="font-medium flex items-center gap-2">
              <span>{a.characterId}</span>
              <TierBadge tier={getCharacterById(a.characterId)?.tier as any} />
              <span className="opacity-60">— {a.tierId}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              WR {fixed(a.avgWinRate * 100)}% · TTK{' '}
              {a.avgTimeToKillMs !== null
                ? `${fixed(a.avgTimeToKillMs)} ms`
                : '—'}{' '}
              · TTD {fixed(a.avgTimeToDeathMs)} ms
            </div>
          </div>
        ))}
        {displayRows.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No results for tier.
          </div>
        )}
      </div>
    </div>
  );
}
