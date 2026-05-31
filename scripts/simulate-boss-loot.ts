/*
  Boss Loot Drop Simulation: Simulates boss currency drops across difficulty tiers
  - Tests the probability-based tier system (50% nothing, 30% small, 9% OK, 1% good)
  - Runs 10,000+ simulations per tier/currency combination
  - Outputs results for visualization in admin panel
*/

import { rollBossCurrency, type BossCurrencyReward } from '../data/loot-table';
import { DIFFICULTY_TIERS } from '../data/difficulty-tiers';
import * as fs from 'fs';
import * as path from 'path';

interface BossLootResult {
  tier: string;
  currency: 'USDC' | 'GHST';
  amount: number;
  baseAmount: number;
  rewardTier: 'none' | 'small' | 'ok' | 'good';
}

interface TierSummary {
  tierId: string;
  currency: 'USDC' | 'GHST';
  simulations: number;
  tierDistribution: {
    none: number;
    small: number;
    ok: number;
    good: number;
  };
  tierPercentages: {
    none: number;
    small: number;
    ok: number;
    good: number;
  };
  amountStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
    total: number;
  };
  amountStatsByTier: {
    small: {
      min: number;
      max: number;
      avg: number;
      total: number;
      count: number;
    };
    ok: { min: number; max: number; avg: number; total: number; count: number };
    good: {
      min: number;
      max: number;
      avg: number;
      total: number;
      count: number;
    };
  };
  baseAmountStats: {
    min: number;
    max: number;
    avg: number;
    median: number;
  };
}

interface SimulationOutput {
  simulationId: number;
  createdAt: string;
  params: {
    simulations: number;
    tiers: string[];
    currencies: Array<'USDC' | 'GHST'>;
  };
  summaries: TierSummary[];
}

function getEnvFlag(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (arg) return arg.split('=')[1];
  return process.env[flag.toUpperCase()];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function simulateTier(
  tierId: string,
  currency: 'USDC' | 'GHST',
  simulations: number
): TierSummary {
  const results: BossLootResult[] = [];
  const tierCounts = { none: 0, small: 0, ok: 0, good: 0 };
  const amounts: number[] = [];
  const baseAmounts: number[] = [];
  const amountsByTier: {
    small: number[];
    ok: number[];
    good: number[];
  } = { small: [], ok: [], good: [] };

  for (let i = 0; i < simulations; i++) {
    const reward = rollBossCurrency({
      difficultyTierId: tierId,
      currency,
      randomSeed: i + tierId.length * 1000,
    });

    results.push({
      tier: tierId,
      currency,
      amount: reward.amount,
      baseAmount: reward.baseAmount,
      rewardTier: reward.tier,
    });

    tierCounts[reward.tier]++;
    amounts.push(reward.amount);
    baseAmounts.push(reward.baseAmount);

    if (reward.tier === 'small' && reward.amount > 0) {
      amountsByTier.small.push(reward.amount);
    } else if (reward.tier === 'ok' && reward.amount > 0) {
      amountsByTier.ok.push(reward.amount);
    } else if (reward.tier === 'good' && reward.amount > 0) {
      amountsByTier.good.push(reward.amount);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const min = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : 0);
  const max = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : 0);
  const total = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  return {
    tierId,
    currency,
    simulations,
    tierDistribution: {
      none: tierCounts.none,
      small: tierCounts.small,
      ok: tierCounts.ok,
      good: tierCounts.good,
    },
    tierPercentages: {
      none: tierCounts.none / simulations,
      small: tierCounts.small / simulations,
      ok: tierCounts.ok / simulations,
      good: tierCounts.good / simulations,
    },
    amountStats: {
      min: min(amounts),
      max: max(amounts),
      avg: avg(amounts),
      median: median(amounts),
      total: total(amounts),
    },
    amountStatsByTier: {
      small: {
        min: min(amountsByTier.small),
        max: max(amountsByTier.small),
        avg: avg(amountsByTier.small),
        total: total(amountsByTier.small),
        count: amountsByTier.small.length,
      },
      ok: {
        min: min(amountsByTier.ok),
        max: max(amountsByTier.ok),
        avg: avg(amountsByTier.ok),
        total: total(amountsByTier.ok),
        count: amountsByTier.ok.length,
      },
      good: {
        min: min(amountsByTier.good),
        max: max(amountsByTier.good),
        avg: avg(amountsByTier.good),
        total: total(amountsByTier.good),
        count: amountsByTier.good.length,
      },
    },
    baseAmountStats: {
      min: min(baseAmounts),
      max: max(baseAmounts),
      avg: avg(baseAmounts),
      median: median(baseAmounts),
    },
  };
}

function main() {
  const onlyTier = getEnvFlag('onlyTier');
  const iterStr = getEnvFlag('iters');
  const simulations = Math.max(1000, Number(iterStr) || 10000);

  const tierIds = Object.keys(DIFFICULTY_TIERS);
  const currencies: Array<'USDC' | 'GHST'> = ['USDC', 'GHST'];

  const selectedTiers = onlyTier
    ? tierIds.filter((t) => t === onlyTier)
    : tierIds;

  console.log('=== Boss Loot Simulation ===');
  console.log(
    `Running ${simulations} simulations per tier/currency combination...`
  );
  console.log(
    `Tiers: ${selectedTiers.length}, Currencies: ${currencies.length}`
  );

  const summaries: TierSummary[] = [];

  for (const tierId of selectedTiers) {
    for (const currency of currencies) {
      console.log(`Simulating ${tierId} - ${currency}...`);
      const summary = simulateTier(tierId, currency, simulations);
      summaries.push(summary);
    }
  }

  // Print summary
  console.log('\n=== Results Summary ===');
  for (const s of summaries) {
    console.log(`\n${s.tierId} - ${s.currency}:`);
    console.log(
      `  Tier Distribution: ${(s.tierPercentages.none * 100).toFixed(1)}% none, ${(s.tierPercentages.small * 100).toFixed(1)}% small, ${(s.tierPercentages.ok * 100).toFixed(1)}% OK, ${(s.tierPercentages.good * 100).toFixed(1)}% good`
    );
    console.log(
      `  Amount Stats: min=${s.amountStats.min.toFixed(2)}, max=${s.amountStats.max.toFixed(2)}, avg=${s.amountStats.avg.toFixed(2)}, median=${s.amountStats.median.toFixed(2)}, total=${s.amountStats.total.toFixed(2)}`
    );
    if (s.amountStatsByTier.small.count > 0) {
      console.log(
        `  Small drops: avg=${s.amountStatsByTier.small.avg.toFixed(2)}, count=${s.amountStatsByTier.small.count}`
      );
    }
    if (s.amountStatsByTier.ok.count > 0) {
      console.log(
        `  OK drops: avg=${s.amountStatsByTier.ok.avg.toFixed(2)}, count=${s.amountStatsByTier.ok.count}`
      );
    }
    if (s.amountStatsByTier.good.count > 0) {
      console.log(
        `  Good drops: avg=${s.amountStatsByTier.good.avg.toFixed(2)}, count=${s.amountStatsByTier.good.count}`
      );
    }
  }

  // Save results
  try {
    const simDir = path.resolve(__dirname, '../apps/client/public/simulations');
    if (!fs.existsSync(simDir)) fs.mkdirSync(simDir, { recursive: true });

    // Find next ID
    const files = fs
      .readdirSync(simDir)
      .filter((f) => /^boss-loot_\d+\.json$/.test(f));
    let maxId = 0;
    for (const f of files) {
      const m = f.match(/boss-loot_(\d+)\.json/);
      if (m) {
        const id = Number(m[1]);
        if (Number.isFinite(id)) maxId = Math.max(maxId, id);
      }
    }
    const simulationId = maxId + 1;

    const output: SimulationOutput = {
      simulationId,
      createdAt: new Date().toISOString(),
      params: {
        simulations,
        tiers: selectedTiers,
        currencies,
      },
      summaries,
    };

    const simFile = path.join(simDir, `boss-loot_${simulationId}.json`);
    fs.writeFileSync(simFile, JSON.stringify(output, null, 2));
    console.log(`\n✅ Saved: ${simFile}`);

    // Update index
    const indexFile = path.join(simDir, 'boss-loot-index.json');
    let index: Array<{
      id: number;
      createdAt: string;
      params: SimulationOutput['params'];
    }> = [];
    try {
      if (fs.existsSync(indexFile)) {
        index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      }
    } catch {}
    index.push({
      id: simulationId,
      createdAt: output.createdAt,
      params: output.params,
    });
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
    console.log(`✅ Updated index: ${indexFile}`);
  } catch (err) {
    console.error('❌ Failed to save simulation outputs:', err);
    process.exit(1);
  }
}

main();
