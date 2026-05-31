import jwt from 'jsonwebtoken';
import { getSessionSecret } from './session';

export const API_KEY_MANAGEMENT_TOKEN_PURPOSE = 'api_key_management';
const DEFAULT_API_KEY_MGMT_TOKEN_TTL_SECONDS = 900;

export interface ApiKeyManagementTokenClaims {
  playerId: string;
  address: string;
  purpose: typeof API_KEY_MANAGEMENT_TOKEN_PURPOSE;
  iat: number;
  exp: number;
}

export interface IssueApiKeyManagementTokenInput {
  playerId: string;
  address: string;
}

function getManagementTokenSecret(): string {
  const explicitSecret = process.env.API_KEY_MGMT_TOKEN_SECRET?.trim();
  if (explicitSecret) {
    return explicitSecret;
  }
  return getSessionSecret();
}

export function getApiKeyManagementTokenTtlSeconds(): number {
  const parsed = Number(process.env.API_KEY_MGMT_TOKEN_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_API_KEY_MGMT_TOKEN_TTL_SECONDS;
  }
  return Math.max(60, Math.min(86_400, Math.floor(parsed)));
}

export function createApiKeyManagementToken(
  input: IssueApiKeyManagementTokenInput
): { token: string; expiresAt: string } {
  const ttlSeconds = getApiKeyManagementTokenTtlSeconds();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ttlSeconds;

  const claims = {
    playerId: input.playerId,
    address: input.address.trim().toLowerCase(),
    purpose: API_KEY_MANAGEMENT_TOKEN_PURPOSE,
  };

  const token = jwt.sign(claims, getManagementTokenSecret(), {
    expiresIn: ttlSeconds,
  });

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyApiKeyManagementToken(
  token: string
): ApiKeyManagementTokenClaims {
  const payload = jwt.verify(token, getManagementTokenSecret()) as Partial<ApiKeyManagementTokenClaims>;

  if (payload.purpose !== API_KEY_MANAGEMENT_TOKEN_PURPOSE) {
    throw new Error('Invalid API key management token purpose');
  }

  if (typeof payload.playerId !== 'string' || payload.playerId.trim().length === 0) {
    throw new Error('Invalid API key management token player id');
  }

  if (typeof payload.address !== 'string' || payload.address.trim().length === 0) {
    throw new Error('Invalid API key management token address');
  }

  if (!Number.isFinite(Number(payload.iat)) || !Number.isFinite(Number(payload.exp))) {
    throw new Error('Invalid API key management token timestamps');
  }

  return {
    playerId: payload.playerId,
    address: payload.address.trim().toLowerCase(),
    purpose: API_KEY_MANAGEMENT_TOKEN_PURPOSE,
    iat: Number(payload.iat),
    exp: Number(payload.exp),
  };
}
