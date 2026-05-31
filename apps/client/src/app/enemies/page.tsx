import { ENEMY_DATA } from '../../../../../data/enemies';

const BASE_GAUGE_GAIN_MULTIPLIER = 100;
const MAX_GAUGE_GAIN_PER_TICK = 200;
const MAX_BOSS_GAUGE_GAIN_PER_TICK = 100;

function getBaseGaugeGain(enemy: (typeof ENEMY_DATA)[string]): number {
  if (enemy.attackType === 'ranged' && enemy.rangedAttackSpeed) {
    return Math.round((1000 / enemy.rangedAttackSpeed) * 100);
  }
  return Math.round(enemy.speed * BASE_GAUGE_GAIN_MULTIPLIER);
}

interface EnemyRow {
  id: string;
  name: string;
  attackType: string;
  speed: number;
  baseGaugeGain: number;
  turnsToAct: string;
  classification: string;
}

function getEnemyRows(): EnemyRow[] {
  return Object.values(ENEMY_DATA)
    .map((enemy) => {
      const rawGaugeGain = getBaseGaugeGain(enemy);
      const maxGaugeGain =
        enemy.classification === 'boss'
          ? MAX_BOSS_GAUGE_GAIN_PER_TICK
          : MAX_GAUGE_GAIN_PER_TICK;
      const baseGaugeGain = Math.min(rawGaugeGain, maxGaugeGain);
      const turnsToAct =
        baseGaugeGain > 0 ? `${Math.ceil(100 / baseGaugeGain)}` : 'n/a';

      return {
        id: enemy.enemyType,
        name: enemy.name,
        attackType: enemy.attackType,
        speed: enemy.speed,
        baseGaugeGain,
        turnsToAct,
        classification: enemy.classification ?? 'normal',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function EnemiesPage() {
  const rows = getEnemyRows();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Enemies</h1>
        <p className="text-sm text-slate-300">
          Base gauge gain per tick is calculated as{' '}
          <span className="font-mono">
            speed × {BASE_GAUGE_GAIN_MULTIPLIER}
          </span>{' '}
          for melee. Ranged enemies use{' '}
          <span className="font-mono">(1000 ÷ rangedAttackSpeed) × 100</span>.
          Gains are clamped to{' '}
          <span className="font-mono">{MAX_GAUGE_GAIN_PER_TICK}</span> before
          difficulty and elite modifiers. Bosses use a cap of{' '}
          <span className="font-mono">{MAX_BOSS_GAUGE_GAIN_PER_TICK}</span>.
        </p>
        <p className="text-sm text-slate-400">
          When base gauge gain exceeds 100, the overflow carries into the next
          tick, so enemies can act on consecutive ticks while still limited to
          one action per tick.
        </p>
        <p className="text-sm text-slate-400">
          Turns to act uses a 100 gauge threshold per action.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-900/70 text-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">Enemy</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Speed</th>
              <th className="px-4 py-3 font-medium">Base Gauge/Tick</th>
              <th className="px-4 py-3 font-medium">Turns to Act</th>
              <th className="px-4 py-3 font-medium">Class</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="bg-slate-950/40">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3 text-slate-300">{row.attackType}</td>
                <td className="px-4 py-3 text-slate-300">{row.speed}</td>
                <td className="px-4 py-3 font-medium text-slate-100">
                  {row.baseGaugeGain}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {row.turnsToAct}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {row.classification}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
