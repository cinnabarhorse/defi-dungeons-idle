jest.mock('../db', () => ({
  authSessionsRepo: {
    getValidAuthSessionById: jest.fn(),
  },
  playersRepo: {
    getPlayerById: jest.fn(),
  },
  apiKeysRepo: {
    getActiveApiKeyByHash: jest.fn(),
    recordAuthSuccess: jest.fn(),
  },
}));

jest.mock('./api-keys', () => ({
  getRequestIpFromHeaders: jest.fn(() => '127.0.0.1'),
  getRequestUserAgentFromHeaders: jest.fn(() => 'jest-agent'),
  hashApiKey: jest.fn(() => 'hash-1'),
  isStakedApiKeysEnabled: jest.fn(() => true),
  maskApiKeyForLogs: jest.fn(() => 'ddk_live_...'),
}));

jest.mock('./session', () => ({
  resolveSessionFromRequest: jest.fn(),
  getSessionSecret: jest.fn(() => 'session-secret'),
}));

jest.mock('./token', () => ({
  verifySessionToken: jest.fn(),
}));

jest.mock('./api-key-management-token', () => ({
  verifyApiKeyManagementToken: jest.fn(),
}));

import { authSessionsRepo, playersRepo, apiKeysRepo } from '../db';
import { isStakedApiKeysEnabled } from './api-keys';
import { resolveSessionFromRequest } from './session';
import { verifySessionToken } from './token';
import { verifyApiKeyManagementToken } from './api-key-management-token';
import { resolveAuthPrincipal } from './principal';

function mockRequest(authorization?: string) {
  return {
    headers: authorization ? { authorization } : {},
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

describe('resolveAuthPrincipal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isStakedApiKeysEnabled as jest.Mock).mockReturnValue(true);
  });

  it('prefers API key bearer auth and records auth success', async () => {
    (apiKeysRepo.getActiveApiKeyByHash as jest.Mock).mockResolvedValue({
      id: 'key-1',
      playerId: 'player-1',
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      walletAddress: '0xabc',
      username: 'alice',
      isAuthorized: true,
    });

    const principal = await resolveAuthPrincipal(mockRequest('Bearer ddk_live_abc'));

    expect(principal).toMatchObject({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
      apiKeyId: 'key-1',
    });
    expect(apiKeysRepo.recordAuthSuccess).toHaveBeenCalledWith('key-1', {
      ip: '127.0.0.1',
      userAgent: 'jest-agent',
    });
  });

  it('accepts management bearer token when enabled for the route', async () => {
    (verifyApiKeyManagementToken as jest.Mock).mockReturnValue({
      playerId: 'player-2',
      address: '0xdef',
      purpose: 'api_key_management',
      iat: 1,
      exp: 2,
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-2',
      walletAddress: '0xdef',
      username: 'bob',
      isAuthorized: true,
    });

    const principal = await resolveAuthPrincipal(mockRequest('Bearer mgmt-token'), {
      allowManagementToken: true,
    });

    expect(principal).toMatchObject({
      authMethod: 'api_key_management',
      playerId: 'player-2',
      address: '0xdef',
    });
  });

  it('falls back to session bearer token when API key and management token do not match', async () => {
    (verifyApiKeyManagementToken as jest.Mock).mockImplementation(() => {
      throw new Error('invalid');
    });
    (verifySessionToken as jest.Mock).mockReturnValue({
      sessionId: 'session-1',
      address: '0xaaa',
    });
    (authSessionsRepo.getValidAuthSessionById as jest.Mock).mockResolvedValue({
      id: 'session-1',
      playerId: 'player-3',
      walletAddress: '0xaaa',
    });

    const principal = await resolveAuthPrincipal(mockRequest('Bearer session-token'), {
      allowManagementToken: true,
    });

    expect(principal).toMatchObject({
      authMethod: 'session_bearer',
      playerId: 'player-3',
      address: '0xaaa',
      sessionId: 'session-1',
    });
  });

  it('falls back to cookie session when no bearer token is present', async () => {
    (resolveSessionFromRequest as jest.Mock).mockResolvedValue({
      playerId: 'player-4',
      address: '0xbbb',
      sessionId: 'session-4',
      token: 'cookie-token',
      record: {},
    });

    const principal = await resolveAuthPrincipal(mockRequest());

    expect(principal).toMatchObject({
      authMethod: 'session_cookie',
      playerId: 'player-4',
      address: '0xbbb',
      sessionId: 'session-4',
      token: 'cookie-token',
    });
  });

  it('caches resolved principal per request/options', async () => {
    (resolveSessionFromRequest as jest.Mock).mockResolvedValue({
      playerId: 'player-4',
      address: '0xbbb',
      sessionId: 'session-4',
      token: 'cookie-token',
      record: {},
    });

    const req = mockRequest();

    const first = await resolveAuthPrincipal(req);
    const second = await resolveAuthPrincipal(req);

    expect(first).toEqual(second);
    expect(resolveSessionFromRequest).toHaveBeenCalledTimes(1);
  });
});
