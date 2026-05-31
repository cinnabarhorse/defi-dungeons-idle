import { describe, it, jest } from '@jest/globals';
import { runIdleModeSimulation, runIdleModeSimulationToFloor } from '../idle-sim';
import { assertSnapshot, saveFixture } from '../snapshot-utils';
import { getBotEligibleCharacters, getCharacterStats } from '../../data/characters';
import { computeProgressionModifiers, type StatAllocation } from '@gotchiverse/progression';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('graphql-request', () => ({
  gql: jest.fn(),
  request: jest.fn(),
}));

const LEVELS = [1, 25, 50, 99];
const LEVERAGES = [1, 10, 50];
const DIFFICULTIES = ['normal', 'nightmare', 'hell'] as const;
const TARGET_FLOORS = [3, 10, 20];
const TICKS = 5;
const TICK_MS = 1000;
const DEFAULT_MAX_HEALTH = 100;
const DEFAULT_BASE_MANA = 50;

const STAT_ALLOCATION_ORDER: Array<keyof StatAllocation> = [
  'spookiness', // health
  'energy', // attack speed
  'aggression', // damage
];

function buildEvenStatAllocation(level: number): StatAllocation {
  const totalPoints = Math.max(0, Math.floor(level) - 1);
  const perStat = Math.floor(totalPoints / STAT_ALLOCATION_ORDER.length);
  const remainder = totalPoints % STAT_ALLOCATION_ORDER.length;
  const stats: StatAllocation = {
    energy: perStat,
    aggression: perStat,
    spookiness: perStat,
    brainSize: 0,
  };

  for (let i = 0; i < remainder; i += 1) {
    const statKey = STAT_ALLOCATION_ORDER[i];
    stats[statKey] += 1;
  }

  return stats;
}

function createSeed(characterId: string, level: number): number {
  let hash = 0;
  for (let i = 0; i < characterId.length; i += 1) {
    hash = (hash * 31 + characterId.charCodeAt(i)) >>> 0;
  }
  return (hash + level * 1009) % 1_000_000;
}

interface FullRunLogEntry {
  characterId: string;
  level: number;
  leverage: number;
  difficulty: string;
  targetFloor: number;
  ticksRun: number;
  durationMs: number;
  runStatus: string;
  endedReason: string;
  depth: number;
  floor: number;
  score: number;
}

function getGoldenRunsArchiveDir(date: string): string {
  return path.join(process.cwd(), '__fixtures__', 'golden-runs', date);
}

function writeFullRunFixtureArchive(
  targetFloor: number,
  fixture: Record<string, unknown>,
  archiveDate?: string
): void {
  if (!archiveDate) return;
  const archiveDir = getGoldenRunsArchiveDir(archiveDate);
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(
    path.join(archiveDir, `idle-full-runs-floor-${targetFloor}.fixture.json`),
    JSON.stringify(fixture, null, 2)
  );
}

function writeCanonicalLogArchive(
  entries: Array<FullRunLogEntry & { type?: string }>,
  archiveDate?: string
): void {
  if (!archiveDate) return;
  const archiveDir = getGoldenRunsArchiveDir(archiveDate);
  fs.mkdirSync(archiveDir, { recursive: true });
  const payload = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
  fs.writeFileSync(path.join(archiveDir, 'idle-full-runs.log.ndjson'), payload);
}

function buildDerivedStats(characterId: string, level: number) {
  const statAllocation = buildEvenStatAllocation(level);
  const modifiers = computeProgressionModifiers(statAllocation);
  const baseStats = getCharacterStats(characterId);
  const attackSpeed = Number.isFinite(baseStats.attackSpeed)
    ? Math.max(150, Math.round((baseStats.attackSpeed || 0) * modifiers.attackSpeedScalar))
    : undefined;
  const damage = Number.isFinite(baseStats.damage)
    ? Math.max(1, Math.round((baseStats.damage || 0) * modifiers.damageMultiplier))
    : undefined;
  const damageRange = baseStats.damageRange
    ? {
        min: Math.max(1, Math.round(baseStats.damageRange.min * modifiers.damageMultiplier)),
        max: Math.max(1, Math.round(baseStats.damageRange.max * modifiers.damageMultiplier)),
      }
    : undefined;
  const baseMaxHp = Number.isFinite(baseStats.maxHealth)
    ? baseStats.maxHealth
    : DEFAULT_MAX_HEALTH;
  const maxHp = Math.max(
    1,
    Math.round(baseMaxHp * modifiers.maxHealthMultiplier + modifiers.maxHealthFlatBonus)
  );
  const baseMaxMana = Math.max(0, Number((baseStats as any).maxMana ?? DEFAULT_BASE_MANA));
  const maxMana = Math.max(0, Math.round(baseMaxMana + modifiers.maxManaBonus));

  const derivedStats = JSON.stringify({
    maxHealth: maxHp,
    attackSpeed,
    meleeAttackRange: baseStats.meleeAttackRange,
    rangedAttackRange: baseStats.rangedAttackRange,
    projectileSpeed: baseStats.projectileSpeed,
    damage,
    damageRange,
    totalDamage: (baseStats as any).totalDamage ?? 1,
    armor: baseStats.armor,
    movementSpeed: baseStats.movementSpeed,
    maxMana,
    manaRegenPerSecond: modifiers.manaRegenMultiplier,
    weaponType: baseStats.weaponType,
    weaponCategory: baseStats.weaponCategory,
    activeWeaponSlug: baseStats.activeWeapon?.slug,
    activeWeaponIndex: -1,
    weapons: baseStats.weapons ?? [],
    equipment: {
      slugs: baseStats.equipment?.slugs ?? [],
      items: baseStats.equipment?.items ?? [],
      modifiers: baseStats.equipment?.modifiers ?? {},
    },
    progression: {
      stats: modifiers,
    },
  });

  return {
    derivedStats,
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    statAllocation,
  };
}

describe('idle golden runs', () => {
  it('matches golden run snapshots for all characters and levels', () => {
    const characters = getBotEligibleCharacters()
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
    const results: Record<string, unknown> = {};

    for (const character of characters) {
      for (const level of LEVELS) {
        for (const leverage of LEVERAGES) {
          for (const difficulty of DIFFICULTIES) {
            const seed = createSeed(character.id, level);
            const derived = buildDerivedStats(character.id, level);
            const result = runIdleModeSimulation({
              seed,
              ticks: TICKS,
              tickMs: TICK_MS,
              leverageTotal: leverage,
              difficultyTier: difficulty,
              playerOverrides: {
                characterId: character.id,
                hp: derived.hp,
                maxHp: derived.maxHp,
                mana: derived.mana,
                maxMana: derived.maxMana,
                derivedStats: derived.derivedStats,
              },
            });

            results[
              `${character.id}-lvl-${level}-lev-${leverage}-diff-${difficulty}`
            ] = {
              characterId: character.id,
              level,
              leverage,
              difficulty,
              seed,
              statAllocation: derived.statAllocation,
              snapshot: result.snapshot,
              stateHash: result.stateHash,
            };
          }
        }
      }
    }

    assertSnapshot('idle-golden-runs', results);
  });

  const runFullIdle = process.env.RUN_FULL_IDLE === '1';
  (runFullIdle ? it : it.skip)(
    'runs a full idle session to floor 3',
    () => {
      const characters = getBotEligibleCharacters()
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const character = characters[0];
      const level = 99;
      const leverage = LEVERAGES[0];
      const difficulty = DIFFICULTIES[0];
      const seed = createSeed(character.id, level);
      const derived = buildDerivedStats(character.id, level);
      const result = runIdleModeSimulationToFloor({
        seed,
        tickMs: TICK_MS,
        targetFloor: TARGET_FLOORS[0],
        maxTicks: 5000,
        leverageTotal: leverage,
        difficultyTier: difficulty,
        playerOverrides: {
          characterId: character.id,
          hp: derived.hp,
          maxHp: derived.maxHp,
          mana: derived.mana,
          maxMana: derived.maxMana,
          derivedStats: derived.derivedStats,
        },
      });

      console.log('[idle-full-run]', {
        characterId: character.id,
        level,
        leverage,
        difficulty,
        ticksRun: result.ticksRun,
        durationMs: result.durationMs,
        runStatus: result.runStatus,
        endedReason: result.endedReason,
        depth: result.depth,
        floor: result.floor,
        score: result.snapshot.playerScore,
      });
    }
  );

  (runFullIdle ? it : it.skip)(
    'runs full idle sessions for all characters and levels to floors 3/10/20',
    () => {
      const characters = getBotEligibleCharacters()
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
      const maxTicksByFloor: Record<number, number> = {
        3: 5000,
        10: 12000,
        20: 20000,
      };
      const archiveDate = process.env.GOLDEN_RUNS_DATE;
      const canonicalEntries: Array<FullRunLogEntry & { type?: string }> = [];
      const canonicalSummary = {
        runs: 0,
        victories: 0,
        deaths: 0,
        avgTicks: 0,
        maxTicks: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
      };
      const canonicalTicks: number[] = [];
      const canonicalDurations: number[] = [];

      for (const targetFloor of TARGET_FLOORS) {
        const results: Record<string, unknown> = {};
        const logEntries: FullRunLogEntry[] = [];
        const durations: number[] = [];
        const ticks: number[] = [];
        let victories = 0;
        let deaths = 0;
        let maxTicks = 0;
        let maxDuration = 0;

        for (const character of characters) {
          for (const level of LEVELS) {
            for (const leverage of LEVERAGES) {
              for (const difficulty of DIFFICULTIES) {
                const seed = createSeed(character.id, level);
                const derived = buildDerivedStats(character.id, level);
                const result = runIdleModeSimulationToFloor({
                  seed,
                  tickMs: TICK_MS,
                  targetFloor,
                  maxTicks: maxTicksByFloor[targetFloor] ?? 5000,
                  leverageTotal: leverage,
                  difficultyTier: difficulty,
                  playerOverrides: {
                    characterId: character.id,
                    hp: derived.hp,
                    maxHp: derived.maxHp,
                    mana: derived.mana,
                    maxMana: derived.maxMana,
                    derivedStats: derived.derivedStats,
                  },
                });

                durations.push(result.durationMs);
                ticks.push(result.ticksRun);
                if (result.endedReason === 'victory') victories += 1;
                if (result.endedReason === 'dead') deaths += 1;
                maxTicks = Math.max(maxTicks, result.ticksRun);
                maxDuration = Math.max(maxDuration, result.durationMs);

                logEntries.push({
                  characterId: character.id,
                  level,
                  leverage,
                  difficulty,
                  targetFloor,
                  ticksRun: result.ticksRun,
                  durationMs: result.durationMs,
                  runStatus: result.runStatus,
                  endedReason: result.endedReason,
                  depth: result.depth,
                  floor: result.floor,
                  score: result.snapshot.playerScore,
                });
                canonicalEntries.push(logEntries[logEntries.length - 1]);
                canonicalTicks.push(result.ticksRun);
                canonicalDurations.push(result.durationMs);

                results[
                  `${character.id}-lvl-${level}-lev-${leverage}-diff-${difficulty}`
                ] = {
                  characterId: character.id,
                  level,
                  leverage,
                  difficulty,
                  seed,
                  statAllocation: derived.statAllocation,
                  ticksRun: result.ticksRun,
                  durationMs: result.durationMs,
                  runStatus: result.runStatus,
                  endedReason: result.endedReason,
                  depth: result.depth,
                  floor: result.floor,
                  score: result.snapshot.playerScore,
                };
              }
            }
          }
        }

        const avgDuration =
          durations.reduce((sum, value) => sum + value, 0) /
          Math.max(1, durations.length);
        const avgTicks =
          ticks.reduce((sum, value) => sum + value, 0) /
          Math.max(1, ticks.length);

        const fixturePayload = {
          generatedAt: new Date().toISOString(),
          targetFloor,
          runs: results,
          summary: {
            runs: durations.length,
            victories,
            deaths,
            avgTicks,
            maxTicks,
            avgDurationMs: avgDuration,
            maxDurationMs: maxDuration,
          },
        };

        canonicalEntries.push({
          type: 'summary',
          targetFloor,
          runs: durations.length,
          victories,
          deaths,
          avgTicks,
          maxTicks,
          avgDurationMs: avgDuration,
          maxDurationMs: maxDuration,
        } as FullRunLogEntry & { type?: string });

        console.log('[idle-full-run-summary]', {
          targetFloor,
          runs: durations.length,
          victories,
          deaths,
          avgTicks: Number(avgTicks.toFixed(2)),
          maxTicks,
          avgDurationMs: Number(avgDuration.toFixed(2)),
          maxDurationMs: maxDuration,
        });

        saveFixture(`idle-full-runs-floor-${targetFloor}`, fixturePayload);
        writeFullRunFixtureArchive(targetFloor, fixturePayload, archiveDate);

        canonicalSummary.runs += durations.length;
        canonicalSummary.victories += victories;
        canonicalSummary.deaths += deaths;
        canonicalSummary.maxTicks = Math.max(canonicalSummary.maxTicks, maxTicks);
        canonicalSummary.maxDurationMs = Math.max(
          canonicalSummary.maxDurationMs,
          maxDuration
        );
      }

      if (canonicalDurations.length > 0) {
        canonicalSummary.avgDurationMs =
          canonicalDurations.reduce((sum, value) => sum + value, 0) /
          canonicalDurations.length;
      }
      if (canonicalTicks.length > 0) {
        canonicalSummary.avgTicks =
          canonicalTicks.reduce((sum, value) => sum + value, 0) /
          canonicalTicks.length;
      }
      canonicalEntries.push({
        type: 'summary',
        targetFloor: 'all',
        ...canonicalSummary,
      } as FullRunLogEntry & { type?: string });
      writeCanonicalLogArchive(canonicalEntries, archiveDate);
    }
  );
});
