import fs from 'fs';
import path from 'path';
import { DIFFICULTY_TIERS } from '../../../data/difficulty-tiers';
import TierAggregateClient from './tier-aggregate-client';
import PerEnemyClient from './per-enemy-client';

interface MatchupSummary {
  characterId: string;
  enemyType: string;
  tierId: string;
  simulations: number;
  winRate: number;
  avgFightDurationMs: number;
  avgTimeToKillMs: number | null;
  avgTimeToDeathMs: number;
  avgPlayerHpRemainingOnWin: number;
  avgEnemyHpRemainingOnLoss: number;
}

interface CharacterSuggestion {
  simulationId: number;
  suggestionNumber: number;
  characterId: string;
  rationale: string;
  changes: Array<any>;
}

interface SimulationOutput {
  simulationId: number;
  createdAt: string;
  params: any;
  summaries: MatchupSummary[];
  agg: Array<{
    characterId: string;
    tierId: string;
    avgWinRate: number;
    avgTimeToKillMs: number | null;
    avgTimeToDeathMs: number;
  }>;
  suggestions: CharacterSuggestion[];
}

export const dynamic = 'force-static';

export default async function SimulationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  const simDir = path.resolve(process.cwd(), 'public/simulations');
  const simPath = path.join(simDir, `simulations_${id}.json`);
  let data: SimulationOutput | null = null;
  try {
    const raw = fs.readFileSync(simPath, 'utf-8');
    data = JSON.parse(raw);
  } catch {}

  if (!data) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-sm text-muted-foreground">
          Simulation not found.
        </div>
      </div>
    );
  }

  const enemyTypes = Array.from(
    new Set(data.summaries.map((s) => s.enemyType))
  ).sort();

  const fixed = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0.0');
  const tierOptions = Object.values(DIFFICULTY_TIERS).map((t) => ({
    id: t.id,
    name: t.name,
  }));
  const defaultTierId = 'normal_1';

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 font-mono">
      <div>
        <h1 className="text-2xl font-semibold">
          Simulation #{data.simulationId}
        </h1>
        <div className="text-sm text-muted-foreground">
          {new Date(data.createdAt).toLocaleString()} — iters{' '}
          {data.params.simulations}, chars {data.params.characters}, enemies{' '}
          {data.params.enemies}, tiers {data.params.tiers}
        </div>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-2">Suggestions</h2>
        <div className="space-y-2">
          {data.suggestions?.map((s) => (
            <div key={s.suggestionNumber} className="border rounded p-3">
              <div className="font-medium">{s.characterId}</div>
              <div className="text-sm text-muted-foreground">{s.rationale}</div>
              <pre className="bg-muted text-xs p-2 rounded mt-2 overflow-auto">
                {JSON.stringify(s.changes, null, 2)}
              </pre>
            </div>
          ))}
          {!data.suggestions?.length && (
            <div className="text-sm text-muted-foreground">
              No suggestions generated.
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-medium mb-2">Aggregate (by tier)</h2>
        <TierAggregateClient
          agg={data.agg}
          tierOptions={tierOptions}
          defaultTierId={defaultTierId}
        />
      </section>

      <section>
        <h2 className="text-xl font-medium mb-2">Per-Enemy Summaries</h2>
        <PerEnemyClient
          summaries={data.summaries}
          enemyOptions={enemyTypes}
          defaultEnemy={enemyTypes[0] || ''}
          tierOptions={tierOptions}
          defaultTierId={defaultTierId}
        />
      </section>
    </div>
  );
}
