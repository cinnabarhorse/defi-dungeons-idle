export interface PlayerRow {
  id: string;
  wallet_address: string;
  email_address: string | null;
  username: string | null;
  region: string | null;
  last_seen: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_banned: boolean;
  is_authorized: boolean;
  access_granted_at: string | null;
  highest_score?: number;
  // progression fields merged in players
  level?: number;
  total_xp?: number;
  unspent_points?: number;
  rebirth_count?: number;
  unlocked_tiers?: string[];
  unlocked_characters?: string[];
  lick_tongue_count?: number;
  stat_allocations?: unknown;
  derived_stats?: unknown;
  equipped_wearables?: unknown;
  allocation_history?: unknown;
  last_synced_at?: string | null;
  // preferences fields merged in players
  selected_character_id?: string | null;
  selected_difficulty_tier?: string | null;
  gotchi_sprite_url?: string | null;
  avatar_id?: string | null;
  audio_settings?: unknown;
}

export interface AuthSessionRow {
  id: string;
  player_id: string | null;
  wallet_address: string;
  nonce: string;
  issued_at: string;
  expires_at: string | null;
  user_agent: string | null;
  ip: string | null;
  valid: boolean;
}

export interface PlayerRecord {
  id: string;
  walletAddress: string;
  emailAddress: string | null;
  username: string | null;
  region: string | null;
  lastSeen: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isBanned: boolean;
  isAuthorized: boolean;
  accessGrantedAt: string | null;
  highestScore?: number;
  // progression fields
  level?: number;
  totalXp?: number;
  unspentPoints?: number;
  rebirthCount?: number;
  unlockedTiers?: string[];
  unlockedCharacters?: string[];
  lickTongueCount?: number;
  statAllocations?: Record<string, unknown>;
  derivedStats?: Record<string, unknown>;
  equippedWearables?: Record<string, unknown>[];
  allocationHistory?: Record<string, unknown>[];
  lastSyncedAt?: string | null;
  // preferences fields
  selectedCharacterId?: string | null;
  selectedDifficultyTier?: string | null;
  gotchiSpriteUrl?: string | null;
  avatarId?: string | null;
  audioSettings?: {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
    muted: boolean;
  };
}

export interface DailyGotchiOwnershipSnapshotRow {
  snapshot_date: string;
  block_number: string | number;
  captured_at: string;
}

export interface DailyGotchiOwnershipSnapshotRecord {
  snapshotDate: string;
  blockNumber: number;
  capturedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  playerId: string | null;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string | null;
  userAgent: string | null;
  ip: string | null;
  valid: boolean;
}

export interface ApiKeyRow {
  id: string;
  player_id: string;
  name: string | null;
  key_hash: string;
  key_prefix: string;
  created_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  auth_success_count: string | number | bigint;
  room_join_count: string | number | bigint;
  last_used_at: string | null;
  last_used_ip: string | null;
  last_used_user_agent: string | null;
}

export interface ApiKeyRecord {
  id: string;
  playerId: string;
  name: string | null;
  keyHash: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  authSuccessCount: number;
  roomJoinCount: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  lastUsedUserAgent: string | null;
}

export interface PlayerAccessRequestRow {
  id: string;
  player_id: string | null;
  wallet_address: string;
  email: string;
  status: string;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PlayerAccessRequestRecord {
  id: string;
  playerId: string | null;
  walletAddress: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlayerProgressionRow {
  player_id: string;
  level: number;
  total_xp: number;
  unspent_points: number;
  rebirth_count: number;
  unlocked_tiers: string[];
  lick_tongue_count: number;
  stat_allocations: unknown;
  derived_stats: unknown;
  equipped_wearables: unknown;
  updated_at: string | null;
  allocation_history: unknown;
  last_synced_at: string | null;
}

export interface PlayerProgressionRecord {
  playerId: string;
  level: number;
  totalXp: number;
  unspentPoints: number;
  rebirthCount: number;
  unlockedTiers: string[];
  lickTongueCount: number;
  statAllocations: unknown;
  derivedStats: unknown;
  equippedWearables: unknown;
  updatedAt: string | null;
  allocationHistory: unknown;
  lastSyncedAt: string | null;
}

export interface PlayerPreferencesRow {
  player_id: string;
  selected_character_id: string | null;
  selected_difficulty_tier: string | null;
  gotchi_sprite_url: string | null;
  avatar_id: string | null;
  audio_settings: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface PlayerPreferencesRecord {
  playerId: string;
  selectedCharacterId: string | null;
  selectedDifficultyTier: string | null;
  gotchiSpriteUrl: string | null;
  avatarId: string | null;
  audioSettings: {
    masterVolume: number;
    sfxVolume: number;
    musicVolume: number;
    muted: boolean;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PlayerInventoryRow {
  id: string;
  player_id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  item_data: unknown;
  instance_id: string;
  wearable_slug: string | null;
  quality: string;
  quality_score: number | null;
  durability_score: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface PlayerInventoryRecord {
  id: string;
  playerId: string;
  itemType: string;
  itemName: string;
  quantity: number;
  itemData: unknown;
  instanceId: string;
  wearableSlug: string | null;
  quality: string;
  qualityScore: number | null;
  durabilityScore: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DepositRow {
  id: string;
  user_id: string | null;
  chain_id: number | null;
  contract_address: string;
  depositor_address: string;
  token_address: string;
  token_symbol: string;
  amount: string;
  amount_wei: string;
  tx_hash: string | null;
  tx_status: string;
  deposit_id: string | null;
  yield_amount: string | null;
  points_minted: string | null;
  unlock_at: string | null;
  auto_renew: boolean;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  discord_notified_at: string | null;
  withdrawn: boolean | null;
  withdrawal_tx: string | null;
}

export type DepositStatus = 'pending' | 'confirmed' | 'credited' | 'failed';

export interface DepositRecord {
  id: string;
  userId: string | null;
  chainId: number | null;
  contractAddress: string;
  depositorAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  amountWei: string;
  txHash: string | null;
  txStatus: DepositStatus;
  depositId: string | null;
  yieldAmount: string | null;
  pointsMinted: string | null;
  unlockAt: string | null;
  autoRenew: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  discordNotifiedAt: string | null;
  withdrawn: boolean;
  withdrawalTx: string | null;
}

export interface PlayerInventoryEventRow {
  id: string;
  player_id: string;
  item_type: string;
  item_name: string;
  delta: number;
  reason: string;
  game_id: string | null;
  metadata: unknown;
  inventory_item_id: string | null;
  created_at: string | null;
}

export interface PlayerInventoryEventRecord {
  id: string;
  playerId: string;
  itemType: string;
  itemName: string;
  delta: number;
  reason: string;
  gameId: string | null;
  metadata: unknown;
  inventoryItemId: string | null;
  createdAt: string | null;
}

export interface PlayerEquipmentRow {
  id: string;
  player_id: string;
  character_id: string | null;
  slot: string;
  wearable_slug: string;
  source: string;
  inventory_item_id: string | null;
  updated_at: string | null;
}

export interface PlayerEquipmentRecord {
  id: string;
  playerId: string;
  characterId: string | null;
  slot: string;
  wearableSlug: string;
  source: string;
  inventoryItemId: string | null;
  updatedAt: string | null;
}

export interface GameRow {
  id: string;
  room_id: string;
  seed: number | null;
  region: string | null;
  difficulty_tier: string | null;
  status: string;
  is_private: boolean;
  max_players: number | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_enemy_kills: number;
  next_timed_spawn_at: string | null;
  phase: string;
  phase_changed_at: string | null;
  run_started_at: string | null;
  late_join_cutoff_at: string | null;
  auto_close_at: string | null;
  started_by_player_id: string | null;
  floor_reached: number | null;
  metadata: unknown;
}

export interface GameRecord {
  id: string;
  roomId: string;
  seed: number | null;
  region: string | null;
  difficultyTier: string | null;
  status: string;
  isPrivate: boolean;
  maxPlayers: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  totalEnemyKills: number;
  nextTimedSpawnAt: string | null;
  phase: string;
  phaseChangedAt: string | null;
  runStartedAt: string | null;
  lateJoinCutoffAt: string | null;
  autoCloseAt: string | null;
  startedByPlayerId: string | null;
  floorReached: number;
  metadata: Record<string, unknown>;
}

export interface GamePlayerRow {
  id: string;
  game_id: string;
  player_id: string;
  character_id: string | null;
  joined_at: string | null;
  left_at: string | null;
  kills: number;
  deaths: number;
  damage_dealt: number;
  damage_taken: number;
  coins_collected: number;
  usdc_earned_base_units: number;
  xp_gained: number;
  level_before: number | null;
  level_after: number | null;
  metadata: unknown;
  updated_at: string | null;
}

export interface GamePlayerRecord {
  id: string;
  gameId: string;
  playerId: string;
  characterId: string | null;
  joinedAt: string | null;
  leftAt: string | null;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  coinsCollected: number;
  usdcEarnedBaseUnits: number;
  xpGained: number;
  levelBefore: number | null;
  levelAfter: number | null;
  metadata: Record<string, unknown>;
  updatedAt: string | null;
}

export interface EnemyKillRow {
  id: string;
  game_id: string;
  player_id: string | null;
  enemy_type: string;
  enemy_id: string | null;
  attack_type: string | null;
  weapon_type: string | null;
  location: unknown;
  metadata: unknown;
  created_at: string | null;
}

export interface EnemyKillRecord {
  id: string;
  gameId: string;
  playerId: string | null;
  enemyType: string;
  enemyId: string | null;
  attackType: string | null;
  weaponType: string | null;
  location: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface EnemyDropRow {
  id: string;
  game_id: string;
  enemy_kill_id: string | null;
  loot_distribution_id: string | null;
  enemy_type: string;
  drop_table: string | null;
  rolled_weight: string | number | null;
  created_at: string | null;
}

export interface EnemyDropRecord {
  id: string;
  gameId: string;
  enemyKillId: string | null;
  lootDistributionId: string | null;
  enemyType: string;
  dropTable: string | null;
  rolledWeight: number | null;
  createdAt: string | null;
}

export interface ChestOpenRow {
  id: string;
  game_id: string;
  player_id: string;
  chest_entity_id: string | null;
  difficulty_tier: string;
  reward_summary: unknown;
  at: string | null;
}

export interface ChestOpenRecord {
  id: string;
  gameId: string;
  playerId: string;
  chestEntityId: string | null;
  difficultyTier: string;
  rewardSummary: Record<string, unknown>[];
  at: string | null;
}

export interface AavegotchiCharacterRow {
  id: string;
  gotchi_id: string;
  owner_address: string;
  wearable_slugs: string[];
  last_synced_at: string | null;
}

export interface AavegotchiCharacterRecord {
  id: string;
  gotchiId: string;
  ownerAddress: string;
  wearableSlugs: string[];
  lastSyncedAt: string | null;
}

export interface LootDistributionRow {
  id: string;
  game_id: string | null;
  player_id: string | null;
  loot_id: string | null;
  source: string;
  amount: string | number | null;
  probability: string | number | null;
  expected_value: string | number | null;
  entity_id: string | null;
  claimed: boolean;
  claim_tx_hash: string | null;
  claim_at: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface LootDistributionRecord {
  id: string;
  gameId: string | null;
  playerId: string | null;
  lootId: string | null;
  source: string;
  amount: number | null;
  probability: number | null;
  expectedValue: number | null;
  entityId: string | null;
  claimed: boolean;
  claimTxHash: string | null;
  claimAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TopUpRow {
  id: string;
  player_id: string;
  amount_base_units: string | number;
  currency: string;
  status: string;
  provider: string | null;
  provider_ref: string | null;
  chain_id: string | null;
  tx_hash: string | null;
  block_number: string | number | null;
  paid_at: string | null;
  failure_reason: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface TopUpRecord {
  id: string;
  playerId: string;
  amountBaseUnits: number;
  currency: string;
  status: string;
  provider: string | null;
  providerRef: string | null;
  chainId: string | null;
  txHash: string | null;
  blockNumber: number | null;
  paidAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PayoutRow {
  id: string;
  player_id: string;
  amount_base_units: string | number;
  currency: string;
  status: string;
  tx_hash: string | null;
  chain_id: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface PayoutRecord {
  id: string;
  playerId: string;
  amountBaseUnits: number;
  currency: string;
  status: string;
  txHash: string | null;
  chainId: string | null;
  sentAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export type TokenWithdrawalStatus =
  | 'received'
  | 'withdrawal_waiting'
  | 'withdrawal_approved'
  | 'withdrawal_sending'
  | 'withdrawal_pending'
  | 'withdrawal_confirmed'
  | 'withdrawal_failed'
  | 'withdrawal_rejected';

export interface TokenWithdrawalRow {
  id: string;
  player_id: string;
  currency: string;
  amount: string;
  amount_base_units: string | number;
  source: string;
  game_id: string | null;
  loot_distribution_id: string | null;
  economy_transaction_id: string | null;
  status: TokenWithdrawalStatus;
  tx_hash: string | null;
  chain_id: number | string | null;
  token_contract_address: string | null;
  received_at: string | null;
  withdrawal_requested_at: string | null;
  withdrawal_approved_at: string | null;
  withdrawal_sending_at: string | null;
  withdrawal_pending_at: string | null;
  withdrawal_confirmed_at: string | null;
  failure_reason: string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
}

export interface TokenWithdrawalRecord {
  id: string;
  playerId: string;
  currency: string;
  amount: string;
  amountBaseUnits: bigint;
  source: string;
  gameId: string | null;
  lootDistributionId: string | null;
  economyTransactionId: string | null;
  status: TokenWithdrawalStatus;
  txHash: string | null;
  chainId: number | null;
  tokenContractAddress: string | null;
  receivedAt: string | null;
  withdrawalRequestedAt: string | null;
  withdrawalApprovedAt: string | null;
  withdrawalSendingAt: string | null;
  withdrawalPendingAt: string | null;
  withdrawalConfirmedAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WithdrawalSettingsRow {
  id: number;
  is_auto_processing_enabled: boolean;
  is_batch_processing_paused: boolean;
  is_confirmation_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface WithdrawalSettingsRecord {
  id: number;
  isAutoProcessingEnabled: boolean;
  isBatchProcessingPaused: boolean;
  isConfirmationPaused: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EconomyTransactionRow {
  id: string;
  player_id: string;
  currency: string;
  amount: string | number;
  source: string;
  game_id: string | null;
  loot_distribution_id: string | null;
  metadata: unknown;
  created_at: string | null;
}

export interface EconomyTransactionRecord {
  id: string;
  playerId: string;
  currency: string;
  amount: number;
  source: string;
  gameId: string | null;
  lootDistributionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
}

export interface GlobalEconomyCounterRow {
  counter_name: string;
  bucket_date: string;
  amount: string | number;
  created_at: string | null;
  updated_at: string | null;
}

export interface GlobalEconomyCounterRecord {
  counterName: string;
  bucketDate: string;
  amount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RunScoreRow {
  id: string;
  player_id: string;
  game_id: string;
  score: number;
  difficulty_tier: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  kills: number | null;
  xp_earned: number | null;
  valid_for_high_score: boolean | null;
  metadata: unknown;
}

export interface RunScoreRecord {
  id: string;
  playerId: string;
  gameId: string;
  score: number;
  difficultyTier: string | null;
  completedAt: string | null;
  durationMs: number | null;
  kills: number | null;
  xpEarned: number | null;
  validForHighScore: boolean;
  metadata: Record<string, unknown>;
}

// DailyBossHighScoreRow, DailyBossHighScoreRecord, DailyHighStakesStateRow, DailyHighStakesStateRecord
// removed - old daily quest system replaced by competition system

export interface LevelCountsRow {
  debug: number;
  info: number;
  warn: number;
  error: number;
  fatal: number;
}

export interface ServerLogIndexRow {
  game_id: string;
  ts_start: string;
  ts_end: string;
  level_counts: Record<string, unknown>;
  size_bytes: number;
  storage_path: string;
  host: string;
  pm_id: number;
  checksum: string;
  server_id: string;
  created_at: string | null;
}

export interface ServerLogIndexRecord {
  gameId: string;
  tsStart: string;
  tsEnd: string;
  levelCounts: LevelCountsRow;
  sizeBytes: number;
  storagePath: string;
  host: string;
  pmId: number;
  checksum: string;
  serverId: string;
  createdAt: string | null;
}
