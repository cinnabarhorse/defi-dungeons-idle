import { Client } from 'colyseus';
import {
  authSessionsRepo,
  apiKeysRepo,
  depositsRepo,
  playersRepo,
  playerDailyRunBonusRepo,
  playerDailyRunsRepo,
  inventoryRepo,
  inventoryEventsRepo,
  lootDistributionsRepo,
  economyRepo,
  tokenWithdrawalsRepo,
  gamePlayersRepo,
  inventoryRecordToItem,
  progressionRecordToProfile,
  sanitizeInventoryItems as sanitizeInventoryPayloads,
  getLickTongueCount,
  getHealthPotionCount,
  getManaPotionCount,
  runTransaction,
  type InventoryItemPayload,
  type PlayerInventoryRecord,
} from '../lib/db';
import {
  formatBaseUnits,
  getWithdrawalTokenConfig,
  parseAmountToBaseUnits,
} from '../lib/withdrawals/token-config';
import { readSessionFromRequest, getSessionSecret } from '../lib/auth/session';
import { verifySessionToken } from '../lib/auth/token';
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
import type { GameRoom } from './GameRoom';
import {
  type ProgressionProfile,
  createDefaultProfile,
  cloneProfile,
  sanitizeProfile,
  computeProgressionModifiers,
  getLevelProgress,
} from '@gotchiverse/progression';
import { progressionRepo } from '../lib/db';
import {
  type KillStreakProfile,
  createKillStreakProfile,
  applyKillStreakIncrement,
  applyKillStreakDecay,
  computeKillStreakModifiers,
  resolveArchetypeForCharacter,
} from '../lib/progression/killStreak';
import { syncPlayerCharacterStats } from '../lib/player-stats';
import {
  type EquipmentBroadcastPayload,
  mapStoredWearablesToAssignments,
  extractWearableSlugs as parseWearableArray,
  resolveRuntimeEquipmentSnapshotForJoin,
} from '../lib/equipment-service';
import { equipmentRepo } from '../lib/db';
import { resolvePreferredHandWeaponIndex } from '../lib/hand-weapon-utils';
import { PlayerSchema } from '../schemas';
import { getLeverageTotal as leverageGetLeverageTotal } from '../lib/systems/LeverageSystem';
import {
  calculateTimeMultiplier,
  getCompetitionTier,
  getCompetitionDate,
  getDailyQuestCompetitionConfig,
} from '../lib/daily-quest-competition';
import { dailyQuestLeaderboardRepo } from '../lib/db';
import { ITEM_COLORS } from '../data/items';
import {
  PORTAL_MAGE_SHOP_BY_ID,
  type ShopItemDefinition,
} from '../data/npc-shops/portalmage';

const GOLD_NAME_ALIASES = new Set(['gold', 'gold coin']);
const GOLD_CURRENCY_TYPES = new Set(['coin', 'gold_coin', 'gold']);
import {
  assertGotchiOwnershipForTodaySnapshot,
  verifyGotchiOwnershipForTodaySnapshot,
} from '../lib/gotchi-ownership-snapshot';
import { assertWalletCanPlayTodaySnapshot } from '../lib/gotchi-auth-eligibility';
import {
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../data/characters';
import { SCORE_CONFIG, GAME_CONFIG, LEVERAGE_CONFIG } from '../lib/constants';
import {
  getAdditiveTradingCompetitionLeverage,
  getRewardLeverageMultiplier,
  isTradingGameEnabled,
  normalizeTradeDirection,
  normalizeTradeLeverage,
  normalizeTradeToken,
} from '../lib/trading-game';
import {
  getDailyRunAllowance,
  getDailyRunsConfig,
  getDailyRunsDate,
  getDailyRunsResetAt,
} from '../lib/daily-runs';

const STAGING_AUTO_CLOSE_MS = 15 * 60 * 1000;
const INVENTORY_PERSIST_DEBOUNCE_MS = 150;
const pendingInventoryPersists = new Map<
  string,
  {
    previous: InventoryItemPayload[];
    next: InventoryItemPayload[];
    timeout: ReturnType<typeof setTimeout> | null;
    sources: Set<string>;
  }
>();
import {
  scheduleRoomLeverageLockTimeout as leverageScheduleRoomLeverageLockTimeout,
  sendLeverageStateToClient as leverageSendLeverageStateToClient,
  clearRoomLeverageLockTimer as leverageClearRoomLeverageLockTimer,
} from '../lib/systems/LeverageSystem';
import { EncounterManager } from '../lib/idle-systems/EncounterManager';
import { gamesRepo } from '../lib/db';
import {
  normalizeEquipmentSlotName,
  buildEquipmentStateForCharacter,
  type EquipmentOverride,
} from '../lib/equipment-service';
import { normalizeQualityTier } from '../data/wearable-quality';
import { toSerializableProfile } from '@gotchiverse/progression';
import {
  sanitizeRebirthCount,
} from '../lib/progression/rebirth';
import { type GameRoomOptions } from './GameRoom';
import { getDifficultyTier, isTierEligible } from '../data/difficulty-tiers';
import {
  applyDevModeToPlayer,
  applyDevModeEquipment,
  generateDevModePotions,
  isDevModeAllowed,
  shouldSkipEntryFee,
  type DevModeOptions,
} from '../lib/dev-mode';
// Old dailyHighStakesStateRepo import removed - using competition system now

// --- Shared Types ---

export interface GamePlayerRuntimeStats {
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

function safeParseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed as T) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

// --- Auth & Session ---

export async function onAuth(
  room: GameRoom,
  client: Client,
  _options: any,
  request?: any
) {
  try {
    const hdrs: any = (request as any)?.headers || {};
    const hasCookie = typeof hdrs.cookie === 'string' && hdrs.cookie.length > 0;

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
      const bearer = hdrs.authorization;
      if (bearer) {
        const bearerResult = await tryBearerToken(bearer);
        if (bearerResult) {
          return (client as any).auth;
        }
      }
    }

    if (!session || !session.address) {
      console.warn('WS auth: no session or address found');
      // Allow connection but mark as unauthorized/guest
      return assignAuth('', null, false, null, { authMethod: 'session' });
    }

    const authorized = await tryResolveSession(
      session.sessionId,
      session.address
    );
    if (!authorized) {
      return assignAuth(session.address, null, false, null, {
        authMethod: 'session',
      });
    }

    return (client as any).auth;
  } catch (error) {
    console.error('WS auth error', error);
    return assignAuth('', null, false, null, { authMethod: 'session' });
  }
}

export function getClientBySessionId(
  room: GameRoom,
  sessionId: string
): Client | undefined {
  return room.getClientBySessionId(sessionId);
}

export function getPlayerIdForSession(room: GameRoom, sessionId: string) {
  return room.getPlayerIdForSession(sessionId);
}

export function getSessionIdsForPlayer(
  room: GameRoom,
  playerId: string
): string[] {
  const sessions: string[] = [];
  // @ts-ignore - access private property
  for (const [sessionId, mappedPlayerId] of room.sessionPlayerIds.entries()) {
    if (mappedPlayerId === playerId) {
      sessions.push(sessionId);
    }
  }
  return sessions;
}

// --- Inventory Management ---

export function getInventoryKey(item: InventoryItemPayload) {
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

interface FungibleSnapshotEntry {
  itemType: string;
  itemName: string;
  quantity: number;
  itemData: InventoryItemPayload;
}

interface FungibleAddition {
  itemType: string;
  itemName: string;
  deltaQuantity: number;
  targetQuantity: number;
  itemData: InventoryItemPayload;
}

interface FungibleDecrease {
  itemType: string;
  itemName: string;
  deltaQuantity: number;
  targetQuantity: number;
  itemData: InventoryItemPayload;
}

interface FungibleRemoval {
  itemType: string;
  itemName: string;
  quantity: number;
  itemData: InventoryItemPayload;
}

interface InventoryDeltaInput {
  add?: InventoryItemPayload[];
  delete?: InventoryItemPayload[];
}

function getFungibleKey(itemType: string, itemName: string) {
  return `${itemType.toLowerCase()}::${itemName.toLowerCase()}`;
}

function buildFungibleSnapshot(items: InventoryItemPayload[]) {
  const map = new Map<string, FungibleSnapshotEntry>();
  for (const item of items) {
    const itemType = String(item.type ?? item.itemType ?? 'unknown').toLowerCase();
    if (itemType === 'wearable') continue;
    const itemName = String(item.name ?? item.id ?? 'item');
    const quantity = Number(item.quantity) || 0;
    if (quantity <= 0) continue;
    const key = getFungibleKey(itemType, itemName);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }
    map.set(key, {
      itemType: item.type ?? item.itemType ?? itemType,
      itemName,
      quantity,
      itemData: item,
    });
  }
  return map;
}

function buildFungibleItemData(item: InventoryItemPayload, quantity: number) {
  return { ...item, quantity };
}

function applyFungibleDelta(
  previousItems: InventoryItemPayload[],
  additions: InventoryItemPayload[],
  deletions: InventoryItemPayload[]
) {
  const working = previousItems.map((item) => ({ ...item }));
  const sanitizeDeltaEntry = (item: InventoryItemPayload) => {
    const quantityRaw = Number(item.quantity);
    const quantity = Number.isFinite(quantityRaw) ? Math.max(1, Math.floor(quantityRaw)) : 1;
    const type = String(item.type ?? item.itemType ?? 'unknown').toLowerCase();
    const name = String(item.name ?? item.id ?? 'item');
    return {
      ...item,
      type,
      itemType: item.itemType ?? type,
      name,
      quantity,
    };
  };

  const applyDelta = (item: InventoryItemPayload, delta: number) => {
    const normalized = sanitizeDeltaEntry(item);
    if (normalized.type === 'wearable') {
      return;
    }
    const key = getFungibleKey(normalized.type, normalized.name);
    const index = working.findIndex(
      (entry) => getFungibleKey(String(entry.type ?? entry.itemType ?? ''), String(entry.name ?? entry.id ?? '')) === key
    );
    const currentQuantity = index >= 0 ? Number(working[index].quantity) || 0 : 0;
    const nextQuantity = Math.max(0, currentQuantity + delta);
    if (nextQuantity === 0) {
      if (index >= 0) {
        working.splice(index, 1);
      }
      return;
    }
    const updated = { ...normalized, quantity: nextQuantity };
    if (index >= 0) {
      working[index] = updated;
    } else {
      working.push(updated);
    }
  };

  additions.forEach((item) => {
    const quantity = Number(item.quantity) || 1;
    applyDelta(item, Math.abs(quantity));
  });
  deletions.forEach((item) => {
    const quantity = Number(item.quantity) || 1;
    applyDelta(item, -Math.abs(quantity));
  });

  return working;
}

function diffFungibleInventory(
  previousItems: InventoryItemPayload[],
  nextItems: InventoryItemPayload[]
): {
  additions: FungibleAddition[];
  decreases: FungibleDecrease[];
  removals: FungibleRemoval[];
} {
  const previousMap = buildFungibleSnapshot(previousItems);
  const nextMap = buildFungibleSnapshot(nextItems);
  const additions: FungibleAddition[] = [];
  const decreases: FungibleDecrease[] = [];
  const removals: FungibleRemoval[] = [];

  for (const [key, prevEntry] of previousMap.entries()) {
    const nextEntry = nextMap.get(key);
    if (!nextEntry) {
      removals.push({
        itemType: prevEntry.itemType,
        itemName: prevEntry.itemName,
        quantity: prevEntry.quantity,
        itemData: prevEntry.itemData,
      });
      continue;
    }
    if (nextEntry.quantity < prevEntry.quantity) {
      const deltaQuantity = prevEntry.quantity - nextEntry.quantity;
      decreases.push({
        itemType: prevEntry.itemType,
        itemName: prevEntry.itemName,
        deltaQuantity,
        targetQuantity: nextEntry.quantity,
        itemData: nextEntry.itemData,
      });
    }
  }

  for (const [key, nextEntry] of nextMap.entries()) {
    const prevEntry = previousMap.get(key);
    if (!prevEntry) {
      additions.push({
        itemType: nextEntry.itemType,
        itemName: nextEntry.itemName,
        deltaQuantity: nextEntry.quantity,
        targetQuantity: nextEntry.quantity,
        itemData: nextEntry.itemData,
      });
      continue;
    }
    if (nextEntry.quantity > prevEntry.quantity) {
      additions.push({
        itemType: nextEntry.itemType,
        itemName: nextEntry.itemName,
        deltaQuantity: nextEntry.quantity - prevEntry.quantity,
        targetQuantity: nextEntry.quantity,
        itemData: nextEntry.itemData,
      });
    }
  }

  return { additions, decreases, removals };
}

export function buildFungibleDeltaInput(
  previousItems: InventoryItemPayload[],
  nextItems: InventoryItemPayload[]
): InventoryDeltaInput {
  const { additions, decreases, removals } = diffFungibleInventory(
    previousItems,
    nextItems
  );
  const add = additions.map((entry) => ({
    itemType: entry.itemType,
    type: entry.itemType,
    name: entry.itemName,
    ...entry.itemData,
    quantity: entry.deltaQuantity,
  }));
  const deletionsFromDecreases = decreases.map((entry) => ({
    itemType: entry.itemType,
    type: entry.itemType,
    name: entry.itemName,
    quantity: entry.deltaQuantity,
  }));
  const deletionsFromRemovals = removals.map((entry) => ({
    itemType: entry.itemType,
    type: entry.itemType,
    name: entry.itemName,
    quantity: entry.quantity,
  }));
  return {
    add,
    delete: [...deletionsFromDecreases, ...deletionsFromRemovals],
  };
}

function cloneInventorySnapshot(items: InventoryItemPayload[]) {
  return items.map((item) => ({ ...item }));
}

function schedulePersistInventoryDelta(
  room: GameRoom,
  sessionId: string,
  previousItems: InventoryItemPayload[],
  nextItems: InventoryItemPayload[],
  auditSource?: string
) {
  const existing = pendingInventoryPersists.get(sessionId);
  if (existing) {
    existing.next = cloneInventorySnapshot(nextItems);
    if (typeof auditSource === 'string' && auditSource.trim().length > 0) {
      existing.sources.add(auditSource.trim());
    }
    return;
  }

  const entry = {
    previous: cloneInventorySnapshot(previousItems),
    next: cloneInventorySnapshot(nextItems),
    timeout: null as ReturnType<typeof setTimeout> | null,
    sources: new Set<string>(),
  };
  if (typeof auditSource === 'string' && auditSource.trim().length > 0) {
    entry.sources.add(auditSource.trim());
  }

  entry.timeout = setTimeout(() => {
    pendingInventoryPersists.delete(sessionId);
    const deltaInput = buildFungibleDeltaInput(entry.previous, entry.next);
    if (
      (!Array.isArray(deltaInput.add) || deltaInput.add.length === 0) &&
      (!Array.isArray(deltaInput.delete) || deltaInput.delete.length === 0)
    ) {
      return;
    }
    const resolvedAuditSource =
      entry.sources.size > 0
        ? Array.from(entry.sources.values()).sort().join('|')
        : undefined;
    void persistInventory(room, sessionId, deltaInput, resolvedAuditSource).catch(
      (error) => {
        console.error('Failed to persist inventory', {
          sessionId,
          error,
        });
      }
    );
  }, INVENTORY_PERSIST_DEBOUNCE_MS);

  pendingInventoryPersists.set(sessionId, entry);
}

export async function persistInventory(
  room: GameRoom,
  sessionId: string,
  itemsInput: InventoryDeltaInput,
  auditSource?: string
) {
  const playerId = getPlayerIdForSession(room, sessionId);
  if (!playerId) {
    return;
  }
  if (!itemsInput) {
    throw new Error('persistInventory requires a delta payload');
  }
  if (Array.isArray(itemsInput)) {
    console.warn('[Inventory] Ignoring array inventory payload; delta required', {
      playerId,
      sessionId,
      length: itemsInput.length,
    });
    return;
  }

  function normalizeDeltaEntry(item: InventoryItemPayload) {
    const quantityRaw = Number(item.quantity);
    const quantity = Number.isFinite(quantityRaw)
      ? Math.max(1, Math.floor(quantityRaw))
      : 1;
    const itemType = String(item.type ?? item.itemType ?? 'unknown');
    const name = String(item.name ?? item.id ?? 'item');
    return {
      ...item,
      itemType,
      type: itemType,
      name,
      quantity,
    };
  }

  // @ts-ignore - access private property
  const cachedItems =
    // @ts-ignore - access private property
    room.playerInventories.get(sessionId) ?? [];
  const deltaAdditionsRaw = Array.isArray(itemsInput?.add)
    ? itemsInput!.add!
    : [];
  const deltaDeletionsRaw = Array.isArray(itemsInput?.delete)
    ? itemsInput!.delete!
    : [];

  if (deltaAdditionsRaw.length === 0 && deltaDeletionsRaw.length === 0) {
    return;
  }

  const deltaAdditions = deltaAdditionsRaw
    .map((item) => normalizeDeltaEntry(item))
    .filter((item) => item.type !== 'wearable' && item.quantity > 0);
  const deltaDeletions = deltaDeletionsRaw
    .map((item) => normalizeDeltaEntry(item))
    .filter((item) => item.type !== 'wearable' && item.quantity > 0);

  if (deltaAdditions.length === 0 && deltaDeletions.length === 0) {
    return;
  }

  const normalizedNext = sanitizeInventoryPayloads(cachedItems);
  const normalizedPrevious = sanitizeInventoryPayloads(
    applyFungibleDelta(normalizedNext, deltaDeletions, deltaAdditions)
  );

  const player = room.state.players.get(sessionId);

  const summarizePotions = (list: InventoryItemPayload[]) => {
    return list.reduce(
      (summary, item) => {
        const type = String(item.type ?? item.itemType ?? '').toLowerCase();
        const name = String(item.name ?? '').toLowerCase();
        const quantity = Number(item.quantity) || 0;
        if (quantity <= 0) return summary;
        if (type !== 'potion' && !name.includes('potion')) return summary;
        if (name.includes('mana')) {
          summary.mana += quantity;
          return summary;
        }
        const tier = name.includes('ultra') ? 3 : name.includes('greater') ? 2 : 1;
        if (tier === 3) summary.tier3 += quantity;
        else if (tier === 2) summary.tier2 += quantity;
        else summary.tier1 += quantity;
        return summary;
      },
      { tier1: 0, tier2: 0, tier3: 0, mana: 0 }
    );
  };
  const potionSummary = summarizePotions(normalizedNext);
  if (
    potionSummary.tier1 > 0 ||
    potionSummary.tier2 > 0 ||
    potionSummary.tier3 > 0 ||
    potionSummary.mana > 0
  ) {
    console.warn('[Inventory] Persist inventory with potions', {
      playerId,
      sessionId,
      source: 'explicit',
      potionSummary,
      runStatus: player?.idleRoom?.runStatus,
      pid: process.pid,
    });
  }
  const prevPotionSummary = summarizePotions(normalizedPrevious);
  const potionDelta =
    prevPotionSummary.tier1 !== potionSummary.tier1 ||
    prevPotionSummary.tier2 !== potionSummary.tier2 ||
    prevPotionSummary.tier3 !== potionSummary.tier3 ||
    prevPotionSummary.mana !== potionSummary.mana;
  if (potionDelta) {
    const stack = new Error('persistInventory potion delta').stack;
    console.warn('[Inventory] Potion delta in persistInventory', {
      playerId,
      sessionId,
      source: 'explicit',
      previous: prevPotionSummary,
      next: potionSummary,
      runStatus: player?.idleRoom?.runStatus,
      pid: process.pid,
      stack,
    });
    await logInventoryDiff(room, playerId, normalizedPrevious, normalizedNext);
  }

  console.warn('[Inventory] Persist delta', {
    playerId,
    sessionId,
    source: 'explicit',
    additions: deltaAdditions.map((entry) => ({
      itemType: entry.itemType,
      itemName: entry.name,
      deltaQuantity: entry.quantity,
    })),
    deletions: deltaDeletions.map((entry) => ({
      itemType: entry.itemType,
      itemName: entry.name,
      deltaQuantity: entry.quantity,
    })),
  });

  try {
    await runTransaction(async (client) => {
      for (const deletion of deltaDeletions) {
        await inventoryRepo.decrementInventoryItem(
          playerId,
          deletion.itemType,
          deletion.name,
          deletion.quantity,
          client
        );
      }

      for (const addition of deltaAdditions) {
        await inventoryRepo.upsertInventoryItem({
          playerId,
          itemType: addition.itemType,
          itemName: addition.name,
          quantity: addition.quantity,
          itemData: buildFungibleItemData(addition, addition.quantity),
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

export async function logInventoryDiff(
  room: GameRoom,
  playerId: string,
  previous: InventoryItemPayload[],
  next: InventoryItemPayload[]
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
          reason: 'server_delta',
          // @ts-ignore - access private property
          gameId: room.currentGameId ?? null,
          metadata: {
            previousQuantity: prev.quantity,
            newQuantity: curr.quantity,
            roomId: room.state.id,
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

export async function applyInventoryDelta(
  room: GameRoom,
  sessionId: string,
  rawItem: InventoryItemPayload,
  delta: number,
  options: {
    entityId?: string | null;
    distributionId?: string | null;
    auditSource?: string;
  } = {}
) {
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }

  const playerId = getPlayerIdForSession(room, sessionId);
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
    // @ts-ignore - access private property
    const mapping = room.entityLootDistributions.get(options.entityId);
    if (mapping) {
      distributionId = mapping.distributionId;
      distributionMetadata = mapping.metadata ?? null;
      lootSource = mapping.source ?? lootSource;
      mappedPlayerId = mapping.playerId ?? null;

      if (mapping.timeout) {
        clearTimeout(mapping.timeout);
      }
      // @ts-ignore - access private property
      room.entityLootDistributions.delete(options.entityId);
    }
  }

  const normalizedType = String(
    sanitizedItem.type ?? sanitizedItem.itemType ?? 'unknown'
  ).toLowerCase();
  const normalizedName = String(sanitizedItem.name ?? '').toLowerCase();
  const isWearable = normalizedType === 'wearable';

  const resolvedDelta = isWearable
    ? delta > 0
      ? Math.max(1, Math.floor(delta))
      : Math.min(-1, Math.ceil(delta))
    : delta;

  if (!Number.isFinite(resolvedDelta) || resolvedDelta === 0) {
    return;
  }

  if (normalizedType === 'potion' && resolvedDelta > 0) {
    console.warn('[Inventory] Potion added', {
      playerId,
      sessionId,
      itemType: sanitizedItem.itemType ?? sanitizedItem.type,
      itemName: sanitizedItem.name ?? sanitizedItem.itemName,
      quantity: resolvedDelta,
      source: lootSource,
      entityId: options.entityId ?? null,
      distributionId,
      distributionMetadata,
      mappedPlayerId,
    });
  }

  // @ts-ignore - access private property
  const previous = room.playerInventories.get(sessionId) || [];
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
      const lowered = typeof quality === 'string' ? quality.toLowerCase() : '';
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
          (typeof item.inventoryItemId === 'string' && item.inventoryItemId) ||
          (typeof item.id === 'string' && item.id) ||
          (typeof item.instanceId === 'string' && item.instanceId) ||
          null;
        const itemSlug = String(
          item.wearableSlug ?? item.name ?? ''
        ).toLowerCase();

        // Match by ID if both exist and match
        const matchesId =
          targetId && candidateId ? candidateId === targetId : false;
        // Fall back to slug matching (regardless of whether targetId exists)
        // This handles cases where the target ID was auto-generated and doesn't match DB IDs
        const matchesSlug = targetSlug ? itemSlug === targetSlug : false;

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
    const key = getInventoryKey(sanitizedItem);

    const index = working.findIndex(
      (existing) => getInventoryKey(existing) === key
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

  // @ts-ignore - access private property
  room.playerInventories.set(sessionId, next);

  const player = room.state.players.get(sessionId);
  if (player) {
    player.lickTongueCount = getLickTongueCount(next);
    player.healthPotionCount = getHealthPotionCount(next);
    player.manaPotionCount = getManaPotionCount(next);
  }

  try {
    await logInventoryDiff(room, playerId, previous, next);
    schedulePersistInventoryDelta(
      room,
      sessionId,
      previous,
      next,
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
            // @ts-ignore - access private property
            gameId: room.currentGameId ?? null,
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
    recordCoinsCollected(room, sessionId, resolvedDelta);
    logEconomyTransaction(room, {
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
      const baseUnits = parseAmountToBaseUnits(usdcAmount, usdcConfig.decimals);
      if (baseUnits > 0n) {
        recordUsdcEarned(room, sessionId, Number(baseUnits));
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
          // @ts-ignore - access private property
          gameId: room.currentGameId,
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
            economyTransactionId: economyTransactionId ?? undefined,
            metadata: sharedMetadata,
          });
        } catch (error) {
          console.error('Failed to create USDC withdrawal record', {
            playerId,
            baseUnits: baseUnits.toString(),
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
      const baseUnits = parseAmountToBaseUnits(ghstAmount, ghstConfig.decimals);
      const amountString = formatBaseUnits(baseUnits, ghstConfig.decimals);
      const sharedMetadata: Record<string, unknown> = {
        ...(distributionMetadata ?? {}),
        mappedPlayerId,
        claimedQuantity: resolvedDelta,
        ghstAmount,
        ghstBaseUnits: Number(baseUnits),
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
          // @ts-ignore - access private property
          gameId: room.currentGameId,
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
        try {
          await tokenWithdrawalsRepo.createTokenWithdrawal({
            playerId,
            currency: 'GHST',
            amount: amountString,
            amountBaseUnits: baseUnits,
            source: lootSource,
            economyTransactionId: economyTransactionId ?? undefined,
            metadata: sharedMetadata,
          });
        } catch (error) {
          console.error('Failed to create GHST withdrawal record', {
            playerId,
            baseUnits: baseUnits.toString(),
            error,
          });
        }
      }
    }
  }
}

// --- Game Metrics & Stats ---

export function recordCoinsCollected(
  room: GameRoom,
  sessionId: string,
  amount: number
) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.coinsCollected += Math.round(amount);
}

export function recordUsdcEarned(
  room: GameRoom,
  sessionId: string,
  amountBaseUnits: number
) {
  if (!Number.isFinite(amountBaseUnits) || amountBaseUnits <= 0) return;
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.usdcEarnedBaseUnits += Math.round(amountBaseUnits);
}

export function recordKill(room: GameRoom, sessionId: string) {
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.kills += 1;
  sendKillCountUpdate(room, sessionId, stats.kills);
}

export function recordPlayerDeathStat(room: GameRoom, sessionId: string) {
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.deaths += 1;
}

export function recordXpGain(
  room: GameRoom,
  sessionId: string,
  amount: number,
  resultingLevel: number
) {
  if (amount <= 0) return;
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.xpGained += amount;
  stats.levelEnd = resultingLevel;
}

export function recordLevelSnapshot(
  room: GameRoom,
  sessionId: string,
  level: number
) {
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
  if (!stats) return;
  stats.levelEnd = level;
}

export function sendKillCountUpdate(
  room: GameRoom,
  sessionId: string,
  kills: number
) {
  const client = getClientBySessionId(room, sessionId);
  if (client) {
    room.msg.sendTo(client, 'kill_count_updated', { kills });
  }
}

export function mapShopItemToResult(
  shopItem: ShopItemDefinition,
  quantity: number
): Record<string, unknown> {
  const type = String(
    shopItem.grant.type ?? shopItem.grant.itemType ?? 'material'
  ).toLowerCase();

  const color =
    (typeof shopItem.grant.color === 'string'
      ? shopItem.grant.color
      : undefined) ?? getDefaultItemColor(type);

  const wearableSlug =
    (shopItem.grant as Record<string, unknown>).wearableSlug &&
    typeof (shopItem.grant as Record<string, unknown>).wearableSlug === 'string'
      ? ((shopItem.grant as Record<string, unknown>).wearableSlug as string)
      : undefined;

  return {
    id: shopItem.grant.id ?? `${type}:${shopItem.grant.name ?? shopItem.label}`,
    name: shopItem.grant.name ?? shopItem.label,
    type,
    quantity,
    color,
    description: shopItem.description ?? shopItem.grant.description,
    rarity: shopItem.grant.rarity,
    wearableId: shopItem.grant.wearableId,
    wearableSlug,
    imageUrl: shopItem.grant.imageUrl,
    spriteId: shopItem.grant.spriteId,
  };
}

export function logEconomyTransaction(
  room: GameRoom,
  options: {
    playerId: string;
    currency: string;
    amount: number;
    source: string;
    gameId?: string | null;
    lootDistributionId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  if (!options.playerId) return;
  void economyRepo
    .logTransaction({
      playerId: options.playerId,
      currency: options.currency,
      amount: options.amount,
      source: options.source,
      // @ts-ignore - access private property
      gameId: options.gameId ?? room.currentGameId,
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

export async function flushGamePlayerStats(
  room: GameRoom,
  sessionId: string,
  options: { markLeft?: boolean } = {}
) {
  // @ts-ignore - access private property
  const stats = room.gamePlayerStats.get(sessionId);
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
      // Reset deltas
      stats.kills = 0;
      stats.deaths = 0;
      stats.damageDealt = 0;
      stats.damageTaken = 0;
      stats.coinsCollected = 0;
      stats.usdcEarnedBaseUnits = 0;
      stats.xpGained = 0;
      stats.levelStart = stats.levelEnd;
    } catch (error) {
      console.error('Failed to flush game player stats', {
        sessionId,
        error,
      });
    }
  }
}

// --- Progression System ---

export function getProgressionProfile(
  room: GameRoom,
  sessionId: string
): ProgressionProfile {
  // @ts-ignore - access private property
  const stored = room.playerProgression.get(sessionId);
  return stored ? cloneProfile(stored) : createDefaultProfile();
}

export function setProgressionProfile(
  room: GameRoom,
  sessionId: string,
  profile: ProgressionProfile,
  options: { persist?: boolean } = {}
) {
  // @ts-ignore - access private property
  room.playerProgression.set(sessionId, cloneProfile(profile));
  if (options.persist) {
    void persistProgression(room, sessionId, profile);
  }
}

export function applyProgressionToPlayer(
  room: GameRoom,
  sessionId: string,
  options: { fullHeal?: boolean } = {}
) {
  const player = room.state.players.get(sessionId);
  if (!player) return;

  const profile = getProgressionProfile(room, sessionId);
  const modifiers = computeProgressionModifiers(profile.stats);
  // @ts-ignore - access private property
  const killStreakProfile = room.killStreakBySession.get(sessionId);
  const leverage = getRewardLeverageMultiplier(
    player,
    leverageGetLeverageTotal(room)
  );
  const killStreakModifiers = killStreakProfile
    ? computeKillStreakModifiers(
        killStreakProfile.archetypeId,
        killStreakProfile.units,
        leverage
      )
    : undefined;
  syncPlayerCharacterStats(player, {
    fullHeal: options.fullHeal,
    preserveHealthRatio: !options.fullHeal,
    progressionModifiers: modifiers,
    killStreakModifiers,
  });
}

export function getUnlockedTiersFromPlayer(
  room: GameRoom,
  sessionId: string
): string[] {
  const player = room.state.players.get(sessionId);
  if (!player) {
    return ['normal']; // Default
  }
  const parsed = safeParseJson<string[]>(player.unlockedTiers, ['normal']);
  return parsed.length > 0 ? parsed : ['normal'];
}

export async function withProgressionWriteLock<T>(
  room: GameRoom,
  playerId: string,
  task: () => Promise<T>
): Promise<T> {
  return room.withProgressionWriteLock(playerId, task);
}

export async function persistProgression(
  room: GameRoom,
  sessionId: string,
  profileInput?: ProgressionProfile
) {
  const playerId = getPlayerIdForSession(room, sessionId);
  if (!playerId) {
    return;
  }

  // @ts-ignore - access private property
  const profile = profileInput ?? room.playerProgression.get(sessionId);
  if (!profile) {
    return;
  }

  const player = room.state.players.get(sessionId);

  // CRITICAL: If player is no longer in the room state, we cannot safely
  // determine their characterId or equipment state. Skip equipment sync entirely
  // to prevent data corruption from race conditions where async persistProgression
  // calls execute after the player has disconnected and been removed from state.
  if (!player) {
    console.warn(
      '[persistProgression] Player not found in room state - skipping equipment sync to prevent data corruption',
      {
        playerId,
        sessionId,
      }
    );

    // Still persist core progression data (XP, level, stats) but DO NOT touch
    // derivedStats or equippedWearables - this preserves the last valid equipment state
    const lastSyncedAtIso =
      typeof profile.lastSyncedAt === 'number'
        ? new Date(profile.lastSyncedAt).toISOString()
        : null;

    await withProgressionWriteLock(room, playerId, async () => {
      try {
        await progressionRepo.updateProgression(playerId, {
          level: profile.level,
          totalXp: profile.totalXp,
          unspentPoints: profile.unspentPoints,
          statAllocations: profile.stats,
          allocationHistory: profile.allocationHistory,
          lastSyncedAt: lastSyncedAtIso,
          // Intentionally NOT updating: lickTongueCount, derivedStats, equippedWearables
          // to avoid overwriting valid data with empty/stale data
        });
      } catch (error) {
        console.error('Failed to persist progression (player gone)', {
          playerId,
          sessionId,
          error,
        });
      }
    });
    return;
  }

  // Player exists - normal flow with full equipment sync
  const lickTongueCount = player.lickTongueCount ?? 0;
  const unlockedTiers = getUnlockedTiersFromPlayer(room, sessionId);
  player.unlockedTiers = JSON.stringify(unlockedTiers);

  const derivedStats = safeParseJson<Record<string, unknown>>(
    player.derivedStats,
    {}
  );
  const equippedWearables = safeParseJson<unknown[]>(
    player.equippedWearables,
    []
  );
  const equipmentAssignments = mapStoredWearablesToAssignments(
    player.equippedWearables,
    []
  );

  const equipmentSignature = equipmentAssignments
    .map(
      (item) =>
        `${item.slot}::${item.slug}::${Number(item.durabilityScore ?? -1)}`
    )
    .sort();
  // @ts-ignore - access private property
  const previousSignature = room.playerEquipmentSnapshots.get(playerId);
  const equipmentChanged =
    !previousSignature ||
    previousSignature.length !== equipmentSignature.length ||
    previousSignature.some(
      (value: string, index: number) => value !== equipmentSignature[index]
    );

  const lastSyncedAtIso =
    typeof profile.lastSyncedAt === 'number'
      ? new Date(profile.lastSyncedAt).toISOString()
      : null;

  await withProgressionWriteLock(room, playerId, async () => {
    try {
      await progressionRepo.updateProgression(playerId, {
        level: profile.level,
        totalXp: profile.totalXp,
        unspentPoints: profile.unspentPoints,
        lickTongueCount,
        statAllocations: profile.stats,
        derivedStats,
        equippedWearables,
        allocationHistory: profile.allocationHistory,
        lastSyncedAt: lastSyncedAtIso,
      });

      if (equipmentChanged) {
        // @ts-ignore - access private property
        room.playerEquipmentSnapshots.set(playerId, equipmentSignature);
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

// --- Kill Streak System ---

export function sendKillStreakProfileToClient(
  room: GameRoom,
  sessionId: string,
  profileInput?: KillStreakProfile
) {
  const client = getClientBySessionId(room, sessionId);
  if (!client) return;
  // @ts-ignore - access private property
  const profile = profileInput ?? room.killStreakBySession.get(sessionId);
  if (!profile) return;
  room.msg.sendTo(client, 'kill_streak:profile', {
    units: profile.units,
    archetypeId: profile.archetypeId,
  });
}

export function sendKillStreakResetToClient(
  room: GameRoom,
  sessionId: string,
  reason?: string
) {
  const client = getClientBySessionId(room, sessionId);
  if (!client) return;
  room.msg.sendTo(client, 'kill_streak:reset', {
    reason: reason ?? 'reset',
  });
}

export function ensureKillStreakForPlayer(
  room: GameRoom,
  sessionId: string,
  player: PlayerSchema,
  options: { reset?: boolean; sendProfile?: boolean } = {}
): KillStreakProfile | null {
  // @ts-ignore - access private property
  if (room.phase !== 'in_game') {
    if (options.reset) {
      // @ts-ignore - access private property
      room.killStreakBySession.delete(sessionId);
    }
    return null;
  }

  const archetypeId = resolveArchetypeForCharacter(player.characterId);
  // @ts-ignore - access private property
  const existing = room.killStreakBySession.get(sessionId);
  const shouldReset =
    options.reset || !existing || existing.archetypeId !== archetypeId;

  const profile = shouldReset
    ? createKillStreakProfile(archetypeId)
    : existing!;

  if (shouldReset) {
    // @ts-ignore - access private property
    room.killStreakBySession.set(sessionId, profile);
  }

  if (options.sendProfile !== false) {
    sendKillStreakProfileToClient(room, sessionId, profile);
  }

  return profile;
}

export function resetKillStreakForSession(
  room: GameRoom,
  sessionId: string,
  options: { reason?: string; reinitialize?: boolean } = {}
): KillStreakProfile | null {
  const player = room.state.players.get(sessionId);
  if (options.reason) {
    sendKillStreakResetToClient(room, sessionId, options.reason);
  } else {
    sendKillStreakResetToClient(room, sessionId);
  }
  // @ts-ignore - access private property
  room.killStreakBySession.delete(sessionId);
  if (player) {
    applyProgressionToPlayer(room, sessionId, { fullHeal: false });
  }

  const shouldReinitialize =
    // @ts-ignore - access private property
    options.reinitialize === true && room.phase === 'in_game' && player;

  if (shouldReinitialize && player) {
    return ensureKillStreakForPlayer(room, sessionId, player, {
      reset: true,
      sendProfile: true,
    });
  }

  return null;
}

export function resetKillStreakForAllPlayers(
  room: GameRoom,
  options: { reason?: string } = {}
) {
  const reason = options.reason;
  room.state.players.forEach((_player, sessionId) => {
    // @ts-ignore - access private property
    room.killStreakBySession.delete(sessionId);
    sendKillStreakResetToClient(room, sessionId, reason);
    applyProgressionToPlayer(room, sessionId, { fullHeal: false });
  });
  // @ts-ignore - access private property
  room.killStreakBySession.clear();
}

export function awardKillStreakUnitsToPlayer(
  room: GameRoom,
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
  // @ts-ignore - access private property
  if (room.phase !== 'in_game') return;
  const player = room.state.players.get(sessionId);
  if (!player) return;

  const profile =
    ensureKillStreakForPlayer(room, sessionId, player, {
      sendProfile: false,
    }) ?? undefined;
  if (!profile) return;

  const { profile: nextProfile, deltaUnits } = applyKillStreakIncrement(
    profile,
    unitDelta
  );
  if (deltaUnits === 0) {
    // @ts-ignore - access private property
    room.killStreakBySession.set(sessionId, nextProfile);
    return;
  }

  // @ts-ignore - access private property
  room.killStreakBySession.set(sessionId, nextProfile);
  applyProgressionToPlayer(room, sessionId, { fullHeal: false });

  const client = getClientBySessionId(room, sessionId);
  if (client) {
    room.msg.sendTo(client, 'kill_streak:updated', {
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

export function updateKillStreakDecay(room: GameRoom, now: number) {
  // @ts-ignore - access private property
  if (room.killStreakBySession.size === 0) {
    return;
  }

  // @ts-ignore - access private property
  room.killStreakBySession.forEach(
    (profile: KillStreakProfile, sessionId: string) => {
      const previousUnits = profile.units;
      const previousFloor = Math.floor(previousUnits);
      const { profile: nextProfile, deltaUnits } = applyKillStreakDecay(
        profile,
        now
      );

      // @ts-ignore - access private property
      room.killStreakBySession.set(sessionId, nextProfile);

      if (deltaUnits === 0) {
        return;
      }

      const nextFloor = Math.floor(nextProfile.units);
      const shouldBroadcast =
        nextFloor !== previousFloor || nextProfile.units <= 0;

      applyProgressionToPlayer(room, sessionId, { fullHeal: false });

      if (shouldBroadcast) {
        const client = getClientBySessionId(room, sessionId);
        if (client && shouldBroadcast) {
          room.msg.sendTo(client, 'kill_streak:updated', {
            units: nextProfile.units,
            deltaUnits,
            archetypeId: nextProfile.archetypeId,
            source: {
              type: 'decay',
            },
          });
        }
      }
    }
  );
}

// --- Equipment System ---

export function getHandWeaponEntriesForPlayer(
  room: GameRoom,
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
      typeof weapon.slug === 'string' ? weapon.slug : String(weapon.slug ?? '');
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

export function resolveCurrentHandWeaponIndex(
  room: GameRoom,
  player: PlayerSchema,
  weapons: Array<{ slot: 'handLeft' | 'handRight'; slug: string }>
): number {
  return resolvePreferredHandWeaponIndex(player.activeWeaponIndex, weapons);
}

export function selectActiveWeaponByIndex(
  room: GameRoom,
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

export function handleWeaponCycle(room: GameRoom, client: Client) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const weapons = getHandWeaponEntriesForPlayer(room, player);
  if (weapons.length === 0) {
    selectActiveWeaponByIndex(room, player, weapons, -1);
    return;
  }

  const currentIndex = resolveCurrentHandWeaponIndex(room, player, weapons);
  const nextIndex =
    weapons.length <= 1 ? currentIndex : (currentIndex + 1) % weapons.length;

  selectActiveWeaponByIndex(room, player, weapons, nextIndex);
  client.send('weapon_switched', {
    attackType: player.attackType,
    activeIndex: player.activeWeaponIndex,
  });
}

export function handleSetActiveWeapon(
  room: GameRoom,
  client: Client,
  data: { index?: number }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const weapons = getHandWeaponEntriesForPlayer(room, player);
  if (weapons.length === 0) {
    selectActiveWeaponByIndex(room, player, weapons, -1);
    return;
  }

  const requested =
    data && typeof data.index === 'number' && Number.isFinite(data.index)
      ? Math.floor(data.index)
      : 0;
  const boundedIndex = Math.max(0, Math.min(requested, weapons.length - 1));
  const currentIndex = resolveCurrentHandWeaponIndex(room, player, weapons);
  if (boundedIndex === currentIndex) {
    return;
  }

  selectActiveWeaponByIndex(room, player, weapons, boundedIndex);
  client.send('weapon_switched', {
    attackType: player.attackType,
    activeIndex: player.activeWeaponIndex,
  });
}

export function equipmentCanModify(room: GameRoom, playerId: string) {
  const sessions = getSessionIdsForPlayer(room, playerId);
  if (sessions.length === 0) {
    // @ts-ignore - access private property
    return { allowed: true, phase: room.phase };
  }

  // @ts-ignore - access private property
  if (room.phase === 'in_game') {
    return {
      allowed: false,
      // @ts-ignore - access private property
      phase: room.phase,
      reason: 'Equipment changes are disabled during an active run',
    };
  }

  // @ts-ignore - access private property
  return { allowed: true, phase: room.phase };
}

export function equipmentBroadcastUpdate(
  room: GameRoom,
  payload: EquipmentBroadcastPayload
) {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const sessions = getSessionIdsForPlayer(room, payload.playerId);
  if (sessions.length === 0) {
    return;
  }

  const signature = payload.equipment
    .map(
      (entry) =>
        `${entry.slot}::${entry.slug}::${Number(entry.durabilityScore ?? -1)}`
    )
    .sort();
  // @ts-ignore - access private property
  room.playerEquipmentSnapshots.set(payload.playerId, signature);

  for (const sessionId of sessions) {
    const player = room.state.players.get(sessionId);
    if (!player) {
      continue;
    }

    player.equippedWearables = JSON.stringify(payload.equippedWearables);
    player.derivedStats = JSON.stringify(payload.derivedStats);

    applyProgressionToPlayer(room, sessionId, { fullHeal: false });

    const client = getClientBySessionId(room, sessionId);
    if (client) {
      room.msg.sendTo(client, 'equipment_updated', {
        equipment: payload.equipment,
        overrides: payload.overrides,
        version: payload.version,
      });
      room.msg.sendTo(client, 'stats_updated', {
        derivedStats: payload.derivedStats,
      });
    }
  }
}

// --- Messaging & Communication ---

export function handleEmote(room: GameRoom, client: Client, input: any) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  // Broadcast emote to all players
  room.msg.broadcast('player_emote', {
    playerId: client.sessionId,
    emoteId: input.id,
    x: player.x,
    y: player.y,
  });
}

export function handleChat(
  room: GameRoom,
  client: Client,
  message: { text: string }
) {
  const player = room.state.players.get(client.sessionId);
  if (!player || !message.text || message.text.length > 200) return;

  // Broadcast chat message
  room.msg.broadcast('chat_message', {
    playerId: client.sessionId,
    playerName: player.name,
    text: message.text,
    timestamp: Date.now(),
  });
}

export function broadcastSnapshot(room: GameRoom) {
  // Colyseus handles state synchronization automatically
  // This is a no-op placeholder for compatibility
}

// --- Utility Methods ---

export function generateRoomCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function getCurrentClientCount(room: GameRoom): number {
  const clientsAny = room.clients as any;
  if (Array.isArray(clientsAny)) return clientsAny.length;
  if (typeof clientsAny?.size === 'number') return clientsAny.size;
  if (typeof clientsAny?.length === 'number') return clientsAny.length;
  return room.state?.players?.size || 0;
}

export function normalizeCurrencyType(value: unknown): string {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized) {
      return normalized;
    }
  }
  return 'coin';
}

export function normalizeCurrencyName(
  value: string | null | undefined
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function currencyNamesMatch(
  existingName: string | null | undefined,
  targetName: string | null | undefined
): boolean {
  const normalizedExisting = normalizeCurrencyName(existingName);
  const normalizedTarget = normalizeCurrencyName(targetName);
  if (!normalizedExisting || !normalizedTarget) {
    return false;
  }
  if (normalizedExisting === normalizedTarget) {
    return true;
  }
  if (
    GOLD_NAME_ALIASES.has(normalizedExisting) &&
    GOLD_NAME_ALIASES.has(normalizedTarget)
  ) {
    return true;
  }
  return false;
}

export function getDefaultItemColor(type: string): string {
  const normalized = String(type ?? '').toLowerCase();
  const palette = ITEM_COLORS as Record<string, string>;
  return palette[normalized] ?? '#ffffff';
}

export function isGoldCurrencyItem(
  item: InventoryItemPayload | null | undefined,
  currencyName?: string | null
): boolean {
  if (!item) {
    return false;
  }
  const typeRaw = item.type ?? item.itemType;
  const normalizedType =
    typeof typeRaw === 'string' ? typeRaw.trim().toLowerCase() : '';
  if (normalizedType && GOLD_CURRENCY_TYPES.has(normalizedType)) {
    if (!currencyName) {
      return true;
    }
    return currencyNamesMatch(item.name ?? item.id, currencyName);
  }
  if (!currencyName) {
    return false;
  }
  // Fallback to name-based matching for legacy data.
  return currencyNamesMatch(item.name ?? item.id, currencyName);
}

export function getCurrencyQuantity(
  inventory: InventoryItemPayload[] | undefined,
  currencyName: string
): number {
  if (!inventory || inventory.length === 0) {
    return 0;
  }

  return inventory.reduce((total, item) => {
    if (!isGoldCurrencyItem(item, currencyName)) {
      return total;
    }
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity)) {
      return total;
    }
    return total + Math.max(0, Math.floor(quantity));
  }, 0);
}

export function findCurrencyInventoryItem(
  inventory: InventoryItemPayload[] | undefined,
  currencyName: string
): InventoryItemPayload | undefined {
  if (!inventory) {
    return undefined;
  }

  return inventory.find((item) => isGoldCurrencyItem(item, currencyName));
}

export function getDifficultyXpMultiplier(room: GameRoom): number {
  const difficulty = getDifficultyTier(room.state.difficultyTier);
  return difficulty?.xpMultiplier ?? 1;
}

export function getGroupXpMultiplier(partySize: number): number {
  if (partySize <= 1) return 1;
  const bonus = Math.min(0.75, (partySize - 1) * 0.15);
  return 1 + bonus;
}

// --- Lifecycle Helpers ---

export async function createGameRecord(
  room: GameRoom,
  options: GameRoomOptions = {}
) {
  // @ts-ignore - access private property
  if (room.currentGameId) {
    // @ts-ignore - access private property
    room.gameStatusFinalized = false;
    // @ts-ignore - access private property
    room.persistGameMetrics({ syncState: true });
    return;
  }

  // @ts-ignore - access private property
  const startedAt = room.state.startedAt || Date.now();
  const record = await gamesRepo.create({
    roomId: room.state.id,
    seed: room.state.seed,
    region: room.state.region,
    difficultyTier: room.state.difficultyTier,
    status: 'active',
    // @ts-ignore - access private property
    isPrivate: room.isPrivateRoom,
    // @ts-ignore - access private property
    maxPlayers: room.maxClients,
    startedAtIso: new Date(startedAt).toISOString(),
    // @ts-ignore - access private property
    phase: room.phase,
    // @ts-ignore - access private property
    phaseChangedAtIso: new Date(room.phaseChangedAt).toISOString(),
    // @ts-ignore - access private property
    runStartedAtIso: room.runStartedAt
      ? // @ts-ignore - access private property
        new Date(room.runStartedAt).toISOString()
      : null,
    lateJoinCutoffAtIso:
      room.state.lateJoinCutoffAt > 0
        ? new Date(room.state.lateJoinCutoffAt).toISOString()
        : null,
    autoCloseAtIso:
      room.state.autoCloseAt > 0
        ? new Date(room.state.autoCloseAt).toISOString()
        : null,
    startedByPlayerId: room.state.startedByPlayerId || null,
    metadata: {
      roomCode: room.state.roomCode,
      colyseusRoomId: room.roomId,
    },
  });

  // @ts-ignore - access private property
  room.currentGameId = record.id;
  // @ts-ignore - access private property
  room.gameStatusFinalized = false;
  // @ts-ignore - access private property
  room.persistGameMetrics({ syncState: true });
}

export async function registerGamePlayer(
  room: GameRoom,
  sessionId: string,
  playerId: string,
  profile: ProgressionProfile,
  player: PlayerSchema
) {
  const isCompetitionRun = player.dailyQuestActive === true;
  const shouldEnforceRuns = !shouldSkipEntryFee(player);
  const shouldConsumeProgressionRun = !isCompetitionRun;

  const ensureCompetitionRunsAvailable = async () => {
    const competitionTier = getCompetitionTier(room.state.difficultyTier);
    if (!competitionTier) {
      return;
    }
    const date = getCompetitionDate();
    const config = getDailyQuestCompetitionConfig();
    const { hasRemaining, remaining } =
      await dailyQuestLeaderboardRepo.hasRemainingDailyRuns(
        date,
        playerId,
        config.dailyRunsPerDay
      );
    if (!hasRemaining) {
      const limitError: any = new Error(
        `No competition runs remaining today. Try again tomorrow.`
      );
      limitError.code = 'NO_COMPETITION_RUNS_REMAINING';
      limitError.remainingRuns = remaining;
      throw limitError;
    }
  };

  const consumeProgressionRun = async () => {
    const config = getDailyRunsConfig();
    if (!config.enabled) {
      return;
    }
    const date = getDailyRunsDate();
    const stakedBalances = await depositsRepo.getStakedUnlockBalances(playerId);
    const totalStaked = stakedBalances.total;
    const baseAllowedRuns = getDailyRunAllowance({
      usdcStaked: totalStaked,
      tiers: config.tiers,
    });
    const bonusRunsRaw = await playerDailyRunBonusRepo.getBonusRuns({
      accountId: playerId,
      date,
      mode: 'progression',
    });
    const bonusRuns = Number.isFinite(bonusRunsRaw)
      ? Math.max(0, Math.floor(bonusRunsRaw))
      : 0;
    const allowedRuns = Math.max(0, Math.floor(baseAllowedRuns) + bonusRuns);
    const result = await playerDailyRunsRepo.consumeDailyRun({
      accountId: playerId,
      date,
      allowedRuns,
    });
    if (!result.success) {
      const resetAtUtc = getDailyRunsResetAt();
      const payload = {
        code: 'DAILY_RUNS_EXHAUSTED',
        resetAtUtc,
        allowedRuns,
        baseAllowedRuns,
        bonusRuns,
        usedRuns: result.usedRuns,
        usdcStaked: stakedBalances.usdc,
        ghoStaked: stakedBalances.gho,
        totalStaked,
      };
      const limitError: any = new Error(JSON.stringify(payload));
      limitError.code = payload.code;
      limitError.resetAtUtc = resetAtUtc;
      limitError.allowedRuns = allowedRuns;
      limitError.usedRuns = result.usedRuns;
      limitError.usdcStaked = stakedBalances.usdc;
      limitError.ghoStaked = stakedBalances.gho;
      limitError.totalStaked = totalStaked;
      throw limitError;
    }
  };

  // @ts-ignore - access private property
  if (!room.currentGameId) {
    console.warn(
      '[registerGamePlayer] No currentGameId yet, skipping game_players record',
      {
        playerId,
        sessionId,
      }
    );
    // Gate entry by competition runs only. Do NOT consume progression runs—
    // we never create a game_players record here; consuming would burn a run.
    if (shouldEnforceRuns && isCompetitionRun) {
      await ensureCompetitionRunsAvailable();
    }
    // WARN: If player has dailyQuestActive but no game_id, attunement cannot be recorded
    // This is a very rare race condition that only happens if createGameRecord fails
    if (isCompetitionRun) {
      console.warn(
        '[registerGamePlayer] Cannot record attunement - no gameId (race condition)',
        {
          playerId,
          sessionId,
          difficultyTier: room.state.difficultyTier,
        }
      );
    }
    return;
  }

  const existingRecord = await gamePlayersRepo.getByGameAndPlayer(
    // @ts-ignore - access private property
    room.currentGameId,
    playerId
  );

  // Deduct daily runs when starting a new run (no existing record).
  // Progression mode consumes runs; competition uses 3/day limit.
  let dailyRunDeducted = false;
  if (!existingRecord && shouldEnforceRuns) {
    if (isCompetitionRun) {
      await ensureCompetitionRunsAvailable();
    } else if (shouldConsumeProgressionRun) {
      await consumeProgressionRun();
      dailyRunDeducted = true;
      console.log('[registerGamePlayer] Daily run deducted', {
        playerId,
        sessionId,
      });
    }
  }

  // Record daily quest run usage when entering the dungeon
  // Players get a fixed number of runs per day (default 3) across all tiers
  if (isCompetitionRun) {
    const competitionTier = getCompetitionTier(room.state.difficultyTier);
    // @ts-ignore - access private property
    const gameId = room.currentGameId;
    if (competitionTier && gameId) {
      const date = getCompetitionDate();
      const config = getDailyQuestCompetitionConfig();
      try {
        const { recorded, alreadyUsed, runsUsed, runsRemaining } =
          await dailyQuestLeaderboardRepo.recordAttunementUsage(
            date,
            competitionTier,
            playerId,
            gameId,
            config.dailyRunsPerDay
          );
        console.log('[DailyQuestCompetition] Recorded daily run on dungeon entry', {
          playerId,
          date,
          tier: competitionTier,
          gameId,
          recorded,
          alreadyUsed,
          runsUsed,
          runsRemaining,
        });
        if (!recorded && alreadyUsed) {
          player.dailyQuestActive = false;
          console.log(
            '[DailyQuestCompetition] Daily run limit reached; disabling competition for this run',
            {
              playerId,
              date,
              tier: competitionTier,
              gameId,
              recorded,
              alreadyUsed,
              runsUsed,
              runsRemaining,
            }
          );
        }
      } catch (error) {
        console.error('[DailyQuestCompetition] Failed to record daily run', {
          playerId,
          error,
        });
      }
    }
  }

  const joinMetadata: Record<string, unknown> = {
    wallet: player.wallet || null,
    sessionId,
    ...(dailyRunDeducted && { dailyRunConsumed: true }),
    ...(!existingRecord && {
      durability: {
        currentRunOrdinal: 1,
        settledRunOrdinal: 0,
      },
    }),
  };

  const record = await gamePlayersRepo.join({
    // @ts-ignore - access private property
    gameId: room.currentGameId,
    playerId,
    characterId: player.characterId,
    levelBefore: profile.level,
    metadata: joinMetadata,
  });

  // @ts-ignore - access private property
  room.gamePlayerStats.set(sessionId, {
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

  // @ts-ignore - access private property
  room.sendKillCountUpdate(sessionId, 0);
  // @ts-ignore - access private property
  room.recordLevelSnapshot(sessionId, profile.level);
}

export async function finalizeGameStatus(
  room: GameRoom,
  status: string,
  metadata: Record<string, unknown> = {}
) {
  // @ts-ignore - access private property
  if (!room.currentGameId || room.gameStatusFinalized) {
    return;
  }

  // @ts-ignore - access private property
  await room.syncGameMetricsImmediate();

  // @ts-ignore - access private property
  const durationMs = Date.now() - (room.state.startedAt || Date.now());

  try {
    await gamesRepo.markStatus({
      // @ts-ignore - access private property
      gameId: room.currentGameId,
      status,
      metadata: {
        totalEnemyKills: room.state.totalEnemyKills,
        durationMs,
        // @ts-ignore - access private property
        hadPlayers: room.hadAnyPlayers,
        bossKilled: room.bossKilled,
        ...metadata,
      },
    });
    // @ts-ignore - access private property
    room.gameStatusFinalized = true;
  } catch (error) {
    console.error('Failed to finalize game status', {
      // @ts-ignore - access private property
      gameId: room.currentGameId,
      status,
      error,
    });
  }
}

export function updateMetadata(
  room: GameRoom,
  extra: Record<string, unknown> = {}
) {
  room.setMetadata({
    roomId: room.state.id,
    roomCode: room.state.roomCode,
    // @ts-ignore - access private property
    isPrivate: room.isPrivateRoom,
    region: room.state.region,
    difficultyTier: room.state.difficultyTier,
    // @ts-ignore - access private property
    hostSessionId: room.state.hostSessionId,
    // @ts-ignore - access private property
    playerCount: room.getCurrentClientCount(),
    // @ts-ignore - access private property
    maxPlayers: room.maxClients,
    colyseusRoomId: room.roomId,
    // @ts-ignore - access private property
    gameId: room.currentGameId,
    // @ts-ignore - access private property
    phase: room.phase,
    autoCloseAt: room.state.autoCloseAt,
    lateJoinCutoffAt: room.state.lateJoinCutoffAt,
    ...extra,
  });
}

// --- Main Lifecycle ---

export async function onJoin(
  room: GameRoom,
  client: Client,
  options: any = {}
) {
  console.log(`Player ${client.sessionId} joined room ${room.state.id}`);

  // Enforce admin-only access if configured
  // @ts-ignore - access private property
  if (room.isAdminOnly) {
    const address: string | undefined = (client as any).auth?.address;
    const { isAdminAddress } = await import('../routes/admin-auth');
    if (!address || !isAdminAddress(address)) {
      throw new Error('Forbidden: admin-only room');
    }
  }
  // @ts-ignore - access private property
  const current = room.getCurrentClientCount();
  // @ts-ignore - access private property
  if (current > room.maxClients) {
    throw new Error('Room is full');
  }

  // @ts-ignore - access private property
  if (room.stagingEnabled && room.phase === 'in_game') {
    const now = Date.now();
    if (room.state.lateJoinCutoffAt > 0 && now > room.state.lateJoinCutoffAt) {
      throw new Error('Run already in progress');
    }
  }

  const requestedDifficultyTierRaw =
    typeof options?.difficultyTier === 'string' ? options.difficultyTier : null;

  const player = new PlayerSchema();
  player.id = client.sessionId;
  player.name = options.name || `Player_${client.sessionId.slice(0, 6)}`;
  player.avatarId = options.avatarId || 'default';

  const authData = (client as any).auth || {};
  const playerId: string | undefined = authData.playerId;
  const walletAddress: string | undefined = authData.address;
  const isAuthorized: boolean = Boolean(authData.isAuthorized);

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
  const currentTier = getDifficultyTier(room.state.difficultyTier)?.id ?? 'normal';
  const canApplyRequested =
    Boolean(requestedTier) &&
    // @ts-ignore - access private property
    room.phase !== 'in_game' &&
    // @ts-ignore - access private property
    room.phase !== 'ended' &&
    room.state.players.size === 0;
  const targetTier = canApplyRequested && requestedTier ? requestedTier : currentTier;
  const stakedBalance = await depositsRepo.getStakedUnlockBalances(playerId);
  if (!isTierEligible(targetTier, stakedBalance.total)) {
    const tier = getDifficultyTier(targetTier);
    throw new Error(
      `Insufficient USDC/GHO staked for ${tier?.name ?? targetTier}`
    );
  }
  if (canApplyRequested && requestedTier) {
    // @ts-ignore - access private property
    room.applyRequestedDifficultyTier(requestedTier);
  }

  // @ts-ignore - access private property
  room.sessionPlayerIds.set(client.sessionId, playerId);
  player.wallet = walletAddress;
  // @ts-ignore - access private property
  room.hadAnyPlayers = true;

  const wantsDailyQuestCompetition = options.dailyQuestActive === true;
  const useTradingSettlement =
    wantsDailyQuestCompetition && isTradingGameEnabled();
  const requestedGameplayLeverage =
    typeof options.leverage === 'number' && Number.isFinite(options.leverage)
      ? options.leverage
      : 1;
  const gameplayLeverage = Math.max(
    1,
    Math.min(LEVERAGE_CONFIG.max, requestedGameplayLeverage)
  );
  const requestedTradeLeverage = options.tradeLeverage ?? 1;
  const tradeLeverage = normalizeTradeLeverage(requestedTradeLeverage, 1);
  const tradeToken = normalizeTradeToken(options.tradeToken, 'BTC');
  const tradeDirection = normalizeTradeDirection(options.tradeDirection, 'long');
  player.tradeToken = tradeToken;
  player.tradeDirection = tradeDirection;
  player.tradeLeverage = tradeLeverage;

  if (useTradingSettlement) {
    const L = Math.max(
      1,
      Math.min(
        LEVERAGE_CONFIG.max,
        getAdditiveTradingCompetitionLeverage({
          gameplayLeverage,
          tradeLeverage,
        })
      )
    );
    // @ts-ignore - access private property
    room.state.floorLeverage = L;
    // @ts-ignore - access private property
    room.state.roomLeverage = L;
    // @ts-ignore - access private property
    room.state.leverageTotal = L;
    // @ts-ignore - access private property
    room.state.floorLeverageLocked = true;
    // @ts-ignore - access private property
    room.state.roomLeverageLocked = true;
  } else if (
    typeof options.leverage === 'number' &&
    Number.isFinite(options.leverage)
  ) {
    const L = gameplayLeverage;
    // @ts-ignore - access private property
    room.state.floorLeverage = L;
    // @ts-ignore - access private property
    room.state.roomLeverage = L;
    // @ts-ignore - access private property
    room.state.leverageTotal = L;
    // @ts-ignore - access private property
    room.state.floorLeverageLocked = true;
    // @ts-ignore - access private property
    room.state.roomLeverageLocked = true;
  }

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

  // Daily Quest Competition: set dailyQuestActive from join options
  // Attunement is recorded in registerGamePlayer when the run starts.
  // Progression runs consume (deduct) a daily run; competition uses the 3/day limit.
  if (wantsDailyQuestCompetition) {
    player.dailyQuestActive = true;
  }

  try {
    const requestedName =
      typeof options?.name === 'string' ? options.name.trim() : '';
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
    // ignore
  }

  const requestedGotchiId = options.gotchiId;
  const requestedCharacterId =
    options.selectedCharacterId || options.characterId;
  const sessionWallet: string | undefined = (client as any).auth?.address;

  player.usesRealGotchi = false;

  if (requestedGotchiId != null && requestedCharacterId) {
    throw new Error('Provide only one of gotchiId or characterId');
  }

  if (requestedGotchiId != null && requestedGotchiId !== '') {
    if (!sessionWallet) {
      throw new Error('Unauthorized: missing session');
    }

    const gotchiIdStr = String(requestedGotchiId);
    const { slugs, assignments } = await assertGotchiOwnershipForTodaySnapshot(
      sessionWallet,
      gotchiIdStr
    );

    const dynamicId = `gotchi:${gotchiIdStr}`;
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
        console.warn('[SharedGame] Failed to verify dynamic gotchi ownership', {
          gotchiId: gotchiIdStr,
          wallet: sessionWallet,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  player.isBot = false;

  const runtimeScoreState = (room as any).ensurePlayerScoreState(playerId);
  player.score = SCORE_CONFIG.enabled ? runtimeScoreState.score : 0;
  player.scoreEligible = SCORE_CONFIG.enabled
    ? runtimeScoreState.eligible
    : true;

  const progressionRecord = await progressionRepo.getProgression(playerId);
  const rebirthCount = sanitizeRebirthCount(progressionRecord?.rebirthCount ?? 0);
  room.setSessionRebirthState(client.sessionId, rebirthCount);
  const currentMaxLevel = room.getSessionProgressionMaxLevel(client.sessionId);
  const initialProfile = sanitizeProfile(
    progressionRecordToProfile(progressionRecord),
    currentMaxLevel
  );

  const equipmentRecords = await equipmentRepo.getEquippedWithInstances(
    playerId,
    player.characterId || null
  );
  const equipmentOverrides: EquipmentOverride[] = [];
  for (const record of equipmentRecords) {
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
      rebirthCount,
      unlockedTiers: ['normal'],
      lickTongueCount: 0,
      statAllocations: initialProfile.stats,
      derivedStats: {},
      equippedWearables: [],
      allocationHistory: initialProfile.allocationHistory,
      lastSyncedAt: null,
    });
  }

  // @ts-ignore - access private property
  const unlockedTiersArray = progressionRecord?.unlockedTiers?.length
    ? progressionRecord.unlockedTiers
    : ['normal'];
  player.unlockedTiers = JSON.stringify(unlockedTiersArray);
  player.lickTongueCount = progressionRecord?.lickTongueCount ?? 0;
  player.derivedStats = JSON.stringify(runtimeDerivedStats);
  player.equippedWearables = JSON.stringify(runtimeWearables);

  const snapshotSignature = equipmentState.equipment
    .map(
      (entry) =>
        `${entry.slot}::${entry.slug}::${Number(entry.durabilityScore ?? -1)}`
    )
    .sort();
  // @ts-ignore - access private property
  room.playerEquipmentSnapshots.set(playerId, snapshotSignature);

  setProgressionProfile(room, client.sessionId, initialProfile, {
    persist: false,
  });
  const modifiers = computeProgressionModifiers(initialProfile.stats);
  syncPlayerCharacterStats(player, {
    fullHeal: true,
    progressionModifiers: modifiers,
  });

  // Sync progression fields to player schema for Colyseus state sync
  const levelProgress = getLevelProgress(initialProfile.totalXp, currentMaxLevel);
  player.level = levelProgress.level;
  player.xp = initialProfile.totalXp;
  player.xpIntoLevel = levelProgress.xpIntoLevel;
  player.xpForNextLevel = levelProgress.xpForNextLevel;

  // Apply dev mode skip run consumption flag BEFORE registerGamePlayer
  // This must happen early so shouldSkipEntryFee() returns true during registration
  if (
    isDevModeAllowed(walletAddress) &&
    options.devMode === true &&
    options.devSkipEntryFee === true
  ) {
    (player as any).devSkipEntryFee = true;
  }

  try {
    await registerGamePlayer(
      room,
      client.sessionId,
      playerId,
      initialProfile,
      player
    );
  } catch (error) {
    console.error('Failed to register game player', {
      sessionId: client.sessionId,
      playerId,
      error,
    });
    throw error;
  }

  // @ts-ignore - access private property
  room.setPlayerSpawnPosition(player);

  player.dir = 'down';
  player.anim = 'idle';
  player.lastMoveTime = 0;
  player.lastAttackTime = 0;

  let killStreakProfile: KillStreakProfile | null = null;
  // @ts-ignore - access private property
  room.logGameEvent('player.joined', `${player.name} joined room`, {
    playerId,
    sessionId: client.sessionId,
    details: {
      walletAddress,
      characterId: player.characterId,
      difficultyTier: room.state.difficultyTier,
      // @ts-ignore - access private property
      phase: room.state.phase,
    },
  });

  // @ts-ignore - access private property
  if (room.phase === 'in_game') {
    killStreakProfile =
      ensureKillStreakForPlayer(room, client.sessionId, player, {
        reset: true,
        sendProfile: false,
      }) ?? null;
    if (killStreakProfile) {
      applyProgressionToPlayer(room, client.sessionId, { fullHeal: true });
    }
  } else {
    // @ts-ignore - access private property
    room.killStreakBySession.delete(client.sessionId);
    applyProgressionToPlayer(room, client.sessionId, { fullHeal: true });
  }

  if (
    // @ts-ignore - access private property
    LEVERAGE_CONFIG.enabled &&
    // @ts-ignore - access private property
    room.phase === 'in_game' &&
    !room.state.roomLeverageLocked
  ) {
    leverageScheduleRoomLeverageLockTimeout(room);
  }

  if (
    // @ts-ignore - access private property
    room.stagingEnabled &&
    // @ts-ignore - access private property
    room.phase === 'staging' &&
    room.state.players.size === 1
  ) {
    const autoCloseAt = Date.now() + STAGING_AUTO_CLOSE_MS;
    room.state.autoCloseAt = autoCloseAt;
    // @ts-ignore - access private property
    room.scheduleStagingAutoClose(autoCloseAt);
    // @ts-ignore - access private property
    room.persistGameMetrics({ syncState: true });
    room.msg.broadcast('staging_auto_close', {
      autoCloseAt,
    });
  }

  // @ts-ignore - access private property
  if (!room.state.hostSessionId) {
    // @ts-ignore - access private property
    room.state.hostSessionId = client.sessionId;
  }

  updateMetadata(room);

  if (playerId) {
    room.state.players.set(client.sessionId, player);
  }

  const inventoryRecords = await inventoryRepo.getInventory(playerId);
  const inventoryItems = inventoryRecords.map(inventoryRecordToItem);
  const sanitizedInventory = sanitizeInventoryPayloads(inventoryItems);
  player.lickTongueCount = getLickTongueCount(sanitizedInventory);
  player.healthPotionCount = getHealthPotionCount(sanitizedInventory);
  player.manaPotionCount = getManaPotionCount(sanitizedInventory);
  // @ts-ignore - access private property
  room.playerInventories.set(client.sessionId, sanitizedInventory);
  const potionSummary = sanitizedInventory.reduce(
    (summary, item) => {
      const type = String(item.type ?? item.itemType ?? '').toLowerCase();
      const name = String(item.name ?? '').toLowerCase();
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) return summary;
      if (type !== 'potion' && !name.includes('potion')) return summary;
      if (name.includes('mana')) {
        summary.mana += quantity;
        return summary;
      }
      const tier = name.includes('ultra') ? 3 : name.includes('greater') ? 2 : 1;
      if (tier === 3) summary.tier3 += quantity;
      else if (tier === 2) summary.tier2 += quantity;
      else summary.tier1 += quantity;
      return summary;
    },
    { tier1: 0, tier2: 0, tier3: 0, mana: 0 }
  );
  if (
    potionSummary.tier1 > 0 ||
    potionSummary.tier2 > 0 ||
    potionSummary.tier3 > 0 ||
    potionSummary.mana > 0
  ) {
    console.warn('[Inventory] Loaded on join', {
      playerId,
      sessionId: client.sessionId,
      potionSummary,
      pid: process.pid,
    });
  }

  client.send('room_joined', {
    playerId: client.sessionId,
    roomId: room.state.id,
    roomCode: room.state.roomCode,
    mapSeed: room.state.seed,
    difficultyTier: room.state.difficultyTier,
    // @ts-ignore - access private property
    currentFloor: room.currentFloor,
    // @ts-ignore - access private property
    floorReached: room.floorReached,
    // @ts-ignore - access private property
    maxPlayers: room.maxClients,
    // @ts-ignore - access private property
    playerCount: room.getCurrentClientCount(),
    region: room.state.region,
    // @ts-ignore - access private property
    hostSessionId: room.state.hostSessionId,
    // @ts-ignore - access private property
    existingTrees: room.treePositions,
    // @ts-ignore - access private property
    chunkLayout: room.chunkLayoutData,
    progressionProfile: toSerializableProfile(initialProfile),
    inventory: sanitizedInventory,
    // @ts-ignore - access private property
    phase: room.state.phase,
    // @ts-ignore - access private property
    phaseChangedAt: room.phaseChangedAt,
    countdownEndsAt: room.state.countdownEndsAt,
    autoCloseAt: room.state.autoCloseAt,
    lateJoinCutoffAt: room.state.lateJoinCutoffAt,
    startedByPlayerId: room.state.startedByPlayerId,
    // @ts-ignore - access private property
    runStartedAt: room.runStartedAt,
  });

  leverageSendLeverageStateToClient(room, client);

  if (killStreakProfile) {
    sendKillStreakProfileToClient(room, client.sessionId, killStreakProfile);
  } else {
    sendKillStreakResetToClient(
      room,
      client.sessionId,
      // @ts-ignore - access private property
      room.phase === 'in_game' ? 'streak_inactive' : 'awaiting_run'
    );
  }

  client.send('weapon_switched', { attackType: player.attackType });

  void persistProgression(room, client.sessionId, initialProfile);

  // --- IDLE GAME INITIALIZATION ---
  player.idleRoom.runStatus = 'active';
  player.idleRoom.depth = 1;
  player.idleRoom.competitionMultiplier = calculateTimeMultiplier();

  // --- DEV MODE HANDLING ---
  // Apply dev mode overrides if enabled and allowed
  const devModeResult = applyDevModeToPlayer(
    player,
    options as DevModeOptions,
    walletAddress
  );

  // Apply dev mode equipment overrides (after player stats are initialized)
  if (devModeResult.applied && Array.isArray(options.devEquipment)) {
    applyDevModeEquipment(
      player,
      options.devEquipment,
      buildEquipmentStateForCharacter
    );
    // Re-sync stats after equipment change
    syncPlayerCharacterStats(player, {
      fullHeal: false,
      progressionModifiers: modifiers,
    });
  }

  // Apply dev mode tiered potions to inventory
  if (devModeResult.applied) {
    const devPotions = generateDevModePotions(options as DevModeOptions);
    if (devPotions.length > 0) {
      // @ts-ignore - access private property
      const currentInventory = room.playerInventories.get(client.sessionId) || [];
      const mergedInventory = [...currentInventory, ...devPotions];
      const sanitizedMerged = sanitizeInventoryPayloads(mergedInventory);
      // @ts-ignore - access private property
      room.playerInventories.set(client.sessionId, sanitizedMerged);
      // Update potion counts
      player.healthPotionCount = getHealthPotionCount(sanitizedMerged);
      player.manaPotionCount = getManaPotionCount(sanitizedMerged);
      console.log('[DevMode] Added tiered potions to inventory:', devPotions.map(p => `${p.quantity}x ${p.name}`).join(', '));
    }
  }

  // Use dev mode start floor if set, otherwise start at depth 1
  const startDepth = player.idleRoom.depth;

  player.idleRoom.encounter = EncounterManager.generateEncounter(
    startDepth,
    room.state.difficultyTier,
    1,
    player.autoAscendFloor,
    false,
    false
  );
  player.idleRoom.encounter.isPlayerTurn = true;
  player.idleRoom.encounter.lastActionLog = devModeResult.applied
    ? `[DEV MODE] Your adventure begins. Features: ${devModeResult.features.join(', ')}`
    : 'Your adventure begins.';

  // Ensure player starts at full HP for idle run
  player.hp = player.maxHp;

  try {
    const derived = JSON.parse(player.derivedStats || '{}');
    const playerSpeedMs = derived.attackSpeed || 1000;
    player.idleRoom.encounter.playerAttackSpeed = Math.round(
      (1000 / Math.max(1, playerSpeedMs)) * 100
    );
    player.idleRoom.encounter.playerAttackRange =
      derived.weaponType === 'ranged'
        ? derived.rangedAttackRange || 200
        : derived.meleeAttackRange || 32;
  } catch (err) {
    player.idleRoom.encounter.playerAttackSpeed = 100;
    player.idleRoom.encounter.playerAttackRange = 32;
  }

  await recordApiKeyRoomJoinUsage(client);
}

export async function onLeave(
  room: GameRoom,
  client: Client,
  consented: boolean
) {
  console.log(`Player ${client.sessionId} left room ${room.state.id}`, {
    consented,
  });
  const playerIdForSession = getPlayerIdForSession(room, client.sessionId);
  const statsSnapshot = (room as any).cloneRuntimeStats(client.sessionId);
  const partySizeBeforeLeave = room.state.players.size;

  const player = room.state.players.get(client.sessionId);
  // Old high-stakes tracking removed - using competition system now
  const hadVictory = player?.idleRoom?.runStatus === 'victory';

  // Only refund entry fees for rooms that are still in staging
  if (
    playerIdForSession &&
    // @ts-ignore - access private property
    room.stagingEnabled &&
    // @ts-ignore - access private property
    room.phase !== 'in_game'
  ) {
    // @ts-ignore - access private property
    await room.refundEntryFee(playerIdForSession, 'disconnect');
  }
  await Promise.allSettled([
    persistProgression(room, client.sessionId),
    flushGamePlayerStats(room, client.sessionId, { markLeft: true }),
  ]);

  // Competition rewards are distributed at end of day via prize distribution job
  // No immediate payout needed here

  // @ts-ignore - access private property
  room.killStreakBySession.delete(client.sessionId);
  room.state.players.delete(client.sessionId);
  // @ts-ignore - access private property
  room.pendingScoreDeltas.delete(client.sessionId);
  // @ts-ignore - access private property
  room.npcPurchaseCooldowns.delete(client.sessionId);

  // @ts-ignore - access private property
  if (room.phase === 'in_game' && room.state.players.size === 0) {
    // @ts-ignore - access private property
    room.pauseEnemyDifficultyMeter('no_players');
  }

  // @ts-ignore - access private property
  room.playerInventories.delete(client.sessionId);
  // @ts-ignore - access private property
  room.playerProgression.delete(client.sessionId);
  // @ts-ignore - access private property
  room.playerDeathsThisRun.delete(client.sessionId);
  if (playerIdForSession) {
    // @ts-ignore - access private property
    room.playerEquipmentSnapshots.delete(playerIdForSession);
  }
  // @ts-ignore - access private property
  room.sessionPlayerIds.delete(client.sessionId);

  // @ts-ignore - access private property
  if (room.state.hostSessionId === client.sessionId) {
    const nextHost = Array.from(room.state.players.keys())[0];
    // @ts-ignore - access private property
    room.state.hostSessionId = nextHost || '';
  }

  if (
    // @ts-ignore - access private property
    room.stagingEnabled &&
    // @ts-ignore - access private property
    room.phase !== 'in_game' &&
    room.state.players.size === 0
  ) {
    // @ts-ignore - access private property
    room.clearStagingAutoCloseTimer();
    room.state.autoCloseAt = 0;
    // @ts-ignore - access private property
    room.persistGameMetrics({ syncState: true });
    room.msg.broadcast('staging_auto_close', {
      autoCloseAt: 0,
    });
  }

  const playersRemaining = room.state.players.size;
  // @ts-ignore - access private property
  room.logGameEvent('player.left', 'Player left room', {
    playerId: playerIdForSession,
    sessionId: client.sessionId,
    details: {
      consented,
      partySizeBeforeLeave,
      playersRemaining,
    },
  });
  if (playersRemaining === 0) {
    const status = room.bossKilled ? 'completed' : 'abandoned';
    await finalizeGameStatus(room, status);
  }

  // @ts-ignore - access private property
  room.persistGameMetrics({ syncState: true });
  updateMetadata(room);

  if (playerIdForSession) {
    await (room as any).persistPlayerRunScore({
      playerId: playerIdForSession,
      sessionId: client.sessionId,
      statsSnapshot,
      partySize: partySizeBeforeLeave,
      reason: 'leave',
      // Old daily quest metadata removed - using competition system now
    });
  }
}

export async function onDispose(room: GameRoom) {
  // @ts-ignore - access private property
  console.log(`GameRoom ${room.state.id} disposed`);
  // @ts-ignore - access private property
  if (room.tickInterval) clearInterval(room.tickInterval);
  // @ts-ignore - access private property
  if (room.snapshotInterval) clearInterval(room.snapshotInterval);
  // @ts-ignore - access private property
  if (room.timedSpawnInterval) clearInterval(room.timedSpawnInterval);
  // @ts-ignore - access private property
  room.clearStagingAutoCloseTimer();
  // @ts-ignore - access private property
  room.clearLateJoinTimer();
  // @ts-ignore - access private property
  if (room.portalCountdownTimer) {
    // @ts-ignore - access private property
    clearTimeout(room.portalCountdownTimer);
    // @ts-ignore - access private property
    room.portalCountdownTimer = null;
  }
  leverageClearRoomLeverageLockTimer(room);

  // @ts-ignore - access private property
  const sessions = Array.from(room.sessionPlayerIds.keys());
  const sessionSnapshots = sessions.map((sessionId) => ({
    sessionId,
    playerId: getPlayerIdForSession(room, sessionId) ?? '',
    stats: (room as any).cloneRuntimeStats(sessionId),
    partySize: room.state.players.size,
  }));
  await Promise.allSettled([
    ...sessions.map((sessionId) => persistProgression(room, sessionId)),
    ...sessions.map((sessionId) =>
      flushGamePlayerStats(room, sessionId, { markLeft: true })
    ),
  ]);

  for (const snapshot of sessionSnapshots) {
    if (!snapshot.playerId) {
      continue;
    }
    await (room as any).persistPlayerRunScore({
      playerId: snapshot.playerId,
      sessionId: snapshot.sessionId,
      statsSnapshot: snapshot.stats,
      partySize: snapshot.partySize,
      reason: 'dispose',
    });
  }

  // @ts-ignore - access private property
  room.sessionPlayerIds.clear();
  // @ts-ignore - access private property
  room.playerDeathsThisRun.clear();
  // @ts-ignore - access private property
  room.gamePlayerStats.clear();
  // @ts-ignore - access private property
  room.playerEquipmentSnapshots.clear();
  // @ts-ignore - access private property
  room.entryFeeLedger.clear();
  // @ts-ignore - access private property
  room.playerScoreStateByPlayerId.clear();
  // @ts-ignore - access private property
  room.pendingScoreDeltas.clear();
  // @ts-ignore - access private property
  room.playersDiedThisRunByPlayerId.clear();
  // @ts-ignore - access private property
  room.persistedScorePlayerIds.clear();
  // @ts-ignore - access private property
  room.recentEnemyKillIds.forEach((entry) => {
    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }
  });
  // @ts-ignore - access private property
  room.recentEnemyKillIds.clear();
  // @ts-ignore - access private property
  room.entityLootDistributions.forEach((entry) => {
    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }
  });
  // @ts-ignore - access private property
  room.entityLootDistributions.clear();

  // @ts-ignore - access private property
  if (!room.gameStatusFinalized) {
    const status = room.bossKilled
      ? 'completed'
      : // @ts-ignore - access private property
        room.hadAnyPlayers
        ? 'terminated'
        : 'abandoned';
    await finalizeGameStatus(room, status);
  }
}
