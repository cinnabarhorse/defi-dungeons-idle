// Game configuration constants
// Generated from /data/game-config.ts to avoid drift
export { GAME_CONFIG } from '../data/game-config';

export const NETWORK_CONFIG = {
  MAX_RTT: 120, // ms
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 1000, // ms
  HEARTBEAT_INTERVAL: 5000, // ms
};

export const PERFORMANCE_CONFIG = {
  TARGET_FPS: 60,
  MAX_CLIENT_MEMORY: 150 * 1024 * 1024, // 150MB
  MAX_ROOM_MEMORY: 64 * 1024 * 1024, // 64MB
  BANDWIDTH_LIMIT: 25 * 1024, // 25KB/s
};

export const REGIONS = {
  'us-east': 'US East',
  'us-west': 'US West',
  'eu-west': 'Europe West',
  'ap-southeast': 'Asia Pacific',
} as const;

export type Region = keyof typeof REGIONS;

// Timed enemy spawn configuration
export const TIMED_SPAWN = {
  intervalMs: 15000, // 15 seconds
  batchCount: 20, // enemies per timed tick (per user request)
  maxEnemies: 10, // population cap per room (initial setting)
  requireActivePlayers: true, // pause when no players present
  pauseDuringTransition: true, // pause during map transitions
};

export const INITIAL_ENEMY_COUNT = 100;

export const STAGING_INVULNERABILITY_MS = 10 * 1000;

const parseEnvNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw == null || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

export const SCORE_CONFIG = {
  enabled: process.env.SCORE_ENABLED !== '0',
  flushIntervalMs: 200,
  maxValue: 2_147_483_647,
};

export const LEVERAGE_CONFIG = {
  enabled: process.env.LEVERAGE_ENABLED !== '0',
  max: Math.max(1, parseEnvNumber('LEVERAGE_MAX', 50)),
  roomTimeoutMs: Math.max(0, parseEnvNumber('LEVERAGE_ROOM_TIMEOUT_MS', 15000)),
};

export const FOG_OF_WAR_ENABLED = true;

// Admin configuration
export const DEFAULT_ADMIN_ADDRESS = '0xc3c2e1cf099bc6e1fa94ce358562bcbd5cc59fe5';

// Inventory configuration (server-authoritative)
export const INVENTORY_CONFIG = {
  // Max number of unique inventory entries (stacked items count as 1)
  MAX_SLOTS: 48,
} as const;

// Enable verbose server logs when true
export const DEBUG_LOGS = process.env.DEBUG_LOGS === '1';

export const DEFAULT_VISION_RADIUS_TILES = 8;
