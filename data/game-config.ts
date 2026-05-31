// Single source of truth for game configuration
// This file is consumed by scripts/generate-shared-files.ts to produce
// client/server copies under apps/*/src/data/game-config.ts

export const GAME_CONFIG = {
  TILE_SIZE: 32,
  MAP_WIDTH: 200, // tiles
  MAP_HEIGHT: 200, // tiles
  WORLD_WIDTH: 32 * 200, // px (match MAP_WIDTH)
  WORLD_HEIGHT: 32 * 200, // px (match MAP_HEIGHT)
  SERVER_TICK_HZ: 30,
  SNAPSHOT_HZ: 15,
  MAX_PLAYERS: 3,
  MOVEMENT_SPEED: 4, // tiles per second
  ATTACK_COOLDOWN: 1000, // ms
  BASE_HP: 100,
  // Feature flags
  EDGE_PAN_ENABLED: false,
  // Staging
  // When true, client should always load staging assets and the server should favor staging flow.
  ELITE_AURA_COLORS: ['red', 'green', 'blue', 'yellow'],
  eliteSpawnChanceByRoomTier: {
    default: 0.2,
    medium: 0.2,
    large: 0.22,
    small: 0.18,
  },
  eliteMaxPerFloor: 1,
  minDistanceBetweenElites: 14, // tiles
  // Minimum distance (in tiles) that player initial spawns must be from elite leaders
  playerSpawnMinDistanceFromElites: 12, // tiles
  // Minimum distance (in tiles) between the party's spawn anchor and elite groups.
  // Helps prevent elites from appearing in the same room as the party on new floors.
  eliteMinDistanceFromPlayerAnchorTiles: 24,
  minionRingRadiusTiles: 4,
  maxFormationAttempts: 6,
  maxElitesPerRoomBySize: {
    small: 1,
    medium: 1,
    large: 2,
  },
  enemyDifficultyMeter: {
    enabled: true,
    tickIntervalMs: 60_000,
    damagePerMinute: 0.08,
    hpPerMinute: 0.1,
    maxDamageMultiplier: 4,
    maxHpMultiplier: 6,
    rescaleBatchSize: 35,
    rescaleBatchDelayMs: 75,
    floorDescendDelta: 5,
  },
  bossLoot: {
    depth: {
      enabled: true,
      wearableCategoryBiasPerFloor: 0.02,
      wearableCategoryBiasMax: 0.35,
      // Boss-tier scaling knobs (by tier.dropRateMultiplier)
      // Probability scaling: dropTarget *= 1 + probabilityDropRateWeight * (dropRateMultiplier - 1)
      probabilityDropRateWeight: 0.5,
      // Amount scaling: baseAmount *= 1 + amountDropRateWeight * (dropRateMultiplier - 1)
      amountDropRateWeight: 0.25,
      // Depth-based currency knobs
      // Probability: already controlled by currencyDropBonusPerFloor / currencyDropMaxBonus / currencyDropTargetCap
      // Amount: scale base amount modestly with depth to avoid economy spikes
      currencyAmountBonusPerFloor: 0.01,
      currencyAmountMaxBonus: 0.15,
      wearableRarityBoostPerFloor: {
        legendary: 0.02,
        mythical: 0.01,
        godlike: 0.005,
      },
      wearableRarityBoostMax: {
        legendary: 0.5,
        mythical: 0.5,
        godlike: 0.5,
      },
      wearableStateBiasPerFloor: {
        broken: -0.02,
        budget: -0.012,
        average: 0,
        excellent: 0.01,
        flawless: 0.015,
      },
      wearableStateBiasMax: {
        broken: 0.6,
        budget: 0.5,
        average: 0.25,
        excellent: 0.5,
        flawless: 0.5,
      },
      currencyDropBonusPerFloor: 0.02,
      currencyDropMaxBonus: 0.3,
      currencyDropTargetCap: 0.9,
    },
  },
  dailyRuns: {
    enabled: true,
    resetTimeUtcHour: 0,
    tiers: [
      { usdcStakedGte: 0, dailyRuns: 10 },
      { usdcStakedGte: 100, dailyRuns: 20 },
      { usdcStakedGte: 1000, dailyRuns: 30 },
    ],
  },
  victoryChest: {
    enabled: true,
    weights: {
      potion: 55,
      bonusProgressionRun: 20,
      bonusCompetitionRun: 10,
      wearable: 15,
    },
    potion: {
      tierWeights: {
        greater: 75,
        ultra: 25,
      },
      quantityWeights: {
        1: 70,
        2: 25,
        3: 5,
      },
    },
    wearable: {
      rarityWeights: {
        common: 50,
        uncommon: 30,
        rare: 15,
        legendary: 4,
        mythical: 1,
        godlike: 0.5,
      },
    },
    goldBonus: {
      amounts: [
        { amount: 10, weight: 70 },
        { amount: 50, weight: 25 },
        { amount: 100, weight: 5 },
      ],
    },
  },
  wearableForge: {
    successChancePctByRarity: {
      common: 80,
      uncommon: 70,
      rare: 60,
      legendary: 50,
      mythical: 40,
      godlike: 30,
    },
    goldCostByRarity: {
      common: 100,
      uncommon: 200,
      rare: 400,
      legendary: 800,
      mythical: 1600,
      godlike: 3200,
    },
    successChanceMultiplierBySourceQuality: {
      broken: 0.1,
      budget: 0.25,
      average: 0.5,
      excellent: 1,
      flawless: 1,
    },
    inputQuality: 'excellent',
    lickTongueCostByRarity: {
      common: 1,
      uncommon: 2,
      rare: 5,
      legendary: 25,
      mythical: 100,
      godlike: 500,
    },
    outputQuality: 'flawless',
    outputDurability: 1000,
  },
  STAGING_ENABLED: false,
  ENABLE_ENEMY_RESPAWN: false,
  leverage: {
    xpMultiplierEnabled: true,
  },
  trading: {
    settlementEnabled: true,
  },
  // Mode-specific reward configuration
  // Controls what players earn in each game mode
  modeRewards: {
    progression: {
      // Progression mode rewards
      earnXp: true,
      earnGold: true, // coins/gold currency
      earnLickTongue: true, // lick tongue materials
      earnWearables: false, // wearable loot
      earnPotions: true, // potions collected during run
    },
    competition: {
      // Competition mode rewards
      earnXp: true,
      earnGold: true,
      earnLickTongue: true,
      earnWearables: true,
      earnPotions: true,
    },
  },
};

export const POTION_TIERS: Record<number, { healPercent: number; minHeal: number }> = {
  1: { healPercent: 0.1, minHeal: 50 },
  2: { healPercent: 0.25, minHeal: 0 },
  3: { healPercent: 0.5, minHeal: 0 },
};

export interface CraftingRecipe {
  inputTier: number;
  outputTier: number;
  inputCount: number;
  outputCount: number;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  { inputTier: 1, outputTier: 2, inputCount: 3, outputCount: 1 },
  { inputTier: 2, outputTier: 3, inputCount: 3, outputCount: 1 },
];
