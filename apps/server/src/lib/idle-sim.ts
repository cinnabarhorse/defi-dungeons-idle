import { processIdleTick } from '../rooms/IdleMode';
import { hashState, withSeed } from './seeded-random';

interface IdleSimEnemy {
  id: string;
  name: string;
  imageId: string;
  hp: number;
  maxHp: number;
  atk: number;
  attackRange: number;
  moveSpeed: number;
  attackSpeed: number;
  actionGauge: number;
  isDead: boolean;
  xpReward: number;
  classification: string;
  specialState: string;
  specialCooldown: number;
  stunTurnsRemaining: number;
}

interface IdleSimLoot {
  type: string;
  name: string;
  quantity: number;
  rarity: string;
  color: string;
  wearableSlug: string;
  quality: string;
  tokenAmount: number;
}

interface IdleSimEncounter {
  id: string;
  type: string;
  name: string;
  description: string;
  imageId: string;
  isPlayerTurn: boolean;
  playerActionGauge: number;
  playerAttackSpeed: number;
  lastActionLog: string;
  progressCurrent: number;
  progressMax: number;
  isCompleted: boolean;
  enemies: IdleSimEnemy[];
  targetIndex: number;
  distance: number;
  playerAttackRange: number;
  loots: IdleSimLoot[];
  grenadeCooldown: number;
  grenadeMaxCooldown: number;
  playerStunTurnsRemaining: number;
  enemyId: string;
  enemyAtk: number;
  xpReward: number;
  lootTableId: string;
}

interface IdleSimRoomState {
  id: string;
  players: Map<string, IdleSimPlayer>;
  difficultyTier: string;
  leverageTotal: number;
}

interface IdleSimRoom {
  state: IdleSimRoomState;
  lastIdleTick: number;
  bossKilled: boolean;
  gamePlayerStats: Map<string, { kills: number }>;
  getPlayerIdForSession: (sessionId: string) => string | null;
  getClientBySessionId: (sessionId: string) => null;
  awardXpToPlayer: () => void;
  applyInventoryDelta: () => Promise<void>;
  logEconomyTransaction: () => void;
  markFloorReached: () => void;
  msg: { sendTo: () => void };
  playerInventories: Map<string, unknown[]>;
}

interface IdleSimPlayer {
  id: string;
  characterId: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  score: number;
  isAutoExploring: boolean;
  derivedStats: string;
  healthPotionCount: number;
  manaPotionCount: number;
  equippedWearables: string;
  dailyQuestActive: boolean;
  autoAscendFloor: number;
  idleRoom: {
    roomId: string;
    encounter: IdleSimEncounter;
    isTransitioning: boolean;
    runStatus: string;
    depth: number;
    maxDepthReached: number;
    difficultyFloor: number;
    roomsVisited: number;
    eliteSpawnedThisFloor: boolean;
    treasureSpawnedThisFloor: boolean;
    grenadeCooldownRemaining: number;
    playerPoisonTurnsRemaining: number;
    playerPoisonDamagePerTurn: number;
    spellCooldowns: Map<string, number>;
    killCount: Map<string, number>;
    lootsCollected: IdleSimLoot[];
    tokenRewards: IdleSimLoot[];
    competitionMultiplier: number;
    runHealthPotionsCollected: number;
    runManaPotionsCollected: number;
    speedRun?: boolean;
    speedRunMultiplier?: number;
  };
}

export interface IdleSimulationOptions {
  seed: number;
  ticks?: number;
  tickMs?: number;
  playerOverrides?: Partial<IdleSimPlayer>;
  enemyOverrides?: Partial<IdleSimEnemy>;
  leverageTotal?: number;
  difficultyTier?: string;
}

export interface IdleSimulationSnapshot {
  seed: number;
  ticks: number;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
  playerScore: number;
  playerActionGauge: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyActionGauge: number;
  enemyStunTurnsRemaining: number;
  encounterCompleted: boolean;
  runStatus: string;
  killCount: Record<string, number>;
  rngSample: number;
}

export interface IdleSimulationResult {
  snapshot: IdleSimulationSnapshot;
  stateHash: string;
}

export interface IdleSimulationFullResult extends IdleSimulationResult {
  ticksRun: number;
  durationMs: number;
  runStatus: string;
  depth: number;
  floor: number;
  endedReason: 'victory' | 'dead' | 'max_ticks' | 'unknown';
}

export interface IdleSimulationFullOptions extends IdleSimulationOptions {
  targetFloor: number;
  autoAscendFloor?: number;
  maxTicks?: number;
}

export interface IdleSimulationReplayOptions extends IdleSimulationOptions {
  includeInitialFrame?: boolean;
}

export interface IdleSimulationReplayFrame {
  tick: number;
  now: number;
  playerHp: number;
  playerMaxHp: number;
  playerMana: number;
  playerMaxMana: number;
  playerScore: number;
  playerActionGauge: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyActionGauge: number;
  enemyStunTurnsRemaining: number;
  encounterCompleted: boolean;
  runStatus: string;
  killCount: Record<string, number>;
  lastActionLog: string;
  stateHash: string;
}

export interface IdleSimulationReplayResult {
  seed: number;
  ticks: number;
  tickMs: number;
  difficultyTier: string;
  leverageTotal: number;
  frames: IdleSimulationReplayFrame[];
  finalStateHash: string;
}

function createSimEnemy(overrides: Partial<IdleSimEnemy> = {}): IdleSimEnemy {
  return {
    id: 'enemy-1',
    name: 'Sim Enemy',
    imageId: 'sim_enemy',
    hp: 120,
    maxHp: 120,
    atk: 6,
    attackRange: 32,
    moveSpeed: 32,
    attackSpeed: 100,
    actionGauge: 0,
    isDead: false,
    xpReward: 20,
    classification: 'normal',
    specialState: 'idle',
    specialCooldown: 0,
    stunTurnsRemaining: 0,
    ...overrides,
  };
}

function createSimPlayer(
  enemy: IdleSimEnemy,
  overrides: Partial<IdleSimPlayer> = {}
): IdleSimPlayer {
  const encounter: IdleSimEncounter = {
    id: 'encounter-1',
    type: 'combat',
    name: 'Simulation Encounter',
    description: '',
    imageId: 'sim_encounter',
    isPlayerTurn: false,
    playerActionGauge: 0,
    playerAttackSpeed: 100,
    lastActionLog: '',
    progressCurrent: 0,
    progressMax: 100,
    isCompleted: false,
    enemies: [enemy],
    targetIndex: 0,
    distance: 0,
    playerAttackRange: 32,
    loots: [],
    grenadeCooldown: 0,
    grenadeMaxCooldown: 3,
    playerStunTurnsRemaining: 0,
    enemyId: enemy.id,
    enemyAtk: enemy.atk,
    xpReward: enemy.xpReward,
    lootTableId: 'sim_loot',
  };

  return {
    id: 'session-sim-1',
    characterId: 'sim-gotchi',
    hp: 100,
    maxHp: 100,
    mana: 50,
    maxMana: 100,
    score: 0,
    isAutoExploring: true,
    derivedStats: JSON.stringify({
      attackSpeed: 1000,
      weaponType: 'melee',
      meleeAttackRange: 32,
    }),
    healthPotionCount: 0,
    manaPotionCount: 0,
    equippedWearables: '[]',
    dailyQuestActive: false,
    autoAscendFloor: 10,
    idleRoom: {
      roomId: 'idle-room-1',
      encounter,
      isTransitioning: false,
      runStatus: 'active',
      depth: 1,
      maxDepthReached: 1,
      difficultyFloor: 1,
      roomsVisited: 1,
      eliteSpawnedThisFloor: false,
      treasureSpawnedThisFloor: false,
      grenadeCooldownRemaining: 0,
      playerPoisonTurnsRemaining: 0,
      playerPoisonDamagePerTurn: 0,
      spellCooldowns: new Map(),
      killCount: new Map(),
      lootsCollected: [],
      tokenRewards: [],
      competitionMultiplier: 1,
      runHealthPotionsCollected: 0,
      runManaPotionsCollected: 0,
      speedRun: false,
      speedRunMultiplier: 1,
    },
    ...overrides,
  };
}

function createSimRoom(player: IdleSimPlayer): IdleSimRoom {
  return {
    state: {
      id: 'room-sim-1',
      players: new Map([[player.id, player]]),
      difficultyTier: 'normal_1',
      leverageTotal: 1,
    },
    lastIdleTick: 0,
    bossKilled: false,
    gamePlayerStats: new Map([[player.id, { kills: 0 }]]),
    getPlayerIdForSession: () => null,
    getClientBySessionId: () => null,
    awardXpToPlayer: () => undefined,
    applyInventoryDelta: async () => undefined,
    logEconomyTransaction: () => undefined,
    markFloorReached: () => undefined,
    msg: { sendTo: () => undefined },
    playerInventories: new Map(),
  };
}

function mapKillCount(counts: Map<string, number>): Record<string, number> {
  const entries: Record<string, number> = {};
  for (const [key, value] of counts.entries()) {
    entries[key] = value;
  }
  return entries;
}

function buildSnapshot(
  player: IdleSimPlayer,
  enemy: IdleSimEnemy,
  seed: number,
  ticks: number,
  rngSample: number
): IdleSimulationSnapshot {
  return {
    seed,
    ticks,
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    playerMana: player.mana,
    playerMaxMana: player.maxMana,
    playerScore: player.score,
    playerActionGauge: player.idleRoom.encounter.playerActionGauge,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.maxHp,
    enemyActionGauge: enemy.actionGauge,
    enemyStunTurnsRemaining: enemy.stunTurnsRemaining,
    encounterCompleted: player.idleRoom.encounter.isCompleted,
    runStatus: player.idleRoom.runStatus,
    killCount: mapKillCount(player.idleRoom.killCount),
    rngSample,
  };
}

function buildReplayFrame(
  player: IdleSimPlayer,
  enemy: IdleSimEnemy,
  tick: number,
  now: number
): IdleSimulationReplayFrame {
  const payload = {
    tick,
    now,
    playerHp: player.hp,
    playerMaxHp: player.maxHp,
    playerMana: player.mana,
    playerMaxMana: player.maxMana,
    playerScore: player.score,
    playerActionGauge: player.idleRoom.encounter.playerActionGauge,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.maxHp,
    enemyActionGauge: enemy.actionGauge,
    enemyStunTurnsRemaining: enemy.stunTurnsRemaining,
    encounterCompleted: player.idleRoom.encounter.isCompleted,
    runStatus: player.idleRoom.runStatus,
    killCount: mapKillCount(player.idleRoom.killCount),
    lastActionLog: player.idleRoom.encounter.lastActionLog || '',
  };

  return {
    ...payload,
    stateHash: hashState(payload as unknown as Record<string, unknown>),
  };
}

function resolveEncounterEnemy(
  player: IdleSimPlayer,
  fallback: IdleSimEnemy
): IdleSimEnemy {
  const encounter = player.idleRoom.encounter;
  const enemy =
    encounter.enemies?.[encounter.targetIndex ?? 0] ?? encounter.enemies?.[0];
  if (!enemy) return fallback;
  return {
    ...fallback,
    hp: Number.isFinite(enemy.hp) ? enemy.hp : fallback.hp,
    maxHp: Number.isFinite(enemy.maxHp) ? enemy.maxHp : fallback.maxHp,
    atk: Number.isFinite(enemy.atk) ? enemy.atk : fallback.atk,
    attackSpeed: Number.isFinite(enemy.attackSpeed)
      ? enemy.attackSpeed
      : fallback.attackSpeed,
    actionGauge: Number.isFinite(enemy.actionGauge)
      ? enemy.actionGauge
      : fallback.actionGauge,
    stunTurnsRemaining: Number.isFinite(enemy.stunTurnsRemaining)
      ? enemy.stunTurnsRemaining
      : fallback.stunTurnsRemaining,
    isDead: Boolean(enemy.isDead),
    classification: enemy.classification ?? fallback.classification,
  };
}

export function runIdleModeReplay(
  options: IdleSimulationReplayOptions
): IdleSimulationReplayResult {
  const seed = Math.floor(options.seed);
  const ticks = Math.max(1, Math.floor(options.ticks ?? 10));
  const tickMs = Math.max(50, Math.floor(options.tickMs ?? 1000));
  const includeInitialFrame = options.includeInitialFrame !== false;

  return withSeed(seed, () => {
    const enemy = createSimEnemy(options.enemyOverrides);
    const player = createSimPlayer(enemy, options.playerOverrides);
    const room = createSimRoom(player);
    room.state.leverageTotal = Math.max(1, options.leverageTotal ?? 1);
    if (options.difficultyTier) {
      room.state.difficultyTier = options.difficultyTier;
    }

    const startNow = 1_000_000;
    const frames: IdleSimulationReplayFrame[] = [];

    if (includeInitialFrame) {
      const initialEnemy = resolveEncounterEnemy(player, enemy);
      frames.push(buildReplayFrame(player, initialEnemy, 0, startNow));
    }

    for (let i = 0; i < ticks; i++) {
      const now = startNow + (i + 1) * tickMs;
      processIdleTick(room as any, now);
      const snapshotEnemy = resolveEncounterEnemy(player, enemy);
      frames.push(buildReplayFrame(player, snapshotEnemy, i + 1, now));
    }

    const finalStateHash = frames.length
      ? frames[frames.length - 1].stateHash
      : hashState({
          seed,
          ticks,
          tickMs,
        } as unknown as Record<string, unknown>);

    return {
      seed,
      ticks,
      tickMs,
      difficultyTier: room.state.difficultyTier,
      leverageTotal: room.state.leverageTotal,
      frames,
      finalStateHash,
    };
  });
}

export function runIdleModeSimulation(
  options: IdleSimulationOptions
): IdleSimulationResult {
  const seed = Math.floor(options.seed);
  const ticks = Math.max(1, Math.floor(options.ticks ?? 5));
  const tickMs = Math.max(50, Math.floor(options.tickMs ?? 1000));

  return withSeed(seed, () => {
    const enemy = createSimEnemy(options.enemyOverrides);
    const player = createSimPlayer(enemy, options.playerOverrides);
    const room = createSimRoom(player);
    room.state.leverageTotal = Math.max(1, options.leverageTotal ?? 1);
    if (options.difficultyTier) {
      room.state.difficultyTier = options.difficultyTier;
    }
    const startNow = 1_000_000;

    for (let i = 0; i < ticks; i++) {
      processIdleTick(room as any, startNow + (i + 1) * tickMs);
    }

    const rngSample = Math.random();
    const snapshot = buildSnapshot(player, enemy, seed, ticks, rngSample);
    return {
      snapshot,
      stateHash: hashState(snapshot as unknown as Record<string, unknown>),
    };
  });
}

export function runIdleModeSimulationToFloor(
  options: IdleSimulationFullOptions
): IdleSimulationFullResult {
  const seed = Math.floor(options.seed);
  const maxTicks = Math.max(1, Math.floor(options.maxTicks ?? 5000));
  const tickMs = Math.max(50, Math.floor(options.tickMs ?? 1000));
  const targetFloor = Math.max(1, Math.floor(options.targetFloor));

  return withSeed(seed, () => {
    const enemy = createSimEnemy(options.enemyOverrides);
    const player = createSimPlayer(enemy, options.playerOverrides);
    const room = createSimRoom(player);
    const autoAscendFloor =
      Math.max(1, Math.floor(options.autoAscendFloor ?? targetFloor));
    player.autoAscendFloor = autoAscendFloor;
    room.state.leverageTotal = Math.max(1, options.leverageTotal ?? 1);
    if (options.difficultyTier) {
      room.state.difficultyTier = options.difficultyTier;
    }

    const startNow = 1_000_000;
    const startTime = Date.now();
    let ticksRun = 0;

    for (let i = 0; i < maxTicks; i++) {
      processIdleTick(room as any, startNow + (i + 1) * tickMs);
      ticksRun += 1;
      if (player.idleRoom.runStatus !== 'active') {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const rngSample = Math.random();
    const snapshotEnemy = resolveEncounterEnemy(player, enemy);
    const snapshot = buildSnapshot(
      player,
      snapshotEnemy,
      seed,
      ticksRun,
      rngSample
    );
    const floor = Math.ceil(player.idleRoom.depth / 10);
    const runStatus = player.idleRoom.runStatus;
    const endedReason =
      runStatus === 'victory'
        ? 'victory'
        : runStatus === 'dead'
          ? 'dead'
          : ticksRun >= maxTicks
            ? 'max_ticks'
            : 'unknown';

    return {
      snapshot,
      stateHash: hashState(snapshot as unknown as Record<string, unknown>),
      ticksRun,
      durationMs,
      runStatus,
      depth: player.idleRoom.depth,
      floor,
      endedReason,
    };
  });
}
