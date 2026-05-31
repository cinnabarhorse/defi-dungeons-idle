import { GAME_CONFIG } from '../data/game-config';

export const TRADE_TOKENS = ['BTC', 'ETH', 'GHST'] as const;
export type TradeToken = (typeof TRADE_TOKENS)[number];

export const TRADE_DIRECTIONS = ['long', 'short'] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

export const TRADE_LEVERAGE_MIN = 1;
export const TRADE_LEVERAGE_MAX = 20;

export const TRADE_MULTIPLIER_MIN = 0.25;
export const TRADE_MULTIPLIER_MAX = 4.0;
export const TRADE_EXTEND_WINDOW_MINUTES = 15;
export const TRADE_EXTEND_WINDOW_MS = TRADE_EXTEND_WINDOW_MINUTES * 60 * 1000;
export const TRADE_EPOCH_MS = TRADE_EXTEND_WINDOW_MS;
export const TRADE_CLOSE_FEE_GOLD = 25;
export const TRADE_UPDATE_FEE_GOLD = 50;
export const TRADE_EXTEND_FEE_GOLD = 50;
export const TRADE_MAX_UPDATES = 1;

function normalizeCompetitionDate(competitionDate: unknown): string {
  if (competitionDate instanceof Date) {
    const dateMs = competitionDate.getTime();
    if (!Number.isFinite(dateMs)) {
      throw new Error(`Invalid competition date: ${String(competitionDate)}`);
    }
    const year = competitionDate.getFullYear();
    const month = String(competitionDate.getMonth() + 1).padStart(2, '0');
    const day = String(competitionDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const rawValue = String(competitionDate ?? '').trim();
  if (!rawValue) {
    throw new Error(`Invalid competition date: ${rawValue}`);
  }

  const datePrefixMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (datePrefixMatch?.[1]) {
    return datePrefixMatch[1];
  }

  const parsedMs = Date.parse(rawValue);
  if (Number.isFinite(parsedMs)) {
    return new Date(parsedMs).toISOString().slice(0, 10);
  }

  throw new Error(`Invalid competition date: ${rawValue}`);
}

function parseCompetitionDateToUtc(competitionDate: unknown): Date {
  const normalizedCompetitionDate = normalizeCompetitionDate(competitionDate);
  const [yearRaw, monthRaw, dayRaw] = normalizedCompetitionDate.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    throw new Error(`Invalid competition date: ${normalizedCompetitionDate}`);
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export function isTradingGameEnabled(): boolean {
  const configValue = (GAME_CONFIG as Record<string, any>)?.trading
    ?.settlementEnabled;
  if (typeof configValue === 'boolean') {
    return configValue;
  }

  // Backward-compatible fallback for older deployments still using env vars.
  const envValue =
    process.env.TRADING_GAME_ENABLED ?? process.env.TRADING_GAME_ENABLE;
  return String(envValue ?? '').trim() === '1';
}

export function isTradingSettlementCompetitionRun(player: {
  dailyQuestActive?: boolean;
}): boolean {
  return isTradingGameEnabled() && player?.dailyQuestActive === true;
}

function normalizeGameplayLeverage(roomLeverage: number): number {
  const leverage = Number(roomLeverage);
  if (!Number.isFinite(leverage) || leverage <= 0) {
    return 1;
  }
  return leverage;
}

export function getRiskLeverageMultiplier(
  _player: { dailyQuestActive?: boolean },
  roomLeverage: number
): number {
  return normalizeGameplayLeverage(roomLeverage);
}

export function getAdditiveTradingCompetitionLeverage(input: {
  gameplayLeverage: number;
  tradeLeverage: number;
}): number {
  const gameplayLeverage = normalizeGameplayLeverage(input.gameplayLeverage);
  const normalizedTradeLeverage = normalizeTradeLeverage(input.tradeLeverage, 1);
  const additiveTradeLeverage = normalizedTradeLeverage > 1 ? normalizedTradeLeverage : 0;
  return gameplayLeverage + additiveTradeLeverage;
}

export function getRewardLeverageMultiplier(
  _player: { dailyQuestActive?: boolean },
  roomLeverage: number
): number {
  return normalizeGameplayLeverage(roomLeverage);
}

export function getGameplayLeverageMultiplier(
  player: { dailyQuestActive?: boolean },
  roomLeverage: number
): number {
  return getRewardLeverageMultiplier(player, roomLeverage);
}

export function normalizeTradeToken(
  value: unknown,
  fallback: TradeToken = 'BTC'
): TradeToken {
  const normalized = String(value ?? '').trim().toUpperCase();
  if ((TRADE_TOKENS as readonly string[]).includes(normalized)) {
    return normalized as TradeToken;
  }
  return fallback;
}

export function normalizeTradeDirection(
  value: unknown,
  fallback: TradeDirection = 'long'
): TradeDirection {
  const normalized = String(value ?? '').trim().toLowerCase();
  if ((TRADE_DIRECTIONS as readonly string[]).includes(normalized)) {
    return normalized as TradeDirection;
  }
  return fallback;
}

export function normalizeTradeLeverage(value: unknown, fallback: number = 1): number {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  const clamped = Math.max(TRADE_LEVERAGE_MIN, Math.min(TRADE_LEVERAGE_MAX, safe));
  return Math.round(clamped * 1000) / 1000;
}

export function getDirectionSign(direction: TradeDirection): 1 | -1 {
  return direction === 'short' ? -1 : 1;
}

export function computeTradeMultiplier(input: {
  direction: TradeDirection;
  riskLeverage: number;
  entryPriceUsd: number;
  exitPriceUsd: number;
}): {
  delta: number;
  unclampedMultiplier: number;
  tradeMultiplier: number;
} {
  const entryPrice = Number(input.entryPriceUsd);
  const exitPrice = Number(input.exitPriceUsd);
  const leverage = normalizeTradeLeverage(input.riskLeverage, 1);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${input.entryPriceUsd}`);
  }
  if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
    throw new Error(`Invalid exit price: ${input.exitPriceUsd}`);
  }

  const sign = getDirectionSign(input.direction);
  const priceReturn = exitPrice / entryPrice - 1;
  const delta = sign * priceReturn;
  const unclampedMultiplier = 1 + leverage * delta;
  const tradeMultiplier = Math.max(
    TRADE_MULTIPLIER_MIN,
    Math.min(TRADE_MULTIPLIER_MAX, unclampedMultiplier)
  );

  return {
    delta,
    unclampedMultiplier,
    tradeMultiplier,
  };
}

export function computeTradeSettlement(input: {
  baseScore: number;
  timeMultiplier: number;
  direction: TradeDirection;
  riskLeverage: number;
  entryPriceUsd: number;
  exitPriceUsd: number;
}): {
  rawScore: number;
  finalScore: number;
  delta: number;
  tradeMultiplier: number;
  unclampedMultiplier: number;
} {
  const baseScore = Math.max(0, Math.floor(Number(input.baseScore) || 0));
  const timeMultiplier = Number.isFinite(Number(input.timeMultiplier))
    ? Number(input.timeMultiplier)
    : 1;
  const { delta, tradeMultiplier, unclampedMultiplier } = computeTradeMultiplier({
    direction: input.direction,
    riskLeverage: input.riskLeverage,
    entryPriceUsd: input.entryPriceUsd,
    exitPriceUsd: input.exitPriceUsd,
  });
  const rawScore = Math.max(0, Math.round(baseScore * tradeMultiplier));
  const finalScore = Math.max(0, Math.round(rawScore * timeMultiplier));
  return {
    rawScore,
    finalScore,
    delta,
    tradeMultiplier,
    unclampedMultiplier,
  };
}

function parseIsoMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  return parsed;
}

export function getTradeCloseAtMs(victoryAtMs: number): number {
  const safeVictoryAtMs = Math.max(0, Math.floor(Number(victoryAtMs) || 0));
  return safeVictoryAtMs + TRADE_EPOCH_MS;
}

export function getTradeCloseAtIso(victoryAtMs: number): string {
  return new Date(getTradeCloseAtMs(victoryAtMs)).toISOString();
}

export function isTradeRunCloseable(input: {
  state: 'unsettled' | 'settled_manual' | 'settled_close';
}): boolean {
  return input.state === 'unsettled';
}

export function isTradeRunUpdatable(input: {
  state: 'unsettled' | 'settled_manual' | 'settled_close';
  closeAtIso: string;
  updateCount: number;
  nowMs?: number;
}): boolean {
  if (input.state !== 'unsettled') {
    return false;
  }
  if ((Number(input.updateCount) || 0) >= TRADE_MAX_UPDATES) {
    return false;
  }
  const nowMs = input.nowMs ?? Date.now();
  return nowMs < parseIsoMs(input.closeAtIso);
}

export function isTradeRunExtendable(input: {
  state: 'unsettled' | 'settled_manual' | 'settled_close';
  closeAtIso: string;
  competitionDate: string | Date;
  nowMs?: number;
}): boolean {
  if (input.state !== 'unsettled') {
    return false;
  }
  const nowMs = input.nowMs ?? Date.now();
  const closeAtMs = parseIsoMs(input.closeAtIso);
  if (!Number.isFinite(closeAtMs) || nowMs >= closeAtMs) {
    return false;
  }
  const competitionCloseCutoffMs = getCompetitionCloseCutoffMs(
    input.competitionDate
  );
  return closeAtMs + TRADE_EXTEND_WINDOW_MS <= competitionCloseCutoffMs;
}

export function getTradeExtendedCloseAtMs(options: {
  closeAtIso: string;
  extendWindows?: number;
}): number {
  const currentCloseAtMs = parseIsoMs(options.closeAtIso);
  const windows = Math.max(1, Math.floor(Number(options.extendWindows) || 1));
  return currentCloseAtMs + windows * TRADE_EXTEND_WINDOW_MS;
}

export function getTradeExtendedCloseAtIso(options: {
  closeAtIso: string;
  extendWindows?: number;
}): string {
  return new Date(getTradeExtendedCloseAtMs(options)).toISOString();
}

export function getCompetitionCloseCutoffMs(competitionDate: string | Date): number {
  const base = parseCompetitionDateToUtc(competitionDate);
  base.setUTCHours(23, 59, 0, 0);
  return base.getTime();
}

export function getCompetitionCloseCutoffIso(competitionDate: string | Date): string {
  return new Date(getCompetitionCloseCutoffMs(competitionDate)).toISOString();
}

export function getCompetitionSettlementDeadlineMs(
  competitionDate: string | Date
): number {
  const base = parseCompetitionDateToUtc(competitionDate);
  base.setUTCDate(base.getUTCDate() + 1);
  base.setUTCHours(0, 20, 0, 0);
  return base.getTime();
}

export function canManuallySettleTradeRun(options: {
  closeAtIso: string;
  nowMs?: number;
}): boolean {
  const nowMs = options.nowMs ?? Date.now();
  return nowMs <= parseIsoMs(options.closeAtIso);
}
