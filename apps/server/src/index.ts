import path from 'path';
import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';

// Load env from multiple locations with clear precedence.
// Order: repo root -> server dir -> cwd; later entries override earlier ones.
const cwd = process.cwd();
const serverDir = path.resolve(__dirname, '../../');
const rootDir = path.resolve(__dirname, '../../../');
const orderedEnvPaths = [
  path.join(rootDir, '.env'),
  path.join(rootDir, '.env.local'),
  path.join(serverDir, '.env'),
  path.join(serverDir, '.env.local'),
  path.join(cwd, '.env'),
  path.join(cwd, '.env.local'),
];
for (const p of orderedEnvPaths) {
  if (existsSync(p)) dotenvConfig({ path: p, override: false });
}

import express from 'express';
import type { Request, Response } from 'express';
import compression from 'compression';
import cors from 'cors';
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import { Server, matchMaker } from 'colyseus';
import { DungeonRoom } from './rooms/DungeonRoom';
import { LobbyRoom } from './rooms/LobbyRoom';
import { GAME_CONFIG } from './lib/constants';
import {
  fetchAavegotchiById,
} from './lib/aavegotchi';
import { normalizeForGenerator } from './lib/gotchi-normalize';
import type { SpriteInfo } from './lib/gotchi-sprites';
import {
  generateOne,
  getExistingSpriteInfo,
} from './lib/gotchi-sprites';
import { requestLogger, logError } from './lib/http-logging';
import {
  getPgPool,
  getSupabaseAdminClient,
  runTransaction,
  playersRepo,
  authSessionsRepo,
  progressionRepo,
  inventoryRepo,
  inventoryEventsRepo,
  lootCatalogRepo,
  paymentsRepo,
  depositsRepo,
  economyRepo,
  progressionRecordToProfile,
  inventoryRecordToItem,
  sanitizeInventoryItems as sanitizeInventoryPayloads,
  getLickTongueCount,
  playerPreferencesRepo,
  type PlayerInventoryRow,
  leaderboardRepo,
  runScoresRepo,
} from './lib/db';
import { verifyGotchiOwnershipForTodaySnapshot } from './lib/gotchi-ownership-snapshot';
import { filterInventoryRecordsForResponse } from './lib/inventory-visibility';
import {
  createSessionCookie,
  clearSessionCookie,
  readSessionFromRequest,
  resolveSessionFromRequest,
} from './lib/auth/session';
import { SESSION_DURATION_SECONDS } from './lib/auth/token';
import { logEvent, installConsoleWarningCapture } from './lib/http-logging';
import { initDebugLogs, flushDebugLogs } from './lib/logging/debug-log-service';
import {
  toSerializableProfile,
  sanitizeProfile,
  getTotalXpForLevel,
  type ProgressionProfile,
  type StatKey,
} from '@gotchiverse/progression';
import {
  getDifficultyTier,
  isTierEligible,
} from './data/difficulty-tiers';
import {
  ALL_CHARACTERS,
  setGotchiWearables,
  setGotchiWearableAssignments,
} from './data/characters';
import { registerAdminDbRoutes } from './routes/admin-db';
import { registerAdminPlayersRoutes } from './routes/admin-players';
import { registerAdminCurrencyRoutes } from './routes/admin-currency';
import { registerAdminPotionsRoutes } from './routes/admin-potions';
import {
  fetchDecodedRecentDepositsWithStatus,
  fetchGoldskyRowByTxHash,
  decodeDepositEvent,
} from './lib/goldsky/deposits';
import { requireAdminSession } from './routes/admin-auth';
import { ethers } from 'ethers';
import { registerAdminRunsRoutes } from './routes/admin-runs';
import { registerAdminLogsRoutes } from './routes/admin/logs';
import { registerAdminStatsRoutes } from './routes/admin/stats';
import { registerAdminGotchisRoutes } from './routes/admin-gotchis';
import { registerAdminServersRoutes } from './routes/admin/servers';
import { registerStatsRoutes } from './routes/stats';
import { registerTokenWithdrawalRoutes } from './routes/token-withdrawals';
import { registerAdminTopUpRoutes } from './routes/admin-topups';
import { registerDailyRunRoutes } from './routes/daily-runs';
import { registerDailyQuestCompetitionRoutes } from './routes/daily-quest-competition';
import { registerShopRoutes } from './routes/shop';
import { registerCraftingRoutes } from './routes/crafting';
import { registerInternalCronRoutes } from './routes/internal-cron';
import { registerAdminCronRoutes } from './routes/admin-cron';
import { registerAdminStoreSalesRoutes } from './routes/admin-store-sales';
import { registerInventorySellRoutes } from './routes/inventory-sell';
import { registerPlayerEquipmentRoutes } from './routes/player-equipment';
import { registerPlayerInventoryForgeRoutes } from './routes/player-inventory-forge';
import { registerPlayerInventoryRepairRoutes } from './routes/player-inventory-repair';
import { registerPlayerStakedBalanceRoutes } from './routes/player-staked-balance';
import { registerPlayerProgressionRebirthRoutes } from './routes/player-progression-rebirth';
import { registerApiKeyRoutes } from './routes/api-keys';
import { registerApiKeySiweTokenRoute } from './routes/api-key-siwe-token';
import {
  validateStakedApiKeyConfiguration,
} from './lib/auth/api-keys';
import { resolveAuthPrincipal } from './lib/auth/principal';
import { startWithdrawalBatchProcessor } from './lib/withdrawals/batch-processor';
import { startUsdcTopupDiscordMonitor } from './lib/topup/discord-monitor';
import { startWithdrawalTxMonitor } from './lib/withdrawals/tx-monitor';
import {
  startContinuousTradeSettlementMonitor,
  stopContinuousTradeSettlementMonitor,
} from './jobs/continuous-trade-settlement';
import { startDailyGotchiSnapshotCron } from './jobs/daily-gotchi-snapshot-cron';
import { runSettleCompetitionTradesForAccountFallback } from './jobs/settle-competition-trades';
import {
  buildEquipmentStateForCharacter,
  getEquippedInventoryItemIds,
  normalizeEquipmentSlotName,
} from './lib/equipment-service';
import { normalizeQualityTier } from './data/wearable-quality';
import { equipmentRepo } from './lib/db';
import {
  executeInventoryRemoval,
  normalizeRemoveRequests,
  InventoryRemovalError,
} from './lib/inventory-removal';
import {
  BASE_CHAIN_ID,
  GAMEPOINTS_CONTRACT_ADDRESS,
  DEADLINE_WINDOW_SECONDS,
  MAX_SLIPPAGE_BPS,
  listSupportedTokens,
  deriveQuote,
  formatAmountFromWei,
  parseAmountWei,
  getTokenBySymbol,
  getTokenByAddress,
} from './lib/topup';
import {
  checkPendingDeposits,
  checkTransactionReceipt,
} from './lib/topup/tx-check';
import {
  ABSOLUTE_PLAYER_LEVEL_CAP,
  REBIRTH_COST_LICK_TONGUES,
  getUnlockedMaxLevel,
  sanitizeRebirthCount,
} from './lib/progression/rebirth';
import { runIdleModeReplay } from './lib/idle-sim';
import { registerAuthVerifyRoute } from './routes/auth-verify';
import { registerAuthSessionRoute } from './routes/auth-session';
import { registerPlayerGotchiRoutes } from './routes/player-gotchis';

initDebugLogs();
installConsoleWarningCapture();
validateStakedApiKeyConfiguration();

const port = Number(process.env.PORT) || 1999;
const app = express();

// Enable gzip/brotli (when supported) for JSON/text responses to reduce payload size.
// Keep this early so it applies to API + static responses served by express.
app.use(compression());

// Disable ETag for JSON API responses to avoid 304 + empty body issues with fetch
app.set('etag', false);
// Prevent caching on API endpoints (always return fresh JSON)
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const STAT_KEYS: StatKey[] = [
  'energy',
  'aggression',
  'spookiness',
  'brainSize',
];
const DEFAULT_UNLOCKED_TIERS = ['normal_1'];
const DEFAULT_DIFFICULTY_TIER = 'normal_1';
const CHARACTER_ID_SET = new Set(
  ALL_CHARACTERS.map((character) => character.id)
);
const DEFAULT_CHARACTER_ID = CHARACTER_ID_SET.has('coderdan')
  ? 'coderdan'
  : ALL_CHARACTERS[0]?.id || 'coderdan';
const CHARACTER_ID_LIST = ALL_CHARACTERS.map((character) => character.id);
const CHARACTER_ORDER = new Map(
  CHARACTER_ID_LIST.map((id, index) => [id, index])
);
const CHARACTER_BY_ID = new Map(
  ALL_CHARACTERS.map((character) => [character.id, character])
);
const CHARACTER_UNLOCK_COSTS = new Map(
  ALL_CHARACTERS.map((character) => [
    character.id,
    Number.isFinite(character.unlockCost) ? Number(character.unlockCost) : 0,
  ])
);
const LICK_TONGUE_ITEM_TYPE = 'material';
const LICK_TONGUE_ITEM_NAME = 'Lick Tongue';

function clampProfileToMaxLevel(
  profile: ProgressionProfile,
  currentMaxLevel: number
): ProgressionProfile {
  const sanitized = sanitizeProfile(profile, currentMaxLevel);
  const maxTotalXp = getTotalXpForLevel(currentMaxLevel);
  if (sanitized.totalXp <= maxTotalXp) {
    return sanitized;
  }
  return sanitizeProfile(
    {
      ...sanitized,
      totalXp: maxTotalXp,
    },
    currentMaxLevel
  );
}

function getRebirthProgressionMeta(rebirthCountInput: unknown) {
  const rebirthCount = sanitizeRebirthCount(rebirthCountInput);
  return {
    rebirthCount,
    currentMaxLevel: getUnlockedMaxLevel(rebirthCount),
    absoluteMaxLevel: ABSOLUTE_PLAYER_LEVEL_CAP,
    rebirthCost: REBIRTH_COST_LICK_TONGUES,
  } as const;
}

function nowHr(): bigint {
  return typeof process !== 'undefined' && (process as any).hrtime
    ? (process as any).hrtime.bigint()
    : BigInt(Date.now() * 1e6);
}

function diffMs(start: bigint, end: bigint): number {
  return Number(end - start) / 1e6;
}

function buildServerTiming(metrics: Record<string, number>): string {
  return Object.entries(metrics)
    .map(([key, value]) => `${key};dur=${value.toFixed(1)}`)
    .join(', ');
}

const NONCE_TTL_MS = 5 * 60 * 1000;
const pendingNonces = new Map<string, number>();
const SIWE_DOMAIN = process.env.SIWE_DOMAIN || 'aavegotchi.com';
const SIWE_STATEMENT =
  process.env.SIWE_STATEMENT || 'Sign in to DeFi Dungeons.';

function getAllowedSiweDomains(): string[] {
  return (process.env.SIWE_ALLOWED_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean);
}

try {
  getSupabaseAdminClient();
  getPgPool();
} catch (error) {
  logError(error);
  throw error;
}

function pruneExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiry] of pendingNonces.entries()) {
    if (expiry <= now) {
      pendingNonces.delete(nonce);
    }
  }
}

function createNonce() {
  pruneExpiredNonces();
  const nonce = randomBytes(16).toString('hex');
  pendingNonces.set(nonce, Date.now() + NONCE_TTL_MS);
  return nonce;
}

function validateNonce(nonce: string) {
  pruneExpiredNonces();
  const expiresAt = pendingNonces.get(nonce);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    pendingNonces.delete(nonce);
    return false;
  }

  pendingNonces.delete(nonce);
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deriveLedgerAmount(
  baseUnits: number,
  metadata?: Record<string, unknown>
): number {
  if (!Number.isFinite(baseUnits)) {
    return 0;
  }
  const decimalsRaw = metadata?.decimals;
  const decimals = Number(decimalsRaw);
  if (Number.isFinite(decimals) && decimals >= 0) {
    return baseUnits / Math.pow(10, decimals);
  }
  return baseUnits;
}

function isGotchiCharacterId(value: string): boolean {
  return /^gotchi:\d{1,32}$/i.test(value);
}

function getCharacterUnlockCost(characterId: string): number | null {
  const cost = CHARACTER_UNLOCK_COSTS.get(characterId);
  if (cost === undefined || !Number.isFinite(cost)) {
    return null;
  }
  return Math.max(0, cost);
}

function normalizeCharacterId(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  if (CHARACTER_ID_SET.has(raw)) {
    return raw;
  }
  if (CHARACTER_ID_SET.has(lowered)) {
    return lowered;
  }
  if (isGotchiCharacterId(raw)) {
    return lowered;
  }
  throw new Error('Character id not recognized');
}

function normalizeDifficultyTierId(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  const tier = getDifficultyTier(normalized);
  if (!tier) {
    throw new Error('Difficulty tier not recognized');
  }
  return tier.id;
}

function sortAndNormalizeUnlockedCharacters(
  unlocked: Iterable<unknown>
): string[] {
  const normalized = new Set<string>();
  for (const value of unlocked) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (CHARACTER_ID_SET.has(trimmed)) {
      normalized.add(trimmed);
      continue;
    }
    const lowered = trimmed.toLowerCase();
    if (CHARACTER_ID_SET.has(lowered)) {
      normalized.add(lowered);
    }
  }
  return CHARACTER_ID_LIST.filter((id) => normalized.has(id));
}

function isCharacterSelectionAllowed(
  characterId: string | null,
  unlockedSet: Set<string>
): boolean {
  if (!characterId) {
    return false;
  }
  if (isGotchiCharacterId(characterId)) {
    return true;
  }
  return unlockedSet.has(characterId);
}

function sanitizeSpriteUrl(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }
  if (raw.length > 2048) {
    throw new Error('Sprite url too long');
  }
  if (raw.startsWith('/')) {
    return raw;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  throw new Error('Sprite url must be relative or http(s)');
}

function sanitizeAvatarId(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }
  if (raw.length > 128) {
    throw new Error('Avatar id too long');
  }
  if (!/^[a-zA-Z0-9:_-]+$/.test(raw)) {
    throw new Error('Avatar id contains invalid characters');
  }
  return raw;
}

function isWebhookAuthorized(req: express.Request) {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }
  const provided = req.headers['x-webhook-secret'];
  if (Array.isArray(provided)) {
    return provided.includes(secret);
  }
  return provided === secret;
}

function getClientIp(req: express.Request) {
  const header = (req.headers['x-forwarded-for'] as string) || '';
  if (header) {
    const [first] = header.split(',');
    if (first && first.trim()) {
      return first.trim();
    }
  }
  return req.socket?.remoteAddress || null;
}

const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware - Configure CORS for local development plus explicit deployments
const corsOptions = {
  origin: [
    // Local development
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    // Local network development (for mobile testing)
    /^http:\/\/192\.168\.\d+\.\d+:3001$/,
    /^http:\/\/10\.\d+\.\d+\.\d+:3001$/,
    /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+:3001$/,
    ...configuredCorsOrigins,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

registerAdminDbRoutes(app);
registerAdminPlayersRoutes(app);
registerAdminRunsRoutes(app);
registerAdminCurrencyRoutes(app);
registerAdminPotionsRoutes(app);
registerTokenWithdrawalRoutes(app);
registerAdminTopUpRoutes(app);
registerAdminLogsRoutes(app);
registerAdminStatsRoutes(app);
registerAdminGotchisRoutes(app);
registerAdminServersRoutes(app);
registerStatsRoutes(app);
registerDailyRunRoutes(app);
registerDailyQuestCompetitionRoutes(app);
registerShopRoutes(app);
registerCraftingRoutes(app);
registerInternalCronRoutes(app);
registerAdminCronRoutes(app);
registerAdminStoreSalesRoutes(app);
registerInventorySellRoutes(app);
registerPlayerEquipmentRoutes(app);
registerPlayerInventoryForgeRoutes(app);
registerPlayerInventoryRepairRoutes(app);
registerPlayerStakedBalanceRoutes(app);
registerPlayerProgressionRebirthRoutes(app);
registerApiKeyRoutes(app);

const isWithdrawalMonitorEnabled =
  process.env.WITHDRAWAL_MONITOR_ENABLED !== 'false';
if (isWithdrawalMonitorEnabled) {
  startWithdrawalBatchProcessor();
  startWithdrawalTxMonitor();
}

const isUsdcTopupMonitorEnabled =
  process.env.USDC_TOPUP_DISCORD_MONITOR_ENABLED !== 'false';
if (isUsdcTopupMonitorEnabled) {
  startUsdcTopupDiscordMonitor({ initialOffsetMs: 2 * 60 * 1000 });
}

startContinuousTradeSettlementMonitor();
startDailyGotchiSnapshotCron();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/leaderboard', async (req, res) => {
  res.setHeader('X-Request-Id', (req as any).id || '');

  const limitParam = req.query.limit;
  const limitValue = Array.isArray(limitParam) ? limitParam[0] : limitParam;
  const parsedLimit =
    typeof limitValue === 'string' && limitValue.trim().length > 0
      ? Number(limitValue)
      : undefined;

  const sortByParam = req.query.sortBy;
  const sortByValue = Array.isArray(sortByParam) ? sortByParam[0] : sortByParam;
  const sortBy =
    sortByValue === 'level' || sortByValue === 'usdc'
      ? (sortByValue as 'level' | 'usdc')
      : undefined;

  try {
    const players = await leaderboardRepo.getPlayersLeaderboard({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      sortBy,
    });

    res.json({ players });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// Admin: backfill a missing deposit into Supabase by tx hash
app.post('/api/admin/goldsky/deposits/backfill', async (req, res) => {
  const admin = await requireAdminSession(req, res);
  if (!admin) return;
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  const body = req.body as Record<string, unknown>;
  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid tx hash' });
  }

  try {
    // Ensure not already present
    const existing = await depositsRepo.getDepositByTxHash(txHash);
    if (existing) {
      return res
        .status(409)
        .json({ error: 'Deposit already exists', deposit: existing });
    }

    // Load from Goldsky and decode
    const goldskyRow = await fetchGoldskyRowByTxHash(txHash);
    if (!goldskyRow) {
      return res.status(404).json({ error: 'Goldsky row not found for tx' });
    }
    const decoded = decodeDepositEvent(goldskyRow);
    if (!decoded) {
      return res.status(400).json({ error: 'Failed to decode Goldsky event' });
    }

    const tokenMeta = getTokenByAddress(decoded.depositToken);
    if (!tokenMeta) {
      return res.status(400).json({ error: 'Unsupported token for backfill' });
    }

    const amountWei = decoded.depositAmountRaw;
    const amountDecimal = ethers.formatUnits(
      BigInt(amountWei),
      tokenMeta.decimals
    );

    // Create pending deposit row then mark as confirmed with metadata
    const created = await depositsRepo.createPendingDeposit({
      userId: null,
      chainId: BASE_CHAIN_ID,
      contractAddress: GAMEPOINTS_CONTRACT_ADDRESS,
      depositorAddress: decoded.user,
      tokenAddress: tokenMeta.address,
      tokenSymbol: tokenMeta.symbol,
      amount: amountDecimal,
      amountWei,
      txHash,
      autoRenew: false,
    });

    const unlockAt =
      decoded.unlockAt && decoded.unlockAt.length > 0 ? decoded.unlockAt : null;

    const updated = await depositsRepo.updateDeposit({
      id: created.id,
      txStatus: 'confirmed',
      depositId: decoded.depositId,
      yieldAmount: decoded.yieldAmountRaw,
      unlockAt,
    });

    // Attempt to immediately credit by inspecting onchain receipt
    try {
      const { checkPendingDeposits } = await import('./lib/topup/tx-check');
      await checkPendingDeposits(null, decoded.user);
    } catch {
      // best-effort
    }
    const refreshed = await depositsRepo.getDepositByTxHash(txHash);
    return res.json({ ok: true, deposit: refreshed ?? updated ?? created });
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to backfill deposit' });
  }
});

// Admin: force-credit a confirmed deposit by tx hash (best-effort)
app.post('/api/admin/goldsky/deposits/credit', async (req, res) => {
  const admin = await requireAdminSession(req, res);
  if (!admin) return;
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  const body = req.body as Record<string, unknown>;
  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid tx hash' });
  }

  try {
    const existing = await depositsRepo.getDepositByTxHash(txHash);
    if (!existing) {
      return res.status(404).json({ error: 'Deposit not found' });
    }
    if (existing.txStatus === 'credited' && existing.pointsMinted) {
      return res.json({ ok: true, deposit: existing });
    }

    // Re-run pending check against depositor address
    try {
      const { checkPendingDeposits } = await import('./lib/topup/tx-check');
      await checkPendingDeposits(
        existing.userId ?? null,
        existing.depositorAddress
      );
    } catch {
      // best-effort
    }
    const refreshed = await depositsRepo.getDepositByTxHash(txHash);
    return res.json({ ok: true, deposit: refreshed ?? existing });
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to credit deposit' });
  }
});

// Goldsky: recent raw deposits (admin diagnostics)
app.get('/api/admin/goldsky/deposits/recent', async (req, res) => {
  const admin = await requireAdminSession(req, res);
  if (!admin) return;
  res.setHeader('X-Request-Id', (req as any).id || '');
  const limitParam = req.query.limit;
  const limitValue = Array.isArray(limitParam) ? limitParam[0] : limitParam;
  const parsedLimit =
    typeof limitValue === 'string' && limitValue.trim().length > 0
      ? Number(limitValue)
      : undefined;
  const limit = Math.max(
    1,
    Math.min(500, Number.isFinite(parsedLimit) ? (parsedLimit as number) : 100)
  );
  try {
    const rows = await fetchDecodedRecentDepositsWithStatus(limit);
    return res.json({ rows, count: rows.length, decoded: true });
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to load Goldsky deposits' });
  }
});

// Top runs by score (public)
app.get('/api/leaderboard/top-runs', async (req, res) => {
  res.setHeader('X-Request-Id', (req as any).id || '');
  const limitParam = req.query.limit;
  const limitValue = Array.isArray(limitParam) ? limitParam[0] : limitParam;
  const parsedLimit =
    typeof limitValue === 'string' && limitValue.trim().length > 0
      ? Number(limitValue)
      : undefined;
  try {
    const runs = await runScoresRepo.getTopRunsByScore({
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
    });
    res.json({ runs });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load top runs' });
  }
});

// Hydrate in-memory gotchi wearable caches from subgraph when needed
async function hydrateGotchiWearablesForCharacter(
  address: string,
  characterId: string
) {
  if (!isGotchiCharacterId(characterId)) return;
  const gotchiIdPart = characterId.split(':')[1] || '';
  if (!gotchiIdPart) return;
  try {
    const { owned, slugs, assignments } =
      await verifyGotchiOwnershipForTodaySnapshot(address, gotchiIdPart);
    if (owned) {
      setGotchiWearables(gotchiIdPart, slugs || []);
      if (assignments?.length) {
        setGotchiWearableAssignments(gotchiIdPart, assignments);
      }
    }
  } catch {}
}

// Basic API endpoints
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await matchMaker.query({ name: 'game_room' });
    res.json(
      rooms.map((room) => ({
        roomId: room.roomId,
        clients: room.clients,
        maxClients: room.maxClients,
        metadata: room.metadata,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { region, isPrivate, maxPlayers } = req.body;

    const requestedMax = Number(maxPlayers);
    const clampedMax = Number.isFinite(requestedMax)
      ? Math.max(1, Math.min(GAME_CONFIG.MAX_PLAYERS, Math.floor(requestedMax)))
      : GAME_CONFIG.MAX_PLAYERS;

    const room = await matchMaker.createRoom('game_room', {
      region: region || 'us-east',
      isPrivate: isPrivate || false,
      maxPlayers: clampedMax,
    });

    res.json({
      roomId: room.roomId,
      processId: room.processId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const rooms = await matchMaker.query({ name: 'game_room' });
    const targetRoomId = req.params.roomId;
    const room = rooms.find((r) => {
      if (r.roomId === targetRoomId) return true;
      const metadata = r.metadata || {};
      return (
        metadata.roomId === targetRoomId || metadata.roomCode === targetRoomId
      );
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({
      roomId: room.roomId,
      clients: room.clients,
      maxClients: room.maxClients,
      availableSlots: Math.max(room.maxClients - room.clients, 0),
      isFull: room.clients >= room.maxClients,
      metadata: room.metadata || {},
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch room details' });
  }
});

app.post('/api/auth/nonce', (req, res) => {
  const nonce = createNonce();
  res.json({
    nonce,
    statement: SIWE_STATEMENT,
    chainId: BASE_CHAIN_ID,
  });
});

registerApiKeySiweTokenRoute(app, {
  siweDomain: SIWE_DOMAIN,
  baseChainId: BASE_CHAIN_ID,
  validateNonce,
  getAllowedDomains: getAllowedSiweDomains,
});

// Debug endpoint to inspect cookies/session (guarded by env flag)
app.get('/api/debug/session', async (req, res) => {
  if (process.env.DEBUG_SESSION !== '1') {
    return res.status(404).end();
  }
  const session = readSessionFromRequest(req);
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');
  res.json({
    hasCookieHeader: Boolean(req.headers.cookie),
    cookies: req.headers.cookie || null,
    session,
    resolved,
  });
});

app.get('/api/idle/replay', async (req, res) => {
  const MAX_REPLAY_TICKS = 100_000;

  res.setHeader('X-Request-Id', (req as any).id || '');

  const seedParam = Array.isArray(req.query.seed)
    ? req.query.seed[0]
    : req.query.seed;
  const ticksParam = Array.isArray(req.query.ticks)
    ? req.query.ticks[0]
    : req.query.ticks;
  const tickMsParam = Array.isArray(req.query.tickMs)
    ? req.query.tickMs[0]
    : req.query.tickMs;
  const leverageParam = Array.isArray(req.query.leverageTotal)
    ? req.query.leverageTotal[0]
    : req.query.leverageTotal;
  const difficultyTierParam = Array.isArray(req.query.difficultyTier)
    ? req.query.difficultyTier[0]
    : req.query.difficultyTier;
  const includeInitialFrameParam = Array.isArray(req.query.includeInitialFrame)
    ? req.query.includeInitialFrame[0]
    : req.query.includeInitialFrame;

  const parsedSeed = Number(seedParam);
  if (!Number.isFinite(parsedSeed)) {
    return res.status(400).json({
      error: 'Invalid seed',
      details: 'Query param "seed" must be a finite number.',
    });
  }

  const parsedTicks = Number(ticksParam);
  const ticks = Number.isFinite(parsedTicks)
    ? Math.max(1, Math.min(MAX_REPLAY_TICKS, Math.floor(parsedTicks)))
    : 20;

  const parsedTickMs = Number(tickMsParam);
  const tickMs = Number.isFinite(parsedTickMs)
    ? Math.max(50, Math.min(60_000, Math.floor(parsedTickMs)))
    : 1000;

  const parsedLeverageTotal = Number(leverageParam);
  const leverageTotal = Number.isFinite(parsedLeverageTotal)
    ? Math.max(1, Math.min(50, Math.floor(parsedLeverageTotal)))
    : 1;

  const difficultyTier =
    typeof difficultyTierParam === 'string' &&
    difficultyTierParam.trim().length > 0
      ? difficultyTierParam.trim().slice(0, 64)
      : undefined;

  const includeInitialFrame =
    includeInitialFrameParam === undefined
      ? true
      : String(includeInitialFrameParam).toLowerCase() !== 'false' &&
        String(includeInitialFrameParam) !== '0';

  try {
    const replay = runIdleModeReplay({
      seed: Math.floor(parsedSeed),
      ticks,
      tickMs,
      leverageTotal,
      difficultyTier,
      includeInitialFrame,
    });

    return res.json(replay);
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to run idle replay' });
  }
});

registerAuthVerifyRoute(app, {
  siweDomain: SIWE_DOMAIN,
  baseChainId: BASE_CHAIN_ID,
  sessionDurationSeconds: SESSION_DURATION_SECONDS,
  validateNonce,
  getAllowedDomains: getAllowedSiweDomains,
});
registerAuthSessionRoute(app);

app.post('/api/auth/dev-login', async (req, res) => {
  // Dev login endpoint for E2E tests and development
  // Only allowed in non-production environments
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Dev login not allowed in production' });
  }

  try {
    // Generate a dev address for testing
    const devAddress = '0x' + randomBytes(20).toString('hex');
    const normalizedAddress = devAddress.toLowerCase();

    // Get or create player for this address
    let player = await playersRepo.getPlayerByWallet(normalizedAddress);
    if (!player) {
      player = await playersRepo.upsertPlayerByWallet({
        walletAddress: normalizedAddress,
        username: `dev-${normalizedAddress.slice(2, 8)}`,
      });
    }

    // Dev login should be authorized to join rooms in non-prod environments
    if (!player.isAuthorized) {
      await getPgPool().query(
        `
          update public.players
             set is_authorized = true,
                 access_granted_at = coalesce(access_granted_at, now())
           where id = $1
        `,
        [player.id]
      );
      player = { ...player, isAuthorized: true };
    }

    const unlockedCharacters = Array.isArray(player.unlockedCharacters)
      ? player.unlockedCharacters.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0
        )
      : [];
    const normalizedUnlockedCharacters = Array.from(
      new Set([...unlockedCharacters, DEFAULT_CHARACTER_ID])
    );
    const selectedCharacterId =
      typeof player.selectedCharacterId === 'string' &&
      player.selectedCharacterId.trim().length > 0
        ? player.selectedCharacterId.trim()
        : DEFAULT_CHARACTER_ID;

    if (
      normalizedUnlockedCharacters.length !== unlockedCharacters.length ||
      selectedCharacterId !== player.selectedCharacterId
    ) {
      await getPgPool().query(
        `
          update public.players
             set unlocked_characters = $2,
                 selected_character_id = $3,
                 updated_at = now()
           where id = $1
        `,
        [player.id, normalizedUnlockedCharacters, selectedCharacterId]
      );
      player = {
        ...player,
        unlockedCharacters: normalizedUnlockedCharacters,
        selectedCharacterId,
      };
    }

    // Create a dev session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
    const sessionRecord = await authSessionsRepo.createAuthSession({
      playerId: player.id,
      walletAddress: normalizedAddress,
      nonce: `dev-${randomBytes(16).toString('hex')}`,
      expiresAt,
      userAgent: (req.headers['user-agent'] as string) || null,
      ip: getClientIp(req),
    });

    const session = createSessionCookie({
      address: normalizedAddress,
      sessionId: sessionRecord.id,
      expirationSeconds: SESSION_DURATION_SECONDS,
    });
    res.setHeader('Set-Cookie', session.cookie);

    res.json({
      address: normalizedAddress,
      playerId: player.id,
      sessionId: sessionRecord.id,
      token: session.token,
      issuedAt: sessionRecord.issuedAt || new Date().toISOString(),
      expirationTime: expiresAt.toISOString(),
      isFirstLogin: false,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to create dev session' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const session = await resolveSessionFromRequest(req);
  if (session) {
    await authSessionsRepo.invalidateAuthSession(session.sessionId);
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ success: true });
});

// Unified player endpoint: progression and preferences
app.get('/api/player', async (req, res) => {
  const tStart = nowHr();
  const resolved = await resolveAuthPrincipal(req);
  const tAfterSession = nowHr();
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    // Single DB round trip by validating session and joining player in one query
    const player = resolved.sessionId
      ? await playersRepo.getPlayerByValidSession(
          resolved.sessionId,
          resolved.address
        )
      : await playersRepo.getPlayerById(resolved.playerId);
    const tAfterDb = nowHr();
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    {
      const lastSeenMs = player.lastSeen ? Date.parse(player.lastSeen) : NaN;
      if (
        !Number.isFinite(lastSeenMs) ||
        Date.now() - lastSeenMs >= 5 * 60 * 1000
      ) {
        playersRepo.touchLastSeen(player.id).catch(() => {});
      }
    }

    const progressionFromPlayer = {
      playerId: player.id,
      level: Number(player.level ?? 1),
      totalXp: Number(player.totalXp ?? 0),
      unspentPoints: Number(player.unspentPoints ?? 0),
      rebirthCount: Number(player.rebirthCount ?? 0),
      unlockedTiers: Array.isArray(player.unlockedTiers)
        ? player.unlockedTiers
        : [],
      lickTongueCount: Number(player.lickTongueCount ?? 0),
      statAllocations: player.statAllocations ?? {},
      derivedStats: player.derivedStats ?? {},
      equippedWearables: player.equippedWearables ?? [],
      allocationHistory: player.allocationHistory ?? [],
      lastSyncedAt: player.lastSyncedAt ?? null,
      updatedAt: player.updatedAt ?? null,
    } as const;

    const rebirthMeta = getRebirthProgressionMeta(
      progressionFromPlayer.rebirthCount
    );
    const profile = clampProfileToMaxLevel(
      progressionRecordToProfile(progressionFromPlayer as any),
      rebirthMeta.currentMaxLevel
    );
    const lickTongueCount = progressionFromPlayer.lickTongueCount || 0;
    const unlockedTiers = progressionFromPlayer.unlockedTiers.length
      ? progressionFromPlayer.unlockedTiers
      : DEFAULT_UNLOCKED_TIERS;

    const rawUnlockedCharacters = Array.isArray(player.unlockedCharacters)
      ? player.unlockedCharacters
      : [];
    const unlockedCharacters = rawUnlockedCharacters.length
      ? sortAndNormalizeUnlockedCharacters(rawUnlockedCharacters)
      : [];
    const unlockedCharacterSet = new Set(unlockedCharacters);

    let storedCharacterId: string | null = null;
    try {
      storedCharacterId = normalizeCharacterId(player.selectedCharacterId);
    } catch {
      storedCharacterId = null;
    }

    const sanitizedSelectedCharacterId = isCharacterSelectionAllowed(
      storedCharacterId,
      unlockedCharacterSet
    )
      ? storedCharacterId
      : null;

    const defaults = {
      selectedCharacterId: DEFAULT_CHARACTER_ID,
      selectedDifficultyTier: DEFAULT_DIFFICULTY_TIER,
      gotchiSpriteUrl: null as string | null,
      avatarId: null as string | null,
      audioSettings: {
        ...playerPreferencesRepo.DEFAULT_AUDIO_SETTINGS,
      },
    };

    const preferences = {
      playerId: player.id,
      selectedCharacterId: sanitizedSelectedCharacterId,
      selectedDifficultyTier: player.selectedDifficultyTier ?? null,
      gotchiSpriteUrl: player.gotchiSpriteUrl ?? null,
      avatarId: player.avatarId ?? null,
      audioSettings: playerPreferencesRepo.sanitizeAudioSettings(
        player.audioSettings ?? undefined,
        defaults.audioSettings
      ),
      createdAt: player.createdAt ?? null,
      updatedAt: player.updatedAt ?? null,
    };

    const resolvedSelectedCharacterId =
      sanitizedSelectedCharacterId ??
      (unlockedCharacters.length > 0 ? unlockedCharacters[0] : null);

    const effective = {
      selectedCharacterId: resolvedSelectedCharacterId,
      selectedDifficultyTier:
        preferences.selectedDifficultyTier ?? defaults.selectedDifficultyTier,
      gotchiSpriteUrl: preferences.gotchiSpriteUrl ?? defaults.gotchiSpriteUrl,
      avatarId: preferences.avatarId ?? defaults.avatarId,
      audioSettings: {
        ...defaults.audioSettings,
        ...preferences.audioSettings,
      },
    };

    const payload = {
      playerId: resolved.playerId,
      address: resolved.address,
      username: player.username,
      isAuthorized: Boolean(player.isAuthorized),
      profile: toSerializableProfile(profile),
      unlockedTiers,
      lickTongueCount,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
      unlockedCharacters,
      preferences,
      defaults,
      effective,
    };

    const tAfterMap = nowHr();
    res.setHeader(
      'Server-Timing',
      buildServerTiming({
        sess: diffMs(tStart, tAfterSession),
        db: diffMs(tAfterSession, tAfterDb),
        map: diffMs(tAfterDb, tAfterMap),
        total: diffMs(tStart, tAfterMap),
      })
    );
    res.json(payload);
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load player' });
  }
});

app.get('/api/player/progression', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const record = await progressionRepo.getProgression(resolved.playerId);
    const rebirthMeta = getRebirthProgressionMeta(record?.rebirthCount ?? 0);
    const profile = clampProfileToMaxLevel(
      progressionRecordToProfile(record),
      rebirthMeta.currentMaxLevel
    );
    const lickTongueCount = Number(record?.lickTongueCount) || 0;
    const unlockedTiers =
      Array.isArray(record?.unlockedTiers) && record!.unlockedTiers.length > 0
        ? (record!.unlockedTiers as string[])
        : DEFAULT_UNLOCKED_TIERS;
    res.json({
      playerId: resolved.playerId,
      address: resolved.address,
      profile: toSerializableProfile(profile),
      lickTongueCount,
      unlockedTiers,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load progression' });
  }
});

app.post('/api/player/progression/allocate', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const statsInput = req.body?.stats;
  const allocationHistoryInput = req.body?.allocationHistory;

  if (!statsInput || typeof statsInput !== 'object') {
    return res.status(400).json({ error: 'stats object is required' });
  }

  const desiredStats: Record<StatKey, number> = {
    energy: 0,
    aggression: 0,
    spookiness: 0,
    brainSize: 0,
  };

  for (const key of STAT_KEYS) {
    const rawValue = Number((statsInput as Record<string, unknown>)[key]);
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      return res.status(400).json({ error: `Invalid stat value for ${key}` });
    }
    desiredStats[key] = Math.floor(rawValue);
  }

  try {
    const record = await progressionRepo.getProgression(resolved.playerId);
    const rebirthMeta = getRebirthProgressionMeta(record?.rebirthCount ?? 0);
    const currentProfile = clampProfileToMaxLevel(
      progressionRecordToProfile(record),
      rebirthMeta.currentMaxLevel
    );

    const currentStats = currentProfile.stats;
    const diffs: Record<StatKey, number> = {
      energy: 0,
      aggression: 0,
      spookiness: 0,
      brainSize: 0,
    };

    let totalDiff = 0;
    for (const key of STAT_KEYS) {
      const desired = desiredStats[key];
      const current = currentStats[key];
      if (desired < current) {
        return res
          .status(400)
          .json({ error: `Stat ${key} cannot be decreased` });
      }
      const diff = desired - current;
      diffs[key] = diff;
      totalDiff += diff;
    }

    if (totalDiff === 0) {
      return res.json({
        profile: toSerializableProfile(currentProfile),
      });
    }

    if (totalDiff > currentProfile.unspentPoints) {
      return res.status(400).json({ error: 'Not enough unspent points' });
    }

    const existingHistory = Array.isArray(currentProfile.allocationHistory)
      ? [...currentProfile.allocationHistory]
      : [];

    let sanitizedIncomingHistory: StatKey[] | null = null;
    if (Array.isArray(allocationHistoryInput)) {
      const parsedHistory: StatKey[] = [];
      for (const value of allocationHistoryInput) {
        if (STAT_KEYS.includes(value as StatKey)) {
          parsedHistory.push(value as StatKey);
        } else {
          return res.status(400).json({ error: 'Invalid allocation history' });
        }
      }
      sanitizedIncomingHistory = parsedHistory;
    }

    let appendedHistory: StatKey[] = [];

    if (sanitizedIncomingHistory) {
      if (sanitizedIncomingHistory.length < existingHistory.length) {
        return res.status(400).json({ error: 'Allocation history mismatch' });
      }

      for (let i = 0; i < existingHistory.length; i += 1) {
        if (sanitizedIncomingHistory[i] !== existingHistory[i]) {
          return res.status(400).json({ error: 'Allocation history mismatch' });
        }
      }

      appendedHistory = sanitizedIncomingHistory.slice(existingHistory.length);
      if (appendedHistory.length !== totalDiff) {
        return res
          .status(400)
          .json({ error: 'Allocation history length mismatch' });
      }
    } else {
      appendedHistory = STAT_KEYS.flatMap((key) =>
        Array.from({ length: diffs[key] }, () => key)
      );
    }

    const appendedCounts: Record<StatKey, number> = {
      energy: 0,
      aggression: 0,
      spookiness: 0,
      brainSize: 0,
    };
    appendedHistory.forEach((key) => {
      appendedCounts[key] += 1;
    });

    for (const key of STAT_KEYS) {
      if (appendedCounts[key] !== diffs[key]) {
        return res
          .status(400)
          .json({ error: 'Allocation history does not match stat changes' });
      }
    }

    const updatedStats: Record<StatKey, number> = { ...currentStats };
    for (const key of STAT_KEYS) {
      updatedStats[key] += diffs[key];
    }

    const updatedHistory = existingHistory.concat(appendedHistory);
    const newUnspentPoints = currentProfile.unspentPoints - totalDiff;

    const lastSyncedAtIso = new Date().toISOString();

    const currentUnlockedTiers =
      Array.isArray(record?.unlockedTiers) && record!.unlockedTiers.length > 0
        ? [...(record!.unlockedTiers as string[])]
        : [...DEFAULT_UNLOCKED_TIERS];
    const currentLickTongueCount = Number(record?.lickTongueCount) || 0;

    const updatedRecord = await progressionRepo.upsertProgression({
      playerId: resolved.playerId,
      level: currentProfile.level,
      totalXp: currentProfile.totalXp,
      unspentPoints: newUnspentPoints,
      rebirthCount: rebirthMeta.rebirthCount,
      unlockedTiers: currentUnlockedTiers,
      lickTongueCount: currentLickTongueCount,
      statAllocations: updatedStats,
      derivedStats: record?.derivedStats ?? {},
      equippedWearables: record?.equippedWearables ?? [],
      allocationHistory: updatedHistory,
      lastSyncedAt: lastSyncedAtIso,
    });

    const updatedProfile = progressionRecordToProfile(updatedRecord);
    const updatedUnlockedTiers =
      Array.isArray(updatedRecord.unlockedTiers) &&
      updatedRecord.unlockedTiers.length > 0
        ? updatedRecord.unlockedTiers
        : DEFAULT_UNLOCKED_TIERS;

    res.json({
      profile: toSerializableProfile(updatedProfile),
      unlockedTiers: updatedUnlockedTiers,
      lickTongueCount: updatedRecord.lickTongueCount ?? 0,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to apply stat allocations' });
  }
});

// Deallocate all allocated stat points (keep level/xp, refund spent points)
app.post('/api/player/progression/deallocate', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const record = await progressionRepo.getProgression(resolved.playerId);
    const rebirthMeta = getRebirthProgressionMeta(record?.rebirthCount ?? 0);
    const currentProfile = clampProfileToMaxLevel(
      progressionRecordToProfile(record),
      rebirthMeta.currentMaxLevel
    );

    const totalAllocated =
      (currentProfile.stats.energy || 0) +
      (currentProfile.stats.aggression || 0) +
      (currentProfile.stats.spookiness || 0) +
      (currentProfile.stats.brainSize || 0);

    const maxPoints = Math.max(0, currentProfile.level - 1);
    const newUnspentPoints = Math.min(
      maxPoints,
      Math.max(0, currentProfile.unspentPoints + totalAllocated)
    );

    const lastSyncedAtIso = new Date().toISOString();
    const currentLickTongueCount = Number(record?.lickTongueCount) || 0;
    const currentUnlockedTiers =
      Array.isArray(record?.unlockedTiers) && record!.unlockedTiers.length > 0
        ? [...(record!.unlockedTiers as string[])]
        : [...DEFAULT_UNLOCKED_TIERS];

    const updatedRecord = await progressionRepo.upsertProgression({
      playerId: resolved.playerId,
      level: currentProfile.level,
      totalXp: currentProfile.totalXp,
      unspentPoints: newUnspentPoints,
      rebirthCount: rebirthMeta.rebirthCount,
      unlockedTiers: currentUnlockedTiers,
      lickTongueCount: currentLickTongueCount,
      statAllocations: {
        energy: 0,
        aggression: 0,
        spookiness: 0,
        brainSize: 0,
      },
      derivedStats: record?.derivedStats ?? {},
      equippedWearables: record?.equippedWearables ?? [],
      allocationHistory: [],
      lastSyncedAt: lastSyncedAtIso,
    });

    const updatedProfile = progressionRecordToProfile(updatedRecord);
    const updatedUnlockedTiers =
      Array.isArray(updatedRecord.unlockedTiers) &&
      updatedRecord.unlockedTiers.length > 0
        ? (updatedRecord.unlockedTiers as string[])
        : DEFAULT_UNLOCKED_TIERS;

    res.json({
      profile: toSerializableProfile(updatedProfile),
      unlockedTiers: updatedUnlockedTiers,
      lickTongueCount: updatedRecord.lickTongueCount ?? 0,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to deallocate stat points' });
  }
});

// Reset progression to defaults (level 1, 0 XP, no allocations)
app.post('/api/player/progression/reset', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const record = await progressionRepo.getProgression(resolved.playerId);
    const rebirthMeta = getRebirthProgressionMeta(record?.rebirthCount ?? 0);

    const currentLickTongueCount = Number(record?.lickTongueCount) || 0;
    const currentUnlockedTiers =
      Array.isArray(record?.unlockedTiers) && record!.unlockedTiers.length > 0
        ? [...(record!.unlockedTiers as string[])]
        : [...DEFAULT_UNLOCKED_TIERS];
    const lastSyncedAtIso = new Date().toISOString();

    const updatedRecord = await progressionRepo.upsertProgression({
      playerId: resolved.playerId,
      level: 1,
      totalXp: 0,
      unspentPoints: 0,
      rebirthCount: rebirthMeta.rebirthCount,
      unlockedTiers: currentUnlockedTiers,
      lickTongueCount: currentLickTongueCount,
      statAllocations: {
        energy: 0,
        aggression: 0,
        spookiness: 0,
        brainSize: 0,
      },
      derivedStats: record?.derivedStats ?? {},
      equippedWearables: record?.equippedWearables ?? [],
      allocationHistory: [],
      lastSyncedAt: lastSyncedAtIso,
    });

    const updatedProfile = progressionRecordToProfile(updatedRecord);
    const updatedUnlockedTiers =
      Array.isArray(updatedRecord.unlockedTiers) &&
      updatedRecord.unlockedTiers.length > 0
        ? (updatedRecord.unlockedTiers as string[])
        : DEFAULT_UNLOCKED_TIERS;

    res.json({
      profile: toSerializableProfile(updatedProfile),
      unlockedTiers: updatedUnlockedTiers,
      lickTongueCount: updatedRecord.lickTongueCount ?? 0,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to reset progression' });
  }
});

/* Rebirth progression: reset level/xp in exchange for Lick Tongues and +3 max levels. (moved to routes/player-progression-rebirth.ts)
app.post('/api/player/progression/rebirth', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const playerId = resolved.playerId as string;
    const result = await runTransaction(async (client) => {
      const playerResult = await client.query<{
        level: number | null;
        total_xp: number | null;
        unspent_points: number | null;
        rebirth_count: number | null;
        unlocked_tiers: unknown;
        lick_tongue_count: number | null;
        stat_allocations: unknown;
        allocation_history: unknown;
        last_synced_at: string | null;
      }>(
        `select
           level,
           total_xp,
           unspent_points,
           rebirth_count,
           unlocked_tiers,
           lick_tongue_count,
           stat_allocations,
           allocation_history,
           last_synced_at
         from players
         where id = $1
         for update`,
        [playerId]
      );

      if (playerResult.rows.length === 0) {
        const err = new Error('Player not found');
        (err as any).code = 'PLAYER_NOT_FOUND';
        throw err;
      }

      const playerRow = playerResult.rows[0];
      const rebirthCountBefore = sanitizeRebirthCount(playerRow.rebirth_count);

      if (isRebirthCapReached(rebirthCountBefore)) {
        const err = new Error('Maximum rebirth reached');
        (err as any).code = 'REBIRTH_CAP_REACHED';
        throw err;
      }

      const currentMaxLevel = getUnlockedMaxLevel(rebirthCountBefore);
      const currentProfile = clampProfileToMaxLevel(
        sanitizeProfile(
          {
            level: Number(playerRow.level ?? 1),
            totalXp: Number(playerRow.total_xp ?? 0),
            unspentPoints: Number(playerRow.unspent_points ?? 0),
            stats:
              playerRow.stat_allocations && typeof playerRow.stat_allocations === 'object'
                ? (playerRow.stat_allocations as ProgressionProfile['stats'])
                : undefined,
            allocationHistory: Array.isArray(playerRow.allocation_history)
              ? playerRow.allocation_history
              : undefined,
            lastSyncedAt: playerRow.last_synced_at
              ? Date.parse(playerRow.last_synced_at)
              : undefined,
          },
          currentMaxLevel
        ),
        currentMaxLevel
      );

      if (currentProfile.level < currentMaxLevel) {
        const err = new Error('Must be at current max level to rebirth');
        (err as any).code = 'LEVEL_TOO_LOW';
        (err as any).requiredLevel = currentMaxLevel;
        (err as any).currentLevel = currentProfile.level;
        throw err;
      }

      let inventoryResult = await client.query<PlayerInventoryRow>(
        `select *
           from player_inventories
          where player_id = $1
            and (
              (item_type = $2 and item_name = $3)
              or lower(item_name) like $4
              or lower(item_name) like $5
            )
          order by case
            when item_type = $2 and item_name = $3 then 0
            else 1
          end,
          lower(item_name) asc`,
        [
          playerId,
          LICK_TONGUE_ITEM_TYPE,
          LICK_TONGUE_ITEM_NAME,
          '%lick tongue%',
          '%lick_tongue%',
        ]
      );

      let inventoryRows = inventoryResult.rows;
      let totalAvailable = inventoryRows.reduce((total, row) => {
        const quantity = Number(row.quantity) || 0;
        return total + (quantity > 0 ? quantity : 0);
      }, 0);

      const recordedCount = Number(playerRow.lick_tongue_count) || 0;
      if (recordedCount > totalAvailable) {
        const deficit = recordedCount - totalAvailable;
        if (deficit > 0) {
          await inventoryRepo.upsertInventoryItem({
            playerId,
            itemType: LICK_TONGUE_ITEM_TYPE,
            itemName: LICK_TONGUE_ITEM_NAME,
            quantity: deficit,
            client,
          });

          inventoryResult = await client.query<PlayerInventoryRow>(
            `select *
               from player_inventories
              where player_id = $1
                and (
                  (item_type = $2 and item_name = $3)
                  or lower(item_name) like $4
                  or lower(item_name) like $5
                )
              order by case
                when item_type = $2 and item_name = $3 then 0
                else 1
              end,
              lower(item_name) asc`,
            [
              playerId,
              LICK_TONGUE_ITEM_TYPE,
              LICK_TONGUE_ITEM_NAME,
              '%lick tongue%',
              '%lick_tongue%',
            ]
          );

          inventoryRows = inventoryResult.rows;
          totalAvailable = inventoryRows.reduce((total, row) => {
            const quantity = Number(row.quantity) || 0;
            return total + (quantity > 0 ? quantity : 0);
          }, 0);
        }
      }

      if (totalAvailable < REBIRTH_COST_LICK_TONGUES) {
        const err = new Error('Not enough Lick Tongues');
        (err as any).code = 'INSUFFICIENT_TONGUES';
        (err as any).required = REBIRTH_COST_LICK_TONGUES;
        (err as any).available = totalAvailable;
        throw err;
      }

      let remaining = REBIRTH_COST_LICK_TONGUES;
      for (const row of inventoryRows) {
        if (remaining <= 0) {
          break;
        }
        const available = Number(row.quantity) || 0;
        if (available <= 0) {
          continue;
        }
        const spend = Math.min(available, remaining);
        const decremented = await inventoryRepo.decrementInventoryItem(
          playerId,
          row.item_type,
          row.item_name,
          spend,
          client
        );
        if (!decremented) {
          const err = new Error('Inventory row disappeared during rebirth');
          (err as any).code = 'DECREMENT_FAILED';
          throw err;
        }
        remaining -= spend;
      }

      if (remaining > 0) {
        const err = new Error('Failed to deduct required quantity');
        (err as any).code = 'DECREMENT_FAILED';
        throw err;
      }

      const nextRebirthCount = sanitizeRebirthCount(rebirthCountBefore + 1);
      const nextMaxLevel = getUnlockedMaxLevel(nextRebirthCount);
      const updatedLickTongueCount = Math.max(
        0,
        totalAvailable - REBIRTH_COST_LICK_TONGUES
      );
      const lastSyncedAtIso = new Date().toISOString();

      const updateResult = await client.query<{
        unlocked_tiers: unknown;
        lick_tongue_count: number | null;
        rebirth_count: number | null;
      }>(
        `update players
            set level = 1,
                total_xp = 0,
                unspent_points = 0,
                rebirth_count = $2,
                lick_tongue_count = $3,
                stat_allocations = $4::jsonb,
                allocation_history = $5::jsonb,
                last_synced_at = $6,
                updated_at = now()
          where id = $1
          returning unlocked_tiers, lick_tongue_count, rebirth_count`,
        [
          playerId,
          nextRebirthCount,
          updatedLickTongueCount,
          JSON.stringify({
            energy: 0,
            aggression: 0,
            spookiness: 0,
            brainSize: 0,
          }),
          JSON.stringify([]),
          lastSyncedAtIso,
        ]
      );

      const updatedRow = updateResult.rows[0];
      const unlockedTiers =
        Array.isArray(updatedRow?.unlocked_tiers) &&
        updatedRow.unlocked_tiers.length > 0
          ? (updatedRow.unlocked_tiers as string[])
          : DEFAULT_UNLOCKED_TIERS;
      const persistedLickTongueCount =
        Number(updatedRow?.lick_tongue_count) || updatedLickTongueCount;

      return {
        rebirthCountBefore,
        rebirthCountAfter:
          Number(updatedRow?.rebirth_count) || nextRebirthCount,
        currentMaxLevel: nextMaxLevel,
        unlockedTiers,
        lickTongueCount: persistedLickTongueCount,
      };
    });

    const rebirthMeta = getRebirthProgressionMeta(result.rebirthCountAfter);
    const resetProfile = sanitizeProfile(
      {
        level: 1,
        totalXp: 0,
        unspentPoints: 0,
        stats: {
          energy: 0,
          aggression: 0,
          spookiness: 0,
          brainSize: 0,
        },
        allocationHistory: [],
      },
      rebirthMeta.currentMaxLevel
    );

    try {
      await inventoryEventsRepo.logInventoryEvent({
        playerId,
        itemType: LICK_TONGUE_ITEM_TYPE,
        itemName: LICK_TONGUE_ITEM_NAME,
        delta: -REBIRTH_COST_LICK_TONGUES,
        reason: 'rebirth_purchase',
        metadata: {
          cost: REBIRTH_COST_LICK_TONGUES,
          rebirthCountBefore: result.rebirthCountBefore,
          rebirthCountAfter: result.rebirthCountAfter,
          currentMaxLevel: rebirthMeta.currentMaxLevel,
        },
      });
    } catch (eventError) {
      console.warn('Failed to log inventory event for rebirth', {
        playerId,
        error: eventError,
      });
    }

    logEvent(
      'player_rebirth',
      {
        rebirthCountBefore: result.rebirthCountBefore,
        rebirthCountAfter: result.rebirthCountAfter,
        currentMaxLevel: rebirthMeta.currentMaxLevel,
        lickTongueCost: REBIRTH_COST_LICK_TONGUES,
        remainingTongues: result.lickTongueCount,
      },
      req
    );

    res.json({
      profile: toSerializableProfile(resetProfile),
      unlockedTiers: result.unlockedTiers,
      lickTongueCount: result.lickTongueCount,
      rebirthCount: rebirthMeta.rebirthCount,
      currentMaxLevel: rebirthMeta.currentMaxLevel,
      absoluteMaxLevel: rebirthMeta.absoluteMaxLevel,
      rebirthCost: rebirthMeta.rebirthCost,
    });
  } catch (error) {
    if ((error as any)?.code === 'PLAYER_NOT_FOUND') {
      return res.status(404).json({ error: 'Player not found' });
    }
    if ((error as any)?.code === 'INSUFFICIENT_TONGUES') {
      return res.status(400).json({ error: 'Not enough Lick Tongues' });
    }
    if ((error as any)?.code === 'LEVEL_TOO_LOW') {
      const requiredLevel =
        Number((error as any)?.requiredLevel) || getUnlockedMaxLevel(0);
      const currentLevel = Number((error as any)?.currentLevel) || 1;
      return res.status(400).json({
        error: `Reach level ${requiredLevel} before rebirthing (current level ${currentLevel}).`,
      });
    }
    if ((error as any)?.code === 'REBIRTH_CAP_REACHED') {
      return res.status(400).json({
        error: `Rebirth is capped at level ${ABSOLUTE_PLAYER_LEVEL_CAP}.`,
      });
    }
    if ((error as any)?.code === 'DECREMENT_FAILED') {
      return res
        .status(409)
        .json({ error: 'Rebirth could not be completed, please retry' });
    }
    logError(error, req);
    res.status(500).json({ error: 'Failed to complete rebirth' });
  }
});
*/

app.post('/api/player/unlocks/character', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const body = req.body as Record<string, unknown>;
  let normalizedCharacterId: string;
  try {
    const candidate =
      normalizeCharacterId(body.characterId) ||
      normalizeCharacterId(body.id) ||
      normalizeCharacterId(body.character);
    if (!candidate) {
      throw new Error('Missing characterId');
    }
    normalizedCharacterId = candidate;
  } catch (error) {
    return res.status(400).json({ error: 'Character id not recognized' });
  }

  if (isGotchiCharacterId(normalizedCharacterId)) {
    return res
      .status(400)
      .json({ error: 'Dynamic characters do not require unlocking' });
  }

  if (!CHARACTER_ID_SET.has(normalizedCharacterId)) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const characterInfo = CHARACTER_BY_ID.get(normalizedCharacterId);
  if (!characterInfo) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const cost = getCharacterUnlockCost(normalizedCharacterId);
  if (!cost || cost <= 0) {
    return res
      .status(400)
      .json({ error: 'Character does not require unlocking' });
  }

  console.log('cost', cost);

  try {
    const playerId = resolved.playerId as string;
    const result = await runTransaction(async (client) => {
      const playerResult = await client.query<{
        unlocked_characters: unknown;
        lick_tongue_count: number | null;
      }>(
        `select unlocked_characters, lick_tongue_count
           from players
          where id = $1
          for update`,
        [playerId]
      );

      if (playerResult.rows.length === 0) {
        const err = new Error('Player not found');
        (err as any).code = 'PLAYER_NOT_FOUND';
        throw err;
      }

      const playerRow = playerResult.rows[0];
      const existingUnlocked = Array.isArray(playerRow.unlocked_characters)
        ? (playerRow.unlocked_characters as string[])
        : [];
      if (existingUnlocked.includes(normalizedCharacterId)) {
        return {
          status: 'already' as const,
          unlockedCharacters:
            sortAndNormalizeUnlockedCharacters(existingUnlocked),
          lickTongueCount: Number(playerRow.lick_tongue_count) || 0,
          selectedCharacterId: normalizedCharacterId,
        };
      }

      let inventoryResult = await client.query<PlayerInventoryRow>(
        `select *
           from player_inventories
          where player_id = $1
            and (
              (item_type = $2 and item_name = $3)
              or lower(item_name) like $4
              or lower(item_name) like $5
            )
          order by case
            when item_type = $2 and item_name = $3 then 0
            else 1
          end,
          lower(item_name) asc`,
        [
          playerId,
          LICK_TONGUE_ITEM_TYPE,
          LICK_TONGUE_ITEM_NAME,
          '%lick tongue%',
          '%lick_tongue%',
        ]
      );

      let inventoryRows = inventoryResult.rows;
      let totalAvailable = inventoryRows.reduce((total, row) => {
        const quantity = Number(row.quantity) || 0;
        return total + (quantity > 0 ? quantity : 0);
      }, 0);

      const recordedCount = Number(playerRow.lick_tongue_count) || 0;
      if (recordedCount > totalAvailable) {
        const deficit = recordedCount - totalAvailable;
        if (deficit > 0) {
          await inventoryRepo.upsertInventoryItem({
            playerId,
            itemType: LICK_TONGUE_ITEM_TYPE,
            itemName: LICK_TONGUE_ITEM_NAME,
            quantity: deficit,
            client,
          });

          inventoryResult = await client.query<PlayerInventoryRow>(
            `select *
               from player_inventories
              where player_id = $1
                and (
                  (item_type = $2 and item_name = $3)
                  or lower(item_name) like $4
                  or lower(item_name) like $5
                )
              order by case
                when item_type = $2 and item_name = $3 then 0
                else 1
              end,
              lower(item_name) asc`,
            [
              playerId,
              LICK_TONGUE_ITEM_TYPE,
              LICK_TONGUE_ITEM_NAME,
              '%lick tongue%',
              '%lick_tongue%',
            ]
          );

          inventoryRows = inventoryResult.rows;
          totalAvailable = inventoryRows.reduce((total, row) => {
            const quantity = Number(row.quantity) || 0;
            return total + (quantity > 0 ? quantity : 0);
          }, 0);
        }
      }

      if (totalAvailable < cost) {
        const err = new Error('Not enough Lick Tongues');
        (err as any).code = 'INSUFFICIENT_TONGUES';
        throw err;
      }

      let remaining = cost;

      console.log('remaining', remaining);

      for (const row of inventoryRows) {
        if (remaining <= 0) {
          break;
        }
        const available = Number(row.quantity) || 0;
        if (available <= 0) {
          continue;
        }
        const spend = Math.min(available, remaining);
        const decremented = await inventoryRepo.decrementInventoryItem(
          playerId,
          row.item_type,
          row.item_name,
          spend,
          client
        );
        if (!decremented) {
          const err = new Error('Inventory row disappeared during unlock');
          (err as any).code = 'DECREMENT_FAILED';
          throw err;
        }
        remaining -= spend;
      }

      if (remaining > 0) {
        const err = new Error('Failed to deduct required quantity');
        (err as any).code = 'DECREMENT_FAILED';
        throw err;
      }

      const unlockedSet = new Set(existingUnlocked);
      unlockedSet.add(normalizedCharacterId);
      const orderedUnlocked = sortAndNormalizeUnlockedCharacters(unlockedSet);
      const updatedLickTongueCount = Math.max(0, totalAvailable - cost);

      const updateResult = await client.query<{
        unlocked_characters: unknown;
        lick_tongue_count: number | null;
        selected_character_id: string | null;
      }>(
        `update players
            set unlocked_characters = $2,
                lick_tongue_count = $3,
                selected_character_id = $4,
                updated_at = now()
          where id = $1
          returning unlocked_characters, lick_tongue_count, selected_character_id`,
        [
          playerId,
          orderedUnlocked,
          updatedLickTongueCount,
          normalizedCharacterId,
        ]
      );

      const updatedRow = updateResult.rows[0];
      const persistedUnlocked = Array.isArray(updatedRow?.unlocked_characters)
        ? (updatedRow.unlocked_characters as string[])
        : orderedUnlocked;
      const persistedLickTongueCount =
        Number(updatedRow?.lick_tongue_count) || updatedLickTongueCount;
      const persistedSelectedCharacterId =
        typeof updatedRow?.selected_character_id === 'string'
          ? updatedRow.selected_character_id
          : normalizedCharacterId;

      return {
        status: 'unlocked' as const,
        unlockedCharacters:
          sortAndNormalizeUnlockedCharacters(persistedUnlocked),
        lickTongueCount: persistedLickTongueCount,
        selectedCharacterId: persistedSelectedCharacterId,
      };
    });

    if (result.status === 'already') {
      return res.status(409).json({
        error: 'Character already unlocked',
        unlockedCharacters: result.unlockedCharacters,
        lickTongueCount: result.lickTongueCount,
        selectedCharacterId: result.selectedCharacterId,
      });
    }

    try {
      await inventoryEventsRepo.logInventoryEvent({
        playerId,
        itemType: LICK_TONGUE_ITEM_TYPE,
        itemName: LICK_TONGUE_ITEM_NAME,
        delta: -cost,
        reason: 'unlock_character',
        metadata: {
          characterId: normalizedCharacterId,
          cost,
          remaining: result.lickTongueCount,
        },
      });
    } catch (eventError) {
      console.warn('Failed to log inventory event for character unlock', {
        playerId,
        characterId: normalizedCharacterId,
        error: eventError,
      });
    }

    logEvent(
      'character_unlocked',
      {
        characterId: normalizedCharacterId,
        cost,
        remainingTongues: result.lickTongueCount,
      },
      req
    );

    res.json({
      unlockedCharacters: result.unlockedCharacters,
      lickTongueCount: result.lickTongueCount,
      selectedCharacterId: result.selectedCharacterId,
    });
  } catch (error) {
    if ((error as any)?.code === 'PLAYER_NOT_FOUND') {
      return res.status(404).json({ error: 'Player not found' });
    }
    if ((error as any)?.code === 'INSUFFICIENT_TONGUES') {
      return res.status(400).json({ error: 'Not enough Lick Tongues' });
    }
    if ((error as any)?.code === 'DECREMENT_FAILED') {
      return res
        .status(409)
        .json({ error: 'Unlock could not be completed, please retry' });
    }
    logError(error, req);

    console.error('error', error);

    res.status(500).json({ error: 'Failed to unlock character' });
  }
});

app.get('/api/player/preferences', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const player = await playersRepo.getPlayerById(resolved.playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const rawUnlockedCharacters = Array.isArray(player.unlockedCharacters)
      ? player.unlockedCharacters
      : [];
    const unlockedCharacters = rawUnlockedCharacters.length
      ? sortAndNormalizeUnlockedCharacters(rawUnlockedCharacters)
      : [];
    const unlockedCharacterSet = new Set(unlockedCharacters);

    const defaults = {
      selectedCharacterId: DEFAULT_CHARACTER_ID,
      selectedDifficultyTier: DEFAULT_DIFFICULTY_TIER,
      gotchiSpriteUrl: null as string | null,
      avatarId: null as string | null,
      audioSettings: {
        ...playerPreferencesRepo.DEFAULT_AUDIO_SETTINGS,
      },
    };

    const existing = await playerPreferencesRepo.getPreferences(
      resolved.playerId
    );

    const basePreferences = existing
      ? existing
      : await playerPreferencesRepo.upsertPreferences({
          playerId: resolved.playerId,
          selectedCharacterId: null,
          selectedDifficultyTier: defaults.selectedDifficultyTier,
          gotchiSpriteUrl: defaults.gotchiSpriteUrl,
          avatarId: defaults.avatarId,
          audioSettings: defaults.audioSettings,
        });

    let storedCharacterId: string | null = null;
    try {
      storedCharacterId = normalizeCharacterId(
        basePreferences.selectedCharacterId
      );
    } catch {
      storedCharacterId = null;
    }

    const sanitizedSelectedCharacterId = isCharacterSelectionAllowed(
      storedCharacterId,
      unlockedCharacterSet
    )
      ? storedCharacterId
      : null;

    const preferences = {
      ...basePreferences,
      selectedCharacterId: sanitizedSelectedCharacterId,
    };

    const resolvedSelectedCharacterId =
      sanitizedSelectedCharacterId ??
      (unlockedCharacters.length > 0 ? unlockedCharacters[0] : null);

    const effective = {
      selectedCharacterId: resolvedSelectedCharacterId,
      selectedDifficultyTier:
        preferences.selectedDifficultyTier ?? defaults.selectedDifficultyTier,
      gotchiSpriteUrl: preferences.gotchiSpriteUrl ?? defaults.gotchiSpriteUrl,
      avatarId: preferences.avatarId ?? defaults.avatarId,
      audioSettings: {
        ...defaults.audioSettings,
        ...preferences.audioSettings,
      },
    };

    res.json({
      playerId: resolved.playerId,
      preferences,
      effective,
      defaults,
      unlockedCharacters,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load player preferences' });
  }
});

app.put('/api/player/preferences', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const body = req.body || {};
  const errors: string[] = [];
  const patch: playerPreferencesRepo.UpdatePreferencesPatch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'selectedCharacterId')) {
    let normalizedCharacterId: string | null = null;
    let normalizationFailed = false;
    try {
      normalizedCharacterId = normalizeCharacterId(body.selectedCharacterId);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Invalid selected character id'
      );
      normalizationFailed = true;
    }

    if (!normalizationFailed) {
      if (!normalizedCharacterId) {
        patch.selectedCharacterId = null;
      } else if (isGotchiCharacterId(normalizedCharacterId)) {
        patch.selectedCharacterId = normalizedCharacterId;
      } else {
        const playerRecord = await playersRepo.getPlayerById(resolved.playerId);
        if (!playerRecord) {
          return res.status(404).json({ error: 'Player not found' });
        }
        const rawUnlockedCharacters = Array.isArray(
          playerRecord.unlockedCharacters
        )
          ? playerRecord.unlockedCharacters
          : [];
        const unlockedCharacters = rawUnlockedCharacters.length
          ? sortAndNormalizeUnlockedCharacters(rawUnlockedCharacters)
          : [];
        const unlockedSet = new Set(unlockedCharacters);
        if (!unlockedSet.has(normalizedCharacterId)) {
          errors.push('Character is not unlocked yet');
        } else {
          patch.selectedCharacterId = normalizedCharacterId;
        }
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'selectedDifficultyTier')) {
    try {
      const normalized = normalizeDifficultyTierId(body.selectedDifficultyTier);
      if (normalized) {
        const stakedBalance = await depositsRepo.getStakedUnlockBalances(
          resolved.playerId
        );
        if (!isTierEligible(normalized, stakedBalance.total)) {
          errors.push('Insufficient USDC/GHO staked for selected difficulty');
        } else {
          patch.selectedDifficultyTier = normalized;
        }
      } else {
        patch.selectedDifficultyTier = null;
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : 'Invalid selected difficulty tier'
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'gotchiSpriteUrl')) {
    try {
      patch.gotchiSpriteUrl = sanitizeSpriteUrl(body.gotchiSpriteUrl);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'Invalid gotchi sprite url'
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatarId')) {
    try {
      patch.avatarId = sanitizeAvatarId(body.avatarId);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid avatar id');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'audioSettings')) {
    patch.audioSettings = body.audioSettings;
  }

  if (errors.length > 0) {
    return res
      .status(400)
      .json({ error: 'Invalid preferences', details: errors });
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({
      error: 'No preference fields provided',
    });
  }

  try {
    const updated = await playerPreferencesRepo.updatePreferences(
      resolved.playerId,
      patch
    );

    const defaults = {
      selectedCharacterId: DEFAULT_CHARACTER_ID,
      selectedDifficultyTier: DEFAULT_DIFFICULTY_TIER,
      gotchiSpriteUrl: null as string | null,
      avatarId: null as string | null,
      audioSettings: {
        ...playerPreferencesRepo.DEFAULT_AUDIO_SETTINGS,
      },
    };

    const effective = {
      selectedCharacterId:
        updated.selectedCharacterId ?? defaults.selectedCharacterId,
      selectedDifficultyTier:
        updated.selectedDifficultyTier ?? defaults.selectedDifficultyTier,
      gotchiSpriteUrl: updated.gotchiSpriteUrl ?? defaults.gotchiSpriteUrl,
      avatarId: updated.avatarId ?? defaults.avatarId,
      audioSettings: {
        ...defaults.audioSettings,
        ...updated.audioSettings,
      },
    };

    res.json({
      playerId: resolved.playerId,
      preferences: updated,
      effective,
      defaults,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to update player preferences' });
  }
});

app.put('/api/player/username', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const body = req.body as Record<string, unknown>;
  const username =
    typeof body.username === 'string'
      ? body.username
      : body.username === null
        ? null
        : undefined;

  if (username === undefined) {
    return res.status(400).json({ error: 'username must be a string or null' });
  }

  try {
    const updated = await playersRepo.updateUsername(
      resolved.playerId,
      username
    );

    if (!updated) {
      return res.status(404).json({ error: 'Player not found' });
    }

    res.json({
      playerId: resolved.playerId,
      username: updated.username,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to update username' });
  }
});

app.post('/api/player/character/select', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const body = req.body as Record<string, unknown>;
  let normalizedCharacterId: string | null = null;
  try {
    normalizedCharacterId = normalizeCharacterId(body.characterId);
    if (!normalizedCharacterId) {
      throw new Error('Missing characterId');
    }
  } catch (error) {
    return res.status(400).json({ error: 'Character id not recognized' });
  }

  const player = await playersRepo.getPlayerById(resolved.playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const rawUnlockedCharacters = Array.isArray(player.unlockedCharacters)
    ? player.unlockedCharacters
    : [];
  const unlockedCharacters = rawUnlockedCharacters.length
    ? sortAndNormalizeUnlockedCharacters(rawUnlockedCharacters)
    : [];
  const unlockedCharacterSet = new Set(unlockedCharacters);

  if (
    !isCharacterSelectionAllowed(normalizedCharacterId, unlockedCharacterSet)
  ) {
    return res.status(400).json({ error: 'Character is not unlocked yet' });
  }

  let sanitizedSpriteUrl: string | null | undefined;
  const spriteProvided = Object.prototype.hasOwnProperty.call(
    body,
    'gotchiSpriteUrl'
  );
  if (spriteProvided) {
    try {
      sanitizedSpriteUrl = sanitizeSpriteUrl(body.gotchiSpriteUrl);
    } catch (error) {
      return res.status(400).json({
        error:
          error instanceof Error ? error.message : 'Invalid gotchi sprite url',
      });
    }
  }

  // If selecting a dynamic gotchi character, hydrate server-side wearable cache
  await hydrateGotchiWearablesForCharacter(
    resolved.address,
    normalizedCharacterId
  );

  const updatePayload: playerPreferencesRepo.UpdatePreferencesPatch = {
    selectedCharacterId: normalizedCharacterId,
  };

  if (isGotchiCharacterId(normalizedCharacterId)) {
    if (spriteProvided) {
      updatePayload.gotchiSpriteUrl = sanitizedSpriteUrl ?? null;
    }
  } else {
    updatePayload.gotchiSpriteUrl = null;
  }

  try {
    const updated = await playerPreferencesRepo.updatePreferences(
      resolved.playerId,
      updatePayload
    );

    // After persisting the selection, recompute and persist the equipment snapshot
    // for the selected character. Preserve any existing explicit overrides for this
    // character (do not clear them), so hand assignments like left/right remain intact.
    try {
      const characterIdForSnapshot: string =
        typeof updated.selectedCharacterId === 'string' &&
        updated.selectedCharacterId.trim().length > 0
          ? updated.selectedCharacterId
          : DEFAULT_CHARACTER_ID;

      const playerIdForTx = resolved.playerId as string;
      await runTransaction(async (client) => {
        // Load any existing per-character overrides and include them when building the snapshot
        const existing = await equipmentRepo.getEquippedWithInstances(
          playerIdForTx,
          characterIdForSnapshot as unknown as string,
          client
        );
        const overrides = existing.map((record) => ({
          slot: normalizeEquipmentSlotName(record.slot),
          slug: record.wearableSlug,
          inventoryItemId: record.inventoryItemId ?? null,
          quality: normalizeQualityTier(record.quality),
          durabilityScore:
            typeof record.durabilityScore === 'number'
              ? record.durabilityScore
              : null,
        }));

        const nextState = buildEquipmentStateForCharacter(
          characterIdForSnapshot,
          overrides
        );

        await client.query(
          `update players
              set derived_stats = $2::jsonb,
                  equipped_wearables = $3::jsonb,
                  updated_at = now()
            where id = $1`,
          [
            playerIdForTx,
            JSON.stringify(nextState.derivedStats),
            JSON.stringify(nextState.equippedWearables),
          ]
        );
      });
    } catch (snapshotError) {
      // Non-fatal: character updated even if snapshot refresh failed
      console.warn(
        'Failed to recompute equipment snapshot on character select',
        {
          playerId: resolved.playerId,
          error: snapshotError,
        }
      );
    }

    const defaults = {
      selectedCharacterId: DEFAULT_CHARACTER_ID,
      selectedDifficultyTier: DEFAULT_DIFFICULTY_TIER,
      gotchiSpriteUrl: null as string | null,
      avatarId: null as string | null,
      audioSettings: {
        ...playerPreferencesRepo.DEFAULT_AUDIO_SETTINGS,
      },
    };

    let storedCharacterId: string | null = null;
    try {
      storedCharacterId = normalizeCharacterId(updated.selectedCharacterId);
    } catch {
      storedCharacterId = null;
    }

    const sanitizedSelectedCharacterId = isCharacterSelectionAllowed(
      storedCharacterId,
      unlockedCharacterSet
    )
      ? storedCharacterId
      : null;

    const preferences = {
      ...updated,
      selectedCharacterId: sanitizedSelectedCharacterId,
    };

    const resolvedSelectedCharacterId =
      sanitizedSelectedCharacterId ??
      (unlockedCharacters.length > 0 ? unlockedCharacters[0] : null);

    const effective = {
      selectedCharacterId: resolvedSelectedCharacterId,
      selectedDifficultyTier:
        preferences.selectedDifficultyTier ?? defaults.selectedDifficultyTier,
      gotchiSpriteUrl: preferences.gotchiSpriteUrl ?? defaults.gotchiSpriteUrl,
      avatarId: preferences.avatarId ?? defaults.avatarId,
      audioSettings: {
        ...defaults.audioSettings,
        ...preferences.audioSettings,
      },
    };

    logEvent(
      'character_selected',
      {
        characterId: normalizedCharacterId,
      },
      req
    );

    res.json({
      selectedCharacterId: preferences.selectedCharacterId,
      preferences,
      effective,
      defaults,
      unlockedCharacters,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to update selected character' });
  }
});

app.get('/api/player/inventory', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    // Exclude wearable instances that are currently equipped (by ID), and
    // also subtract any remaining equipped count per slug in case of legacy
    // overrides that lack inventory instance IDs.
    const [records, equippedSummary] = await Promise.all([
      inventoryRepo.getInventory(resolved.playerId),
      equipmentRepo.getEquippedSummary(resolved.playerId),
    ]);

    const filtered = filterInventoryRecordsForResponse(
      records,
      equippedSummary
    );
    const items = sanitizeInventoryPayloads(
      filtered.map(inventoryRecordToItem)
    );
    res.json({
      playerId: resolved.playerId,
      address: resolved.address,
      inventory: items,
      lickTongueCount: getLickTongueCount(items),
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load inventory' });
  }
});

app.post('/api/player/inventory/remove', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const requests = normalizeRemoveRequests(req.body);
  if (requests.length === 0) {
    return res.status(400).json({ error: 'Invalid destroy request' });
  }

  try {
    // Process in manageable chunks to avoid MAX_REMOVE_OPERATIONS
    const CHUNK_SIZE = 100;
    const removedAll: Awaited<ReturnType<typeof executeInventoryRemoval>> = [];
    for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
      const slice = requests.slice(i, i + CHUNK_SIZE);
      const removed = await executeInventoryRemoval(resolved.playerId, slice, {
        reason: 'destroy_user',
        metadata: { source: 'inventory_http' },
      });
      removedAll.push(...removed);
    }

    const records = await inventoryRepo.getInventory(resolved.playerId);
    const items = sanitizeInventoryPayloads(records.map(inventoryRecordToItem));

    return res.json({
      removed: removedAll,
      inventory: items,
      lickTongueCount: getLickTongueCount(items),
      action: 'destroy',
    });
  } catch (error) {
    if (error instanceof InventoryRemovalError) {
      return res.status(error.status).json({
        error: error.code,
        message: error.message,
        detail: error.detail ?? null,
      });
    }
    logError(error, req);
    return res.status(500).json({ error: 'Failed to destroy item' });
  }
});

app.get('/api/player/runs', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  try {
    const limit = req.query.limit
      ? Math.max(1, Math.min(100, Number(req.query.limit)))
      : 50;
    const offset = req.query.offset ? Math.max(0, Number(req.query.offset)) : 0;

    if (offset === 0) {
      try {
        await runSettleCompetitionTradesForAccountFallback({
          accountId: resolved.playerId,
          nowMs: Date.now(),
          maxDueRuns: 5,
          minIntervalMs: 30_000,
        });
      } catch (fallbackError) {
        logError(fallbackError, req);
      }
    }

    const result = await runScoresRepo.getRunsByPlayerId({
      playerId: resolved.playerId,
      limit,
      offset,
    });

    res.json({ runs: result.runs, total: result.total });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load runs' });
  }
});


// DEV: Top up Lick Tongues by +50 for any authenticated player
app.post('/api/player/lick-tongues/top-up', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  // No special wallet gating; any authenticated player can use in non-production

  if (process.env.DB_PERSISTENCE_ENABLED === '0') {
    return res.status(503).json({ error: 'Database persistence disabled' });
  }

  try {
    // Upsert +50 tongues as inventory material "Lick Tongue"
    const playerId = resolved.playerId as string;
    const increment = 50;
    await inventoryRepo.upsertInventoryItem({
      playerId,
      itemType: LICK_TONGUE_ITEM_TYPE,
      itemName: LICK_TONGUE_ITEM_NAME,
      quantity: increment,
    });

    try {
      await inventoryEventsRepo.logInventoryEvent({
        playerId,
        itemType: LICK_TONGUE_ITEM_TYPE,
        itemName: LICK_TONGUE_ITEM_NAME,
        delta: increment,
        reason: 'dev_top_up',
        metadata: { source: 'me_page_button' },
      });
    } catch (eventError) {
      console.warn('Failed to log inventory event for dev top-up', {
        playerId,
        error: eventError,
      });
    }

    // Recompute lick tongue count from inventory
    const records = await inventoryRepo.getInventory(playerId);
    const items = sanitizeInventoryPayloads(records.map(inventoryRecordToItem));
    const lickTongueCount = getLickTongueCount(items);

    // Persist cached lick_tongue_count on players for faster reads elsewhere
    try {
      await getPgPool().query(
        `update players set lick_tongue_count = $2, updated_at = now() where id = $1`,
        [playerId, lickTongueCount]
      );
    } catch (e) {
      // non-fatal
    }

    logEvent(
      'dev_lick_tongues_top_up',
      { delta: increment, total: lickTongueCount },
      req
    );

    return res.json({ lickTongueCount, delta: increment });
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to top up lick tongues' });
  }
});

app.get('/api/loot/catalog', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const loot = await lootCatalogRepo.listActive();
    res.json({ loot });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load loot catalog' });
  }
});

app.get('/api/player/economy', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

  try {
    const transactions = await economyRepo.listRecent(resolved.playerId, limit);
    const summary = transactions.reduce(
      (acc, tx) => {
        const key = tx.currency;
        acc[key] = (acc[key] ?? 0) + tx.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    res.json({
      playerId: resolved.playerId,
      address: resolved.address,
      summary,
      transactions,
    });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load economy history' });
  }
});

app.get('/api/topup/config', (req, res) => {
  res.setHeader('X-Request-Id', (req as any).id || '');
  res.json({
    chainId: BASE_CHAIN_ID,
    contractAddress: GAMEPOINTS_CONTRACT_ADDRESS,
    maxSlippageBps: MAX_SLIPPAGE_BPS,
    deadlineWindowSeconds: DEADLINE_WINDOW_SECONDS,
    tokens: listSupportedTokens(),
  });
});

app.post('/api/topup/quote', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const body = req.body as Record<string, unknown>;
  const tokenSymbol =
    typeof body.tokenSymbol === 'string'
      ? body.tokenSymbol
      : typeof body.token === 'string'
        ? body.token
        : null;
  const amountParamRaw =
    body.amountWei ?? body.amount_wei ?? body.amount ?? body.value;

  if (!tokenSymbol || amountParamRaw === undefined) {
    return res
      .status(400)
      .json({ error: 'tokenSymbol and amountWei required' });
  }

  const amountInput = amountParamRaw as string | number | bigint;

  try {
    const quote = deriveQuote({
      tokenSymbol,
      amountWei: amountInput,
      slippageBps:
        typeof body.slippageBps === 'number' ? body.slippageBps : undefined,
    });
    return res.json({ quote });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to derive quote';
    if (message.toLowerCase().includes('unsupported token')) {
      return res.status(400).json({ error: message });
    }
    if (message.toLowerCase().includes('amount')) {
      return res.status(400).json({ error: message });
    }
    logError(error, req);
    return res.status(500).json({ error: 'Failed to derive quote' });
  }
});

app.get('/api/topup/deposits', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

  try {
    await checkPendingDeposits(resolved.playerId ?? null, resolved.address);
  } catch (error) {
    console.warn('Failed to refresh pending deposits before listing', error);
  }

  try {
    const deposits = resolved.playerId
      ? await depositsRepo.listDepositsByUser(resolved.playerId, limit)
      : await depositsRepo.listDepositsByAddress(resolved.address, limit);

    return res.json({
      chainId: BASE_CHAIN_ID,
      contractAddress: GAMEPOINTS_CONTRACT_ADDRESS,
      deposits,
    });
  } catch (error) {
    logError(error, req);
    return res.status(500).json({ error: 'Failed to load deposits' });
  }
});

app.post('/api/topup/deposits', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (process.env.DB_PERSISTENCE_ENABLED === '0') {
    return res.status(503).json({ error: 'Database persistence disabled' });
  }

  if (!isPlainObject(req.body)) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const body = req.body as Record<string, unknown>;
  const tokenSymbol =
    typeof body.tokenSymbol === 'string'
      ? body.tokenSymbol
      : typeof body.token === 'string'
        ? body.token
        : null;
  const txHashRaw =
    typeof body.txHash === 'string'
      ? body.txHash
      : typeof body.transactionHash === 'string'
        ? body.transactionHash
        : null;

  if (!tokenSymbol) {
    return res.status(400).json({ error: 'tokenSymbol is required' });
  }

  const token = getTokenBySymbol(tokenSymbol);
  if (!token) {
    return res.status(400).json({ error: 'Unsupported token' });
  }

  if (!txHashRaw) {
    return res.status(400).json({ error: 'txHash is required' });
  }

  const txHashNormalized = txHashRaw.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHashNormalized)) {
    return res.status(400).json({ error: 'Invalid txHash' });
  }

  const amountParam =
    body.amountWei ?? body.amount_wei ?? body.amount ?? body.value;
  if (amountParam === undefined) {
    return res.status(400).json({ error: 'amountWei is required' });
  }

  let amountWei: bigint;
  try {
    amountWei = parseAmountWei(amountParam);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid amountWei';
    return res.status(400).json({ error: message });
  }

  // Verify this transaction includes a successful deposit event owned by the authenticated wallet.
  let receiptDetails: Awaited<ReturnType<typeof checkTransactionReceipt>>;
  try {
    receiptDetails = await checkTransactionReceipt(txHashNormalized);
    if (!receiptDetails) {
      return res.status(400).json({
        error: 'Transaction not confirmed',
        details: 'The transaction is not mined yet or could not be found',
      });
    }
    if (receiptDetails.status !== 1) {
      return res.status(400).json({
        error: 'Transaction failed',
        details: 'Only successful deposit transactions can be recorded',
      });
    }
    if (!receiptDetails.depositId || !receiptDetails.depositor) {
      return res.status(403).json({
        error: 'Invalid deposit transaction',
        details:
          'No valid GamePoints deposit event was found for this transaction',
      });
    }
    if (receiptDetails.depositor.toLowerCase() !== resolved.address.toLowerCase()) {
      return res.status(403).json({
        error: 'Transaction sender mismatch',
        details:
          'The deposit event user does not match your authenticated wallet address',
      });
    }
    if (
      receiptDetails.depositToken?.toLowerCase() !== token.address.toLowerCase()
    ) {
      return res.status(403).json({
        error: 'Token mismatch',
        details:
          'The deposit event token does not match the token symbol submitted',
      });
    }
    if (receiptDetails.depositAmount && BigInt(receiptDetails.depositAmount) !== amountWei) {
      return res.status(400).json({
        error: 'Deposit amount mismatch',
        details:
          'The on-chain deposit amount does not match the amount submitted',
      });
    }
  } catch (error) {
    logError(error, req);
    return res.status(500).json({
      error: 'Failed to verify transaction',
      details: 'Could not verify transaction on blockchain',
    });
  }

  const autoRenew = body.autoRenew === true || body.auto_renew === true;
  const minAmountOutRaw = body.minAmountOut ?? body.min_amount_out;
  let minAmountOut: bigint | null = null;
  if (minAmountOutRaw !== undefined) {
    try {
      minAmountOut = parseAmountWei(minAmountOutRaw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid minAmountOut';
      return res.status(400).json({ error: message });
    }
  }

  let expiresAt: string | undefined;
  if (typeof body.expiresAt === 'string') {
    const date = new Date(body.expiresAt);
    if (!Number.isNaN(date.getTime())) {
      expiresAt = date.toISOString();
    }
  }

  let quote: ReturnType<typeof deriveQuote>;
  try {
    quote = deriveQuote({
      tokenSymbol: token.symbol,
      amountWei,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to derive quote';
    if (message.toLowerCase().includes('unsupported token')) {
      return res.status(400).json({ error: message });
    }
    if (message.toLowerCase().includes('amount')) {
      return res.status(400).json({ error: message });
    }
    logError(error, req);
    return res.status(500).json({ error: 'Failed to derive quote' });
  }

  if (minAmountOut && minAmountOut < BigInt(quote.minAmountOut)) {
    return res.status(400).json({
      error: 'minAmountOut below allowed threshold',
      details: {
        minAmountOut: minAmountOut.toString(),
        recommendedMinAmountOut: quote.minAmountOut,
      },
    });
  }

  const amountDecimal = formatAmountFromWei(amountWei, token);

  try {
    const existingDeposit = await depositsRepo.getDepositByTxHash(
      txHashNormalized
    );
    if (existingDeposit) {
      let deposit = existingDeposit;
      try {
        await checkPendingDeposits(resolved.playerId ?? null, resolved.address);
        const refreshed =
          await depositsRepo.getDepositByTxHash(txHashNormalized);
        if (refreshed) {
          deposit = refreshed;
        }
      } catch (error) {
        console.warn('Failed to refresh duplicate pending deposit', error);
      }
      return res.status(200).json({
        deposit,
        quote,
      });
    }

    // Allow deposits without playerId - we can link by depositor_address
    // The playerId will be null if not linked, but the deposit can still be tracked
    const createdDeposit = await depositsRepo.createPendingDeposit({
      userId: resolved.playerId ?? null,
      chainId: BASE_CHAIN_ID,
      contractAddress: GAMEPOINTS_CONTRACT_ADDRESS,
      depositorAddress: resolved.address,
      tokenAddress: token.address,
      tokenSymbol: token.symbol,
      amount: amountDecimal,
      amountWei: amountWei.toString(),
      txHash: txHashNormalized,
      autoRenew,
      expiresAt,
    });

    let deposit = createdDeposit;
    try {
      await checkPendingDeposits(resolved.playerId ?? null, resolved.address);
      const refreshed = await depositsRepo.getDepositByTxHash(txHashNormalized);
      if (refreshed) {
        deposit = refreshed;
      }
    } catch (error) {
      console.warn('Failed to refresh pending deposit after create', error);
    }

    return res.status(201).json({
      deposit,
      quote,
    });
  } catch (error) {
    if ((error as any)?.code === '23505') {
      return res.status(409).json({
        error: 'Duplicate deposit transaction',
        message: 'A deposit with this transaction hash already exists.',
      });
    }
    logError(error, req);
    return res.status(500).json({ error: 'Failed to create deposit' });
  }
});

app.get('/api/payments/top-ups', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

  try {
    const topUps = await paymentsRepo.listTopUpsByPlayer(
      resolved.playerId,
      limit
    );
    res.json({ playerId: resolved.playerId, topUps });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load top-ups' });
  }
});

app.post('/api/payments/top-ups', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (process.env.DB_PERSISTENCE_ENABLED === '0') {
    return res.status(503).json({ error: 'Database persistence disabled' });
  }

  const {
    amountBaseUnits,
    amount,
    decimals,
    currency,
    provider,
    providerRef,
    metadata,
  } = req.body || {};

  let baseUnits = Number(amountBaseUnits);
  const decimalsNumber = decimals === undefined ? undefined : Number(decimals);

  if (!Number.isFinite(baseUnits) || baseUnits <= 0) {
    if (amount !== undefined && Number.isFinite(decimalsNumber)) {
      const numericAmount = Number(amount);
      if (Number.isFinite(numericAmount)) {
        baseUnits = Math.round(
          numericAmount * Math.pow(10, Number(decimalsNumber))
        );
      }
    }
  }

  if (!Number.isFinite(baseUnits) || baseUnits <= 0) {
    return res
      .status(400)
      .json({ error: 'amountBaseUnits or amount/decimals must be provided' });
  }

  const metadataPayload: Record<string, unknown> = isPlainObject(metadata)
    ? { ...metadata }
    : {};
  if (Number.isFinite(decimalsNumber) && decimalsNumber! >= 0) {
    metadataPayload.decimals = Number(decimalsNumber);
  }

  try {
    const record = await paymentsRepo.createTopUp({
      playerId: resolved.playerId,
      amountBaseUnits: baseUnits,
      currency: typeof currency === 'string' ? currency : 'CREDITS',
      provider: provider ? String(provider) : null,
      providerRef: providerRef ? String(providerRef) : null,
      metadata: metadataPayload,
    });

    res.status(201).json({ topUp: record });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to create top-up' });
  }
});

app.post('/api/payments/top-ups/webhook', async (req, res) => {
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const {
    provider,
    providerRef,
    status,
    txHash,
    blockNumber,
    chainId,
    failureReason,
    metadata,
  } = req.body || {};

  if (typeof providerRef !== 'string' || providerRef.length === 0) {
    return res.status(400).json({ error: 'providerRef is required' });
  }

  try {
    const existing = await paymentsRepo.getTopUpByProviderRef(
      providerRef,
      provider ? String(provider) : undefined
    );

    if (!existing) {
      return res.status(404).json({ error: 'Top-up not found' });
    }

    if (existing.status === 'paid') {
      return res.json({ topUp: existing, message: 'Already paid' });
    }

    let updated = existing;
    const metadataPayload = isPlainObject(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined;

    const normalizedStatus =
      typeof status === 'string' ? status.toLowerCase() : '';

    if (normalizedStatus === 'paid') {
      const record = await paymentsRepo.markTopUpPaid({
        id: existing.id,
        txHash: txHash ?? null,
        blockNumber:
          blockNumber === undefined ? undefined : Number(blockNumber),
        chainId: chainId ?? null,
        metadata: metadataPayload,
      });
      if (record) {
        updated = record;
        const amount = deriveLedgerAmount(
          record.amountBaseUnits,
          record.metadata
        );
        await economyRepo
          .logTransaction({
            playerId: record.playerId,
            currency: record.currency,
            amount,
            source: 'top_up',
            lootDistributionId: null,
            metadata: {
              topUpId: record.id,
              provider: record.provider,
              providerRef: record.providerRef,
            },
          })
          .catch((error) => logError(error, req));
      }
    } else if (normalizedStatus === 'failed') {
      const record = await paymentsRepo.markTopUpFailed({
        id: existing.id,
        failureReason: failureReason ?? null,
        metadata: metadataPayload,
      });
      if (record) {
        updated = record;
      }
    } else if (normalizedStatus === 'processing') {
      return res.status(202).json({ topUp: existing, message: 'processing' });
    } else {
      return res.status(400).json({ error: 'Unsupported status' });
    }

    return res.json({ topUp: updated });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

app.get('/api/payments/payouts', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));

  try {
    const payouts = await paymentsRepo.listPayoutsByPlayer(
      resolved.playerId,
      limit
    );
    res.json({ playerId: resolved.playerId, payouts });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to load payouts' });
  }
});

app.post('/api/payments/payouts', async (req, res) => {
  const resolved = await resolveAuthPrincipal(req);
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!resolved) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!resolved.playerId) {
    return res.status(403).json({ error: 'Player not linked to session' });
  }

  if (process.env.DB_PERSISTENCE_ENABLED === '0') {
    return res.status(503).json({ error: 'Database persistence disabled' });
  }

  const { amountBaseUnits, amount, decimals, currency, metadata } =
    req.body || {};

  let baseUnits = Number(amountBaseUnits);
  const decimalsNumber = decimals === undefined ? undefined : Number(decimals);

  if (!Number.isFinite(baseUnits) || baseUnits <= 0) {
    if (amount !== undefined && Number.isFinite(decimalsNumber)) {
      const numericAmount = Number(amount);
      if (Number.isFinite(numericAmount)) {
        baseUnits = Math.round(
          numericAmount * Math.pow(10, Number(decimalsNumber))
        );
      }
    }
  }

  if (!Number.isFinite(baseUnits) || baseUnits <= 0) {
    return res
      .status(400)
      .json({ error: 'amountBaseUnits or amount/decimals must be provided' });
  }

  const metadataPayload: Record<string, unknown> = isPlainObject(metadata)
    ? { ...metadata }
    : {};
  if (Number.isFinite(decimalsNumber) && decimalsNumber! >= 0) {
    metadataPayload.decimals = Number(decimalsNumber);
  }

  try {
    const record = await paymentsRepo.queuePayout({
      playerId: resolved.playerId,
      amountBaseUnits: baseUnits,
      currency: typeof currency === 'string' ? currency : 'CREDITS',
      metadata: metadataPayload,
    });
    res.status(201).json({ payout: record });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to queue payout' });
  }
});

app.post('/api/payments/payouts/webhook', async (req, res) => {
  res.setHeader('X-Request-Id', (req as any).id || '');

  if (!isWebhookAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const { payoutId, status, txHash, chainId, failureReason, metadata } =
    req.body || {};

  if (typeof payoutId !== 'string' || payoutId.length === 0) {
    return res.status(400).json({ error: 'payoutId is required' });
  }

  try {
    const existing = await paymentsRepo.getPayoutById(payoutId);
    if (!existing) {
      return res.status(404).json({ error: 'Payout not found' });
    }

    if (existing.status === 'sent' && status === 'sent') {
      return res.json({ payout: existing, message: 'Already sent' });
    }

    const metadataPayload = isPlainObject(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined;

    const normalizedStatus =
      typeof status === 'string' ? status.toLowerCase() : '';
    let updated = existing;

    if (normalizedStatus === 'sent') {
      const record = await paymentsRepo.markPayoutSent({
        id: payoutId,
        txHash: txHash ?? null,
        chainId: chainId ?? null,
        metadata: metadataPayload,
      });
      if (record) {
        updated = record;
        const amount =
          -1 * deriveLedgerAmount(record.amountBaseUnits, record.metadata);
        await economyRepo
          .logTransaction({
            playerId: record.playerId,
            currency: record.currency,
            amount,
            source: 'payout',
            lootDistributionId: null,
            metadata: {
              payoutId: record.id,
              txHash: record.txHash,
            },
          })
          .catch((error) => logError(error, req));
      }
    } else if (normalizedStatus === 'failed') {
      const record = await paymentsRepo.markPayoutFailed({
        id: payoutId,
        failureReason: failureReason ?? null,
        metadata: metadataPayload,
      });
      if (record) {
        updated = record;
      }
    } else if (normalizedStatus === 'processing') {
      return res.status(202).json({ payout: existing, message: 'processing' });
    } else {
      return res.status(400).json({ error: 'Unsupported status' });
    }

    res.json({ payout: updated });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to process payout webhook' });
  }
});

function toPublicSprite(info: SpriteInfo) {
  return { id: info.id, url: info.url, hash: info.hash };
}
registerPlayerGotchiRoutes(app);

app.get('/api/gotchis/:id', async (req, res) => {
  const rawId = String(req.params.id ?? '').trim();
  if (!/^\d+$/.test(rawId)) {
    return res.status(400).json({ error: 'Invalid gotchi id' });
  }
  const numericId = Number(rawId);
  res.setHeader('X-Request-Id', (req as any).id || '');
  const debugParam = String((req.query as any)?.debug ?? '').toLowerCase();
  const debug = debugParam === '1' || debugParam === 'true';
  const configuredSubgraphEndpoint =
    process.env.SUBGRAPH_CORE_BASE?.trim() ||
    process.env.SUBGRAPH_CORE?.trim() ||
    '';
  try {
    const existing = await getExistingSpriteInfo(numericId);
    if (existing) {
      return res.json({ sprite: toPublicSprite(existing) });
    }
    const raw = await fetchAavegotchiById(rawId);
    if (!raw) {
      try {
        console.warn('[gotchi] by-id 404', {
          gotchiId: rawId,
          endpointPresent: Boolean(configuredSubgraphEndpoint),
          endpoint: debug ? configuredSubgraphEndpoint : undefined,
          reason: configuredSubgraphEndpoint
            ? 'subgraphReturnedNoResult'
            : 'subgraphEndpointMissing',
          reqId: (req as any).id || '',
        });
      } catch {}
      if (debug) {
        res.setHeader('X-Subgraph-Endpoint', configuredSubgraphEndpoint || '');
        return res.status(404).json({
          error: 'Gotchi not found',
          debug: {
            gotchiId: rawId,
            endpointPresent: Boolean(configuredSubgraphEndpoint),
            endpoint: configuredSubgraphEndpoint || null,
          },
        });
      }
      return res.status(404).json({ error: 'Gotchi not found' });
    }
    const generator = normalizeForGenerator(raw);
    const sprite = await generateOne(generator);
    res.json({ sprite: toPublicSprite(sprite) });
  } catch (error) {
    logError(error, req);
    res.status(500).json({ error: 'Failed to resolve gotchi sprite' });
  }
});

// Create HTTP server
const server = createServer(app);

// Create Colyseus server
const gameServer = new Server({
  server,
  // Increase ping interval and retries for high-latency connections (Asia <-> US)
  // pingInterval: 5000ms gives more time for round-trip on high-latency connections
  // pingMaxRetries: 8 allows ~40 seconds of tolerance before disconnect
  pingInterval: 5000, // Send ping every 5 seconds (default: 3000ms)
  pingMaxRetries: 8, // Allow 8 missed pings before disconnect (default: 3)
});

// Register room handlers
gameServer.define('lobby', LobbyRoom);
gameServer.define('game_room', DungeonRoom);

// Error handling
gameServer.onShutdown(() => {
  console.log('Game server is shutting down...');
});

process.on('unhandledRejection', (reason, promise) => {
  logError(reason);
});

process.on('uncaughtException', (error) => {
  logError(error);
  process.exit(1);
});

// Graceful shutdown
process.on('beforeExit', () => {
  void flushDebugLogs('shutdown').catch(() => undefined);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopContinuousTradeSettlementMonitor();
  flushDebugLogs('shutdown')
    .catch((error) => {
      console.warn('Failed to flush debug logs during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
});

// Start server
gameServer.listen(port, '0.0.0.0', undefined, () => {
  console.log(`🎮 DeFi Dungeon server listening on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🚀 Game server ready!`);
});

export { gameServer };
