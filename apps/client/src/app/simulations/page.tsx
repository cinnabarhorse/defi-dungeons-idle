import fs from 'fs';
import path from 'path';
import Link from 'next/link';

interface SimulationIndexItem {
  id: number;
  createdAt: string;
  params: {
    simulations: number;
    characters: number;
    enemies: number;
    tiers: number;
    onlyCharacter?: string;
    onlyEnemy?: string;
    onlyTier?: string;
  };
}

export const dynamic = 'force-static';

export default async function SimulationsPage() {
  const simDir = path.resolve(process.cwd(), 'public/simulations');
  let items: SimulationIndexItem[] = [];
  try {
    const idxPath = path.join(simDir, 'index.json');
    const raw = fs.readFileSync(idxPath, 'utf-8');
    items = JSON.parse(raw);
    items.sort((a, b) => b.id - a.id);
  } catch {}

  return (
    <div className="p-6 max-w-4xl mx-auto font-mono">
      <h1 className="text-2xl font-semibold mb-4">Simulations</h1>
      <div className="space-y-3">
        {items.map((it) => (
          <Link
            key={it.id}
            href={`/simulations/${it.id}`}
            className="block border rounded p-4 hover:bg-muted"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Simulation #{it.id}</div>
                <div className="text-sm text-muted-foreground">
                  {new Date(it.createdAt).toLocaleString()} — iters{' '}
                  {it.params.simulations}, chars {it.params.characters}, enemies{' '}
                  {it.params.enemies}, tiers {it.params.tiers}
                </div>
              </div>
              <div className="text-primary text-sm">View →</div>
            </div>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No simulations yet.
          </div>
        )}
      </div>
    </div>
  );
}
