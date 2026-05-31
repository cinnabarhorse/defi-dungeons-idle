import { Room, Client } from 'colyseus';
import { readSessionFromRequest, getSessionSecret } from '../lib/auth/session';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../lib/auth/token';
import { parse as parseCookie } from 'cookie';
import {
  extractBearerToken,
  getRequestIpFromHeaders,
  getRequestUserAgentFromHeaders,
  hashApiKey,
  isApiKeyToken,
  isStakedApiKeysEnabled,
  maskApiKeyForLogs,
} from '../lib/auth/api-keys';
import {
  enforceApiKeyJoinStakeEntitlement,
  recordApiKeyRoomJoinUsage,
} from '../lib/auth/api-key-room-access';
import {
  authSessionsRepo,
  apiKeysRepo,
  depositsRepo,
  progressionRepo,
  inventoryRepo,
  inventoryEventsRepo,
  playersRepo,
  gamesRepo,
  gamePlayersRepo,
  enemyKillsRepo,
  enemyDropsRepo,
  lootDistributionsRepo,
  economyRepo,
  equipmentRepo,
  runScoresRepo,
  tokenWithdrawalsRepo,
  progressionRecordToProfile,
  inventoryRecordToItem,
  sanitizeInventoryItems as sanitizeInventoryPayloads,
  getLickTongueCount,
  type InventoryItemPayload,
  type PlayerInventoryRecord,
  runTransaction,
} from '../lib/db';
import {
  formatBaseUnits,
  getWithdrawalTokenConfig,
  parseAmountToBaseUnits,
} from '../lib/withdrawals/token-config';
import {
  executeInventoryRemoval,
  InventoryRemovalError,
  type InventoryRemoveRequest,
  type AppliedInventoryRemoval,
} from '../lib/inventory-removal';
import { GameRoomState, PlayerSchema } from '../schemas';
import { GAME_CONFIG, SCORE_CONFIG, TIMED_SPAWN, LEVERAGE_CONFIG } from '../lib/constants';
import { generateRoomId } from '../lib/utils';
import { getDifficultyTier, isTierEligible } from '../data/difficulty-tiers';
import {
  durabilityLossForRun,
  isBrokenDurability,
  normalizeQualityTier,
} from '../data/wearable-quality';
import { syncPlayerCharacterStats } from '../lib/player-stats';
import { emitGameLog, flushGameLogs } from '../lib/logging';
import { resolvePreferredHandWeaponIndex } from '../lib/hand-weapon-utils';
import {
  ProgressionProfile,
  createDefaultProfile,
  sanitizeProfile,
  applyXp as applyXpToProfile,
  computeProgressionModifiers,
  cloneProfile,
  toSerializableProfile,
  getLevelProgress,
} from '@gotchiverse/progression';
import {
  createKillStreakProfile,
  applyKillStreakIncrement,
  computeKillStreakModifiers,
  resolveArchetypeForCharacter,
  getKillStreakUnitDeltaForClassification,
  type KillStreakProfile,
} from '../lib/progression/killStreak';
import {
  getUnlockedMaxLevel,
  sanitizeRebirthCount,
} from '../lib/progression/rebirth';
import { getEnemyStats } from '../data/enemies';
import type { EmoteInput } from '../types';
import { setupDebugHandlers } from '../lib/debug';
import { clearAuraEffects } from '../lib/systems/AuraSystem';

import {
  getLeverageTotal as getLeverageTotalValue,
  handleRoomLeverageEngagement as handleLeverageEngagement,
} from '../lib/systems/LeverageSystem';
import {
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../data/characters';
import { performResourceHarvest as sysPerformResourceHarvest } from '../lib/systems/ResourceSystem';
import type { GameRoomApi } from '../types/game-room-api';
import {
  ensureServerBroadcaster,
  type ServerBroadcaster,
} from '../lib/messaging';
import {
  buildEquipmentStateForCharacter,
  mapStoredWearablesToAssignments,
  normalizeEquipmentSlotName,
  extractWearableSlugs,
  resolveRuntimeEquipmentSnapshotForJoin,
  type EquipmentOverride,
  type EquipmentBroadcastPayload,
} from '../lib/equipment-service';
import {
  scheduleStagingAutoClose as stagingScheduleStagingAutoClose,
  clearStagingAutoCloseTimer as stagingClearStagingAutoCloseTimer,
  refundEntryFee as stagingRefundEntryFee,
  clearLateJoinTimer as stagingClearLateJoinTimer,
} from './StagingRoom';
import {
  toggleAutoExplore,
  setSpeedRun,
  restartRun,
  handleKite,
  handleCombatAction,
  setTarget,
  handleCastSpell,
  processNextRoom,
  processGrenade,
  processIdleTick,
  logAction,
} from './IdleMode';
import { handleOpenVictoryChest } from './VictoryChestSystem';
import {
  assertGotchiOwnershipForTodaySnapshot,
  verifyGotchiOwnershipForTodaySnapshot,
} from '../lib/gotchi-ownership-snapshot';
import { assertWalletCanPlayTodaySnapshot } from '../lib/gotchi-auth-eligibility';
import {
  computeHealthPotionHeal,
  computeManaPotionRestore,
} from '../lib/potion-utils';

const DEBUG = process.env.DEBUG === '1';
const DEFAULT_UNLOCKED_TIERS = ['normal_1'];
const STAGING_AUTO_CLOSE_MS = 15 * 60 * 1000;

type RoomPhase = 'staging' | 'countdown' | 'in_game' | 'ended';

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function parseWearableArray(raw: unknown): string[] {
  return extractWearableSlugs(raw);
}

interface GamePlayerRuntimeStats {
  playerId: string;
  gamePlayerId: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  coinsCollected: number;
  usdcEarnedBaseUnits: number;
  xpGained: number;
  levelStart: number;
  levelEnd: number;
}

interface PlayerRuntimeScoreState {
  score: number;
  eligible: boolean;
  enteredTreasureAt: number | null;
}

export interface GameRoomOptions {
  region?: string;
  isPrivate?: boolean;
  roomCode?: string;
  maxPlayers?: number;
  difficultyTier?: string;
  // Admin/dev preview options
  seed?: number;
  skipStaging?: boolean;
  preferredChunkName?: string;
  // Admin-only room: require admin wallet session to join
  adminOnly?: boolean;
}

export class GameRoom extends Room<GameRoomState> {
  public msg!: ServerBroadcaster;
  public now: number = 0;
  private chunkLayoutData: Array<{ x: number; y: number; chunkName: string }> =
    [];

  // Server-side inventory tracking (not synchronized to clients to prevent large payloads)
  private playerInventories: Map<string, InventoryItemPayload[]> = new Map();
  private playerProgression: Map<string, ProgressionProfile> = new Map();
  private playerRebirthCounts: Map<string, number> = new Map();
  private playerMaxLevels: Map<string, number> = new Map();
  private killStreakBySession: Map<string, KillStreakProfile> = new Map();
  private sessionPlayerIds: Map<string, string> = new Map();
  private playerEquipmentSnapshots: Map<string, string[]> = new Map();
  private progressionWriteQueues: Map<string, Promise<void>> = new Map();
  private recentEnemyKillIds: Map<
    string,
    { id: string | null; timeout: NodeJS.Timeout | null }
  > = new Map();
  private entityLootDistributions: Map<
    string,
    {
      distributionId: string | null;
      timeout: NodeJS.Timeout | null;
      source?: string;
      metadata?: Record<string, unknown>;
      playerId?: string | null;
    }
  > = new Map();
  private playerDeathsThisRun: Set<string> = new Set();
  private currentGameId: string | null = null;
  private gamePlayerStats: Map<string, GamePlayerRuntimeStats> = new Map();
  private gameStatusFinalized = false;
  private hadAnyPlayers = false;
  private tickInterval!: NodeJS.Timeout;
  private snapshotInterval!: NodeJS.Timeout;
  private timedSpawnInterval: NodeJS.Timeout | null = null;
  private treePositions: Array<{ x: number; y: number }> = [];
  private lastVacuumUpdate: number = 0; // Performance optimization for vacuum system
  private isRoomTransitioning: boolean = false; // pause timed spawns during transitions
  private isPrivateRoom: boolean = false;
  private isAdminOnly: boolean = false;
  private phase: RoomPhase = 'staging';
  private phaseChangedAt: number = 0;
  public runStartedAt: number | null = null;
  private stagingAutoCloseTimer: NodeJS.Timeout | null = null;
  private lateJoinTimer: NodeJS.Timeout | null = null;
  private entryFeeLedger: Map<
    string,
    { amountCents: number; chargedAtIso: string | null; refundable: boolean }
  > = new Map();
  private playerScoreStateByPlayerId: Map<string, PlayerRuntimeScoreState> =
    new Map();
  private pendingScoreDeltas: Map<string, number> = new Map();
  public playersDiedThisRunByPlayerId: Set<string> = new Set();
  private persistedScorePlayerIds: Set<string> = new Set();
  private stagingEnabled: boolean = true;
  private currentFloor = 0;
  private floorReached = 0;
  public bossKilled = false;
  private preferredChunkName: string | undefined;
  public lastIdleTick: number = 0;

  private logGameEvent(
    event: string,
    message: string,
    extra: {
      level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
      playerId?: string | null;
      sessionId?: string | null;
      details?: Record<string, unknown>;
      gameId?: string | null;
    } = {}
  ) {
    const resolvedGameId = extra.gameId ?? this.currentGameId;
    if (!resolvedGameId) {
      return;
    }
    emitGameLog({
      event,
      message,
      level: extra.level,
      gameId: resolvedGameId,
      playerId: extra.playerId ?? undefined,
      sessionId: extra.sessionId ?? undefined,
      details: extra.details,
    });
  }

  private getInventoryKey(item: InventoryItemPayload) {
    const type = String(item.type ?? item.itemType ?? 'unknown').toLowerCase();
    const name = String(item.name ?? item.id ?? 'item').toLowerCase();
    if (type === 'wearable') {
      const instanceKey = String(
        item.inventoryItemId ?? item.instanceId ?? item.id ?? name
      );
      return `${type}::${instanceKey}`;
    }
    const wearable =
      item.wearableId != null ? `::wearable:${item.wearableId}` : '';
    return `${type}::${name}${wearable}`;
  }

  public markFloorReached(floorIndex: number): number {
    const normalized = Math.max(1, Math.floor(Number(floorIndex) || 0));
    if (!(normalized > 0)) {
      return this.floorReached;
    }
    if (normalized > this.floorReached) {
      this.floorReached = normalized;
      this.state.floorReached = normalized;
    }
    return this.floorReached;
  }

  public getCurrentGameId(): string | null {
    return this.currentGameId;
  }

  public getFloorReached(): number {
    return Math.max(0, Number(this.floorReached) || 0);
  }

  public handleFloorAdvanced(nextFloor: number): number {
    const normalized =
      nextFloor > 0 ? Math.max(1, Math.floor(Number(nextFloor) || 0)) : 1;
    this.currentFloor = normalized;
    this.state.currentFloor = normalized;
    this.markFloorReached(normalized);
    return normalized;
  }


  static filterBy(
    options: Partial<GameRoomOptions>,
    rooms: Array<{ metadata?: { roomCode?: string; isPrivate?: boolean } }>
  ) {
    // If joining by room code, filter to match the specific room
    if (options.roomCode) {
      return rooms.filter(
        (room) => room.metadata?.roomCode === options.roomCode
      );
    }

    // Default filter for regular joinOrCreate - exclude private rooms
    return rooms.filter((room) => !room.metadata?.isPrivate);
  }

  // Authenticate websocket using session cookie from the HTTP upgrade request
  async onAuth(client: Client, _options: any, request?: any) {
    try {
      const hdrs: any = (request as any)?.headers || {};
      const hasCookie =
        typeof hdrs.cookie === 'string' && hdrs.cookie.length > 0;

      if (hasCookie) {
        try {
          // Cookie parsing logic would go here if needed
        } catch (e) {
          console.log('WS cookie debug: failed to parse cookies', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        console.log('WS cookie debug: no cookie header present');
      }
    } catch {
      // Ignore errors in cookie parsing
    }

    const requestHeaders = ((request as any)?.headers ||
      {}) as Record<string, unknown>;
    const requestIp = getRequestIpFromHeaders(
      requestHeaders,
      (request as any)?.socket?.remoteAddress ?? null
    );
    const requestUserAgent = getRequestUserAgentFromHeaders(requestHeaders);

    const assignAuth = (
      address: string,
      playerId?: string | null,
      isAuthorized?: boolean,
      username?: string | null,
      options?: { authMethod?: 'session' | 'api_key'; apiKeyId?: string | null }
    ) => {
      const authData = {
        address: address.toLowerCase(),
        playerId: playerId ?? null,
        isAuthorized: Boolean(isAuthorized),
        username: username ?? null,
        authMethod: options?.authMethod ?? 'session',
        apiKeyId: options?.apiKeyId ?? null,
      };
      (client as any).auth = authData;
      return authData;
    };

    const tryResolveSession = async (sessionId: string, address: string) => {
      const record = await authSessionsRepo.getValidAuthSessionById(sessionId);
      if (!record) {
        console.warn('WS auth: session not found or expired', { sessionId });
        return false;
      }
      if (record.walletAddress !== address.toLowerCase()) {
        console.warn('WS auth: wallet mismatch', {
          expected: record.walletAddress,
          provided: address,
        });
        return false;
      }
      if (!record.playerId) {
        console.warn('WS auth: session missing playerId', { sessionId });
        return false;
      }
      const player = await playersRepo.getPlayerById(record.playerId);
      if (!player || !player.isAuthorized) {
        console.warn('WS auth: player not authorized', {
          playerId: record.playerId,
          hasPlayer: Boolean(player),
        });
        return false;
      }
      assignAuth(
        record.walletAddress,
        record.playerId,
        player.isAuthorized,
        player.username ?? null,
        { authMethod: 'session' }
      );
      return true;
    };

    const tryBearerToken = async (bearer: string) => {
      const token = extractBearerToken(bearer);
      if (!token) {
        return false;
      }

      if (isApiKeyToken(token)) {
        if (!isStakedApiKeysEnabled()) {
          return false;
        }
        try {
          const keyHash = hashApiKey(token);
          const apiKey = await apiKeysRepo.getActiveApiKeyByHash(keyHash);
          if (!apiKey) {
            console.warn('WS auth: API key not found or revoked', {
              keyPreview: maskApiKeyForLogs(token),
            });
            return false;
          }
          const player = await playersRepo.getPlayerById(apiKey.playerId);
          if (!player || !player.isAuthorized) {
            console.warn('WS auth: API key player not authorized', {
              apiKeyId: apiKey.id,
              playerId: apiKey.playerId,
            });
            return false;
          }

          assignAuth(
            player.walletAddress,
            player.id,
            player.isAuthorized,
            player.username ?? null,
            { authMethod: 'api_key', apiKeyId: apiKey.id }
          );
          await apiKeysRepo.recordAuthSuccess(apiKey.id, {
            ip: requestIp,
            userAgent: requestUserAgent,
          });
          return true;
        } catch (error) {
          console.warn('WS auth: API key verification failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      }

      try {
        const payload = verifySessionToken(token, getSessionSecret());
        if (!payload?.sessionId || !payload.address) {
          console.warn('WS auth: invalid bearer payload');
          return false;
        }
        return await tryResolveSession(payload.sessionId, payload.address);
      } catch (error) {
        console.warn('WS auth: invalid authorization token', {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    };

    try {
      const hdrs: any = (request as any)?.headers || {};
      const cookieHeader: string | undefined =
        typeof hdrs.cookie === 'string' ? hdrs.cookie : undefined;

      const session = readSessionFromRequest(request as any);
      if (session) {
        // Session found
      } else {
        console.log('WS auth: readSessionFromRequest returned null');
      }
      if (session?.sessionId && session.address) {
        const resolved = await tryResolveSession(
          session.sessionId,
          session.address
        );
        if (resolved) {
          return (client as any).auth;
        }
        console.warn('WS auth: cookie present but session resolution failed');
      }

      // Manual fallback: parse cookie header and verify token directly
      if (!session?.sessionId && cookieHeader) {
        try {
          const cookies = parseCookie(cookieHeader);
          const token = cookies[SESSION_COOKIE_NAME];
          if (token) {
            try {
              const payload = verifySessionToken(token, getSessionSecret());

              if (payload?.sessionId && (payload as any).address) {
                const resolved = await tryResolveSession(
                  (payload as any).sessionId,
                  (payload as any).address
                );
                if (resolved) {
                  return (client as any).auth;
                }
              }
            } catch (e) {
              console.warn('WS auth: manual cookie verify failed', {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          } else {
            console.warn(
              'WS auth: session cookie not found in parsed cookies',
              {
                expectedName: SESSION_COOKIE_NAME,
                cookieKeys: Object.keys(cookies),
              }
            );
          }
        } catch (e) {
          console.warn('WS auth: manual cookie parse failed', {
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const authorization = (request as any)?.headers?.authorization;
      if (authorization && (await tryBearerToken(authorization))) {
        return (client as any).auth;
      }

      const optionsAuth =
        (request as any)?.body?.authorization ||
        (request as any)?.query?.authorization ||
        (_options as any)?.authorization;
      if (optionsAuth && (await tryBearerToken(optionsAuth))) {
        return (client as any).auth;
      }

      // Allow unauthenticated connections; onJoin will enforce access for
      // features (like custom gotchis) that require a signed session.
      console.warn(
        'WS auth: no valid session found; allowing anonymous connection'
      );

      console.log('UNAUTHORIZED CONNECTION');
      console.log('resolved:', session);

      return true;
    } catch (error) {
      console.warn('WS auth: unexpected error during authentication', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  public cancelPlayerAction(
    player: PlayerSchema,
    reason: string = 'Cancelled'
  ): boolean {
    return false;
  }

  async onCreate(options: GameRoomOptions = {}) {
    console.log('GameRoom created with options:', options);

    this.setState(new GameRoomState());
    this.state.attachRoom(this);
    this.msg = ensureServerBroadcaster(this);
    // Start perf sampler broadcast
    this.startPerfSampler();

    // Initialize room state
    this.state.id = generateRoomId(); // Always use generated ID for room ID
    this.isPrivateRoom = Boolean(options.isPrivate);
    // Admin-only rooms are implicitly private and gated by wallet allowlist
    this.isAdminOnly = Boolean(options.adminOnly);
    if (this.isAdminOnly) {
      this.isPrivateRoom = true;
    }
    this.state.roomCode =
      options.roomCode || (this.isPrivateRoom ? this.generateRoomCode() : '');
    this.state.seed = Number.isFinite(options.seed as any)
      ? Math.floor(Number(options.seed))
      : Math.floor(Math.random() * 1000000);
    this.state.region = options.region || 'us-east';
    this.state.difficultyTier = (
      (options.difficultyTier as string) || 'normal_1'
    )
      .toLowerCase()
      .replace(/-/g, '_');
    this.state.startedAt = Date.now();
    // Initialize deterministic tick clock
    this.now = this.state.startedAt;
    this.state.hostSessionId = '';
    this.preferredChunkName =
      typeof options.preferredChunkName === 'string'
        ? options.preferredChunkName
        : undefined;
    // Allow admin/dev to bypass staging and go straight in-game
    // Also honor global STAGING_ENABLED flag from game-config
    const stagingGloballyEnabled = Boolean(
      (GAME_CONFIG as any)?.STAGING_ENABLED
    );
    this.stagingEnabled = stagingGloballyEnabled && !options.skipStaging;
    this.phase = this.stagingEnabled ? 'staging' : 'in_game';
    this.currentFloor = this.stagingEnabled ? 0 : 1;
    this.floorReached = this.currentFloor;
    this.state.currentFloor = this.currentFloor;
    this.state.floorReached = this.floorReached;
    this.state.phase = this.phase;
    this.phaseChangedAt = this.state.startedAt;
    this.runStartedAt = this.stagingEnabled ? null : this.state.startedAt;
    this.state.countdownEndsAt = 0;
    this.state.lateJoinCutoffAt = 0;
    this.state.startedByPlayerId = '';
    this.state.autoCloseAt = 0;

    // Set max clients (clamp to server-enforced maximum)
    const requestedMax = Number(options.maxPlayers);
    this.maxClients = Number.isFinite(requestedMax)
      ? Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYERS, Math.floor(requestedMax)))
      : GAME_CONFIG.MAX_PLAYERS;

    await this.createGameRecord(options).catch((error) => {
      console.error('Failed to create game record', {
        roomId: this.state.id,
        error,
      });
    });

    // Set room metadata for filtering
    this.updateMetadata();

    // Initialize entities array for logging
    let entities: any[] = [];

    this.chunkLayoutData = [];
    entities = [];

    console.log(
      `🏗️ Room onCreate: Total enemies after spawn: ${this.state.enemies.size}`
    );

    // Setup game loop
    this.setupGameLoop();

    // Setup message handlers
    this.setupMessageHandlers();

    // Count different entity types for debugging
    const entityCounts = {
      obstacles: entities.filter((e: any) => e.kind === 'obstacle').length,
      spawnPoints: entities.filter((e: any) => e.kind === 'spawn_point').length,
      treasureChests: entities.filter((e: any) => e.kind === 'treasure_chest')
        .length,
      collectibles: entities.filter((e: any) => e.kind === 'collectible')
        .length,
    };

    const roomType = 'GameRoom';
    console.log(
      `🏗️ ${roomType} ${this.state.id} initialized with ${entities.length} entities:`,
      entityCounts
    );

    // Log all treasure chests for debugging
    entities
      .filter((e: any) => e.kind === 'treasure_chest')
      .forEach((chest: any) => {
        console.log(
          `💰 Treasure chest created: ${chest.id} at (${Math.floor(chest.x)}, ${Math.floor(chest.y)})`
        );
      });
  }

  async onJoin(client: Client, options: any = {}) {
    console.log(`Player ${client.sessionId} joined room ${this.state.id}`);

    // Enforce capacity server-side
    // Enforce admin-only access if configured
    if (this.isAdminOnly) {
      const address: string | undefined = (client as any).auth?.address;
      // Lazy import to avoid express types at runtime; the function is pure
      const { isAdminAddress } = await import('../routes/admin-auth');
      if (!address || !isAdminAddress(address)) {
        throw new Error('Forbidden: admin-only room');
      }
    }
    const current = this.getCurrentClientCount();
    // Note: during onJoin, Colyseus already counts this connecting client
    // in the current clients set. Allow the last seat by only rejecting when
    // the count exceeds maxClients (not equals).
    if (current > this.maxClients) {
      throw new Error('Room is full');
    }

    if (this.stagingEnabled && this.phase === 'in_game') {
      const now = Date.now();
      if (
        this.state.lateJoinCutoffAt > 0 &&
        now > this.state.lateJoinCutoffAt
      ) {
        throw new Error('Run already in progress');
      }
    }

    const requestedDifficultyTierRaw =
      typeof options?.difficultyTier === 'string'
        ? options.difficultyTier
        : null;

    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.name = options.name || `Player_${client.sessionId.slice(0, 6)}`;
    player.avatarId = options.avatarId || 'default';

    const authData = (client as any).auth || {};
    const playerId: string | undefined = authData.playerId;
    const walletAddress: string | undefined = authData.address;
    const isAuthorized: boolean = Boolean(authData.isAuthorized);

    console.log('authData', authData);
    console.log('playerId', playerId);
    console.log('walletAddress', walletAddress);
    console.log('isAuthorized', isAuthorized);

    if (!isAuthorized) {
      throw new Error('Player is not authorized');
    }

    if (!playerId || !walletAddress) {
      throw new Error('Unauthorized: missing player identity');
    }

    const bypassPlayEligibility =
      process.env.NODE_ENV !== 'production' && options?.devMode === true;
    if (!bypassPlayEligibility) {
      await assertWalletCanPlayTodaySnapshot(walletAddress);
    }
    await enforceApiKeyJoinStakeEntitlement(client, playerId);

    const requestedTier = requestedDifficultyTierRaw
      ? getDifficultyTier(requestedDifficultyTierRaw)?.id ?? null
      : null;
    const currentTier = getDifficultyTier(this.state.difficultyTier)?.id ?? 'normal';
    const canApplyRequested =
      Boolean(requestedTier) &&
      this.phase !== 'in_game' &&
      this.phase !== 'ended' &&
      this.state.players.size === 0;
    const targetTier = canApplyRequested && requestedTier ? requestedTier : currentTier;
    const stakedBalance = await depositsRepo.getStakedUnlockBalances(playerId);
    if (!isTierEligible(targetTier, stakedBalance.total)) {
      const tier = getDifficultyTier(targetTier);
      throw new Error(
        `Insufficient USDC/GHO staked for ${tier?.name ?? targetTier}`
      );
    }
    if (canApplyRequested && requestedTier) {
      this.applyRequestedDifficultyTier(requestedTier);
    }

    this.sessionPlayerIds.set(client.sessionId, playerId);
    player.wallet = walletAddress;
    this.hadAnyPlayers = true;

    let targetFloor: number | null = null;
    if (typeof options.autoAscendFloor === 'number' && Number.isFinite(options.autoAscendFloor)) {
      targetFloor = options.autoAscendFloor;
    } else if (typeof options.autoAscendFloor === 'string') {
      const parsed = Number.parseInt(options.autoAscendFloor, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        targetFloor = parsed;
      }
    }
    player.autoAscendFloor = targetFloor !== null && targetFloor >= 1 ? Math.max(1, Math.floor(targetFloor)) : 3;

    // Resolve effective display name with precedence:
    // 1) DB username (provided via client.auth.username from onAuth)
    // 2) ENS name from client (passed via options.name)
    // 3) Random fallback
    try {
      const requestedName =
        typeof options?.name === 'string' ? options.name.trim() : '';
      // Heuristic: ENS names include a dot (e.g., myname.eth)
      const looksLikeEns = requestedName.includes('.');
      const authUsername =
        typeof (client as any).auth?.username === 'string'
          ? (client as any).auth.username.trim()
          : '';
      if (authUsername.length > 0) {
        player.name = authUsername;
      } else if (looksLikeEns && requestedName) {
        player.name = requestedName;
      } else {
        player.name = `Player_${client.sessionId.slice(0, 6)}`;
      }
    } catch {
      // If anything fails, keep existing player.name
    }

    // Support dynamic gotchi selection via gotchiId (string or number). Only one of gotchiId | characterId is expected.
    const requestedGotchiId = options.gotchiId;
    const requestedCharacterId = options.characterId;
    const sessionWallet: string | undefined = (client as any).auth?.address;

    player.usesRealGotchi = false;

    // If both are provided, reject
    if (requestedGotchiId != null && requestedCharacterId) {
      throw new Error('Provide only one of gotchiId or characterId');
    }

    if (requestedGotchiId != null && requestedGotchiId !== '') {
      // Verify session via cookie in onAuth; must have client.auth.address
      if (!sessionWallet) {
        throw new Error('Unauthorized: missing session');
      }

      const gotchiIdStr = String(requestedGotchiId);
      const { slugs, assignments } = await assertGotchiOwnershipForTodaySnapshot(
        sessionWallet,
        gotchiIdStr
      );

      // Register or update a dynamic character entry
      const dynamicId = `gotchi:${gotchiIdStr}`;

      // Cache wearables/assignments for stat derivation (empty arrays allowed)
      setGotchiWearables(gotchiIdStr, slugs || []);
      if (assignments && assignments.length > 0) {
        setGotchiWearableAssignments(gotchiIdStr, assignments);
      }

      player.characterId = dynamicId;
      player.usesRealGotchi = true;
    } else {
      const selectedCharacterId = requestedCharacterId || 'coderdan';
      player.characterId = selectedCharacterId;

      const dynamicMatch = /^gotchi:(\d{1,32})$/i.exec(selectedCharacterId);
      if (dynamicMatch && sessionWallet) {
        const gotchiIdStr = dynamicMatch[1];
        try {
          const { owned, slugs, assignments } =
            await verifyGotchiOwnershipForTodaySnapshot(
              sessionWallet,
              gotchiIdStr
            );
          if (owned) {
            setGotchiWearables(gotchiIdStr, slugs || []);
            if (assignments && assignments.length > 0) {
              setGotchiWearableAssignments(gotchiIdStr, assignments);
            }
            player.usesRealGotchi = true;
          }
        } catch (error) {
          console.warn('[GameRoom] Failed to verify dynamic gotchi ownership', {
            gotchiId: gotchiIdStr,
            wallet: sessionWallet,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    player.isBot = false; // Mark as real player

    const runtimeScoreState = this.ensurePlayerScoreState(playerId);
    player.score = SCORE_CONFIG.enabled ? runtimeScoreState.score : 0;
    player.scoreEligible = SCORE_CONFIG.enabled
      ? runtimeScoreState.eligible
      : true;

    const progressionRecord = await progressionRepo.getProgression(playerId);
    this.setSessionRebirthState(
      client.sessionId,
      progressionRecord?.rebirthCount ?? 0
    );
    const sessionMaxLevel = this.getSessionProgressionMaxLevel(client.sessionId);
    const initialProfile = sanitizeProfile(
      progressionRecordToProfile(progressionRecord),
      sessionMaxLevel
    );
    const equipmentRecords = await equipmentRepo.getEquippedWithInstances(
      playerId,
      player.characterId || null
    );
    const equipmentOverrides: EquipmentOverride[] = [];
    for (const record of equipmentRecords) {
      try {
        equipmentOverrides.push({
          slot: normalizeEquipmentSlotName(record.slot),
          slug: record.wearableSlug,
          inventoryItemId: record.inventoryItemId ?? null,
          quality: normalizeQualityTier(record.quality),
          durabilityScore:
            typeof record.durabilityScore === 'number'
              ? record.durabilityScore
              : null,
        });
      } catch (error) {
        console.warn('Skipping equipment with invalid slot', {
          playerId,
          slot: record.slot,
          wearable: record.wearableSlug,
          error,
        });
      }
    }

    const equipmentState = buildEquipmentStateForCharacter(
      player.characterId || 'coderdan',
      equipmentOverrides
    );
    const prefersFreshEquipmentState =
      player.usesRealGotchi === true || equipmentRecords.length > 0;
    const { runtimeWearables, runtimeDerivedStats } =
      resolveRuntimeEquipmentSnapshotForJoin({
        equipmentState,
        progressionWearables: progressionRecord?.equippedWearables,
        progressionDerivedStats: progressionRecord?.derivedStats,
        preferFreshState: prefersFreshEquipmentState,
      });

    if (!progressionRecord) {
      await progressionRepo.upsertProgression({
        playerId,
        level: initialProfile.level,
        totalXp: initialProfile.totalXp,
        unspentPoints: initialProfile.unspentPoints,
        rebirthCount: this.getSessionRebirthCount(client.sessionId),
        unlockedTiers: DEFAULT_UNLOCKED_TIERS,
        lickTongueCount: 0,
        statAllocations: initialProfile.stats,
        derivedStats: {},
        equippedWearables: [],
        allocationHistory: initialProfile.allocationHistory,
        lastSyncedAt: null,
      });
    }

    const unlockedTiersArray = progressionRecord?.unlockedTiers?.length
      ? progressionRecord.unlockedTiers
      : DEFAULT_UNLOCKED_TIERS;
    player.unlockedTiers = JSON.stringify(unlockedTiersArray);
    player.lickTongueCount = progressionRecord?.lickTongueCount ?? 0;
    player.derivedStats = JSON.stringify(runtimeDerivedStats);
    player.equippedWearables = JSON.stringify(runtimeWearables);

    const snapshotSignature = equipmentState.equipment
      .map((entry) => `${entry.slot}::${entry.slug}`)
      .sort();
    this.playerEquipmentSnapshots.set(playerId, snapshotSignature);

    this.setProgressionProfile(client.sessionId, initialProfile, {
      persist: false,
    });
    const modifiers = computeProgressionModifiers(initialProfile.stats);
    syncPlayerCharacterStats(player, {
      fullHeal: true,
      progressionModifiers: modifiers,
    });

    // Idle-only mode: SharedGame's onJoin handles registration (daily runs, competition, game_players).

    console.log(
      `🎭 Player ${player.name} selected character: ${player.characterId} with weapon type: ${player.attackType}`
    );

    // Set spawn position in center area
    this.setPlayerSpawnPosition(player);

    player.dir = 'down';
    player.anim = 'idle';
    player.lastMoveTime = 0;
    player.lastAttackTime = 0;

    let killStreakProfile: KillStreakProfile | null = null;
    this.state.players.set(client.sessionId, player);
    this.logGameEvent('player.joined', `${player.name} joined room`, {
      playerId,
      sessionId: client.sessionId,
      details: {
        walletAddress,
        characterId: player.characterId,
        difficultyTier: this.state.difficultyTier,
        phase: this.state.phase,
      },
    });

    if (this.phase === 'in_game') {
      killStreakProfile =
        this.ensureKillStreakForPlayer(client.sessionId, player, {
          reset: true,
          sendProfile: false,
        }) ?? null;
      if (killStreakProfile) {
        this.applyProgressionToPlayer(client.sessionId, { fullHeal: true });
      }
    } else {
      this.killStreakBySession.delete(client.sessionId);
      this.applyProgressionToPlayer(client.sessionId, { fullHeal: true });
    }

    // Removed Portal Guardian spawn timer broadcast

    if (
      this.stagingEnabled &&
      this.phase === 'staging' &&
      this.state.players.size === 1
    ) {
      const autoCloseAt = Date.now() + STAGING_AUTO_CLOSE_MS;
      this.state.autoCloseAt = autoCloseAt;
      this.scheduleStagingAutoClose(autoCloseAt);
      this.persistGameMetrics({ syncState: true });
      this.msg.broadcast('staging_auto_close', {
        autoCloseAt,
      });
    }

    if (!this.state.hostSessionId) {
      this.state.hostSessionId = client.sessionId;
    }

    this.updateMetadata();

    const inventoryRecords = await inventoryRepo.getInventory(playerId);
    const inventoryItems = inventoryRecords.map(inventoryRecordToItem);
    const sanitizedInventory = sanitizeInventoryPayloads(inventoryItems);
    player.lickTongueCount = getLickTongueCount(sanitizedInventory);
    this.playerInventories.set(client.sessionId, sanitizedInventory);

    // Send initial game state to client, including existing tree positions
    // This prevents tree duplication when players return to visited rooms
    client.send('room_joined', {
      playerId: client.sessionId,
      roomId: this.state.id,
      roomCode: this.state.roomCode,
      mapSeed: this.state.seed,
      difficultyTier: this.state.difficultyTier, // Send difficulty tier for chunk selection
      currentFloor: this.currentFloor, // Current dungeon floor index
      floorReached: this.floorReached,
      maxPlayers: this.maxClients,
      playerCount: this.getCurrentClientCount(),
      region: this.state.region,
      hostSessionId: this.state.hostSessionId,
      existingTrees: this.treePositions, // Send existing trees for restoration
      chunkLayout: this.chunkLayoutData, // Send chunk layout for proper floor rendering
      progressionProfile: toSerializableProfile(initialProfile),
      inventory: sanitizedInventory,
      phase: this.state.phase,
      phaseChangedAt: this.phaseChangedAt,
      countdownEndsAt: this.state.countdownEndsAt,
      autoCloseAt: this.state.autoCloseAt,
      lateJoinCutoffAt: this.state.lateJoinCutoffAt,
      startedByPlayerId: this.state.startedByPlayerId,
      runStartedAt: this.runStartedAt,
    });

    if (killStreakProfile) {
      this.sendKillStreakProfileToClient(client.sessionId, killStreakProfile);
    } else {
      this.sendKillStreakResetToClient(
        client.sessionId,
        this.phase === 'in_game' ? 'streak_inactive' : 'awaiting_run'
      );
    }

    // Send initial weapon type to client
    client.send('weapon_switched', { attackType: player.attackType });

    void this.persistProgression(client.sessionId, initialProfile);

    const { onJoin: sharedOnJoin } = await import('./SharedGame');
    await sharedOnJoin(this, client, options);
    await recordApiKeyRoomJoinUsage(client);
  }

  async onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left room ${this.state.id}`, {
      consented,
    });
    const playerIdForSession = this.getPlayerIdForSession(client.sessionId);
    const statsSnapshot = this.cloneRuntimeStats(client.sessionId);
    const partySizeBeforeLeave = this.state.players.size;
    if (playerIdForSession && this.stagingEnabled && this.phase !== 'in_game') {
      await this.refundEntryFee(playerIdForSession, 'disconnect');
    }
    await this.settleEquippedWearableDurability(client.sessionId, 'leave');
    await Promise.allSettled([
      this.persistProgression(client.sessionId),
      this.persistInventory(client.sessionId),
      this.flushGamePlayerStats(client.sessionId, { markLeft: true }),
    ]);

    this.killStreakBySession.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.pendingScoreDeltas.delete(client.sessionId);

    // Clean up server-side tracking
    this.playerInventories.delete(client.sessionId);
    this.playerProgression.delete(client.sessionId);
    this.playerRebirthCounts.delete(client.sessionId);
    this.playerMaxLevels.delete(client.sessionId);
    this.playerDeathsThisRun.delete(client.sessionId);
    if (playerIdForSession) {
      this.playerEquipmentSnapshots.delete(playerIdForSession);
    }
    this.sessionPlayerIds.delete(client.sessionId);

    if (this.state.hostSessionId === client.sessionId) {
      const nextHost = Array.from(this.state.players.keys())[0];
      this.state.hostSessionId = nextHost || '';
    }

    if (
      this.stagingEnabled &&
      this.phase !== 'in_game' &&
      this.state.players.size === 0
    ) {
      this.clearStagingAutoCloseTimer();
      this.state.autoCloseAt = 0;
      this.persistGameMetrics({ syncState: true });
      this.msg.broadcast('staging_auto_close', {
        autoCloseAt: 0,
      });
    }

    const playersRemaining = this.state.players.size;
    this.logGameEvent('player.left', 'Player left room', {
      playerId: playerIdForSession,
      sessionId: client.sessionId,
      details: {
        consented,
        partySizeBeforeLeave,
        playersRemaining,
      },
    });
    if (playersRemaining === 0) {
      const status = this.bossKilled ? 'completed' : 'abandoned';
      await this.finalizeGameStatus(status);
    }

    this.persistGameMetrics({ syncState: true });
    this.updateMetadata();

    if (playerIdForSession) {
      await this.persistPlayerRunScore({
        playerId: playerIdForSession,
        sessionId: client.sessionId,
        statsSnapshot,
        partySize: partySizeBeforeLeave,
        reason: 'leave',
      });
    }

  }

  async onDispose() {
    console.log(`GameRoom ${this.state.id} disposed`);
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    if (this.timedSpawnInterval) clearInterval(this.timedSpawnInterval);
    this.clearStagingAutoCloseTimer();
    this.clearLateJoinTimer();
    // Removed Portal Guardian spawn timer
    this.clearLateJoinTimer();

    const sessions = Array.from(this.sessionPlayerIds.keys());
    const sessionSnapshots = sessions.map((sessionId) => ({
      sessionId,
      playerId: this.getPlayerIdForSession(sessionId) ?? '',
      stats: this.cloneRuntimeStats(sessionId),
      partySize: this.state.players.size,
    }));
    await Promise.allSettled(
      sessions.map((sessionId) =>
        this.settleEquippedWearableDurability(sessionId, 'dispose')
      )
    );
    await Promise.allSettled([
      ...sessions.map((sessionId) => this.persistProgression(sessionId)),
      ...sessions.map((sessionId) => this.persistInventory(sessionId)),
      ...sessions.map((sessionId) =>
        this.flushGamePlayerStats(sessionId, { markLeft: true })
      ),
    ]);

    for (const snapshot of sessionSnapshots) {
      if (!snapshot.playerId) {
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.persistPlayerRunScore({
        playerId: snapshot.playerId,
        sessionId: snapshot.sessionId,
        statsSnapshot: snapshot.stats,
        partySize: snapshot.partySize,
        reason: 'dispose',
      });
    }

    this.sessionPlayerIds.clear();
    this.playerProgression.clear();
    this.playerRebirthCounts.clear();
    this.playerMaxLevels.clear();
    this.playerDeathsThisRun.clear();
    this.gamePlayerStats.clear();
    this.playerEquipmentSnapshots.clear();
    this.entryFeeLedger.clear();
    this.playerScoreStateByPlayerId.clear();
    this.pendingScoreDeltas.clear();
    this.playersDiedThisRunByPlayerId.clear();
    this.persistedScorePlayerIds.clear();
    this.persistedScorePlayerIds.clear();
    this.recentEnemyKillIds.forEach((entry) => {
      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }
    });
    this.recentEnemyKillIds.clear();
    this.entityLootDistributions.forEach((entry) => {
      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }
    });
    this.entityLootDistributions.clear();

    // Drop any pending scheduled spell follow-ups
    try {
      const state: any = this.state as any;
      if (Array.isArray(state._scheduledSpellFollowups)) {
        state._scheduledSpellFollowups.length = 0;
      }
    } catch {
      // Ignore errors clearing spell followups
    }

    if (!this.gameStatusFinalized) {
      const status = this.bossKilled
        ? 'completed'
        : this.hadAnyPlayers
          ? 'terminated'
          : 'abandoned';
      await this.finalizeGameStatus(status);
    }
  }

  private setupGameLoop() {
    // Game simulation tick at 30Hz
    this.tickInterval = setInterval(() => {
      const startHr = process.hrtime.bigint();
      this.gameTick();
      const endHr = process.hrtime.bigint();
      const elapsedMs = Number(endHr - startHr) / 1_000_000; // ns → ms
      this.recordTickSample(elapsedMs);
    }, 1000 / GAME_CONFIG.SERVER_TICK_HZ);

    // Snapshot broadcast at 15Hz
    this.snapshotInterval = setInterval(() => {
      this.broadcastSnapshot();
    }, 1000 / GAME_CONFIG.SNAPSHOT_HZ);

    // Timed enemy spawn every interval
    const scheduleNextSpawn = () => {
      if (TIMED_SPAWN.pauseDuringTransition && this.isRoomTransitioning) {
        this.state.nextTimedSpawnAt = 0;
        return;
      }
      if (this.phase !== 'in_game') {
        this.state.nextTimedSpawnAt = 0;
        return;
      }
      const now = Date.now();
      this.state.nextTimedSpawnAt = now + TIMED_SPAWN.intervalMs;
    };
  }

  // --- Performance sampling ---
  private tickSamples: number[] = [];
  private perfInterval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuTimeMs: number = Date.now();

  private recordTickSample(ms: number) {
    const samples = this.tickSamples;
    samples.push(ms);
    if (samples.length > 300) samples.shift(); // keep last ~10s at 30Hz
  }

  private startPerfSampler() {
    if (this.perfInterval) return;
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTimeMs = Date.now();
    this.perfInterval = setInterval(() => {
      // Compute CPU% (user+system) over last interval
      const now = Date.now();
      const elapsedMs = Math.max(1, now - this.lastCpuTimeMs);
      const usage = process.cpuUsage(this.lastCpuUsage || undefined);
      const cpuMs = (usage.user + usage.system) / 1000; // microseconds → ms
      const cpuPct = Math.max(0, Math.min(100, (cpuMs / elapsedMs) * 100));
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTimeMs = now;

      // Compute avg/p95 tick
      const arr = this.tickSamples.slice();
      let avg = 0;
      if (arr.length) {
        avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        const sorted = arr.slice().sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.95);
        const p95 = sorted[Math.min(sorted.length - 1, Math.max(0, idx))] || 0;
        this.msg.broadcast('server_perf', {
          avgTickMs: Number(avg.toFixed(2)),
          p95TickMs: Number(p95.toFixed(2)),
          cpuPct: Number(cpuPct.toFixed(1)),
          enemies: this.state.enemies.size,
          projectiles: this.state.projectiles.size,
          activeEnemies: Number((this as any).lastActiveEnemies || 0),
        });
      } else {
        this.msg.broadcast('server_perf', {
          avgTickMs: 0,
          p95TickMs: 0,
          cpuPct: Number(cpuPct.toFixed(1)),
          enemies: this.state.enemies.size,
          projectiles: this.state.projectiles.size,
          activeEnemies: Number((this as any).lastActiveEnemies || 0),
        });
      }
    }, 1000);
  }

  private setupMessageHandlers() {
    this.onMessage('emote', (client, input: EmoteInput) => {
      this.handleEmote(client, input);
    });

    this.onMessage('chat', (client, message: { text: string }) => {
      this.handleChat(client, message);
    });

    this.onMessage(
      'progression_sync',
      (client, data: { profile?: unknown }) => {
        void this.handleProgressionSync(client, data).catch((error) => {
          console.error('Failed to handle progression sync', {
            sessionId: client.sessionId,
            error,
          });
        });
      }
    );

    //todo: do we still need this? tree positions are now coming server side
    this.onMessage(
      'tree_positions',
      (client, positions: Array<{ x: number; y: number }>) => {
        this.treePositions = positions;
        console.log(`Received ${positions.length} tree positions from client`);
      }
    );

    // Handle ping for connection diagnostics
    this.onMessage('ping', (client, data: { timestamp: number }) => {
      // Immediately respond with pong containing the original timestamp
      client.send('pong', { timestamp: data.timestamp });
    });

    // Idle mode message handlers
    this.onMessage('idle_toggle_auto', (client, data: { enabled: boolean }) => {
      toggleAutoExplore(this, client, data);
    });

    this.onMessage(
      'idle_set_speed_run',
      (client, data: { enabled: boolean; multiplier?: number }) => {
        setSpeedRun(this, client, data);
      }
    );

    this.onMessage('idle_restart_run', (client) => {
      void restartRun(this, client).catch((error) => {
        console.error('Failed to restart idle run', {
          sessionId: client.sessionId,
          error,
        });
      });
    });

    this.onMessage('idle_kite', (client) => {
      handleKite(this, client);
    });

    this.onMessage('idle_grenade', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        processGrenade(this, client.sessionId, player);
      }
    });

    this.onMessage('idle_enter_next_room', (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        void processNextRoom(this, player).catch((error) => {
          console.error('Failed to process next room', {
            sessionId: client.sessionId,
            error,
          });
        });
      }
    });

    this.onMessage('idle_open_victory_chest', (client) => {
      console.log('[VictoryChest] open request received', {
        sessionId: client.sessionId,
      });
      void handleOpenVictoryChest(this, client).catch((error) => {
        console.error('Failed to open victory chest', {
          sessionId: client.sessionId,
          error,
        });
        try {
          this.msg.sendTo(client, 'victory_chest_open_failed', {
            reason:
              error instanceof Error
                ? error.message
                : 'Failed to open victory chest',
          });
        } catch {
          // ignore
        }
      });
    });

    // Allow the client to re-check whether the victory chest is unlocked after staking.
    this.onMessage('idle_refresh_victory_chest', (client) => {
      void (async () => {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;
        if (player.idleRoom.runStatus !== 'victory') return;
        if (!player.dailyQuestActive) return;

        const playerId = this.getPlayerIdForSession(client.sessionId);
        if (!playerId) return;

        try {
          const stakedBalances = await depositsRepo.getStakedUnlockBalances(
            playerId
          );
          const canOpenChest = Number(stakedBalances?.total || 0) >= 1;
          player.idleRoom.victoryChestStatus = canOpenChest
            ? 'available'
            : 'teaser';
        } catch (error) {
          console.error('Failed to refresh victory chest gate', {
            sessionId: client.sessionId,
            playerId,
            error,
          });
        }
      })();
    });

    this.onMessage(
      'idle_combat_action',
      (client, data: { action: string }) => {
        handleCombatAction(this, client, data);
      }
    );

    this.onMessage('idle_set_target', (client, data: { index: number }) => {
      setTarget(this, client, data);
    });

    this.onMessage('idle_cast_spell', (client, data: { spellId: string }) => {
      handleCastSpell(this, client, data);
    });

    // Setup all debug message handlers
    setupDebugHandlers(this);
  }

  private handleEmote(client: Client, input: EmoteInput) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // Broadcast emote to all players
    this.msg.broadcast('player_emote', {
      playerId: client.sessionId,
      emoteId: input.id,
      x: player.x,
      y: player.y,
    });
  }

  private handleChat(client: Client, message: { text: string }) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !message.text || message.text.length > 200) return;

    // Broadcast chat message
    this.msg.broadcast('chat_message', {
      playerId: client.sessionId,
      playerName: player.name,
      text: message.text,
      timestamp: Date.now(),
    });
  }
  private gameTick() {
    // Advance deterministic tick clock by fixed delta per server tick
    const tickMs = Math.round(1000 / GAME_CONFIG.SERVER_TICK_HZ);
    this.now = this.now > 0 ? this.now + tickMs : Date.now();
    const now = this.now;
    this.state.lastTick = now;

    // Process idle mode ticks if any players are in idle mode
    const hasIdlePlayers = Array.from(this.state.players.values()).some(
      (player) =>
        player.idleRoom &&
        player.idleRoom.encounter &&
        player.idleRoom.runStatus === 'active'
    );
    if (hasIdlePlayers) {
      processIdleTick(this, now);
    }
  }

  public isTileDiscovered(_tileX: number, _tileY: number): boolean {
    return true;
  }

  public setEnemyAggro(enemyId: string, playerId: string) {
    const enemy = this.state.enemies.get(enemyId);
    if (!enemy) return;
    enemy.forcedAggro = true as any;
    enemy.aggroTargetPlayerId = playerId as any;
    enemy.targetPlayerId = playerId as any;
  }

  public hasLineOfSight(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): boolean {
    return true;
  }

  public async handleEnemyDeath(
    enemy: any,
    enemyId: string,
    attackType: 'melee' | 'ranged' | 'grenades' = 'melee',
    killerId?: string
  ) {
    // If the boss has already been killed, ignore further kill processing for non-boss enemies
    // and hard-remove the entity to prevent post-boss kill farming.
    try {
      const isBossFlag = Boolean((enemy as any)?.isBossEncounter);
      if (!isBossFlag && this.bossKilled) {
        try {
          if (this.state.enemies.has(enemyId)) {
            this.state.enemies.delete(enemyId);
          }
          // Also drop any pending scheduled removals/followups referencing this enemy
          const s: any = this.state as any;
          if (Array.isArray(s._scheduledEnemyRemovals)) {
            s._scheduledEnemyRemovals = s._scheduledEnemyRemovals.filter(
              (t: any) => t && t.id !== enemyId
            );
          }
          if (Array.isArray(s._scheduledSpellFollowups)) {
            s._scheduledSpellFollowups = s._scheduledSpellFollowups.filter(
              (t: any) => t && t.fromId !== enemyId && t.toId !== enemyId
            );
          }
        } catch {
          // Ignore cleanup failures for boss-locked enemies
        }
        return;
      }
    } catch {
      // Ignore boss-kill guard errors; fallback to normal handling
    }

    // Drop any scheduled spell follow-ups targeting or originating from this enemy
    try {
      const state: any = this.state as any;
      if (Array.isArray(state._scheduledSpellFollowups)) {
        state._scheduledSpellFollowups = state._scheduledSpellFollowups.filter(
          (t: any) =>
            t &&
            t.kind === 'spell_bounce' &&
            t.fromId !== enemyId &&
            t.toId !== enemyId
        );
      }
    } catch {
      // Ignore errors filtering scheduled followups
    }

    // Track boss kills for completion status
    const isBossEncounter = Boolean((enemy as any).isBossEncounter);
    if (isBossEncounter) {
      this.bossKilled = true;
      // Clear boss aura effects immediately
      try {
        clearAuraEffects(enemy as any);
      } catch {
        // Ignore aura cleanup failures
      }
      // Immediately despawn all remaining enemies in the boss room and clear scheduled spawns/projectiles
      try {
        // Remove all non-boss enemies
        if (this.state.enemies && this.state.enemies.size > 0) {
          const toRemove: string[] = [];
          this.state.enemies.forEach((_e, id) => {
            if (id !== enemyId) toRemove.push(id);
          });
          for (const id of toRemove) {
            try {
              const e = this.state.enemies.get(id);
              if (e) clearAuraEffects(e as any);
            } catch {
              // Ignore aura cleanup failures for despawned enemies
            }
            this.state.enemies.delete(id);
          }
        }
        // Clear any scheduled enemy removals/spawn followups and spell followups to prevent post-boss spawns
        const s: any = this.state as any;
        if (Array.isArray(s._scheduledEnemyRemovals)) {
          s._scheduledEnemyRemovals = s._scheduledEnemyRemovals.filter(
            (t: any) => t && t.id === enemyId
          );
        }
        if (Array.isArray(s._scheduledEnemyFollowups)) {
          s._scheduledEnemyFollowups = [];
        }
        if (Array.isArray(s._scheduledSpellFollowups)) {
          s._scheduledSpellFollowups = s._scheduledSpellFollowups.filter(
            (t: any) => t && t.fromId === enemyId && t.toId === enemyId
          );
        }
        // Remove any remaining projectiles to avoid stray kills after boss death
        try {
          this.state.projectiles.clear();
        } catch {
          // Ignore projectile cleanup failures
        }
      } catch {
        // Ignore boss room cleanup failures
      }
    }

    const xpAwarded = this.awardXpForEnemyDefeat(
      enemy,
      enemyId,
      attackType,
      killerId
    );
    if (killerId) {
      this.recordKill(killerId);
    }
    await this.recordEnemyKill(enemy, enemyId, attackType, killerId, xpAwarded);
    this.persistGameMetrics({ totalEnemyKillsDelta: 1 });
  }

  private broadcastSnapshot() {
    this.flushPendingScores();
  }

  private emitMatchEvent(
    eventName: string,
    _payload: Record<string, unknown> = {}
  ) {
    // Handle internal server-side hooks for world transitions
    try {
      if (eventName === 'new_map_entered') {
        this.state.players.forEach((player) => {
          this.setPlayerSpawnPosition(player);
        });
      }
    } catch (error) {
      if (DEBUG) {
        console.warn('emitMatchEvent handler failed', {
          eventName,
          error,
        });
      }
    }
  }

  // Removed Portal Guardian spawn timer helpers and scheduling

  private applyRequestedDifficultyTier(requestedTier: string) {
    const normalized = String(requestedTier || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return false;
    }

    const tier = getDifficultyTier(normalized);
    if (!tier) {
      console.warn('Ignoring unknown difficulty tier request', {
        requestedTier,
      });
      return false;
    }

    if (normalized === this.state.difficultyTier) {
      return false;
    }

    console.log('🎚️ Applying requested difficulty tier', {
      from: this.state.difficultyTier,
      to: normalized,
    });

    this.state.difficultyTier = normalized;

    this.updateMetadata({ difficultyTier: normalized });
    this.persistGameMetrics({ syncState: true });

    return true;
  }

  private scheduleStagingAutoClose(deadlineMs: number) {
    stagingScheduleStagingAutoClose(this as any, deadlineMs);
  }

  public clearStagingAutoCloseTimer() {
    stagingClearStagingAutoCloseTimer(this as any);
  }

  public setPhase(
    nextPhase: RoomPhase,
    options: {
      countdownEndsAt?: number;
      startedByPlayerId?: string | null;
      lateJoinCutoffAt?: number;
      autoCloseAt?: number | null;
      runStartedAt?: number | null;
    } = {}
  ) {
    const previousPhase = this.phase;
    let phaseChanged = false;
    if (previousPhase !== nextPhase) {
      this.phase = nextPhase;
      this.state.phase = nextPhase;
      this.phaseChangedAt = Date.now();
      phaseChanged = true;
      if (phaseChanged && nextPhase === 'in_game') {
        this.resetScoreTrackingForRun();
        this.currentFloor = 1;
        this.floorReached = this.currentFloor;
        this.state.currentFloor = this.currentFloor;
        this.state.floorReached = this.floorReached;
      } else if (
        phaseChanged &&
        SCORE_CONFIG.enabled &&
        nextPhase !== 'in_game'
      ) {
        this.pendingScoreDeltas.clear();
      }
      if (phaseChanged && nextPhase !== 'in_game') {
        // No-op placeholder for non-game phase changes.
      }
    }

    if (options.countdownEndsAt !== undefined) {
      this.state.countdownEndsAt = options.countdownEndsAt;
    } else if (nextPhase !== 'countdown') {
      this.state.countdownEndsAt = 0;
    }

    if (options.startedByPlayerId !== undefined) {
      this.state.startedByPlayerId = options.startedByPlayerId ?? '';
    } else if (phaseChanged && nextPhase !== 'countdown') {
      // keep existing startedByPlayerId unless explicitly cleared
      if (nextPhase !== 'in_game') {
        this.state.startedByPlayerId = '';
      }
    }

    if (options.lateJoinCutoffAt !== undefined) {
      this.state.lateJoinCutoffAt = options.lateJoinCutoffAt;
    } else if (nextPhase !== 'in_game') {
      this.state.lateJoinCutoffAt = 0;
    }

    if (options.autoCloseAt !== undefined) {
      this.state.autoCloseAt = options.autoCloseAt ?? 0;
    }

    if (options.runStartedAt !== undefined) {
      this.runStartedAt = options.runStartedAt;
      this.state.runStartedAt = options.runStartedAt ?? 0;
    } else if (nextPhase !== 'in_game') {
      this.runStartedAt = null;
      this.state.runStartedAt = 0;
    }

    this.persistGameMetrics({ syncState: true });
    this.updateMetadata();

    if (phaseChanged) {
      if (nextPhase === 'in_game') {
        this.state.players.forEach((player, sessionId) => {
          const profile = this.ensureKillStreakForPlayer(sessionId, player, {
            reset: true,
            sendProfile: true,
          });
          if (profile) {
            this.applyProgressionToPlayer(sessionId, { fullHeal: true });
          }
        });
      } else {
        if (previousPhase === 'in_game') {
          this.resetKillStreakForAllPlayers({ reason: 'run_end' });
          // Finalize per-game debug logs into a single shard on run end
          if (this.currentGameId) {
            void flushGameLogs(this.currentGameId, 'manual');
          }
        }
      }
    }
  }

  private async refundEntryFee(
    playerId: string,
    reason: 'timeout' | 'manual' | 'disconnect',
    extraMetadata: Record<string, unknown> = {}
  ): Promise<boolean> {
    return await stagingRefundEntryFee(
      this as any,
      playerId,
      reason,
      extraMetadata
    );
  }

  public clearLateJoinTimer() {
    stagingClearLateJoinTimer(this as any);
  }

  public isOnRoad(x: number, y: number): boolean {
    // Road runs horizontally across the center of the screen
    const roadCenterY = GAME_CONFIG.WORLD_HEIGHT / 2; // Center of world height
    const roadWidth = 60; // 60 pixels wide road

    return y >= roadCenterY - roadWidth / 2 && y <= roadCenterY + roadWidth / 2;
  }

  public setPlayerSpawnPosition(player: PlayerSchema) {
    const fallbackX = GAME_CONFIG.WORLD_WIDTH / 2;
    const fallbackY = GAME_CONFIG.WORLD_HEIGHT / 2;
    player.x = fallbackX;
    player.y = fallbackY;
    player.dir = 'down';
    player.onRoad = false;
  }

  private getHandWeaponEntriesForPlayer(
    player: PlayerSchema
  ): Array<{ slot: 'handLeft' | 'handRight'; slug: string }> {
    const derived = safeParseJson<any>(player.derivedStats, null);
    if (!derived) {
      return [];
    }

    const weaponsSource = Array.isArray(derived.weapons) ? derived.weapons : [];
    const equipmentItems = Array.isArray(derived.equipment?.items)
      ? derived.equipment.items
      : [];

    const entries: Array<{ slot: 'handLeft' | 'handRight'; slug: string }> = [];
    const usedSlots = new Set<'handLeft' | 'handRight'>();

    for (const weapon of weaponsSource) {
      if (
        !weapon ||
        (weapon.weaponType !== 'melee' && weapon.weaponType !== 'ranged')
      ) {
        continue;
      }
      const slug =
        typeof weapon.slug === 'string'
          ? weapon.slug
          : String(weapon.slug ?? '');
      if (!slug) continue;
      const equipment = equipmentItems.find(
        (item: any) => item && item.slug === slug
      );
      const slotRaw = equipment?.slot as 'handLeft' | 'handRight' | undefined;
      if (slotRaw === 'handLeft' || slotRaw === 'handRight') {
        usedSlots.add(slotRaw);
        entries.push({ slot: slotRaw, slug });
      }
    }

    entries.sort((a, b) =>
      a.slot === b.slot ? 0 : a.slot === 'handLeft' ? -1 : 1
    );

    return entries;
  }

  private resolveCurrentHandWeaponIndex(
    player: PlayerSchema,
    weapons: Array<{ slot: 'handLeft' | 'handRight'; slug: string }>
  ): number {
    return resolvePreferredHandWeaponIndex(player.activeWeaponIndex, weapons);
  }

  private selectActiveWeaponByIndex(
    player: PlayerSchema,
    weapons: Array<{ slot: 'handLeft' | 'handRight'; slug: string }>,
    index: number
  ) {
    if (weapons.length === 0) {
      player.activeWeaponIndex = -1;
      syncPlayerCharacterStats(player, {
        fullHeal: false,
        preserveHealthRatio: true,
      });
      return;
    }
    const boundedIndex = Math.max(0, Math.min(index, weapons.length - 1));
    player.activeWeaponIndex = boundedIndex;
    syncPlayerCharacterStats(player, {
      fullHeal: false,
      preserveHealthRatio: true,
    });
  }

  private handleWeaponCycle(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const weapons = this.getHandWeaponEntriesForPlayer(player);
    if (weapons.length === 0) {
      this.selectActiveWeaponByIndex(player, weapons, -1);
      return;
    }

    const currentIndex = this.resolveCurrentHandWeaponIndex(player, weapons);
    const nextIndex =
      weapons.length <= 1 ? currentIndex : (currentIndex + 1) % weapons.length;

    this.selectActiveWeaponByIndex(player, weapons, nextIndex);
    client.send('weapon_switched', {
      attackType: player.attackType,
      activeIndex: player.activeWeaponIndex,
    });
  }

  private handleSetActiveWeapon(client: Client, data: { index?: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const weapons = this.getHandWeaponEntriesForPlayer(player);
    if (weapons.length === 0) {
      this.selectActiveWeaponByIndex(player, weapons, -1);
      return;
    }

    const requested =
      data && typeof data.index === 'number' && Number.isFinite(data.index)
        ? Math.floor(data.index)
        : 0;
    const boundedIndex = Math.max(0, Math.min(requested, weapons.length - 1));
    const currentIndex = this.resolveCurrentHandWeaponIndex(player, weapons);
    if (boundedIndex === currentIndex) {
      return;
    }

    this.selectActiveWeaponByIndex(player, weapons, boundedIndex);
    client.send('weapon_switched', {
      attackType: player.attackType,
      activeIndex: player.activeWeaponIndex,
    });
  }

  private handleHealPlayer(client: Client, data: { healAmount: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.hp <= 0) return;

    // Validate heal amount (prevent cheating). Clamp to our potion cap.
    const maxHealAmount = computeHealthPotionHeal(player.maxHp);
    const healAmount = Math.min(
      Math.max(0, Math.floor(Number(data.healAmount) || 0)),
      maxHealAmount
    );

    // Calculate new HP (don't exceed max HP)
    const oldHp = player.hp;
    player.hp = Math.min(player.hp + healAmount, player.maxHp);
    const actualHealed = player.hp - oldHp;

    console.log(
      `Player ${player.id} healed for ${actualHealed} HP (${oldHp} -> ${player.hp})`
    );

    // Broadcast healing effect to all clients (including the healer)
    this.msg.broadcast('player_healed', {
      playerId: client.sessionId,
      healAmount: actualHealed,
      currentHp: player.hp,
      maxHp: player.maxHp,
    });
  }

  private handleUseManaPotion(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.hp <= 0) return;

    if (player.maxMana <= 0) {
      return;
    }

    if (player.mana >= player.maxMana) {
      return;
    }

    const inventory = this.playerInventories.get(client.sessionId);
    if (!inventory || inventory.length === 0) {
      return;
    }

    const potion = inventory.find((item) => {
      if (!item) return false;
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return false;
      const type = String(item.type ?? item.itemType ?? '').toLowerCase();
      if (type !== 'potion') return false;
      const name = String(item.name ?? item.itemType ?? '').toLowerCase();
      return name.includes('mana');
    });

    if (!potion) {
      return;
    }

    const previousMana = Math.max(0, Number(player.mana) || 0);
    const restoreAmount = computeManaPotionRestore(player.maxMana);
    const nextMana = Math.min(player.maxMana, previousMana + restoreAmount);
    const restored = nextMana - previousMana;
    if (restored <= 0) {
      return;
    }

    player.mana = nextMana;

    void this.applyInventoryDelta(client.sessionId, potion, -1, {
      auditSource: 'potion_manual_mana',
    });

    this.msg.broadcast('player_mana_restored', {
      playerId: client.sessionId,
      manaAmount: restored,
      currentMana: player.mana,
      maxMana: player.maxMana,
    });
  }

  private handleUseHealthPotion(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.hp <= 0) return;

    // Already at full HP
    if (player.hp >= player.maxHp) {
      return;
    }

    const inventory = this.playerInventories.get(client.sessionId);
    if (!inventory || inventory.length === 0) {
      return;
    }

    const potion = inventory.find((item) => {
      if (!item) return false;
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return false;
      const type = String(
        item.type ?? (item as any).itemType ?? ''
      ).toLowerCase();
      if (type !== 'potion') return false;
      const name = String(
        (item as any).name ?? (item as any).itemType ?? ''
      ).toLowerCase();
      return name.includes('health');
    });

    if (!potion) {
      return;
    }

    const healAmount = computeHealthPotionHeal(player.maxHp);
    const previousHp = Math.max(0, player.hp);
    const nextHp = Math.min(player.maxHp, previousHp + Math.floor(healAmount));
    const actualHealed = Math.max(0, nextHp - previousHp);

    if (actualHealed <= 0) {
      return;
    }

    player.hp = nextHp;

    void this.applyInventoryDelta(client.sessionId, potion, -1, {
      auditSource: 'potion_manual_health',
    });

    this.msg.broadcast('player_healed', {
      playerId: client.sessionId,
      healAmount: actualHealed,
      currentHp: player.hp,
      maxHp: player.maxHp,
      source: 'potion',
    });
  }

  public tryAutoHeal(player: PlayerSchema): boolean {
    if (!player || player.isBot || player.hp > 0) {
      return false;
    }

    const sessionId = player.id;
    if (!sessionId) {
      return false;
    }

    const inventory = this.playerInventories.get(sessionId);
    if (!inventory || inventory.length === 0) {
      return false;
    }

    const potion = inventory.find((item) => {
      if (!item) return false;
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return false;
      const type = String(item.type ?? item.itemType ?? '').toLowerCase();
      if (type !== 'potion') return false;
      const name = String(item.name ?? '').toLowerCase();
      return name.includes('health');
    });

    if (!potion) {
      return false;
    }

    const healAmount = computeHealthPotionHeal(player.maxHp);
    const previousHp = Math.max(0, player.hp);
    const nextHp = Math.max(
      1,
      Math.min(player.maxHp, previousHp + Math.floor(healAmount))
    );

    if (nextHp <= previousHp) {
      return false;
    }

    player.hp = nextHp;
    const actualHealed = nextHp - previousHp;

    void this.applyInventoryDelta(sessionId, potion, -1, {
      auditSource: 'potion_auto_heal',
    });

    this.msg.broadcast('player_healed', {
      playerId: sessionId,
      healAmount: actualHealed,
      currentHp: player.hp,
      maxHp: player.maxHp,
      source: 'auto_heal',
    });

    return true;
  }

  public tryAutoRestoreMana(player: PlayerSchema): boolean {
    if (!player || player.isBot) {
      return false;
    }
    if (player.maxMana <= 0) {
      return false;
    }
    if (player.mana > 0) {
      return false;
    }

    const sessionId = player.id;
    if (!sessionId) {
      return false;
    }

    const inventory = this.playerInventories.get(sessionId);
    if (!inventory || inventory.length === 0) {
      return false;
    }

    const potion = inventory.find((item) => {
      if (!item) return false;
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return false;
      const type = String(
        item.type ?? (item as any).itemType ?? ''
      ).toLowerCase();
      if (type !== 'potion') return false;
      const name = String(
        (item as any).name ?? (item as any).itemType ?? ''
      ).toLowerCase();
      return name.includes('mana');
    });

    if (!potion) {
      return false;
    }

    const previousMana = Math.max(0, Number(player.mana) || 0);
    const restoreAmount = computeManaPotionRestore(player.maxMana);
    const nextMana = Math.min(player.maxMana, previousMana + restoreAmount);
    const restored = nextMana - previousMana;
    if (restored <= 0) {
      return false;
    }

    player.mana = nextMana;

    void this.applyInventoryDelta(sessionId, potion, -1, {
      auditSource: 'potion_auto_mana',
    });

    this.msg.broadcast('player_mana_restored', {
      playerId: sessionId,
      manaAmount: restored,
      currentMana: player.mana,
      maxMana: player.maxMana,
      source: 'auto_mana',
    });

    return true;
  }

  public async applyInventoryDelta(
    sessionId: string,
    rawItem: InventoryItemPayload,
    delta: number,
    options: {
      entityId?: string | null;
      distributionId?: string | null;
      auditSource?: string;
      eventReason?: string;
      eventMetadata?: Record<string, unknown>;
    } = {}
  ) {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }

    const sanitizedItem = sanitizeInventoryPayloads([rawItem])[0];
    if (!sanitizedItem) {
      return;
    }

    let distributionId = options.distributionId ?? null;
    let distributionMetadata: Record<string, unknown> | null = null;
    let lootSource = options.entityId ? 'enemy_drop' : 'inventory_delta';
    let mappedPlayerId: string | null = null;

    if (!distributionId && options.entityId) {
      const mapping = this.entityLootDistributions.get(options.entityId);
      if (mapping) {
        distributionId = mapping.distributionId;
        distributionMetadata = mapping.metadata ?? null;
        lootSource = mapping.source ?? lootSource;
        mappedPlayerId = mapping.playerId ?? null;

        if (mapping.timeout) {
          clearTimeout(mapping.timeout);
        }
        this.entityLootDistributions.delete(options.entityId);
      }
    }

    const normalizedType = String(
      sanitizedItem.type ?? sanitizedItem.itemType ?? 'unknown'
    ).toLowerCase();
    const isWearable = normalizedType === 'wearable';

    const resolvedDelta = isWearable
      ? delta > 0
        ? Math.max(1, Math.floor(delta))
        : Math.min(-1, Math.ceil(delta))
      : delta;

    if (!Number.isFinite(resolvedDelta) || resolvedDelta === 0) {
      return;
    }

    const previous = this.playerInventories.get(sessionId) || [];
    const wearableEvents: Array<{
      record: PlayerInventoryRecord;
      delta: number;
      reason: string;
      metadata?: Record<string, unknown>;
    }> = [];

    let next: InventoryItemPayload[];

    if (isWearable) {
      const unitsToProcess = Math.abs(resolvedDelta);
      const targetSlugRaw =
        sanitizedItem.wearableSlug ??
        sanitizedItem.itemName ??
        sanitizedItem.name ??
        '';
      const wearableSlug = String(targetSlugRaw || '').trim();
      if (!wearableSlug) {
        console.warn('Wearable slug missing for inventory delta', {
          sessionId,
          playerId,
          rawItem,
        });
        return;
      }

      const allowedQualities = new Set([
        'broken',
        'budget',
        'average',
        'excellent',
        'flawless',
      ]);
      const resolveQuality = (
        quality: unknown
      ): 'broken' | 'budget' | 'average' | 'excellent' | 'flawless' => {
        const lowered =
          typeof quality === 'string' ? quality.toLowerCase() : '';
        return allowedQualities.has(lowered as any)
          ? (lowered as
              | 'broken'
              | 'budget'
              | 'average'
              | 'excellent'
              | 'flawless')
          : 'average';
      };
      const resolveDurability = (value: unknown) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          return 1000;
        }
        return Math.max(1, Math.min(1000, Math.floor(numeric)));
      };

      if (resolvedDelta > 0) {
        const reason = options.entityId ? 'pickup' : 'server_delta';
        const {
          inventoryItemId: _ignored,
          id: _ignoredId,
          quantity: _ignoredQty,
          ...dataForStorage
        } = sanitizedItem;
        const createdRecords = await inventoryRepo.createInventoryInstances({
          playerId,
          items: Array.from({ length: unitsToProcess }, () => ({
            wearableSlug,
            quality: resolveQuality(sanitizedItem.quality),
            qualityScore:
              typeof sanitizedItem.qualityScore === 'number'
                ? sanitizedItem.qualityScore
                : null,
            durabilityScore: resolveDurability(sanitizedItem.durabilityScore),
            itemData: {
              ...dataForStorage,
              quantity: 1,
            },
          })),
        });
        const createdItems = createdRecords.map(inventoryRecordToItem);
        for (const record of createdRecords) {
          wearableEvents.push({
            record,
            delta: 1,
            reason,
            metadata: {
              entityId: options.entityId ?? null,
              lootDistributionId: distributionId,
            },
          });
        }
        next = sanitizeInventoryPayloads([...previous, ...createdItems]);
      } else {
        let remainingToRemove = unitsToProcess;
        const targetIdRaw =
          sanitizedItem.inventoryItemId ??
          sanitizedItem.id ??
          sanitizedItem.instanceId ??
          null;
        const targetId =
          targetIdRaw && typeof targetIdRaw === 'string' ? targetIdRaw : null;
        const targetSlug = wearableSlug.toLowerCase();
        const updated: InventoryItemPayload[] = [];

        for (const item of previous) {
          const itemType = String(
            item.type ?? item.itemType ?? 'unknown'
          ).toLowerCase();
          if (itemType !== 'wearable') {
            updated.push(item);
            continue;
          }
          if (remainingToRemove <= 0) {
            updated.push(item);
            continue;
          }

          const candidateId =
            (typeof item.inventoryItemId === 'string' &&
              item.inventoryItemId) ||
            (typeof item.id === 'string' && item.id) ||
            (typeof item.instanceId === 'string' && item.instanceId) ||
            null;
          const itemSlug = String(
            item.wearableSlug ?? item.name ?? ''
          ).toLowerCase();

          const matchesId = targetId ? candidateId === targetId : false;
          const matchesSlug =
            !targetId && targetSlug
              ? itemSlug === targetSlug
              : !targetId && !targetSlug;

          if (!matchesId && !matchesSlug) {
            updated.push(item);
            continue;
          }

          if (!candidateId) {
            updated.push(item);
            continue;
          }

          const removedRecord = await inventoryRepo.removeInventoryItemById(
            playerId,
            candidateId
          );
          if (removedRecord) {
            wearableEvents.push({
              record: removedRecord,
              delta: -1,
              reason: 'server_delta',
              metadata: {
                removedVia: 'applyInventoryDelta',
              },
            });
            remainingToRemove -= 1;
            continue;
          }

          updated.push(item);
        }

        if (remainingToRemove > 0) {
          console.warn('Requested wearable removals unavailable', {
            playerId,
            requested: unitsToProcess,
            remaining: remainingToRemove,
            targetId,
            targetSlug,
          });
        }

        next = sanitizeInventoryPayloads(updated);
      }
    } else {
      const working = previous.map((item) => ({ ...item }));
      const key = this.getInventoryKey(sanitizedItem);

      const index = working.findIndex(
        (existing) => this.getInventoryKey(existing) === key
      );
      const currentQuantity =
        index >= 0 ? Number(working[index].quantity) || 0 : 0;
      const updatedQuantity = Math.max(0, currentQuantity + resolvedDelta);

      if (updatedQuantity === 0) {
        if (index >= 0) {
          working.splice(index, 1);
        }
      } else {
        const updatedItem = { ...sanitizedItem, quantity: updatedQuantity };
        if (index >= 0) {
          working[index] = updatedItem;
        } else {
          working.push(updatedItem);
        }
      }

      next = sanitizeInventoryPayloads(working);
    }

    this.playerInventories.set(sessionId, next);

    const player = this.state.players.get(sessionId);
    if (player) {
      player.lickTongueCount = getLickTongueCount(next);
    }

    try {
      await this.logInventoryDiff(playerId, previous, next, {
        eventReason: options.eventReason,
        eventMetadata: options.eventMetadata,
      });
      await this.persistInventory(
        sessionId,
        next,
        previous,
        options.auditSource
      );
    } catch (error) {
      console.error('Failed to apply inventory delta', {
        sessionId,
        playerId,
        error,
      });
    }

    if (wearableEvents.length > 0) {
      await Promise.all(
        wearableEvents.map(async (event) => {
          try {
            await inventoryEventsRepo.logInventoryEvent({
              playerId,
              itemType: 'wearable',
              itemName: event.record.wearableSlug ?? event.record.itemName,
              delta: event.delta,
              reason: event.reason,
              gameId: this.currentGameId ?? null,
              inventoryItemId: event.record.id,
              metadata: {
                quality: event.record.quality,
                durabilityScore: event.record.durabilityScore,
                ...(event.metadata ?? {}),
              },
            });
          } catch (eventError) {
            console.error('Failed to log wearable inventory event', {
              playerId,
              inventoryItemId: event.record.id,
              delta: event.delta,
              error: eventError,
            });
          }
        })
      );
    }

    if (distributionId && resolvedDelta > 0) {
      const claimMetadata: Record<string, unknown> = {
        ...(distributionMetadata ?? {}),
        claimedByPlayerId: playerId,
        claimedBySessionId: sessionId,
        claimedQuantity: resolvedDelta,
        claimSource: lootSource,
      };

      void lootDistributionsRepo
        .markClaimed({
          id: distributionId,
          metadata: claimMetadata,
        })
        .catch((error) => {
          console.error('Failed to mark loot distribution claimed', {
            distributionId,
            playerId,
            sessionId,
            error,
          });
        });
    }

    if (
      resolvedDelta > 0 &&
      normalizedType === 'coin' &&
      options.entityId &&
      Number.isFinite(resolvedDelta) &&
      typeof sanitizedItem.usdcAmount !== 'number'
    ) {
      this.recordCoinsCollected(sessionId, resolvedDelta);
      this.logEconomyTransaction({
        playerId,
        currency: sanitizedItem.name ?? 'COIN',
        amount: resolvedDelta,
        source: lootSource,
        lootDistributionId: distributionId ?? undefined,
        metadata: {
          ...(distributionMetadata ?? {}),
          mappedPlayerId,
          quantity: resolvedDelta,
        },
      });
    }

    if (resolvedDelta > 0 && typeof sanitizedItem.usdcAmount === 'number') {
      const usdcAmount = Number(sanitizedItem.usdcAmount);
      if (Number.isFinite(usdcAmount) && usdcAmount > 0) {
        const usdcConfig = getWithdrawalTokenConfig('USDC');
        const baseUnits = parseAmountToBaseUnits(
          usdcAmount,
          usdcConfig.decimals
        );
        if (baseUnits > 0n) {
          this.recordUsdcEarned(sessionId, Number(baseUnits));
        }
        const amountString = formatBaseUnits(baseUnits, usdcConfig.decimals);
        const sharedMetadata: Record<string, unknown> = {
          ...(distributionMetadata ?? {}),
          mappedPlayerId,
          claimedQuantity: resolvedDelta,
          usdcAmount,
          usdcBaseUnits: Number(baseUnits),
          entityId: options.entityId ?? null,
          tokenDecimals: usdcConfig.decimals,
        };

        let economyTransactionId: string | null = null;
        try {
          const economyTransaction = await economyRepo.logTransaction({
            playerId,
            currency: 'USDC',
            amount: usdcAmount,
            source: lootSource,
            gameId: this.currentGameId,
            lootDistributionId: distributionId ?? undefined,
            metadata: sharedMetadata,
          });
          economyTransactionId = economyTransaction.id;
        } catch (error) {
          console.error('Failed to log USDC economy transaction', {
            playerId,
            lootSource,
            usdcAmount,
            error,
          });
        }

        if (baseUnits > 0n) {
          try {
            await tokenWithdrawalsRepo.createTokenWithdrawal({
              playerId,
              currency: 'USDC',
              amount: amountString,
              amountBaseUnits: baseUnits,
              source: lootSource,
              gameId: this.currentGameId ?? null,
              lootDistributionId: distributionId ?? undefined,
              economyTransactionId: economyTransactionId ?? undefined,
              metadata: sharedMetadata,
              chainId: usdcConfig.defaultChainId,
              tokenContractAddress: usdcConfig.tokenAddress,
            });
          } catch (error) {
            console.error('Failed to create token withdrawal record', {
              playerId,
              lootSource,
              usdcAmount,
              error,
            });
          }
        }
      }
    }

    if (resolvedDelta > 0 && typeof sanitizedItem.ghstAmount === 'number') {
      const ghstAmount = Number(sanitizedItem.ghstAmount);
      if (Number.isFinite(ghstAmount) && ghstAmount > 0) {
        const ghstConfig = getWithdrawalTokenConfig('GHST');
        const baseUnits = parseAmountToBaseUnits(
          ghstAmount,
          ghstConfig.decimals
        );
        const sharedMetadata: Record<string, unknown> = {
          ...(distributionMetadata ?? {}),
          mappedPlayerId,
          claimedQuantity: resolvedDelta,
          ghstAmount,
          ghstBaseUnits: baseUnits.toString(),
          entityId: options.entityId ?? null,
          tokenDecimals: ghstConfig.decimals,
        };

        let economyTransactionId: string | null = null;
        try {
          const economyTransaction = await economyRepo.logTransaction({
            playerId,
            currency: 'GHST',
            amount: ghstAmount,
            source: lootSource,
            gameId: this.currentGameId,
            lootDistributionId: distributionId ?? undefined,
            metadata: sharedMetadata,
          });
          economyTransactionId = economyTransaction.id;
        } catch (error) {
          console.error('Failed to log GHST economy transaction', {
            playerId,
            lootSource,
            ghstAmount,
            error,
          });
        }

        if (baseUnits > 0n) {
          const amountString = formatBaseUnits(baseUnits, ghstConfig.decimals);
          try {
            await tokenWithdrawalsRepo.createTokenWithdrawal({
              playerId,
              currency: 'GHST',
              amount: amountString,
              amountBaseUnits: baseUnits,
              source: lootSource,
              gameId: this.currentGameId ?? null,
              lootDistributionId: distributionId ?? undefined,
              economyTransactionId: economyTransactionId ?? undefined,
              metadata: sharedMetadata,
              chainId: ghstConfig.defaultChainId,
              tokenContractAddress: ghstConfig.tokenAddress,
            });
          } catch (error) {
            console.error('Failed to create GHST token withdrawal record', {
              playerId,
              lootSource,
              ghstAmount,
              error,
            });
          }
        }
      }
    }

    const client = this.getClientBySessionId(sessionId);
    if (client) {
      this.msg.sendTo(client, 'inventory_updated', { inventory: next });
    }
  }

  private buildInventoryRemovalRequests(
    payload: Record<string, unknown> | null | undefined
  ): InventoryRemoveRequest[] {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    if (
      typeof payload.inventoryItemId === 'string' &&
      payload.inventoryItemId.trim().length > 0
    ) {
      return [{ inventoryItemId: payload.inventoryItemId.trim() }];
    }

    const itemType =
      typeof payload.itemType === 'string' ? payload.itemType.trim() : '';
    const itemName =
      typeof payload.itemName === 'string' ? payload.itemName.trim() : '';
    if (itemType && itemName) {
      const quantityRaw = Number((payload as any).quantity);
      const quantity =
        Number.isFinite(quantityRaw) && quantityRaw > 0
          ? Math.floor(quantityRaw)
          : 1;
      return [
        {
          itemType,
          itemName,
          quantity,
        },
      ];
    }

    return [];
  }

  private applyRemovedItemsToSessionInventory(
    sessionId: string,
    removals: AppliedInventoryRemoval[]
  ): InventoryItemPayload[] {
    if (!removals.length) {
      return this.playerInventories.get(sessionId) ?? [];
    }

    const previous = this.playerInventories.get(sessionId) ?? [];
    const working = previous.map((item) => ({ ...item }));
    const toLower = (value: unknown) =>
      typeof value === 'string' ? value.toLowerCase() : '';

    for (const removal of removals) {
      if (removal.type === 'fungible') {
        const targetType = removal.itemType.toLowerCase();
        const targetName = removal.itemName.toLowerCase();
        const index = working.findIndex((entry) => {
          const entryType = toLower(entry.type ?? (entry as any).itemType);
          const entryName = toLower(entry.name ?? (entry as any).itemName);
          return entryType === targetType && entryName === targetName;
        });
        if (index < 0) {
          console.warn('Fungible removal not found in cached inventory', {
            sessionId,
            removal,
          });
          continue;
        }
        const currentQuantity = Number(working[index].quantity) || 0;
        const nextQuantity = Math.max(0, currentQuantity - removal.quantity);
        if (nextQuantity <= 0) {
          working.splice(index, 1);
        } else {
          working[index] = {
            ...working[index],
            quantity: nextQuantity,
          };
        }
      } else {
        const index = working.findIndex((entry) => {
          const candidateId =
            (typeof entry.inventoryItemId === 'string' &&
              entry.inventoryItemId) ||
            (typeof entry.id === 'string' && entry.id) ||
            (typeof entry.instanceId === 'string' && entry.instanceId) ||
            null;
          return candidateId === removal.inventoryItemId;
        });
        if (index < 0) {
          console.warn('Wearable removal not found in cached inventory', {
            sessionId,
            removal,
          });
          continue;
        }
        working.splice(index, 1);
      }
    }

    const sanitized = sanitizeInventoryPayloads(working);
    this.playerInventories.set(sessionId, sanitized);
    return sanitized;
  }

  private async handleDestroyItem(
    client: Client,
    payload: Record<string, unknown>
  ) {
    const sessionId = client.sessionId;
    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      this.msg.sendTo(client, 'inventory_remove_error', {
        code: 'UNAUTHORIZED',
        message: 'Player not linked to session',
      });
      return;
    }

    const requests = this.buildInventoryRemovalRequests(payload);
    if (requests.length === 0) {
      this.msg.sendTo(client, 'inventory_remove_error', {
        code: 'INVENTORY_INVALID_REQUEST',
        message: 'Invalid destroy request',
      });
      return;
    }

    let removals: AppliedInventoryRemoval[];
    try {
      removals = await executeInventoryRemoval(playerId, requests, {
        reason: 'destroy_user',
        metadata: {
          source: 'game_room',
          sessionId,
          roomId: this.state.id,
        },
      });
    } catch (error) {
      if (error instanceof InventoryRemovalError) {
        this.msg.sendTo(client, 'inventory_remove_error', {
          code: error.code,
          message: error.message,
          detail: error.detail ?? null,
        });
        return;
      }
      console.error('Failed to destroy inventory item', {
        sessionId,
        playerId,
        payload,
        error,
      });
      this.msg.sendTo(client, 'inventory_remove_error', {
        code: 'UNKNOWN',
        message: 'Failed to destroy item',
      });
      return;
    }

    const updatedInventory = this.applyRemovedItemsToSessionInventory(
      sessionId,
      removals
    );

    const player = this.state.players.get(sessionId);
    if (player) {
      player.lickTongueCount = getLickTongueCount(updatedInventory);
    }

    this.msg.sendTo(client, 'inventory_removed', {
      removed: removals as Array<Record<string, unknown>>,
      inventory: updatedInventory,
      action: 'destroy',
    });
  }

  private async handleDropItem(
    client: Client,
    _payload: Record<string, unknown>
  ) {
    this.msg.sendTo(client, 'inventory_remove_error', {
      code: 'NOT_IMPLEMENTED',
      message: 'Drop action not yet implemented',
    });
  }

  private async handleProgressionSync(
    client: Client,
    data: { profile?: unknown }
  ) {
    const maxLevel = this.getSessionProgressionMaxLevel(client.sessionId);
    const sanitized = sanitizeProfile(
      (data?.profile as ProgressionProfile) || undefined,
      maxLevel
    );
    sanitized.lastSyncedAt = Date.now();
    this.setProgressionProfile(client.sessionId, sanitized, { persist: false });
    this.recordLevelSnapshot(client.sessionId, sanitized.level);
    this.applyProgressionToPlayer(client.sessionId, { fullHeal: true });
    await this.persistProgression(client.sessionId, sanitized);

    this.msg.sendTo(client, 'progression:profile', {
      profile: toSerializableProfile(sanitized),
      source: 'server_ack',
    });
  }

  private getProgressionProfile(sessionId: string): ProgressionProfile {
    const stored = this.playerProgression.get(sessionId);
    return stored ? cloneProfile(stored) : createDefaultProfile();
  }

  public setSessionRebirthState(sessionId: string, rebirthCountInput: unknown) {
    const rebirthCount = sanitizeRebirthCount(rebirthCountInput);
    const maxLevel = getUnlockedMaxLevel(rebirthCount);
    this.playerRebirthCounts.set(sessionId, rebirthCount);
    this.playerMaxLevels.set(sessionId, maxLevel);
  }

  public getSessionRebirthCount(sessionId: string): number {
    const stored = this.playerRebirthCounts.get(sessionId);
    if (stored !== undefined) {
      return stored;
    }
    return 0;
  }

  public getSessionProgressionMaxLevel(sessionId: string): number {
    const stored = this.playerMaxLevels.get(sessionId);
    if (stored !== undefined) {
      return stored;
    }
    const inferred = getUnlockedMaxLevel(this.getSessionRebirthCount(sessionId));
    this.playerMaxLevels.set(sessionId, inferred);
    return inferred;
  }

  private setProgressionProfile(
    sessionId: string,
    profile: ProgressionProfile,
    options: { persist?: boolean } = {}
  ) {
    this.playerProgression.set(sessionId, cloneProfile(profile));
    if (options.persist) {
      void this.persistProgression(sessionId, profile);
    }
  }

  private applyProgressionToPlayer(
    sessionId: string,
    options: { fullHeal?: boolean } = {}
  ) {
    const player = this.state.players.get(sessionId);
    if (!player) return;

    const profile = this.getProgressionProfile(sessionId);
    const modifiers = computeProgressionModifiers(profile.stats);
    const killStreakProfile = this.killStreakBySession.get(sessionId);
    const killStreakModifiers = killStreakProfile
      ? computeKillStreakModifiers(
          killStreakProfile.archetypeId,
          killStreakProfile.units
        )
      : undefined;
    syncPlayerCharacterStats(player, {
      fullHeal: options.fullHeal,
      preserveHealthRatio: !options.fullHeal,
      progressionModifiers: modifiers,
      killStreakModifiers,
    });
  }

  private ensureKillStreakForPlayer(
    sessionId: string,
    player: PlayerSchema,
    options: { reset?: boolean; sendProfile?: boolean } = {}
  ): KillStreakProfile | null {
    if (this.phase !== 'in_game') {
      if (options.reset) {
        this.killStreakBySession.delete(sessionId);
      }
      return null;
    }

    const archetypeId = resolveArchetypeForCharacter(player.characterId);
    const existing = this.killStreakBySession.get(sessionId);
    const shouldReset =
      options.reset || !existing || existing.archetypeId !== archetypeId;

    const profile = shouldReset
      ? createKillStreakProfile(archetypeId)
      : existing!;

    if (shouldReset) {
      this.killStreakBySession.set(sessionId, profile);
    }

    if (options.sendProfile !== false) {
      this.sendKillStreakProfileToClient(sessionId, profile);
    }

    return profile;
  }

  private sendKillStreakProfileToClient(
    sessionId: string,
    profileInput?: KillStreakProfile
  ) {
    const client = this.getClientBySessionId(sessionId);
    if (!client) return;
    const profile = profileInput ?? this.killStreakBySession.get(sessionId);
    if (!profile) return;
    this.msg.sendTo(client, 'kill_streak:profile', {
      units: profile.units,
      archetypeId: profile.archetypeId,
    });
  }

  private sendKillStreakResetToClient(sessionId: string, reason?: string) {
    const client = this.getClientBySessionId(sessionId);
    if (!client) return;
    this.msg.sendTo(client, 'kill_streak:reset', {
      reason: reason ?? 'reset',
    });
  }

  public equipmentCanModify(playerId: string) {
    const sessions = this.getSessionIdsForPlayer(playerId);
    if (sessions.length === 0) {
      return { allowed: true, phase: this.phase };
    }

    if (this.phase === 'in_game') {
      return {
        allowed: false,
        phase: this.phase,
        reason: 'Equipment changes are disabled during an active run',
      };
    }

    return { allowed: true, phase: this.phase };
  }

  public equipmentBroadcastUpdate(payload: EquipmentBroadcastPayload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const sessions = this.getSessionIdsForPlayer(payload.playerId);
    if (sessions.length === 0) {
      return;
    }

    const signature = payload.equipment
      .map(
        (entry) =>
          `${entry.slot}::${entry.slug}::${Number(entry.durabilityScore ?? -1)}`
      )
      .sort();
    this.playerEquipmentSnapshots.set(payload.playerId, signature);

    for (const sessionId of sessions) {
      const player = this.state.players.get(sessionId);
      if (!player) {
        continue;
      }

      player.equippedWearables = JSON.stringify(payload.equippedWearables);
      player.derivedStats = JSON.stringify(payload.derivedStats);

      this.applyProgressionToPlayer(sessionId, { fullHeal: false });

      const client = this.getClientBySessionId(sessionId);
      if (client) {
        this.msg.sendTo(client, 'equipment_updated', {
          equipment: payload.equipment,
          overrides: payload.overrides,
          version: payload.version,
        });
        this.msg.sendTo(client, 'stats_updated', {
          derivedStats: payload.derivedStats,
        });
      }
    }
  }

  private resetKillStreakForSession(
    sessionId: string,
    options: { reason?: string; reinitialize?: boolean } = {}
  ): KillStreakProfile | null {
    const player = this.state.players.get(sessionId);
    if (options.reason) {
      this.sendKillStreakResetToClient(sessionId, options.reason);
    } else {
      this.sendKillStreakResetToClient(sessionId);
    }
    this.killStreakBySession.delete(sessionId);
    if (player) {
      this.applyProgressionToPlayer(sessionId, { fullHeal: false });
    }

    const shouldReinitialize =
      options.reinitialize === true && this.phase === 'in_game' && player;

    if (shouldReinitialize && player) {
      return this.ensureKillStreakForPlayer(sessionId, player, {
        reset: true,
        sendProfile: true,
      });
    }

    return null;
  }

  private resetKillStreakForAllPlayers(options: { reason?: string } = {}) {
    const reason = options.reason;
    this.state.players.forEach((_player, sessionId) => {
      this.killStreakBySession.delete(sessionId);
      this.sendKillStreakResetToClient(sessionId, reason);
      this.applyProgressionToPlayer(sessionId, { fullHeal: false });
    });
    this.killStreakBySession.clear();
  }

  private awardKillStreakUnitsToPlayer(
    sessionId: string,
    unitDelta: number,
    context: {
      enemyId?: string;
      enemyType?: string;
      attackType?: string;
      classification?: string;
    }
  ) {
    if (unitDelta <= 0) return;
    if (this.phase !== 'in_game') return;
    const player = this.state.players.get(sessionId);
    if (!player) return;

    const profile =
      this.ensureKillStreakForPlayer(sessionId, player, {
        sendProfile: false,
      }) ?? undefined;
    if (!profile) return;

    const { profile: nextProfile, deltaUnits } = applyKillStreakIncrement(
      profile,
      unitDelta
    );
    if (deltaUnits === 0) {
      this.killStreakBySession.set(sessionId, nextProfile);
      return;
    }

    this.killStreakBySession.set(sessionId, nextProfile);
    this.applyProgressionToPlayer(sessionId, { fullHeal: false });

    const client = this.getClientBySessionId(sessionId);
    if (client) {
      this.msg.sendTo(client, 'kill_streak:updated', {
        units: nextProfile.units,
        deltaUnits,
        archetypeId: nextProfile.archetypeId,
        source: {
          ...context,
          type: 'kill',
        },
      });
    }
  }

  public getClientBySessionId(sessionId: string): Client | undefined {
    return this.clients.find((client) => client.sessionId === sessionId);
  }

  // (reverted) no coalescing helpers

  public getPlayerIdForSession(sessionId: string) {
    return this.sessionPlayerIds.get(sessionId);
  }

  private getSessionIdsForPlayer(playerId: string): string[] {
    const sessions: string[] = [];
    for (const [sessionId, mappedPlayerId] of this.sessionPlayerIds.entries()) {
      if (mappedPlayerId === playerId) {
        sessions.push(sessionId);
      }
    }
    return sessions;
  }

  private getUnlockedTiersFromPlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) {
      return DEFAULT_UNLOCKED_TIERS;
    }
    const parsed = safeParseJson<string[]>(
      player.unlockedTiers,
      DEFAULT_UNLOCKED_TIERS
    );
    return parsed.length > 0 ? parsed : DEFAULT_UNLOCKED_TIERS;
  }

  async withProgressionWriteLock<T>(
    playerId: string,
    task: () => Promise<T>
  ): Promise<T> {
    const previous =
      this.progressionWriteQueues.get(playerId) ?? Promise.resolve();
    const runPromise = previous.then(
      () => task(),
      () => task()
    );
    const finalPromise = runPromise.then(
      () => undefined,
      () => undefined
    );
    this.progressionWriteQueues.set(playerId, finalPromise);
    try {
      return await runPromise;
    } finally {
      if (this.progressionWriteQueues.get(playerId) === finalPromise) {
        this.progressionWriteQueues.delete(playerId);
      }
    }
  }

  private async persistProgression(
    sessionId: string,
    profileInput?: ProgressionProfile
  ) {
    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }

    const profile = profileInput ?? this.playerProgression.get(sessionId);
    if (!profile) {
      return;
    }

    const player = this.state.players.get(sessionId);
    const lickTongueCount = player?.lickTongueCount ?? 0;
    const unlockedTiers = this.getUnlockedTiersFromPlayer(sessionId);
    if (player) {
      player.unlockedTiers = JSON.stringify(unlockedTiers);
    }
    const derivedStats = player
      ? safeParseJson<Record<string, unknown>>(player.derivedStats, {})
      : {};
    const equippedWearables = player
      ? safeParseJson<unknown[]>(player.equippedWearables, [])
      : [];
    const equipmentAssignments = player
      ? mapStoredWearablesToAssignments(player.equippedWearables, [])
      : [];
    const equipmentSignature = equipmentAssignments
      .map(
        (item) =>
          `${item.slot}::${item.slug}::${Number(item.durabilityScore ?? -1)}`
      )
      .sort();
    const previousSignature = this.playerEquipmentSnapshots.get(playerId);
    const equipmentChanged =
      !previousSignature ||
      previousSignature.length !== equipmentSignature.length ||
      previousSignature.some(
        (value, index) => value !== equipmentSignature[index]
      );

    const lastSyncedAtIso =
      typeof profile.lastSyncedAt === 'number'
        ? new Date(profile.lastSyncedAt).toISOString()
        : null;

    await this.withProgressionWriteLock(playerId, async () => {
      try {
        // Do not update unlocked_tiers from the room to avoid overwriting
        // server-authoritative difficulty unlocks. Persist only other fields.
        await progressionRepo.updateProgression(playerId, {
          level: profile.level,
          totalXp: profile.totalXp,
          unspentPoints: profile.unspentPoints,
          // unlockedTiers intentionally omitted
          lickTongueCount,
          statAllocations: profile.stats,
          derivedStats,
          equippedWearables,
          allocationHistory: profile.allocationHistory,
          lastSyncedAt: lastSyncedAtIso,
        });

        if (equipmentChanged) {
          this.playerEquipmentSnapshots.set(playerId, equipmentSignature);
        }
      } catch (error) {
        console.error('Failed to persist progression', {
          playerId,
          sessionId,
          error,
        });
      }
    });
  }

  private async persistInventory(
    sessionId: string,
    itemsInput?: InventoryItemPayload[],
    previousItems?: InventoryItemPayload[],
    auditSource?: string
  ) {
    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }

    const items = itemsInput ?? this.playerInventories.get(sessionId) ?? [];
    const normalizedNext = sanitizeInventoryPayloads(items);
    const normalizedPrevious = sanitizeInventoryPayloads(
      previousItems ?? this.playerInventories.get(sessionId) ?? []
    );

    this.playerInventories.set(sessionId, normalizedNext);

    const buildFungibleMap = (list: InventoryItemPayload[]) => {
      const map = new Map<
        string,
        {
          itemType: string;
          itemName: string;
          quantity: number;
          itemData: InventoryItemPayload;
        }
      >();
      for (const item of list) {
        const type = String(item.type ?? item.itemType ?? 'unknown').toLowerCase();
        if (type === 'wearable') {
          continue;
        }
        const name = String(item.name ?? item.id ?? 'item');
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) {
          continue;
        }
        const key = `${type}::${name}`;
        map.set(key, {
          itemType: String(item.itemType ?? item.type ?? type),
          itemName: name,
          quantity,
          itemData: item,
        });
      }
      return map;
    };

    const buildFungibleItemData = (
      item: InventoryItemPayload,
      quantity: number
    ) => ({
      ...item,
      quantity,
    });

    const previousMap = buildFungibleMap(normalizedPrevious);
    const nextMap = buildFungibleMap(normalizedNext);
    const keys = new Set([...previousMap.keys(), ...nextMap.keys()]);

    const additions: Array<{
      itemType: string;
      itemName: string;
      quantity: number;
      itemData: InventoryItemPayload;
    }> = [];
    const deletions: Array<{
      itemType: string;
      itemName: string;
      quantity: number;
    }> = [];

    for (const key of keys) {
      const prev = previousMap.get(key);
      const next = nextMap.get(key);
      const prevQty = prev?.quantity ?? 0;
      const nextQty = next?.quantity ?? 0;
      if (nextQty > prevQty && next) {
        additions.push({
          itemType: next.itemType,
          itemName: next.itemName,
          quantity: nextQty - prevQty,
          itemData: next.itemData,
        });
      } else if (prevQty > nextQty && prev) {
        deletions.push({
          itemType: prev.itemType,
          itemName: prev.itemName,
          quantity: prevQty - nextQty,
        });
      }
    }

    if (additions.length === 0 && deletions.length === 0) {
      return;
    }

    try {
      await runTransaction(async (client) => {
        for (const deletion of deletions) {
          await inventoryRepo.decrementInventoryItem(
            playerId,
            deletion.itemType,
            deletion.itemName,
            deletion.quantity,
            client
          );
        }

        for (const addition of additions) {
          await inventoryRepo.upsertInventoryItem({
            playerId,
            itemType: addition.itemType,
            itemName: addition.itemName,
            quantity: addition.quantity,
            itemData: buildFungibleItemData(
              addition.itemData,
              addition.quantity
            ),
            client,
          });
        }
      });
    } catch (error) {
      console.error('Failed to persist inventory', {
        playerId,
        sessionId,
        error,
      });
    }
  }

  private async logInventoryDiff(
    playerId: string,
    previous: InventoryItemPayload[],
    next: InventoryItemPayload[],
    options: {
      eventReason?: string;
      eventMetadata?: Record<string, unknown>;
    } = {}
  ) {
    const buildMap = (items: InventoryItemPayload[]) => {
      const map = new Map<
        string,
        { quantity: number; type: string; name: string }
      >();
      items.forEach((item) => {
        const type = String(item.type ?? item.itemType ?? 'unknown');
        const name = String(item.name ?? item.id ?? 'item');
        const key = `${type}::${name}`;
        const quantity = Number.isFinite(item.quantity)
          ? Number(item.quantity)
          : 0;
        map.set(key, { quantity, type, name });
      });
      return map;
    };

    const prevMap = buildMap(previous);
    const nextMap = buildMap(next);
    const keys = new Set([...prevMap.keys(), ...nextMap.keys()]);

    await Promise.all(
      Array.from(keys).map(async (key) => {
        const [typeKey, nameKey = 'item'] = key.split('::');
        const prev = prevMap.get(key) || {
          quantity: 0,
          type: typeKey || 'unknown',
          name: nameKey,
        };
        const curr = nextMap.get(key) || {
          quantity: 0,
          type: prev.type,
          name: prev.name,
        };
        if (String(curr.type ?? '').toLowerCase() === 'wearable') {
          return;
        }
        const delta = curr.quantity - prev.quantity;
        if (delta === 0) {
          return;
        }
        try {
          await inventoryEventsRepo.logInventoryEvent({
            playerId,
            itemType: curr.type,
            itemName: curr.name,
            delta,
            reason: options.eventReason ?? 'server_delta',
            gameId: this.currentGameId ?? null,
            metadata: {
              previousQuantity: prev.quantity,
              newQuantity: curr.quantity,
              roomId: this.state.id,
              ...(options.eventMetadata ?? {}),
            },
          });
        } catch (error) {
          console.error('Failed to log inventory event', {
            playerId,
            itemType: curr.type,
            itemName: curr.name,
            delta,
            error,
          });
        }
      })
    );
  }

  public getGroupXpMultiplier(partySize: number): number {
    if (partySize <= 1) return 1;
    const bonus = Math.min(0.75, (partySize - 1) * 0.15);
    return 1 + bonus;
  }

  public getDifficultyXpMultiplier(): number {
    const difficulty = getDifficultyTier(this.state.difficultyTier);
    return difficulty?.xpMultiplier ?? 1;
  }

  public getLeverageTotal(): number {
    return getLeverageTotalValue(this);
  }

  public handleRoomLeverageEngagement(
    reason: 'combat' | 'timeout' = 'combat'
  ): void {
    handleLeverageEngagement(this, reason);
  }

  private ensurePlayerScoreState(playerId: string): PlayerRuntimeScoreState {
    let state = this.playerScoreStateByPlayerId.get(playerId);
    if (!state) {
      state = { score: 0, eligible: true, enteredTreasureAt: null };
      this.playerScoreStateByPlayerId.set(playerId, state);
    }
    return state;
  }

  private resetScoreTrackingForRun() {
    this.playerScoreStateByPlayerId.clear();
    this.pendingScoreDeltas.clear();
    this.playersDiedThisRunByPlayerId.clear();

    this.state.players.forEach((player, sessionId) => {
      const playerId = this.getPlayerIdForSession(sessionId);
      if (SCORE_CONFIG.enabled && playerId) {
        const state = this.ensurePlayerScoreState(playerId);
        state.score = 0;
        state.eligible = true;
        state.enteredTreasureAt = null;
        player.score = 0;
        player.scoreEligible = true;
        this.scheduleScoreSync(sessionId);
      } else {
        player.score = 0;
        player.scoreEligible = true;
      }
    });
  }

  private scheduleScoreSync(sessionId: string) {
    if (!SCORE_CONFIG.enabled) {
      return;
    }
    if (!this.pendingScoreDeltas.has(sessionId)) {
      this.pendingScoreDeltas.set(sessionId, 0);
    }
  }

  private queueScoreDelta(sessionId: string, amount: number) {
    if (!SCORE_CONFIG.enabled) {
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }

    const state = this.ensurePlayerScoreState(playerId);
    const rounded = Math.round(amount);
    const nextScore = Math.min(
      SCORE_CONFIG.maxValue,
      state.score + (rounded > 0 ? rounded : 0)
    );
    state.score = nextScore;
    const previous = this.pendingScoreDeltas.get(sessionId) ?? 0;
    this.pendingScoreDeltas.set(sessionId, previous + rounded);
  }

  private setPlayerScoreEligibilityByPlayerId(
    playerId: string,
    eligible: boolean
  ): boolean {
    if (!SCORE_CONFIG.enabled) {
      return false;
    }
    const state = this.ensurePlayerScoreState(playerId);
    if (state.eligible === eligible) {
      return false;
    }
    state.eligible = eligible;
    if (!eligible) {
      this.playersDiedThisRunByPlayerId.add(playerId);
    } else {
      this.playersDiedThisRunByPlayerId.delete(playerId);
    }
    return true;
  }

  private markPlayerScoreIneligible(sessionId: string) {
    if (!SCORE_CONFIG.enabled) {
      return;
    }
    const playerId = this.getPlayerIdForSession(sessionId);
    if (!playerId) {
      return;
    }
    const changed = this.setPlayerScoreEligibilityByPlayerId(playerId, false);
    if (changed) {
      this.scheduleScoreSync(sessionId);
    }
  }

  private flushPendingScores() {
    if (!SCORE_CONFIG.enabled) {
      this.pendingScoreDeltas.clear();
      return;
    }
    if (this.pendingScoreDeltas.size === 0) {
      return;
    }

    this.pendingScoreDeltas.forEach((_delta, sessionId) => {
      const player = this.state.players.get(sessionId);
      if (!player) {
        return;
      }
      const playerId = this.getPlayerIdForSession(sessionId);
      if (!playerId) {
        return;
      }
      const state = this.playerScoreStateByPlayerId.get(playerId);
      if (!state) {
        return;
      }
      player.score = state.score;
      player.scoreEligible = state.eligible;
    });

    this.pendingScoreDeltas.clear();
  }

  private cloneRuntimeStats(sessionId: string): GamePlayerRuntimeStats | null {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) {
      return null;
    }
    return { ...stats };
  }

  private async persistPlayerRunScore(options: {
    playerId: string;
    sessionId?: string;
    statsSnapshot?: GamePlayerRuntimeStats | null;
    partySize?: number;
    reason: 'leave' | 'dispose';
  }) {
    if (!SCORE_CONFIG.enabled) {
      return;
    }
    if (!this.currentGameId) {
      return;
    }

    const { playerId } = options;
    if (!playerId) {
      return;
    }

    if (this.persistedScorePlayerIds.has(playerId)) {
      return;
    }

    const scoreState = this.playerScoreStateByPlayerId.get(playerId);
    if (!scoreState) {
      return;
    }

    const score = Math.max(0, Math.floor(scoreState.score ?? 0));
    const validForHighScore =
      score > 0 &&
      scoreState.eligible &&
      scoreState.enteredTreasureAt != null &&
      !this.playersDiedThisRunByPlayerId.has(playerId);

    const durationMs =
      this.runStartedAt != null && this.runStartedAt > 0
        ? Math.max(0, Date.now() - this.runStartedAt)
        : null;

    const stats = options.statsSnapshot ?? null;

    const metadata: Record<string, unknown> = {
      reason: options.reason,
      enteredTreasureAt: scoreState.enteredTreasureAt,
      partySize: options.partySize ?? this.state.players.size,
      sessionId: options.sessionId ?? null,
    };
    const leverageTotal = this.state.leverageTotal || 1;
    (metadata as any).leverage = { total: leverageTotal };

    if (stats) {
      metadata.gamePlayerId = stats.gamePlayerId;
      metadata.kills = stats.kills;
      metadata.xpGained = stats.xpGained;
    }

    try {
      await runTransaction(async (client) => {
        // Always persist the score, even if not valid for high score
        await runScoresRepo.recordRunScore({
          playerId,
          gameId: this.currentGameId!,
          score,
          difficultyTier: this.state.difficultyTier,
          durationMs,
          kills: stats?.kills ?? null,
          xpEarned: stats?.xpGained ?? null,
          validForHighScore,
          metadata,
          client,
        });

        // Only update highest score if valid for high score
        if (validForHighScore) {
          await playersRepo.updateHighestScore(playerId, score, client);
        }

        // Always save score metadata to game_players for fallback
        if (stats?.gamePlayerId) {
          await gamePlayersRepo.applyStats({
            gamePlayerId: stats.gamePlayerId,
            metadata: {
              score: {
                final: score,
                eligible: validForHighScore,
                submittedAt: new Date().toISOString(),
                durationMs,
                difficultyTier: this.state.difficultyTier,
              },
              leverage: { total: leverageTotal },
            },
            client,
          });
        }
      });

      this.persistedScorePlayerIds.add(playerId);
    } catch (error) {
      console.error('Failed to persist run score', {
        playerId,
        gameId: this.currentGameId,
        score,
        error,
      });
    }
  }

  private getDurabilityRunMetadata(record: { metadata?: unknown } | null): {
    currentRunOrdinal: number;
    settledRunOrdinal: number;
  } {
    const metadata =
      record?.metadata && typeof record.metadata === 'object'
        ? (record.metadata as Record<string, unknown>)
        : {};
    const durability =
      metadata.durability && typeof metadata.durability === 'object'
        ? (metadata.durability as Record<string, unknown>)
        : {};
    const currentRaw = Number(durability.currentRunOrdinal);
    const settledRaw = Number(durability.settledRunOrdinal);
    return {
      currentRunOrdinal:
        Number.isFinite(currentRaw) && currentRaw >= 1
          ? Math.floor(currentRaw)
          : 1,
      settledRunOrdinal:
        Number.isFinite(settledRaw) && settledRaw >= 0
          ? Math.floor(settledRaw)
          : 0,
    };
  }

  public async advanceDurabilityRunOrdinal(sessionId: string): Promise<void> {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats?.gamePlayerId) {
      return;
    }
    const record = await gamePlayersRepo.getById(stats.gamePlayerId);
    const durability = this.getDurabilityRunMetadata(record);
    await gamePlayersRepo.applyStats({
      gamePlayerId: stats.gamePlayerId,
      metadata: {
        durability: {
          currentRunOrdinal: durability.currentRunOrdinal + 1,
          settledRunOrdinal: durability.settledRunOrdinal,
          advancedAt: new Date().toISOString(),
        },
      },
    });
  }

  public async settleEquippedWearableDurability(
    sessionId: string,
    reason: string
  ): Promise<void> {
    if (this.phase !== 'in_game') {
      return;
    }

    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats?.gamePlayerId) {
      return;
    }

    const playerId = this.getPlayerIdForSession(sessionId);
    const player = this.state.players.get(sessionId);
    if (!playerId || !player) {
      return;
    }

    const maxDepthReached = Math.max(
      1,
      Math.floor(Number(player.idleRoom?.maxDepthReached) || 1)
    );
    const durabilityLoss = durabilityLossForRun(maxDepthReached);
    const characterId =
      typeof player.characterId === 'string' && player.characterId.trim().length
        ? player.characterId
        : null;

    let changed = false;
    await runTransaction(async (client) => {
      const record = await gamePlayersRepo.getById(
        stats.gamePlayerId,
        client,
        { forUpdate: true }
      );
      if (!record) {
        return;
      }

      const durabilityMeta = this.getDurabilityRunMetadata(record);
      if (durabilityMeta.settledRunOrdinal >= durabilityMeta.currentRunOrdinal) {
        return;
      }

      if (characterId) {
        const equipped = await equipmentRepo.getEquippedWithInstances(
          playerId,
          characterId,
          client
        );
        for (const entry of equipped) {
          if (!entry.inventoryItemId) {
            continue;
          }
          if (isBrokenDurability(entry.durabilityScore)) {
            continue;
          }
          const updated = await inventoryRepo.applyWearableDurabilityLossById(
            playerId,
            entry.inventoryItemId,
            durabilityLoss,
            client
          );
          if (
            updated &&
            Number(updated.durabilityScore) !== Number(entry.durabilityScore)
          ) {
            changed = true;
          }
        }
      }

      await gamePlayersRepo.applyStats({
        gamePlayerId: stats.gamePlayerId,
        metadata: {
          durability: {
            currentRunOrdinal: durabilityMeta.currentRunOrdinal,
            settledRunOrdinal: durabilityMeta.currentRunOrdinal,
            settledAt: new Date().toISOString(),
            reason,
            maxDepthReached,
            durabilityLoss,
          },
        },
        client,
      });
    });

    if (!changed || !characterId) {
      return;
    }

    const equipmentRecords = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId
    );
    const equipmentOverrides: EquipmentOverride[] = [];
    for (const equipmentRecord of equipmentRecords) {
      equipmentOverrides.push({
        slot: normalizeEquipmentSlotName(equipmentRecord.slot),
        slug: equipmentRecord.wearableSlug,
        inventoryItemId: equipmentRecord.inventoryItemId ?? null,
        quality: normalizeQualityTier(equipmentRecord.quality),
        durabilityScore:
          typeof equipmentRecord.durabilityScore === 'number'
            ? equipmentRecord.durabilityScore
            : null,
      });
    }

    const state = buildEquipmentStateForCharacter(characterId, equipmentOverrides);
    this.playerEquipmentSnapshots.set(
      playerId,
      state.equipment
        .map(
          (entry) =>
            `${entry.slot}::${entry.slug}::${Number(entry.durabilityScore ?? -1)}`
        )
        .sort()
    );

    try {
      await progressionRepo.updateProgression(playerId, {
        derivedStats: state.derivedStats,
        equippedWearables: state.equippedWearables,
      });
    } catch (error) {
      console.error('Failed to persist post-settlement equipment snapshot', {
        playerId,
        sessionId,
        error,
      });
    }

    this.equipmentBroadcastUpdate({
      ...state,
      playerId,
    });
  }

  private awardXpForEnemyDefeat(
    enemy: any,
    enemyId: string,
    attackType: 'melee' | 'ranged' | 'grenades',
    killerId?: string
  ): Map<string, number> {
    const xpAwardedBySession = new Map<string, number>();
    const partySize = this.state.players.size;
    if (partySize <= 0) {
      return xpAwardedBySession;
    }

    const enemyType = enemy?.enemyType || enemy?.name || 'unknown';
    const enemyStats = getEnemyStats(enemyType);
    const baseXp = Math.max(0, enemyStats.baseXp || 0);
    if (baseXp <= 0) {
      return xpAwardedBySession;
    }

    const totalXpPool =
      baseXp *
      this.getDifficultyXpMultiplier() *
      this.getGroupXpMultiplier(partySize);
    if (!Number.isFinite(totalXpPool) || totalXpPool <= 0) {
      return xpAwardedBySession;
    }

    const sessionIds = Array.from(this.state.players.keys());
    const normalizedKiller =
      killerId && sessionIds.includes(killerId) ? killerId : undefined;

    const shares = new Map<string, number>();
    if (!normalizedKiller || partySize <= 1) {
      const share = totalXpPool / partySize;
      sessionIds.forEach((id) => shares.set(id, share));
    } else {
      const others = sessionIds.filter((id) => id !== normalizedKiller);
      const killerShare = totalXpPool * 0.6;
      shares.set(normalizedKiller, killerShare);

      if (others.length === 0) {
        shares.set(normalizedKiller, totalXpPool);
      } else {
        const perMember = (totalXpPool * 0.4) / others.length;
        others.forEach((id) => shares.set(id, perMember));
      }
    }

    const shouldAwardScore = SCORE_CONFIG.enabled && Boolean(killerId);
    const leverageForScore = this.getLeverageTotal();
    const xpSource = {
      enemyId,
      enemyType: enemyStats.enemyType,
      attackType,
      classification: enemyStats.classification,
    };
    const xpMultiplierEnabled = GAME_CONFIG.leverage?.xpMultiplierEnabled ?? true;

    shares.forEach((rawShare, sessionId) => {
      const baseXpAmount = Math.round(rawShare);

      // Award score based on raw share so that killing an enemy always increases score
      if (shouldAwardScore && baseXpAmount > 0) {
        this.queueScoreDelta(sessionId, baseXpAmount * leverageForScore);
      }

      if (baseXpAmount > 0) {
        const xpAmount = xpMultiplierEnabled
          ? Math.round(baseXpAmount * leverageForScore)
          : baseXpAmount;

        // Calculate actual XP amount after mode-based reduction
        // (awardXpToPlayer will apply this reduction, but we need to track the actual amount)
        const player = this.state.players.get(sessionId);
        const isCompetition = player?.dailyQuestActive === true;
        const actualXpAmount = isCompetition
          ? xpAmount
          : Math.round(xpAmount * 0.1);

        if (actualXpAmount > 0) {
          // Pass full amount to awardXpToPlayer - it will apply mode-based reduction
          this.awardXpToPlayer(sessionId, xpAmount, xpSource);
          // Track the actual XP awarded (after mode reduction)
          xpAwardedBySession.set(sessionId, actualXpAmount);
        }
      }
    });

    if (normalizedKiller) {
      const unitDelta = getKillStreakUnitDeltaForClassification(
        enemyStats.classification
      );
      if (unitDelta > 0) {
        this.awardKillStreakUnitsToPlayer(normalizedKiller, unitDelta, {
          enemyId,
          enemyType: enemyStats.enemyType,
          attackType,
          classification: enemyStats.classification,
        });
      }
    }

    return xpAwardedBySession;
  }

  public handlePlayerDeath(sessionId: string, cause: string = 'unknown') {
    if (this.playerDeathsThisRun.has(sessionId)) {
      return;
    }

    const player = this.state.players.get(sessionId);
    if (!player) return;

    this.playerDeathsThisRun.add(sessionId);
    this.recordPlayerDeathStat(sessionId);
    this.markPlayerScoreIneligible(sessionId);

    // Reset kill streak on death
    this.resetKillStreakForSession(sessionId, {
      reason: 'death',
      reinitialize: false,
    });

    this.msg.broadcast('player_died', {
      playerId: sessionId,
      cause,
    });
    const playerId = this.getPlayerIdForSession(sessionId);
    this.logGameEvent('player.death', `${player.name} was defeated`, {
      level: 'warn',
      playerId,
      sessionId,
      details: {
        cause,
        hpAtDeath: player.hp,
      },
    });
    void this.settleEquippedWearableDurability(sessionId, 'death');
  }

  /**
   * Generic resource harvesting method - replaces performTreeChop and performStoneChop
   * Works for any resource type defined in resource-config.ts
   */
  public performResourceHarvest(
    playerId: string,
    resourceId: string,
    resourceType: string
  ): boolean {
    return sysPerformResourceHarvest(
      this as any,
      playerId,
      resourceId,
      resourceType
    );
  }

  private getCurrentClientCount(): number {
    const clientsAny = this.clients as any;
    if (Array.isArray(clientsAny)) return clientsAny.length;
    if (typeof clientsAny?.size === 'number') return clientsAny.size;
    if (typeof clientsAny?.length === 'number') return clientsAny.length;
    return this.state?.players?.size || 0;
  }

  private updateMetadata(extra: Record<string, unknown> = {}) {
    this.setMetadata({
      roomId: this.state.id,
      roomCode: this.state.roomCode,
      isPrivate: this.isPrivateRoom,
      region: this.state.region,
      difficultyTier: this.state.difficultyTier,
      hostSessionId: this.state.hostSessionId,
      playerCount: this.getCurrentClientCount(),
      maxPlayers: this.maxClients,
      colyseusRoomId: this.roomId,
      gameId: this.currentGameId,
      phase: this.state.phase,
      autoCloseAt: this.state.autoCloseAt,
      lateJoinCutoffAt: this.state.lateJoinCutoffAt,
      ...extra,
    });
  }

  private async createGameRecord(options: GameRoomOptions = {}) {
    if (this.currentGameId) {
      this.gameStatusFinalized = false;
      this.persistGameMetrics({ syncState: true });
      return;
    }

    const startedAt = this.state.startedAt || Date.now();
    const record = await gamesRepo.create({
      roomId: this.state.id,
      seed: this.state.seed,
      region: this.state.region,
      difficultyTier: this.state.difficultyTier,
      status: 'active',
      isPrivate: this.isPrivateRoom,
      maxPlayers: this.maxClients,
      startedAtIso: new Date(startedAt).toISOString(),
      phase: this.phase,
      phaseChangedAtIso: new Date(this.phaseChangedAt).toISOString(),
      runStartedAtIso: this.runStartedAt
        ? new Date(this.runStartedAt).toISOString()
        : null,
      lateJoinCutoffAtIso:
        this.state.lateJoinCutoffAt > 0
          ? new Date(this.state.lateJoinCutoffAt).toISOString()
          : null,
      autoCloseAtIso:
        this.state.autoCloseAt > 0
          ? new Date(this.state.autoCloseAt).toISOString()
          : null,
      startedByPlayerId: this.state.startedByPlayerId || null,
      metadata: {
        roomCode: this.state.roomCode,
        colyseusRoomId: this.roomId,
        leverage: {
          total: this.state.leverageTotal || 1,
        },
      },
    });

    this.currentGameId = record.id;
    this.gameStatusFinalized = false;
    this.persistGameMetrics({ syncState: true });
    this.logGameEvent('game.record.created', 'Game record created', {
      details: {
        roomId: this.state.id,
        region: this.state.region,
        difficultyTier: this.state.difficultyTier,
        isPrivate: this.isPrivateRoom,
        stagingEnabled: this.stagingEnabled,
        maxPlayers: this.maxClients,
      },
    });
  }

  private async registerGamePlayer(
    sessionId: string,
    playerId: string,
    profile: ProgressionProfile,
    player: PlayerSchema
  ) {
    if (!this.currentGameId) {
      return;
    }

    const joinMetadata: Record<string, unknown> = {
      wallet: player.wallet || null,
      sessionId,
      leverage: {
        total: this.state.leverageTotal || 1,
      },
    };

    const record = await gamePlayersRepo.join({
      gameId: this.currentGameId,
      playerId,
      characterId: player.characterId,
      levelBefore: profile.level,
      metadata: joinMetadata,
    });

    this.gamePlayerStats.set(sessionId, {
      playerId,
      gamePlayerId: record.id,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      coinsCollected: 0,
      usdcEarnedBaseUnits: 0,
      xpGained: 0,
      levelStart: record.levelBefore ?? profile.level,
      levelEnd: profile.level,
    });

    this.sendKillCountUpdate(sessionId, 0);

    this.recordLevelSnapshot(sessionId, profile.level);
  }

  private sendKillCountUpdate(sessionId: string, kills: number) {
    const client = this.getClientBySessionId(sessionId);
    if (client) {
      this.msg.sendTo(client, 'kill_count_updated', { kills });
    }
  }

  private recordKill(sessionId: string) {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.kills += 1;
    this.sendKillCountUpdate(sessionId, stats.kills);
  }

  private recordPlayerDeathStat(sessionId: string) {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.deaths += 1;
  }

  private recordXpGain(
    sessionId: string,
    amount: number,
    resultingLevel: number
  ) {
    if (amount <= 0) return;
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.xpGained += amount;
    stats.levelEnd = resultingLevel;
  }

  private recordLevelSnapshot(sessionId: string, level: number) {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.levelEnd = level;
  }

  awardXpToPlayer(sessionId: string, xpAmount: number, source?: any) {
    if (xpAmount <= 0) return;

    const player = this.state.players.get(sessionId);
    if (player) {
      const isCompetition = player.dailyQuestActive === true;
      const mode = isCompetition ? 'competition' : 'progression';
      const rewardConfig = (GAME_CONFIG as any).modeRewards?.[mode];
      if (rewardConfig && !rewardConfig.earnXp) {
        return; // Skip XP if not allowed by mode config
      }

      // Apply 10% XP multiplier for progression mode (practice/progression matches)
      // Competition mode gets full XP (100%)
      if (!isCompetition) {
        xpAmount = Math.round(xpAmount * 0.1);
        if (xpAmount <= 0) return; // Skip if rounded down to 0
      }
    }

    const profile = this.getProgressionProfile(sessionId);
    const maxLevel = this.getSessionProgressionMaxLevel(sessionId);
    const result = applyXpToProfile(profile, xpAmount, maxLevel);

    this.setProgressionProfile(sessionId, result.profile, { persist: false });
    this.recordXpGain(sessionId, xpAmount, result.profile.level);
    this.recordLevelSnapshot(sessionId, result.profile.level);

    if (result.levelUps > 0) {
      this.applyProgressionToPlayer(sessionId, { fullHeal: true });
      if (player && player.idleRoom && player.idleRoom.runStatus === 'active') {
        logAction(
          player,
          `::gold::🌟 You leveled up! Current level: ${result.currentLevel}. Restored to full HP!::`
        );
      }
    }

    void this.persistProgression(sessionId, result.profile);

    // Sync progression fields to player schema for Colyseus state sync
    const levelProgress = getLevelProgress(result.profile.totalXp, maxLevel);
    if (player) {
      player.level = levelProgress.level;
      player.xp = result.profile.totalXp;
      player.xpIntoLevel = levelProgress.xpIntoLevel;
      player.xpForNextLevel = levelProgress.xpForNextLevel;
    }

    const client = this.getClientBySessionId(sessionId);
    if (client) {
      this.msg.sendTo(client, 'progression:xp_awarded', {
        amount: xpAmount,
        totalXp: result.profile.totalXp,
        level: result.currentLevel,
        levelUps: result.levelUps,
        unspentPoints: result.profile.unspentPoints,
        stats: result.profile.stats,
        allocationHistory: result.profile.allocationHistory,
        levelProgress,
        source: source,
      });
    }
  }

  private recordCoinsCollected(sessionId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.coinsCollected += Math.round(amount);
  }

  private recordUsdcEarned(sessionId: string, amountBaseUnits: number) {
    if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0) return;
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) return;
    stats.usdcEarnedBaseUnits += Math.round(amountBaseUnits);
  }

  public logEconomyTransaction(options: {
    playerId: string;
    currency: string;
    amount: number;
    source: string;
    gameId?: string | null;
    lootDistributionId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    if (!options.playerId) return;
    void economyRepo
      .logTransaction({
        playerId: options.playerId,
        currency: options.currency,
        amount: options.amount,
        source: options.source,
        gameId: options.gameId ?? this.currentGameId,
        lootDistributionId: options.lootDistributionId ?? null,
        metadata: options.metadata,
      })
      .catch((error) => {
        console.error('Failed to log economy transaction', {
          playerId: options.playerId,
          currency: options.currency,
          source: options.source,
          error,
        });
      });
  }

  private async flushGamePlayerStats(
    sessionId: string,
    options: { markLeft?: boolean } = {}
  ) {
    const stats = this.gamePlayerStats.get(sessionId);
    if (!stats) {
      return;
    }

    const payload: gamePlayersRepo.ApplyStatsInput = {
      gamePlayerId: stats.gamePlayerId,
      killsDelta: stats.kills || undefined,
      deathsDelta: stats.deaths || undefined,
      damageDealtDelta: stats.damageDealt || undefined,
      damageTakenDelta: stats.damageTaken || undefined,
      coinsCollectedDelta: stats.coinsCollected || undefined,
      usdcEarnedBaseUnitsDelta: stats.usdcEarnedBaseUnits || undefined,
      xpGainedDelta: stats.xpGained || undefined,
      levelAfter: stats.levelEnd,
      markLeft: options.markLeft,
    };

    const shouldUpdate =
      options.markLeft === true ||
      stats.kills !== 0 ||
      stats.deaths !== 0 ||
      stats.damageDealt !== 0 ||
      stats.damageTaken !== 0 ||
      stats.coinsCollected !== 0 ||
      stats.usdcEarnedBaseUnits !== 0 ||
      stats.xpGained !== 0 ||
      stats.levelEnd !== stats.levelStart;

    if (shouldUpdate) {
      try {
        await gamePlayersRepo.applyStats(payload);
      } catch (error) {
        console.error('Failed to persist game player stats', {
          gamePlayerId: stats.gamePlayerId,
          sessionId,
          error,
        });
      }
    }

    if (options.markLeft) {
      this.gamePlayerStats.delete(sessionId);
    } else {
      stats.kills = 0;
      stats.deaths = 0;
      stats.damageDealt = 0;
      stats.damageTaken = 0;
      stats.coinsCollected = 0;
      stats.usdcEarnedBaseUnits = 0;
      stats.xpGained = 0;
      stats.levelStart = stats.levelEnd;
    }
  }

  private persistGameMetrics(
    options: { totalEnemyKillsDelta?: number; syncState?: boolean } = {}
  ) {
    if (!this.currentGameId || this.gameStatusFinalized) {
      return;
    }

    const payload: gamesRepo.UpdateMetricsInput = {
      gameId: this.currentGameId,
      floorReached: this.getFloorReached(),
    };

    if (
      typeof options.totalEnemyKillsDelta === 'number' &&
      options.totalEnemyKillsDelta !== 0
    ) {
      payload.totalEnemyKillsDelta = options.totalEnemyKillsDelta;
    }

    if (options.syncState) {
      payload.nextTimedSpawnAt =
        this.state.nextTimedSpawnAt && this.state.nextTimedSpawnAt > 0
          ? new Date(this.state.nextTimedSpawnAt).toISOString()
          : null;
      payload.difficultyTier = this.state.difficultyTier;
      payload.phase = this.state.phase;
      payload.phaseChangedAtIso = new Date(this.phaseChangedAt).toISOString();
      payload.runStartedAtIso = this.runStartedAt
        ? new Date(this.runStartedAt).toISOString()
        : null;
      payload.lateJoinCutoffAtIso =
        this.state.lateJoinCutoffAt > 0
          ? new Date(this.state.lateJoinCutoffAt).toISOString()
          : null;
      payload.autoCloseAtIso =
        this.state.autoCloseAt > 0
          ? new Date(this.state.autoCloseAt).toISOString()
          : null;
      payload.startedByPlayerId = this.state.startedByPlayerId || null;
    }

    if (payload.totalEnemyKillsDelta === undefined && !options.syncState) {
      return;
    }

    void gamesRepo.updateMetrics(payload).catch((error) => {
      console.error('Failed to update game metrics', {
        gameId: this.currentGameId,
        error,
      });
    });
  }

  private async syncGameMetricsImmediate() {
    if (!this.currentGameId) {
      return;
    }
    try {
      await gamesRepo.updateMetrics({
        gameId: this.currentGameId,
        floorReached: this.getFloorReached(),
        nextTimedSpawnAt:
          this.state.nextTimedSpawnAt && this.state.nextTimedSpawnAt > 0
            ? new Date(this.state.nextTimedSpawnAt).toISOString()
            : null,
        difficultyTier: this.state.difficultyTier,
        phase: this.state.phase,
        phaseChangedAtIso: new Date(this.phaseChangedAt).toISOString(),
        runStartedAtIso: this.runStartedAt
          ? new Date(this.runStartedAt).toISOString()
          : null,
        lateJoinCutoffAtIso:
          this.state.lateJoinCutoffAt > 0
            ? new Date(this.state.lateJoinCutoffAt).toISOString()
            : null,
        autoCloseAtIso:
          this.state.autoCloseAt > 0
            ? new Date(this.state.autoCloseAt).toISOString()
            : null,
        startedByPlayerId: this.state.startedByPlayerId || null,
      });
    } catch (error) {
      console.error('Failed to sync game metrics immediately', {
        gameId: this.currentGameId,
        error,
      });
    }
  }

  public recordPostKillMetrics() {
    this.persistGameMetrics({ syncState: true });
  }

  public syncGameMetrics() {
    this.persistGameMetrics({ syncState: true });
  }

  private async recordEnemyKill(
    enemy: any,
    enemyId: string,
    attackType: 'melee' | 'ranged' | 'grenades',
    killerSessionId?: string,
    scoreAwardedBySession?: Map<string, number>
  ): Promise<string | null> {
    if (!this.currentGameId) {
      return null;
    }

    const playerId = killerSessionId
      ? this.getPlayerIdForSession(killerSessionId)
      : undefined;
    const location = {
      x: typeof enemy?.x === 'number' ? enemy.x : 0,
      y: typeof enemy?.y === 'number' ? enemy.y : 0,
    };

    const scoreAwarded =
      killerSessionId && scoreAwardedBySession
        ? (scoreAwardedBySession.get(killerSessionId) ?? null)
        : null;
    let scoreTotal: number | null = null;
    if (killerSessionId && playerId) {
      const scoreState = this.playerScoreStateByPlayerId.get(playerId);
      if (scoreState) {
        scoreTotal = Math.max(0, Math.floor(scoreState.score ?? 0));
      }
    }

    try {
      const record = await enemyKillsRepo.logKill({
        gameId: this.currentGameId,
        playerId: playerId ?? null,
        enemyType: enemy?.enemyType || enemy?.name || 'unknown',
        enemyId,
        attackType,
        weaponType: enemy?.weaponType ?? null,
        location,
        metadata: {
          killerSessionId: killerSessionId ?? null,
          scoreAwarded,
          scoreTotal,
          isBossEncounter: Boolean((enemy as any)?.isBossEncounter),
        },
      });

      const previous = this.recentEnemyKillIds.get(enemyId);
      if (previous?.timeout) {
        clearTimeout(previous.timeout);
      }
      const timeout = setTimeout(() => {
        this.recentEnemyKillIds.delete(enemyId);
      }, 60_000);
      this.recentEnemyKillIds.set(enemyId, { id: record.id, timeout });

      return record.id;
    } catch (error) {
      console.error('Failed to log enemy kill', {
        gameId: this.currentGameId,
        enemyId,
        error,
      });
      return null;
    }
  }

  public async registerEnemyDrop(options: {
    entityId: string;
    enemyId: string;
    enemyType: string;
    dropTable?: string | null;
    rolledWeight?: number | null;
    item?: InventoryItemPayload;
  }) {
    if (!this.currentGameId) {
      return;
    }

    const killEntry = this.recentEnemyKillIds.get(options.enemyId);
    const enemyKillId = killEntry?.id ?? null;

    let distributionId: string | null = null;

    try {
      const distribution = await lootDistributionsRepo.createPending({
        source: 'enemy_drop',
        gameId: this.currentGameId,
        playerId: null,
        lootId: null,
        amount: Number(options.item?.quantity) || 1,
        probability: null,
        expectedValue: null,
        entityId: options.entityId,
        claimed: false,
        metadata: {
          item: options.item ?? null,
          enemyType: options.enemyType,
          dropTable: options.dropTable ?? null,
        },
      });

      distributionId = distribution.id;

      const existing = this.entityLootDistributions.get(options.entityId);
      if (existing?.timeout) {
        clearTimeout(existing.timeout);
      }
      const timeout = setTimeout(() => {
        this.entityLootDistributions.delete(options.entityId);
      }, 10 * 60_000);
      this.entityLootDistributions.set(options.entityId, {
        distributionId,
        timeout,
        source: 'enemy_drop',
        metadata: {
          enemyType: options.enemyType,
          dropTable: options.dropTable ?? null,
          item: options.item ?? null,
        },
      });
    } catch (error) {
      console.error('Failed to create loot distribution for enemy drop', {
        gameId: this.currentGameId,
        enemyId: options.enemyId,
        entityId: options.entityId,
        error,
      });
    }

    try {
      await enemyDropsRepo.logDrop({
        gameId: this.currentGameId,
        enemyKillId,
        lootDistributionId: distributionId,
        enemyType: options.enemyType,
        dropTable: options.dropTable ?? null,
        rolledWeight: options.rolledWeight ?? null,
      });
    } catch (error) {
      console.error('Failed to log enemy drop', {
        gameId: this.currentGameId,
        enemyId: options.enemyId,
        entityId: options.entityId,
        error,
      });
    }
  }

  private async finalizeGameStatus(
    status: string,
    metadata: Record<string, unknown> = {}
  ) {
    if (!this.currentGameId || this.gameStatusFinalized) {
      return;
    }

    await this.syncGameMetricsImmediate();

    const durationMs = Date.now() - (this.state.startedAt || Date.now());

    try {
      await gamesRepo.markStatus({
        gameId: this.currentGameId,
        status,
        metadata: {
          totalEnemyKills: this.state.totalEnemyKills,
          durationMs,
          hadPlayers: this.hadAnyPlayers,
          bossKilled: this.bossKilled,
          ...metadata,
        },
      });
      this.gameStatusFinalized = true;
    } catch (error) {
      console.error('Failed to finalize game status', {
        gameId: this.currentGameId,
        status,
        error,
      });
    }
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

}
