import {
  IdleEncounterSchema,
  IdleEnemySchema,
} from '../../schemas/IdleSchemas';
import { ENEMY_TYPES, getRandomEliteNameForType } from '../../data/enemies';
import { getDifficultyTier } from '../../data/difficulty-tiers';

const ENEMY_GAUGE_GAIN_MULTIPLIER = 100;

function getBaseEnemyGaugeGain(template: any): number {
  const rangedAttackSpeed = Number(template?.rangedAttackSpeed);
  if (template?.attackType === 'ranged' && rangedAttackSpeed > 0) {
    return Math.round((1000 / rangedAttackSpeed) * 100);
  }
  return Math.round((template?.speed || 1) * ENEMY_GAUGE_GAIN_MULTIPLIER);
}

export class EncounterManager {
  static generateEncounter(
    depth: number,
    difficultyTierId: string = 'normal',
    difficultyFloor: number = 1,
    targetFloor: number = 3,
    eliteSpawnedThisFloor: boolean = false,
    treasureSpawnedThisFloor: boolean = false
  ): IdleEncounterSchema {
    const encounter = new IdleEncounterSchema();
    encounter.id = Math.random().toString(36).substring(7);

    // Use difficultyFloor for scaling, depth for room type
    const roomInFloor = depth % 10 === 0 ? 10 : depth % 10;
    const currentFloor = Math.ceil(depth / 10);

    const tier = getDifficultyTier(difficultyTierId);

    // 1. Boss Room (Final Room of Target Floor ONLY)
    // CRITICAL: Bosses must ONLY spawn on room 10 of the target floor
    if (roomInFloor === 10 && currentFloor === targetFloor) {
      console.log('[EncounterManager] Generating BOSS encounter', {
        depth,
        currentFloor,
        targetFloor,
        roomInFloor,
        difficultyFloor,
      });
      return this.createBossEncounter(encounter, difficultyFloor, tier);
    }

    // 2. Elite Room (Room 10, if not boss room and player reached it without finding portal)
    // On non-target floors, room 10 should have an elite, not a boss
    if (roomInFloor === 10 && !eliteSpawnedThisFloor) {
      if (currentFloor === targetFloor) {
        console.error('[EncounterManager] ERROR: Room 10 on target floor should be boss, not elite!', {
          depth,
          currentFloor,
          targetFloor,
        });
      }
      return this.createEliteEncounter(encounter, difficultyFloor, tier);
    }

    // 3. Random Encounter (Combat, Treasure, or Portal)
    const roll = Math.random();

    // Portals spawn in rooms 6-9, but not on target floor (must face boss)
    const canSpawnPortal =
      roomInFloor >= 6 &&
      roomInFloor <= 9 &&
      currentFloor !== targetFloor;

    if (roll < 0.2 && !treasureSpawnedThisFloor) {
      return this.createTreasureEncounter(encounter, difficultyFloor);
    } else if (roll < 0.35 && canSpawnPortal) {
      // 15% chance to find a portal early in the late floor rooms
      return this.createPortalEncounter(encounter);
    } else {
      return this.createCombatEncounter(encounter, difficultyFloor, tier);
    }
  }

  private static createPortalEncounter(
    encounter: IdleEncounterSchema
  ): IdleEncounterSchema {
    encounter.type = 'portal';
    encounter.name = 'Mysterious Portal';
    encounter.description =
      'A swirling rift in reality that leads deeper into the dungeon.';
    encounter.imageId = 'og_portal'; // Using existing portal asset

    encounter.progressMax = 1;
    encounter.progressCurrent = 1;

    return encounter;
  }

  private static createCombatEncounter(
    encounter: IdleEncounterSchema,
    floor: number,
    tier: any
  ): IdleEncounterSchema {
    // Select random enemy (excluding boss/elite/special for now)
    const candidates = Object.values(ENEMY_TYPES).filter(
      (e) =>
        e.enemyType !== 'portal_guardian' &&
        e.classification !== 'boss' &&
        e.classification !== 'elite'
    );

    // 1-5 enemies, scaling cap with floor
    const maxEnemies = Math.min(5, Math.ceil(floor / 2) + 1);
    const count = 1 + Math.floor(Math.random() * maxEnemies);

    encounter.type = 'combat';

    // Scale stats by floor and difficulty tier
    const floorScale = 1 + (floor - 1) * 0.1; // +10% per floor
    const healthMult = tier?.enemyHealthMultiplier ?? 1;
    const damageMult = tier?.enemyDamageMultiplier ?? 1;
    const speedMult = tier?.enemySpeedMultiplier ?? 1;
    const xpMult = tier?.xpMultiplier ?? 1;

    let totalHp = 0;

    // Initial distance for combat: random between 0 and 300px
    encounter.distance = Math.floor(Math.random() * 301);

    for (let i = 0; i < count; i++) {
      const template =
        candidates[Math.floor(Math.random() * candidates.length)];
      const enemy = new IdleEnemySchema();
      enemy.id = `enemy_${i}`;
      enemy.name = template.name;
      enemy.imageId = template.enemyType;

      enemy.maxHp = Math.round(template.maxHealth * floorScale * healthMult);
      enemy.hp = enemy.maxHp;
      enemy.atk = Math.round(template.damage * floorScale * damageMult);
      enemy.xpReward = Math.round(template.baseXp * floorScale * xpMult);
      enemy.classification = template.classification || 'normal';

      // CRITICAL: Ensure no bosses are created in regular combat encounters
      if (enemy.classification === 'boss' || template.enemyType === 'portal_guardian') {
        console.error('[EncounterManager] ERROR: Attempted to create boss in regular combat encounter!', {
          enemyType: template.enemyType,
          classification: enemy.classification,
          floor,
        });
        // Replace with a normal enemy instead
        const normalCandidates = candidates.filter(
          (e) => e.classification !== 'boss' && e.enemyType !== 'portal_guardian'
        );
        if (normalCandidates.length > 0) {
          const normalTemplate = normalCandidates[Math.floor(Math.random() * normalCandidates.length)];
          enemy.name = normalTemplate.name;
          enemy.imageId = normalTemplate.enemyType;
          enemy.classification = normalTemplate.classification || 'normal';
          enemy.maxHp = Math.round(normalTemplate.maxHealth * floorScale * healthMult);
          enemy.hp = enemy.maxHp;
          enemy.atk = Math.round(normalTemplate.damage * floorScale * damageMult);
          enemy.xpReward = Math.round(normalTemplate.baseXp * floorScale * xpMult);
        }
      }

      // Ranges & Movement
      enemy.attackRange = template.attackRange || 32;
      enemy.moveSpeed = Math.round(
        (template.speed || 1) * 60 * floorScale * speedMult
      );
      const baseGaugeGain = getBaseEnemyGaugeGain(template);
      enemy.attackSpeed = Math.round(baseGaugeGain * speedMult);
      enemy.actionGauge = 0;

      encounter.enemies.push(enemy);
      totalHp += enemy.maxHp;
    }

    const firstEnemy = encounter.enemies[0];
    encounter.name =
      count > 1 ? `${count} Enemies` : firstEnemy?.name || 'Unknown';
    encounter.description =
      count > 1
        ? `::enemy:${firstEnemy?.imageId || 'slime'}:: A group of ${count} enemies appears!`
        : `::enemy:${firstEnemy?.imageId || 'slime'}:: A wild ${firstEnemy?.name || 'enemy'} appears!`;
    encounter.imageId = firstEnemy?.imageId || 'slime';
    encounter.enemyId = firstEnemy?.imageId || 'slime'; // Legacy

    encounter.progressMax = totalHp;
    encounter.progressCurrent = totalHp;
    encounter.targetIndex = 0;

    return encounter;
  }

  private static createEliteEncounter(
    encounter: IdleEncounterSchema,
    floor: number,
    tier: any
  ): IdleEncounterSchema {
    // Find elite candidates
    const eliteCandidates = Object.values(ENEMY_TYPES).filter(
      (e) => e.classification === 'elite'
    );
    const minionCandidates = Object.values(ENEMY_TYPES).filter(
      (e) => e.classification !== 'boss' && e.classification !== 'elite'
    );

    const eliteTemplate =
      eliteCandidates.length > 0
        ? eliteCandidates[Math.floor(Math.random() * eliteCandidates.length)]
        : minionCandidates[Math.floor(Math.random() * minionCandidates.length)];

    encounter.type = 'combat';

    const floorScale = 1 + (floor - 1) * 0.1;
    const healthMult = tier?.enemyHealthMultiplier ?? 1;
    const damageMult = tier?.enemyDamageMultiplier ?? 1;
    const speedMult = tier?.enemySpeedMultiplier ?? 1;
    const xpMult = tier?.xpMultiplier ?? 1;

    let totalHp = 0;
    encounter.distance = 350; // Elites start a bit further back

    // 1. Create the Elite Leader
    const elite = new IdleEnemySchema();
    elite.id = 'elite_leader';
    const specialName = getRandomEliteNameForType(eliteTemplate.enemyType);
    elite.name = `Elite ${specialName}`;
    elite.imageId = eliteTemplate.enemyType;
    // Elites are 2x tougher
    elite.maxHp = Math.round(
      eliteTemplate.maxHealth * floorScale * healthMult * 2.5
    );
    elite.hp = elite.maxHp;
    elite.atk = Math.round(
      eliteTemplate.damage * floorScale * damageMult * 1.5
    );
    elite.xpReward = Math.round(eliteTemplate.baseXp * floorScale * xpMult * 3);
    elite.classification = 'elite';
    elite.attackRange = eliteTemplate.attackRange || 32;
    elite.moveSpeed = Math.round(
      (eliteTemplate.speed || 1) * 60 * floorScale * speedMult
    );
    const eliteBaseGaugeGain = getBaseEnemyGaugeGain(eliteTemplate);
    elite.attackSpeed = Math.round(eliteBaseGaugeGain * speedMult * 1.2); // Elites attack 20% faster
    elite.actionGauge = 0;

    encounter.enemies.push(elite);
    totalHp += elite.maxHp;

    // 2. Create 4 Minions
    for (let i = 0; i < 4; i++) {
      const minionTemplate =
        minionCandidates[Math.floor(Math.random() * minionCandidates.length)];
      const minion = new IdleEnemySchema();
      minion.id = `minion_${i}`;
      minion.name = `${minionTemplate.name} Guard`;
      minion.imageId = minionTemplate.enemyType;
      minion.maxHp = Math.round(
        minionTemplate.maxHealth * floorScale * healthMult
      );
      minion.hp = minion.maxHp;
      minion.atk = Math.round(minionTemplate.damage * floorScale * damageMult);
      minion.xpReward = Math.round(minionTemplate.baseXp * floorScale * xpMult);
      minion.classification = 'normal';
      minion.attackRange = minionTemplate.attackRange || 32;
      minion.moveSpeed = Math.round(
        (minionTemplate.speed || 1) * 60 * floorScale * speedMult
      );
      const minionBaseGaugeGain = getBaseEnemyGaugeGain(minionTemplate);
      minion.attackSpeed = Math.round(minionBaseGaugeGain * speedMult);
      minion.actionGauge = 0;

      encounter.enemies.push(minion);
      totalHp += minion.maxHp;
    }

    encounter.name = elite.name + ' Mob';
    encounter.description = `::enemy:${elite.imageId}:: A powerful elite enemy and its guards block your path!`;
    encounter.imageId = elite.imageId;
    encounter.progressMax = totalHp;
    encounter.progressCurrent = totalHp;
    encounter.targetIndex = 0;

    return encounter;
  }

  private static createBossEncounter(
    encounter: IdleEncounterSchema,
    floor: number,
    tier: any
  ): IdleEncounterSchema {
    // CRITICAL: This method should ONLY be called for room 10 of the target floor
    // For now, use Portal Guardian as generic boss
    const template = ENEMY_TYPES['portal_guardian'];
    const floorScale = 1 + (floor - 1) * 0.25; // +25% per floor for bosses
    const healthMult = tier?.enemyHealthMultiplier ?? 1;
    const damageMult = tier?.enemyDamageMultiplier ?? 1;
    const speedMult = tier?.enemySpeedMultiplier ?? 1;
    const xpMult = tier?.xpMultiplier ?? 1;

    const enemy = new IdleEnemySchema();
    enemy.id = 'boss';
    enemy.name = template.name;
    enemy.imageId = template.enemyType;
    enemy.maxHp = Math.round(template.maxHealth * floorScale * healthMult);
    enemy.hp = enemy.maxHp;
    enemy.atk = Math.round(template.damage * floorScale * damageMult);
    enemy.xpReward = Math.round(template.baseXp * floorScale * 2 * xpMult);
    enemy.classification = 'boss';
    enemy.attackRange = template.attackRange || 32;
    enemy.moveSpeed = Math.round(
      (template.speed || 1) * 60 * floorScale * speedMult
    );
    const bossBaseGaugeGain = getBaseEnemyGaugeGain(template);
    enemy.attackSpeed = Math.round(
      bossBaseGaugeGain * floorScale * speedMult
    );
    enemy.actionGauge = 0;

    encounter.enemies.push(enemy);

    encounter.type = 'combat';
    encounter.name = `${template.name} (Final Floor)`;
    encounter.description = `::enemy:${template.enemyType}:: The Guardian of the Gate stands before you.`;
    encounter.imageId = template.enemyType;
    encounter.enemyId = template.enemyType; // Legacy

    encounter.progressMax = enemy.maxHp;
    encounter.progressCurrent = enemy.hp;
    encounter.targetIndex = 0;
    encounter.distance = 400; // Bosses start further away?

    return encounter;
  }

  private static createTreasureEncounter(
    encounter: IdleEncounterSchema,
    floor: number
  ): IdleEncounterSchema {
    encounter.type = 'treasure';
    encounter.name = 'Old Treasure Chest';
    encounter.description =
      'It looks locked, but you might find something useful inside.';
    encounter.imageId = 'chest_wood'; // Placeholder ID

    // Treasure has "HP" to represent opening time/effort if we want, or 0
    encounter.progressMax = 1;
    encounter.progressCurrent = 1;

    return encounter;
  }
}
