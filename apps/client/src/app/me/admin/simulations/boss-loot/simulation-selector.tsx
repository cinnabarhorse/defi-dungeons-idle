'use client';

import { useRouter } from 'next/navigation';

interface SimulationIndexItem {
  id: number;
  createdAt: string;
  params: {
    simulations: number;
    tiers: string[];
    currencies: Array<'USDC' | 'GHST'>;
  };
}

interface SimulationSelectorProps {
  simulations: SimulationIndexItem[];
  currentId: number;
}

export default function SimulationSelector({
  simulations,
  currentId,
}: SimulationSelectorProps) {
  const router = useRouter();

  if (simulations.length <= 1) return null;

  return (
    <div className="rounded-lg border border-white/20 bg-white/5 p-4">
      <label htmlFor="simulation-select" className="block text-sm font-medium mb-2">
        Select Simulation
      </label>
      <select
        id="simulation-select"
        className="w-full rounded border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
        value={currentId}
        onChange={(e) => {
          const id = Number(e.target.value);
          router.push(`/me/admin/simulations/boss-loot?id=${id}`);
        }}
      >
        {simulations.map((sim) => (
          <option key={sim.id} value={sim.id}>
            Simulation #{sim.id} · {new Date(sim.createdAt).toLocaleString()} ·{' '}
            {sim.params.simulations.toLocaleString()} sims
          </option>
        ))}
      </select>
    </div>
  );
}


