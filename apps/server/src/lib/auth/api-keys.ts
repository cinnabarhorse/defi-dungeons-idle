import { createHmac, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'ddk_live_';
const DEFAULT_MAX_ACTIVE_KEYS_PER_PLAYER = 5;
const PREFIX_VISIBLE_RANDOM_CHARS = 10;

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isStakedApiKeysEnabled(): boolean {
  return parseBooleanEnv(process.env.ENABLE_STAKED_API_KEYS);
}

export function validateStakedApiKeyConfiguration() {
  if (!isStakedApiKeysEnabled()) {
    return;
  }
  getApiKeyHashSecret();
}

export function getApiKeyMaxActivePerPlayer(): number {
  const parsed = Number(process.env.API_KEY_MAX_ACTIVE_PER_PLAYER);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MAX_ACTIVE_KEYS_PER_PLAYER;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

export function isApiKeyToken(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith(API_KEY_PREFIX) &&
    value.length > API_KEY_PREFIX.length
  );
}

export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
}

export function getApiKeyPrefix(apiKey: string): string {
  if (!isApiKeyToken(apiKey)) {
    return apiKey.slice(0, 16);
  }
  const visibleLength = API_KEY_PREFIX.length + PREFIX_VISIBLE_RANDOM_CHARS;
  return apiKey.slice(0, Math.min(apiKey.length, visibleLength));
}

function getApiKeyHashSecret(): string {
  const secret = process.env.API_KEY_HASH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'API_KEY_HASH_SECRET is required when staked API keys are enabled'
    );
  }
  return secret;
}

export function hashApiKey(apiKey: string): string {
  return createHmac('sha256', getApiKeyHashSecret())
    .update(apiKey)
    .digest('hex');
}

export function maskApiKeyForLogs(value?: string | null): string {
  if (!value) return '';
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function extractBearerToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]?.trim();
  return token || null;
}

function getHeaderAsString(
  headers: Record<string, unknown>,
  key: string
): string | null {
  const direct = headers[key];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  if (Array.isArray(direct) && direct.length > 0) {
    const first = direct.find((entry) => typeof entry === 'string');
    if (typeof first === 'string' && first.trim().length > 0) {
      return first.trim();
    }
  }
  return null;
}

export function getRequestIpFromHeaders(
  headers: Record<string, unknown>,
  fallback?: string | null
): string | null {
  const trustForwardedFor =
    parseBooleanEnv(process.env.TRUST_PROXY) ||
    parseBooleanEnv(process.env.API_KEY_TRUST_X_FORWARDED_FOR);

  if (trustForwardedFor) {
    const forwarded = getHeaderAsString(headers, 'x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0]?.trim();
      if (first) {
        return first.slice(0, 128);
      }
    }
  }
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim().slice(0, 128);
  }
  return null;
}

export function getRequestUserAgentFromHeaders(
  headers: Record<string, unknown>
): string | null {
  const ua = getHeaderAsString(headers, 'user-agent');
  if (!ua) return null;
  return ua.slice(0, 512);
}
