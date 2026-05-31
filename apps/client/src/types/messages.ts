/**
* ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
*
* Client Message Types - Generated from apps/server/src/types/messages.ts
* Keep the client in sync with server→client message contracts.
*
* To make changes, edit apps/server/src/types/messages.ts and run: npm run generate:shared
*/

export interface FogTile {
  x: number;
  y: number;
}

export interface ChunkLayoutEntry {
  x: number;
  y: number;
  chunkName: string;
}

export interface PortalListing {
  kind: string;
  label?: string;
  x: number;
  y: number;
  fallback?: boolean;
}

export interface RoomListing {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  region: string;
  isPrivate: boolean;
  metadata: Record<string, unknown>;
}

export interface ChestOpenedPayload {
  chestId: string;
  playerId: string;
  difficultyTier: string;
  lootSummary: Record<string, unknown>;
  rewardResult: Record<string, unknown>;
  spawnedItemCount: number;
  usdcReward: number;
  ghstReward: number;
}

export interface ServerPerfPayload {
  avgTickMs: number;
  p95TickMs: number;
  cpuPct?: number;
  enemies?: number;
  projectiles?: number;
  activeEnemies?: number;
}

export interface FogStatePayload {
  enabled: boolean;
  tileSize: number;
  mapWidth: number;
  mapHeight: number;
  radiusTiles: number;
  discovered?: FogTile[];
}

export interface StagingCountdownPayload {
  countdownEndsAt: number;
  startedByPlayerId: string | null;
  startedBySessionId?: string;
}

export interface StagingRunStartedPayload {
  runStartedAt: number;
  lateJoinCutoffAt?: number;
  startedByPlayerId: string | null;
  chunkLayout?: ChunkLayoutEntry[];
  difficultyTier: string;
  phase: string;
}

export interface StagingCancelledPayload {
  reason: string;
  refunded?: boolean;
}

export interface PortalsOpenedPayload {
  message?: string;
  portalCount: number;
  floorIndex?: number;
  portals?: PortalListing[];
  debug?: boolean;
}

export interface EnteredNewMapPayload {
  message: string;
  difficultyTier: string | number;
  floorIndex?: number;
}

export interface ChunkLayoutUpdatePayload {
  chunkLayout: ChunkLayoutEntry[] | unknown;
  difficultyTier: string | number;
  phase: string;
}

export interface ChatMessagePayload {
  playerId: string;
  playerName: string;
  text: string;
  timestamp?: number;
}

export interface PlayerEmotePayload {
  playerId: string;
  emoteId: string | number;
  x: number;
  y: number;
}

export interface PlayerDiedPayload {
  playerId: string;
  cause?: string;
}

export interface FogRevealPayload {
  tiles: FogTile[];
}

export type WeaponType = 'melee' | 'ranged' | 'grenades' | 'boss_charge';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface AttackAnimationProfile {
  totalFrames: number;
  impactFrameIndex: number;
  frameRateBase?: number;
}

export interface AttackStartedPayload {
  attackerId: string;
  targetId: string;
  timestamp: number;
  durationMs: number;
  hitOffsetMs: number;
  direction: Direction;
  weaponType: WeaponType;
  weaponAnimProfile?: AttackAnimationProfile;
}

export interface AttackEvadedPayload {
  attackerId: string;
  targetId: string;
  timestamp: number;
  weaponType: WeaponType;
}

export interface DamageAppliedPayload {
  attackerId: string;
  targetId: string;
  timestamp: number;
  damage: number;
  hp: number;
  maxHp: number;
  weaponType: WeaponType;
  isCrit?: boolean;
  killed?: boolean;
}

export interface EnemyDamagedPayload {
  enemyId: string;
  damage: number;
  hp: number;
  maxHp: number;
  attackerId?: string;
  weaponType: WeaponType;
  isCrit?: boolean;
  attackerDir?: Direction;
  interval?: number;
  killed?: boolean;
}

export interface StatusAppliedPayload {
  targetId: string;
  type: 'slow' | 'stun' | 'poison';
  amount?: number;
  durationMs?: number;
  dps?: number;
  tickMs?: number;
}

export interface StatusRemovedPayload {
  targetId: string;
  type: 'slow' | 'stun' | 'poison';
}

export interface PlayerActionAnimationPayload {
  sessionId: string;
  timestamp: number;
  direction: Direction;
  actionType: string;
  animation: string;
  targetId?: string;
  interval: number;
  weaponType?: WeaponType;
  characterId?: string;
}

export interface PlayerActionCompletePayload {
  sessionId: string;
  timestamp: number;
  actionType: string;
}

export interface PlayerHealedPayload {
  playerId: string;
  healAmount: number;
  currentHp: number;
  maxHp: number;
  source?: string;
  originPlayerId?: string;
  wearableSlug?: string;
  potionTier?: number;
}

export interface PlayerManaRestoredPayload {
  playerId: string;
  manaAmount: number;
  currentMana: number;
  maxMana: number;
  source?: string;
}

export interface SpellProcPayload {
  playerId: string;
  spellId: string;
  autocast?: boolean;
  targetId?: string;
}

export interface SpellChainHitPayload {
  playerId: string;
  fromId: string;
  toId: string;
  hopIndex: number;
}

export interface SpellCastResultPayload {
  ok: boolean;
  spellId: string;
  reason?: string;
}

export interface SpellAutocastResultPayload {
  ok: boolean;
  spellId: string;
  enabled: boolean;
  reason?: string;
}

export interface LifeStealHealPayload {
  playerId: string;
  healAmount: number;
  currentHp: number;
  maxHp: number;
  source: string;
}

export interface LifeStealHealEnemyPayload {
  enemyId: string;
  healAmount: number;
  currentHp: number;
  maxHp: number;
  source: string;
}

export interface BossSpecialStatePayload {
  state: 'powerup' | 'charge_start' | 'charge_end' | 'recovery' | 'ended';
  enemyId: string;
  durationMs?: number;
  targetX?: number;
  targetY?: number;
}

export interface BossRoomClearedPayload {
  enemyId: string;
  enemyType: string;
  killerId?: string | null;
  floor?: number;
}

export interface BossLootReadyPayload {
  enemyId: string;
  enemyType?: string;
}

export interface PortalUsedPayload {
  portalType: string;
  portalKind?: string;
  destination?: string;
  usedBy?: string | null;
}

export interface TreeChoppedPayload {
  treeId: string;
  health: number;
  maxHealth: number;
}

export interface TreeCutDownPayload {
  treeId: string;
  woodId: string;
  choppedBy: string;
}

export interface StoneChoppedPayload {
  stoneId: string;
  health: number;
  maxHealth: number;
}

export interface StoneBrokenPayload {
  stoneId: string;
  stoneDropId: string;
  brokenBy: string;
}
export interface InventoryItemMessage {
  id?: string;
  inventoryItemId?: string;
  instanceId?: string;
  itemType?: string;
  type?: string;
  name?: string;
  quantity?: number;
  wearableSlug?: string | null;
  quality?: string | null;
  [key: string]: unknown;
}

export interface InventoryUpdatedPayload {
  inventory: InventoryItemMessage[];
}

export interface InventoryRemovedPayload {
  removed: Array<Record<string, unknown>>;
  inventory: InventoryItemMessage[];
  action?: string;
}

export interface InventoryRemoveErrorPayload {
  code: string;
  message: string;
  detail?: unknown;
}

export interface GrenadeThrownPayload {
  grenadeId: string;
  playerId: string;
  wearableSlug: string;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  timestamp: number;
  travelTimeMs: number;
  fuseMs: number;
  cooldownMs: number;
  blastRadius: number;
}

export interface GrenadeHitEnemyPayload {
  enemyId: string;
  damage: number;
  hp: number;
  maxHp: number;
}

export interface GrenadeHitPlayerPayload {
  playerId: string;
  damage: number;
  hp: number;
  maxHp: number;
}

export interface GrenadeHealPayload {
  playerId: string;
  healAmount: number;
  hp: number;
  maxHp: number;
}

export interface GrenadeExplodedPayload {
  grenadeId: string;
  playerId: string;
  wearableSlug?: string;
  position: { x: number; y: number };
  radius: number;
  timestamp: number;
  effect?: 'damage' | 'healing';
  enemies?: GrenadeHitEnemyPayload[];
  players?: GrenadeHitPlayerPayload[];
  heals?: GrenadeHealPayload[];
}

export interface ProgressionProfilePayload {
  profile: unknown;
  source?: string;
}

export interface ProgressionXpAwardedPayload {
  amount: number;
  totalXp: number;
  level: number;
  levelUps: number;
  unspentPoints: number;
  stats?: unknown;
  allocationHistory?: unknown;
  levelProgress?: unknown;
  source?: unknown;
}

export interface ProgressionLevelLostPayload
  extends ProgressionXpAwardedPayload {
  levelsLost: number;
  cause?: string;
}

export interface KillStreakProfilePayload {
  units: number;
  archetypeId: string;
}

export interface KillStreakUpdatedPayload {
  units: number;
  deltaUnits: number;
  archetypeId: string;
  source?: unknown;
}

export interface KillStreakResetPayload {
  reason?: string;
}

export interface EquipmentUpdatedPayload {
  equipment: unknown;
  overrides?: unknown;
  version: number;
}

export interface StatsUpdatedPayload {
  derivedStats: unknown;
}

export interface KillCountUpdatedPayload {
  kills: number;
}

export interface LeverageStatePayload {
  floor: number;
  room: number;
  total: number;
  floorLocked: boolean;
  roomLocked: boolean;
  staniActive: boolean;
  floorSetAt?: number;
  roomSetAt?: number;
}

export interface LeverageErrorPayload {
  reason: string;
}

export interface VictoryChestOpenedPayload {
  source: 'competition_victory_chest';
  gameId: string;
  competitionDate: string;
  goldBonus: { amount: number };
  reward:
    | {
        type: 'potion';
        potionTier: 2 | 3;
        itemName: 'Greater Healing Potion' | 'Ultra Healing Potion';
        quantity: 1 | 2 | 3;
      }
    | {
        type: 'bonus_progression_run' | 'bonus_competition_run';
        bonusRuns: 1;
        mode: 'progression' | 'competition';
      }
    | {
        type: 'wearable';
        wearableSlug: string;
        wearableName: string;
        svgId: number;
        rarity:
          | 'common'
          | 'uncommon'
          | 'rare'
          | 'legendary'
          | 'mythical'
          | 'godlike';
        quality: 'excellent';
        durabilityScore: number;
      };
}

export interface VictoryChestOpenFailedPayload {
  reason: string;
}

export interface ServerToClientMessages {
  staging_auto_close: { autoCloseAt: number };
  staging_countdown: StagingCountdownPayload;
  staging_run_started: StagingRunStartedPayload;
  staging_cancelled: StagingCancelledPayload;
  late_join_closed: { roomId: string; closedAt: number };
  portals_opened: PortalsOpenedPayload;
  entered_boss_room: { message: string };
  entered_new_map: EnteredNewMapPayload;
  chunk_layout_update: ChunkLayoutUpdatePayload;
  player_emote: PlayerEmotePayload;
  chat_message: ChatMessagePayload;
  chest_opened: ChestOpenedPayload;
  victory_chest_opened: VictoryChestOpenedPayload;
  victory_chest_open_failed: VictoryChestOpenFailedPayload;
  player_died: PlayerDiedPayload;
  server_perf: ServerPerfPayload;
  fog_reveal: FogRevealPayload;
  fog_state: FogStatePayload;
  inventory_updated: InventoryUpdatedPayload;
  inventory_removed: InventoryRemovedPayload;
  inventory_remove_error: InventoryRemoveErrorPayload;
  grenade_thrown: GrenadeThrownPayload;
  grenade_exploded: GrenadeExplodedPayload;
  'progression:profile': ProgressionProfilePayload;
  'progression:xp_awarded': ProgressionXpAwardedPayload;
  'progression:level_lost': ProgressionLevelLostPayload;
  'kill_streak:profile': KillStreakProfilePayload;
  'kill_streak:updated': KillStreakUpdatedPayload;
  'kill_streak:reset': KillStreakResetPayload;
  equipment_updated: EquipmentUpdatedPayload;
  stats_updated: StatsUpdatedPayload;
  kill_count_updated: KillCountUpdatedPayload;
  'leverage:state': LeverageStatePayload;
  'leverage:error': LeverageErrorPayload;
  attack_started: AttackStartedPayload;
  attack_evaded: AttackEvadedPayload;
  damage_applied: DamageAppliedPayload;
  enemy_damaged: EnemyDamagedPayload;
  status_applied: StatusAppliedPayload;
  status_removed: StatusRemovedPayload;
  player_healed: PlayerHealedPayload;
  player_mana_restored: PlayerManaRestoredPayload;
  spell_proc: SpellProcPayload;
  chain_hit: SpellChainHitPayload;
  spell_cast_result: SpellCastResultPayload;
  spell_autocast_result: SpellAutocastResultPayload;
  life_steal_heal: LifeStealHealPayload;
  life_steal_heal_enemy: LifeStealHealEnemyPayload;
  boss_special_state: BossSpecialStatePayload;
  boss_room_cleared: BossRoomClearedPayload;
  boss_loot_ready: BossLootReadyPayload;
  portal_used: PortalUsedPayload;
  player_action_animation: PlayerActionAnimationPayload;
  player_action_complete: PlayerActionCompletePayload;
  tree_chopped: TreeChoppedPayload;
  tree_cut_down: TreeCutDownPayload;
  stone_chopped: StoneChoppedPayload;
  stone_broken: StoneBrokenPayload;
  room_listings: RoomListing[];
  room_listings_updated: RoomListing[];
  room_created: { roomId: string; roomCode?: string };
  join_room: { reservation: unknown };
  room_creation_failed: { error: string };
  join_room_failed: { error: string };
  'daily_quest:status': { active: boolean; thresholdScore?: number | null };
  'daily_quest:leaderboard_update': {
    tier: string;
    rawScore: number;
    finalScore: number;
    timeMultiplier: number;
    gotchiBonusMultiplier: number;
    isRealGotchi: boolean;
    rank: number | null;
    status?: 'settled' | 'unsettled';
    runId?: string;
    token?: string;
    direction?: 'long' | 'short';
    riskLeverage?: number;
    tradeMultiplier?: number;
    estimatedTradeMultiplier?: number;
    estimatedFinalScore?: number;
    entryPriceUsd?: number;
    livePriceUsd?: number;
    priceStale?: boolean;
    closesAtUtc?: string;
    secondsRemaining?: number;
  };
  craft_success: {
    inputTier: number;
    outputTier: number;
    inputConsumed: number;
    outputProduced: number;
    inventory: Record<number, number>;
  };
  craft_error: {
    error: string;
  };
}
