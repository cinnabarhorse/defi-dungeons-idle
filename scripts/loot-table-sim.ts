/*
  Simulate 1000 normal enemy kills using the canonical loot table.
  Outputs:
  - Drop success rate
  - Category counts
  - Top item types by count
  - Basic assertion against expected ranges
*/

import {
  rollEnemyDrop,
  getEnemyDropThresholdForSimulation,
  type EnemyDropContext,
  getExpectedWearableQualityProportions,
  getExpectedWearableRarityProportions,
  getEliteWearableRarityMultipliers,
  rollChestItem,
  rollChestCurrency,
  LOOT_SOURCE_IDS,
} from '../data/loot-table';
import { getAllItemCategories, getItemTypesByCategory } from '../data/items';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

interface SimulationResult {
  totalKills: number;
  dropSuccesses: number;
  categories: Record<string, number>;
  items: Record<string, number>;
  wearableGroups: Record<
    string,
    { total: number; items: Record<string, number> }
  >;
}

interface ChestSimulationResult {
  totalOpens: number;
  categories: Record<string, number>;
  items: Record<string, number>;
  wearableGroups: Record<
    string,
    { total: number; items: Record<string, number> }
  >;
  sumUSDC: number;
  sumGHST: number;
  avgUSDC: number;
  avgGHST: number;
}

function simulateChestRolls(
  num: number,
  difficultyTierId?: string
): ChestSimulationResult {
  const categories = Object.fromEntries(
    getAllItemCategories().map((c) => [c, 0])
  ) as Record<string, number>;
  const items: Record<string, number> = {};
  const wearableGroups: Record<
    string,
    { total: number; items: Record<string, number> }
  > = {};
  let sumUSDC = 0;
  let sumGHST = 0;

  for (let i = 0; i < num; i += 1) {
    const item = rollChestItem({
      difficultyTierId,
      sourceId: LOOT_SOURCE_IDS.treasureChest,
    });
    categories[item.type] = (categories[item.type] ?? 0) + 1;
    const itemKey =
      item.type === 'wearable' && (item as any).quality
        ? `${item.type}:${item.name}:${(item as any).quality}`
        : `${item.type}:${item.name}`;
    items[itemKey] = (items[itemKey] ?? 0) + 1;

    if (item.type === 'wearable') {
      const rarity = (item as any).rarity || 'unknown';
      const quality = (item as any).quality || 'unknown';
      const groupKey = `${rarity}|${quality}`;
      const g = (wearableGroups[groupKey] ||= { total: 0, items: {} });
      g.total += 1;
      g.items[item.name] = (g.items[item.name] ?? 0) + 1;
    }

    // Currency (USDC and GHST)
    const usdc = rollChestCurrency({
      difficultyTierId: difficultyTierId || 'normal_1',
      currency: 'USDC',
      randomSeed: i,
    });
    const ghst = rollChestCurrency({
      difficultyTierId: difficultyTierId || 'normal_1',
      currency: 'GHST',
      randomSeed: i + 777,
    });
    sumUSDC += usdc.amount;
    sumGHST += ghst.amount;
  }

  return {
    totalOpens: num,
    categories,
    items,
    wearableGroups,
    sumUSDC,
    sumGHST,
    avgUSDC: num > 0 ? sumUSDC / num : 0,
    avgGHST: num > 0 ? sumGHST / num : 0,
  };
}

function createNormalContext(): EnemyDropContext {
  return {
    classification: 'trash',
    killStreakPotionCoinFindBonus: 0,
    enemyType: undefined,
    rewardMultiplier: undefined,
    potionFarm: undefined,
  };
}

function simulateKills(
  num: number,
  baseCtx?: EnemyDropContext
): SimulationResult {
  const categories = Object.fromEntries(
    getAllItemCategories().map((c) => [c, 0])
  ) as Record<string, number>;
  const items: Record<string, number> = {};
  const wearableGroups: Record<
    string,
    { total: number; items: Record<string, number> }
  > = {};
  let dropSuccesses = 0;

  for (let i = 0; i < num; i += 1) {
    const ctx = baseCtx || createNormalContext();
    const drop = rollEnemyDrop(ctx);
    if (!drop) continue;
    dropSuccesses += 1;
    categories[drop.type] = (categories[drop.type] ?? 0) + 1;
    const itemKey =
      drop.type === 'wearable' && (drop as any).quality
        ? `${drop.type}:${drop.name}:${(drop as any).quality}`
        : `${drop.type}:${drop.name}`;
    items[itemKey] = (items[itemKey] ?? 0) + 1;

    if (drop.type === 'wearable') {
      const rarity = (drop as any).rarity || 'unknown';
      const quality = (drop as any).quality || 'unknown';
      const groupKey = `${rarity}|${quality}`;
      const g = (wearableGroups[groupKey] ||= { total: 0, items: {} });
      g.total += 1;
      g.items[drop.name] = (g.items[drop.name] ?? 0) + 1;
    }
  }

  return {
    totalKills: num,
    dropSuccesses,
    categories,
    items,
    wearableGroups,
  };
}

function formatTopItems(items: Record<string, number>, topN = 10): string[] {
  return Object.entries(items)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([k, v]) => `${k} = ${v}`);
}

function createEliteContext(): EnemyDropContext {
  return {
    classification: 'elite',
    killStreakPotionCoinFindBonus: 0,
    enemyType: undefined,
    rewardMultiplier: undefined,
    potionFarm: undefined,
  };
}

function simulateEliteKills(
  num: number,
  baseCtx?: EnemyDropContext
): SimulationResult {
  const categories = Object.fromEntries(
    getAllItemCategories().map((c) => [c, 0])
  ) as Record<string, number>;
  const items: Record<string, number> = {};
  const wearableGroups: Record<
    string,
    { total: number; items: Record<string, number> }
  > = {};
  let dropSuccesses = 0;

  for (let i = 0; i < num; i += 1) {
    const ctx = baseCtx || createEliteContext();
    const drop = rollEnemyDrop(ctx);
    if (!drop) continue;
    dropSuccesses += 1;
    categories[drop.type] = (categories[drop.type] ?? 0) + 1;
    const itemKey =
      drop.type === 'wearable' && (drop as any).quality
        ? `${drop.type}:${drop.name}:${(drop as any).quality}`
        : `${drop.type}:${drop.name}`;
    items[itemKey] = (items[itemKey] ?? 0) + 1;

    if (drop.type === 'wearable') {
      const rarity = (drop as any).rarity || 'unknown';
      const quality = (drop as any).quality || 'unknown';
      const groupKey = `${rarity}|${quality}`;
      const g = (wearableGroups[groupKey] ||= { total: 0, items: {} });
      g.total += 1;
      g.items[drop.name] = (g.items[drop.name] ?? 0) + 1;
    }
  }

  return {
    totalKills: num,
    dropSuccesses,
    categories,
    items,
    wearableGroups,
  };
}

function parseDifficultyArg(argv: string[]): string | undefined {
  // Supports: --difficulty n1|n2|n3|nm1|nm2|nm3|h1|h2|h3|bh
  const flag = '--difficulty';
  const eq = argv.find((a) => a.startsWith(flag + '='));
  let val: string | undefined;
  if (eq) {
    val = eq.split('=')[1];
  } else {
    const idx = argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < argv.length) {
      val = argv[idx + 1];
    }
  }
  if (!val) return undefined;
  const lower = val.toLowerCase();
  if (/^n\d+$/.test(lower)) {
    return `normal_${lower.slice(1)}`;
  }
  if (/^nm\d+$/.test(lower)) {
    return `nightmare_${lower.slice(2)}`;
  }
  if (/^h\d+$/.test(lower)) {
    return `hell_${lower.slice(1)}`;
  }
  if (lower === 'bh') return 'beyond_hell';
  // Fallback: allow passing full id directly
  return lower;
}

function main() {
  const difficultyTierId = parseDifficultyArg(process.argv);
  // Normal enemies
  const KILLS_NORMAL = 100000;

  const normalCtx: EnemyDropContext = {
    ...createNormalContext(),
    difficultyTierId,
  };
  const expectedNormal = getEnemyDropThresholdForSimulation(normalCtx);
  const resultNormal = simulateKills(KILLS_NORMAL, normalCtx);

  const observedNormal = resultNormal.dropSuccesses / KILLS_NORMAL;
  const toleranceNormal = 0.05; // +/- 5% tolerance
  const withinNormal =
    Math.abs(observedNormal - expectedNormal) <= toleranceNormal;

  console.log('--- Loot Table Simulation (Normal Enemies) ---');
  if (difficultyTierId) console.log(`Difficulty: ${difficultyTierId}`);
  console.log(`Kills: ${KILLS_NORMAL}`);
  console.log(`Expected base drop rate: ${expectedNormal.toFixed(3)}`);
  console.log(
    `Observed drop rate: ${observedNormal.toFixed(3)} (${withinNormal ? 'OK' : 'OUT OF RANGE'})`
  );
  console.log('Category counts:');
  for (const [cat, count] of Object.entries(resultNormal.categories)) {
    console.log(`  ${cat}: ${count}`);
  }
  //   console.log('Top items:');
  //   for (const line of formatTopItems(resultNormal.items, TOP_ITEMS_COUNT)) {
  //     console.log(`  ${line}`);
  //   }
  // Wearable breakdown by Rarity / Quality
  console.log(`${BOLD}Wearables by Rarity / Quality:${RESET}`);
  const wearGroupsN = Object.entries(resultNormal.wearableGroups).sort(
    (a, b) => b[1].total - a[1].total
  );
  const totalWearablesN = wearGroupsN.reduce((sum, [, d]) => sum + d.total, 0);
  const expectedQualityN = getExpectedWearableQualityProportions();
  const rarityMultN = getEliteWearableRarityMultipliers(difficultyTierId);
  const expectedRarityN = getExpectedWearableRarityProportions(rarityMultN);
  for (const [groupKey, data] of wearGroupsN) {
    const [rarity, quality] = groupKey.split('|');
    const R = rarity
      ? rarity.charAt(0).toUpperCase() + rarity.slice(1)
      : 'Unknown';
    const Q = quality
      ? quality.charAt(0).toUpperCase() + quality.slice(1)
      : 'Unknown';
    const pct = totalWearablesN > 0 ? (data.total / totalWearablesN) * 100 : 0;
    const rProb = rarity && (expectedRarityN as any)[rarity];
    const qProb = quality && (expectedQualityN as any)[quality];
    const expGroupPct =
      typeof rProb === 'number' && typeof qProb === 'number'
        ? rProb * qProb * 100
        : undefined;
    const pass = expGroupPct == null || Math.abs(pct - expGroupPct) <= 5;
    console.log(
      `  ${BOLD}${R} (${Q}) - ${data.total} (${pct.toFixed(2)}%)` +
        (expGroupPct != null ? ` | expected ~${expGroupPct.toFixed(2)}%` : '') +
        ` | ${pass ? 'PASS' : 'FAIL'}${RESET}`
    );
    const itemsSorted = Object.entries(data.items).sort((a, b) => b[1] - a[1]);
    // for (const [name, count] of itemsSorted) {
    //   console.log(`    ${name} = ${count}`);
    // }
  }

  if (!withinNormal) {
    console.error(
      `Assertion failed: observed rate ${observedNormal.toFixed(3)} not within +/-${toleranceNormal} of expected ${expectedNormal.toFixed(3)}`
    );
    process.exitCode = 1;
  }

  // Elite enemies
  const KILLS_ELITE = 100000;
  const eliteCtx: EnemyDropContext = {
    ...createEliteContext(),
    difficultyTierId,
  };
  const expectedElite = getEnemyDropThresholdForSimulation(eliteCtx);
  const resultElite = simulateEliteKills(KILLS_ELITE, eliteCtx);
  const observedElite = resultElite.dropSuccesses / KILLS_ELITE;
  const toleranceElite = 0.001; // elites should be ~1.0
  const withinElite = Math.abs(observedElite - expectedElite) <= toleranceElite;

  console.log('\n--- Loot Table Simulation (Elite Enemies) ---');
  console.log(`Kills: ${KILLS_ELITE}`);
  console.log(`Expected base drop rate: ${expectedElite.toFixed(3)}`);
  console.log(
    `Observed drop rate: ${observedElite.toFixed(3)} (${withinElite ? 'OK' : 'OUT OF RANGE'})`
  );
  console.log('Category counts:');
  for (const [cat, count] of Object.entries(resultElite.categories)) {
    console.log(`  ${cat}: ${count}`);
  }
  //   console.log('Top items:');
  //   for (const line of formatTopItems(resultElite.items, TOP_ITEMS_COUNT)) {
  //     console.log(`  ${line}`);
  //   }
  // Wearable breakdown by Rarity / Quality
  console.log(`${BOLD}Wearables by Rarity / Quality:${RESET}`);
  const wearGroupsE = Object.entries(resultElite.wearableGroups).sort(
    (a, b) => b[1].total - a[1].total
  );
  const totalWearablesE = wearGroupsE.reduce((sum, [, d]) => sum + d.total, 0);
  const expectedQualityE = getExpectedWearableQualityProportions();
  const rarityMultE = getEliteWearableRarityMultipliers(difficultyTierId);
  const expectedRarityE = getExpectedWearableRarityProportions(rarityMultE);
  for (const [groupKey, data] of wearGroupsE) {
    const [rarity, quality] = groupKey.split('|');
    const R = rarity
      ? rarity.charAt(0).toUpperCase() + rarity.slice(1)
      : 'Unknown';
    const Q = quality
      ? quality.charAt(0).toUpperCase() + quality.slice(1)
      : 'Unknown';
    const pct = totalWearablesE > 0 ? (data.total / totalWearablesE) * 100 : 0;
    const rProbE = rarity && (expectedRarityE as any)[rarity];
    const qProbE = quality && (expectedQualityE as any)[quality];
    const expGroupPctE =
      typeof rProbE === 'number' && typeof qProbE === 'number'
        ? rProbE * qProbE * 100
        : undefined;
    const pass = expGroupPctE == null || Math.abs(pct - expGroupPctE) <= 5;
    console.log(
      `  ${BOLD}${R} (${Q}) - ${data.total} (${pct.toFixed(2)}%)` +
        (expGroupPctE != null
          ? ` | expected ~${expGroupPctE.toFixed(2)}%`
          : '') +
        ` | ${pass ? 'PASS' : 'FAIL'}${RESET}`
    );
    const itemsSorted = Object.entries(data.items).sort((a, b) => b[1] - a[1]);
    // for (const [name, count] of itemsSorted) {
    //   console.log(`    ${name} = ${count}`);
    // }
  }

  if (!withinElite) {
    console.error(
      `Assertion failed: observed elite rate ${observedElite.toFixed(3)} not within +/-${toleranceElite} of expected ${expectedElite.toFixed(3)}`
    );
    process.exitCode = 1;
  }

  // Treasure chests
  const CHEST_ROLLS = 100000;
  const chestResult = simulateChestRolls(CHEST_ROLLS, difficultyTierId);

  console.log('\n--- Loot Table Simulation (Treasure Chests) ---');
  if (difficultyTierId) console.log(`Difficulty: ${difficultyTierId}`);
  console.log(`Opens: ${CHEST_ROLLS}`);
  console.log('Category counts:');
  for (const [cat, count] of Object.entries(chestResult.categories)) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('Currency:');
  console.log(
    `  USDC total: ${chestResult.sumUSDC.toFixed(2)} | avg/open: ${chestResult.avgUSDC.toFixed(4)}`
  );
  console.log(
    `  GHST total: ${chestResult.sumGHST.toFixed(2)} | avg/open: ${chestResult.avgGHST.toFixed(4)}`
  );

  console.log(`${BOLD}Wearables by Rarity / Quality (Chests):${RESET}`);
  const wearGroupsC = Object.entries(chestResult.wearableGroups).sort(
    (a, b) => b[1].total - a[1].total
  );
  const totalWearablesC = wearGroupsC.reduce((sum, [, d]) => sum + d.total, 0);
  const expectedQualityC = getExpectedWearableQualityProportions();
  const rarityMultC = getEliteWearableRarityMultipliers(difficultyTierId);
  const expectedRarityC = getExpectedWearableRarityProportions(rarityMultC);
  for (const [groupKey, data] of wearGroupsC) {
    const [rarity, quality] = groupKey.split('|');
    const R = rarity
      ? rarity.charAt(0).toUpperCase() + rarity.slice(1)
      : 'Unknown';
    const Q = quality
      ? quality.charAt(0).toUpperCase() + quality.slice(1)
      : 'Unknown';
    const pct = totalWearablesC > 0 ? (data.total / totalWearablesC) * 100 : 0;
    const rProb = rarity && (expectedRarityC as any)[rarity];
    const qProb = quality && (expectedQualityC as any)[quality];
    const expGroupPct =
      typeof rProb === 'number' && typeof qProb === 'number'
        ? rProb * qProb * 100
        : undefined;
    const pass = expGroupPct == null || Math.abs(pct - expGroupPct) <= 5;
    console.log(
      `  ${BOLD}${R} (${Q}) - ${data.total} (${pct.toFixed(2)}%)` +
        (expGroupPct != null ? ` | expected ~${expGroupPct.toFixed(2)}%` : '') +
        ` | ${pass ? 'PASS' : 'FAIL'}${RESET}`
    );
  }
}

main();
