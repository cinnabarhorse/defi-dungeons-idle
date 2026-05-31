/*
  Monte Carlo combat simulation: characters vs enemies across difficulty tiers
  - Approximates server combat cadence
  - Ignores crit/evade/cleave/grenades for a baseline balance read
  - Applies player flat/percent mitigation exactly as in server logic
*/

import {
  ALL_CHARACTERS,
  getCharacterStats,
  type CharacterInfo,
} from '../data/characters';
import { ENEMY_DATA, type ServerEnemyStats } from '../data/enemies';
import { DIFFICULTY_TIERS } from '../data/difficulty-tiers';
import { aggregateAbilityEffects } from '../data/abilities-sim';
import * as fs from 'fs';
import * as path from 'path';

interface FightResult {
  playerWon: boolean;
  durationMs: number;
  playerHpRemaining: number;
  enemyHpRemaining: number;
  playerHitsLanded: number;
  enemyHitsLanded: number;
}

interface MatchupSummary {
  characterId: string;
  enemyType: string;
  tierId: string;
  simulations: number;
  winRate: number; // 0..1
  avgFightDurationMs: number;
  avgTimeToKillMs: number | null; // among wins; null when no wins
  avgTimeToDeathMs: number; // among losses
  avgPlayerHpRemainingOnWin: number;
  avgEnemyHpRemainingOnLoss: number;
}

interface SimulationOutput {
  simulationId: number;
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
  summaries: MatchupSummary[];
  agg: Array<{
    characterId: string;
    tierId: string;
    avgWinRate: number;
    avgTimeToKillMs: number;
    avgTimeToDeathMs: number;
  }>;
  suggestions: CharacterSuggestion[];
}

interface CharacterSuggestion {
  simulationId: number;
  suggestionNumber: number;
  characterId: string;
  rationale: string;
  changes: Array<
    | { field: 'damageRange'; scale: number }
    | { field: 'attackSpeed'; multiplier: number }
    | { field: 'armor'; add: number }
  >;
}

function getEnvFlag(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (arg) return arg.split('=')[1];
  return process.env[flag.toUpperCase()];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function randomIntInclusive(min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function applyDifficulty(
  enemy: ServerEnemyStats,
  tierId: string
): ServerEnemyStats {
  const tier = DIFFICULTY_TIERS[tierId];
  if (!tier) return enemy;
  return {
    ...enemy,
    health: Math.round(enemy.health * tier.enemyHealthMultiplier),
    maxHealth: Math.round(enemy.maxHealth * tier.enemyHealthMultiplier),
    damage: Math.round(enemy.damage * tier.enemyDamageMultiplier),
    speed: enemy.speed * tier.enemySpeedMultiplier,
    aggroRange: Math.round(enemy.aggroRange * tier.enemyAggroRangeMultiplier),
  };
}

function getEnemyAttackIntervalMs(enemy: ServerEnemyStats): number {
  // Mirrors server cadence:
  // melee: handleMeleeEnemyAttack gate ~800ms
  // ranged: rangedAttackSpeed || 2000ms
  if (enemy.attackType === 'ranged') {
    return enemy.rangedAttackSpeed || 2000;
  }
  return 800;
}

function calculateDamageAfterMitigation(
  armor: number,
  incomingDamage: number
): number {
  const normalizedArmor = Math.max(0, armor || 0);
  const percent = clamp(normalizedArmor / 100, 0, 0.8);
  const reduced = Math.max(normalizedArmor, percent * incomingDamage);
  return Math.max(0, Math.round(incomingDamage - reduced));
}

// Ability helpers extracted to data/abilities-sim.ts

function simulateSingleFight(
  characterId: string,
  enemyBase: ServerEnemyStats,
  tierId: string
): FightResult {
  const derived = getCharacterStats(characterId);
  const enemy = applyDifficulty(enemyBase, tierId);

  // Initial HP (server sets enemy.hp = enemy.health at spawn)
  let playerHp = Math.max(1, derived.maxHealth);
  let enemyHp = Math.max(1, enemy.health);

  // Attack intervals
  const playerInterval = Math.max(50, Math.round(derived.attackSpeed));
  const enemyInterval = Math.max(
    50,
    Math.round(getEnemyAttackIntervalMs(enemy))
  );

  // Abilities aggregated by current weapon scope
  const abilityEffects = aggregateAbilityEffects(
    (derived.abilities as any[]) || [],
    (derived.weaponType as 'melee' | 'ranged') || 'melee'
  );

  // Grenades (if any) - model as periodic extra damage and/or self-heal
  const grenadeProfiles = (derived.weapons || []).filter(
    (w) => (w as any).weaponType === 'grenades' && (w as any).grenade
  );
  // Start with a small initial windup so grenades don't detonate at t=0
  const grenadeNext: number[] = grenadeProfiles.map(
    () => 300 + Math.random() * 300
  );

  // Randomize initial offsets to avoid bias
  let tPlayerNext = Math.random() * playerInterval;
  let tEnemyNext = Math.random() * enemyInterval;
  let now = 0;

  // Damage helpers
  const playerDamageSample = () => {
    const range = derived.damageRange || {
      min: derived.damage,
      max: derived.damage,
    };
    return Math.max(0, randomIntInclusive(range.min, range.max));
  };

  const enemyDamagePerHit = calculateDamageAfterMitigation(
    derived.armor || 0,
    enemy.damage
  );

  let playerHits = 0;
  let enemyHits = 0;

  // Safety to prevent infinite loops
  const MAX_STEPS = 10000;
  let steps = 0;

  while (playerHp > 0 && enemyHp > 0 && steps < MAX_STEPS) {
    const tGren = grenadeNext.length
      ? Math.min(...grenadeNext)
      : Number.POSITIVE_INFINITY;
    const nextEvent = Math.min(tPlayerNext, tEnemyNext, tGren);
    now = nextEvent;

    // Both can land at the same timestamp
    const playerAttacksNow = Math.abs(tPlayerNext - nextEvent) < 1e-6;
    const enemyAttacksNow = Math.abs(tEnemyNext - nextEvent) < 1e-6;

    if (playerAttacksNow) {
      let dmg = playerDamageSample();
      // Critical strike
      if (Math.random() < abilityEffects.critChance) {
        dmg = Math.round(dmg * abilityEffects.critMultiplier);
      }
      enemyHp = Math.max(0, enemyHp - dmg);
      // Lifesteal (post-damage)
      if (abilityEffects.lifeStealPercent > 0 && dmg > 0) {
        const heal = Math.floor(dmg * abilityEffects.lifeStealPercent);
        if (heal > 0) {
          playerHp = Math.min(derived.maxHealth, playerHp + heal);
        }
      }
      playerHits++;
      tPlayerNext += playerInterval;
    }
    if (enemyHp <= 0) break;

    if (enemyAttacksNow) {
      // Evade roll
      if (Math.random() < abilityEffects.evadeChance) {
        // dodged
        tEnemyNext += enemyInterval;
      } else {
        if (enemyDamagePerHit > 0) {
          playerHp = Math.max(0, playerHp - enemyDamagePerHit);
        }
        enemyHits++;
        tEnemyNext += enemyInterval;
      }
    }
    if (playerHp <= 0) break;

    // Grenade events
    if (tGren === nextEvent) {
      for (let gi = 0; gi < grenadeNext.length; gi++) {
        if (Math.abs(grenadeNext[gi] - nextEvent) < 1e-6) {
          const g = (grenadeProfiles[gi] as any).grenade as {
            damageCenter?: number;
            cooldownMs: number;
            healingSplash?: { healAmount?: number };
          };
          const gDmg = Math.max(0, Math.round(g.damageCenter || 0));
          if (gDmg > 0) {
            enemyHp = Math.max(0, enemyHp - gDmg);
          }
          const healAmt = Math.max(
            0,
            Math.round(g.healingSplash?.healAmount || 0)
          );
          if (healAmt > 0) {
            playerHp = Math.min(derived.maxHealth, playerHp + healAmt);
          }
          grenadeNext[gi] += Math.max(200, g.cooldownMs || 1000);
        }
      }
    }

    steps++;
  }

  return {
    playerWon: enemyHp <= 0 && playerHp > 0,
    durationMs: now,
    playerHpRemaining: playerHp,
    enemyHpRemaining: enemyHp,
    playerHitsLanded: playerHits,
    enemyHitsLanded: enemyHits,
  };
}

function summarizeMatchup(
  characterId: string,
  enemyType: string,
  tierId: string,
  simulations: number
): MatchupSummary {
  const enemy = ENEMY_DATA[enemyType];
  let wins = 0;
  const durations: number[] = [];
  const killDurations: number[] = [];
  const deathDurations: number[] = [];
  let hpRemainOnWin = 0;
  let enemyHpRemainOnLoss = 0;

  for (let i = 0; i < simulations; i++) {
    const result = simulateSingleFight(characterId, enemy, tierId);
    durations.push(result.durationMs);
    if (result.playerWon) {
      wins++;
      killDurations.push(result.durationMs);
      hpRemainOnWin += result.playerHpRemaining;
    } else {
      deathDurations.push(result.durationMs);
      enemyHpRemainOnLoss += result.enemyHpRemaining;
    }
  }

  const winRate = wins / simulations;
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    characterId,
    enemyType,
    tierId,
    simulations,
    winRate,
    avgFightDurationMs: avg(durations),
    avgTimeToKillMs: killDurations.length ? avg(killDurations) : null,
    avgTimeToDeathMs: avg(deathDurations),
    avgPlayerHpRemainingOnWin: wins > 0 ? hpRemainOnWin / wins : 0,
    avgEnemyHpRemainingOnLoss:
      wins < simulations ? enemyHpRemainOnLoss / (simulations - wins) : 0,
  };
}

function main() {
  const onlyCharacter = getEnvFlag('onlyCharacter');
  const onlyTier = getEnvFlag('onlyTier');
  const onlyEnemy = getEnvFlag('onlyEnemy');
  const iterStr = getEnvFlag('iters');
  const simulations = Math.max(50, Number(iterStr) || 400);

  const characters: CharacterInfo[] = ALL_CHARACTERS.filter(
    (c) => c.isPlayable !== false
  );
  const enemyTypes = Object.keys(ENEMY_DATA);
  const tierIds = Object.keys(DIFFICULTY_TIERS);

  const selectedCharacters = onlyCharacter
    ? characters.filter((c) => c.id === onlyCharacter)
    : characters;
  const selectedEnemies = onlyEnemy
    ? enemyTypes.filter((e) => e === onlyEnemy)
    : enemyTypes;
  const selectedTiers = onlyTier
    ? tierIds.filter((t) => t === onlyTier)
    : tierIds;

  const summaries: MatchupSummary[] = [];

  for (const tierId of selectedTiers) {
    for (const char of selectedCharacters) {
      for (const enemyType of selectedEnemies) {
        const s = summarizeMatchup(char.id, enemyType, tierId, simulations);
        summaries.push(s);
      }
    }
  }

  // Aggregate per character/tier across enemies (equal weight)
  type AggKey = string;
  const agg: Record<
    AggKey,
    {
      tierId: string;
      characterId: string;
      winRate: number;
      tKill: number;
      tDeath: number;
      count: number;
    }
  > = {};
  for (const s of summaries) {
    const key = `${s.characterId}::${s.tierId}`;
    if (!agg[key]) {
      agg[key] = {
        tierId: s.tierId,
        characterId: s.characterId,
        winRate: 0,
        tKill: 0,
        tDeath: 0,
        count: 0,
      };
    }
    agg[key].winRate += s.winRate;
    agg[key].tKill += s.avgTimeToKillMs || 0;
    agg[key].tDeath += s.avgTimeToDeathMs || 0;
    agg[key].count += 1;
  }

  const aggList = Object.values(agg).map((a) => ({
    characterId: a.characterId,
    tierId: a.tierId,
    avgWinRate: a.winRate / a.count,
    avgTimeToKillMs: a.tKill / a.count,
    avgTimeToDeathMs: a.tDeath / a.count,
  }));

  // Print concise report
  console.log('=== Combat Simulation Results ===');
  console.log(
    `iters=${simulations} characters=${selectedCharacters.length} enemies=${selectedEnemies.length} tiers=${selectedTiers.length}`
  );

  // Top-level balance flags
  for (const row of aggList) {
    const wr = row.avgWinRate;
    const ttk = Math.round(row.avgTimeToKillMs);
    const ttd = Math.round(row.avgTimeToDeathMs);
    const tier = row.tierId;
    const char = row.characterId;
    let flag = '';
    if (wr < 0.35 && ttk > 0 && (ttd > 0 ? ttd < ttk : true))
      flag = 'UNDERPOWERED';
    else if (wr > 0.65 && (ttk > 0 ? (ttd > 0 ? ttk < ttd : true) : false))
      flag = 'OVERPOWERED';
    console.log(
      `${tier} | ${char} | winRate=${(wr * 100).toFixed(1)}% | TTK=${ttk}ms | TTD=${ttd}ms ${flag ? '<< ' + flag : ''}`
    );
  }

  // Build structured suggestions per character for Normal tiers only
  const suggestions: CharacterSuggestion[] = [];
  let suggestionNumber = 1;
  for (const char of selectedCharacters) {
    const normals = aggList.filter(
      (r) => r.characterId === char.id && r.tierId.startsWith('normal')
    );
    if (!normals.length) continue;
    const avgWr =
      normals.reduce((acc, r) => acc + r.avgWinRate, 0) / normals.length;
    if (avgWr > 0.7) {
      suggestions.push({
        simulationId: 0, // temp, will set after id allocated
        suggestionNumber: suggestionNumber++,
        characterId: char.id,
        rationale: `Avg win rate ${(avgWr * 100).toFixed(1)}% across normal tiers is too high. Reduce DPS or survivability slightly.`,
        changes: [
          { field: 'damageRange', scale: 0.9 },
          { field: 'attackSpeed', multiplier: 1.1 },
        ],
      });
    } else if (avgWr < 0.4) {
      suggestions.push({
        simulationId: 0,
        suggestionNumber: suggestionNumber++,
        characterId: char.id,
        rationale: `Avg win rate ${(avgWr * 100).toFixed(1)}% across normal tiers is too low. Boost DPS or mitigation slightly.`,
        changes: [
          { field: 'damageRange', scale: 1.1 },
          { field: 'attackSpeed', multiplier: 0.9 },
          { field: 'armor', add: 1 },
        ],
      });
    }
  }

  // Persist results and per-character suggestions under apps/client/public/simulations
  try {
    const simDir = path.resolve(__dirname, '../apps/client/public/simulations');
    if (!fs.existsSync(simDir)) fs.mkdirSync(simDir, { recursive: true });
    const files = fs
      .readdirSync(simDir)
      .filter((f) => /^simulations_\d+\.json$/.test(f));
    let maxId = 0;
    for (const f of files) {
      const m = f.match(/simulations_(\d+)\.json/);
      if (m) {
        const id = Number(m[1]);
        if (Number.isFinite(id)) maxId = Math.max(maxId, id);
      }
    }
    const simulationId = maxId + 1;

    // fill suggestion simulationId
    for (const s of suggestions) {
      s.simulationId = simulationId;
    }

    const output: SimulationOutput = {
      simulationId,
      createdAt: new Date().toISOString(),
      params: {
        simulations,
        characters: selectedCharacters.length,
        enemies: selectedEnemies.length,
        tiers: selectedTiers.length,
        onlyCharacter: onlyCharacter || undefined,
        onlyEnemy: onlyEnemy || undefined,
        onlyTier: onlyTier || undefined,
      },
      summaries,
      agg: aggList,
      suggestions,
    };

    const simFile = path.join(simDir, `simulations_${simulationId}.json`);
    fs.writeFileSync(simFile, JSON.stringify(output, null, 2));
    console.log(`\nSaved: ${simFile}`);

    // Write per-suggestion files
    for (const s of suggestions) {
      const sugFile = path.join(
        simDir,
        `suggestions_${s.simulationId}_${s.suggestionNumber}.json`
      );
      fs.writeFileSync(sugFile, JSON.stringify(s, null, 2));
      console.log(`Saved: ${sugFile}`);
    }

    // Update simulations index for listing in UI
    const indexFile = path.join(simDir, 'index.json');
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
    console.log(`Updated index: ${indexFile}`);
  } catch (err) {
    console.warn('Failed to save simulation outputs:', err);
  }
}

main();
