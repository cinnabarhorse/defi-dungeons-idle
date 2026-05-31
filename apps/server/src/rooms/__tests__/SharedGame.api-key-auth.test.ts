jest.mock('../../lib/db', () => ({
  authSessionsRepo: {
    getValidAuthSessionById: jest.fn(),
  },
  apiKeysRepo: {
    getActiveApiKeyByHash: jest.fn(),
    recordAuthSuccess: jest.fn(),
  },
  playersRepo: {
    getPlayerById: jest.fn(),
  },
}));

jest.mock('../../lib/auth/session', () => ({
  readSessionFromRequest: jest.fn(),
  getSessionSecret: jest.fn(() => 'session-secret'),
}));

jest.mock('../../lib/auth/token', () => ({
  verifySessionToken: jest.fn(),
}));

import { onAuth } from '../SharedGame';
import { authSessionsRepo, apiKeysRepo, playersRepo } from '../../lib/db';
import { readSessionFromRequest } from '../../lib/auth/session';

describe('SharedGame onAuth API keys', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ENABLE_STAKED_API_KEYS = '1';
    process.env.API_KEY_HASH_SECRET = 'test-secret';
    process.env.API_KEY_TRUST_X_FORWARDED_FOR = '1';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('authenticates valid API keys and increments auth usage counter', async () => {
    (readSessionFromRequest as jest.Mock).mockReturnValue(null);
    (apiKeysRepo.getActiveApiKeyByHash as jest.Mock).mockResolvedValue({
      id: 'key-1',
      playerId: 'player-1',
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      walletAddress: '0xabc',
      isAuthorized: true,
      username: 'bot',
    });
    (apiKeysRepo.recordAuthSuccess as jest.Mock).mockResolvedValue({
      id: 'key-1',
    });

    const client: any = { sessionId: 'session-1' };
    const auth = await onAuth(
      {} as any,
      client,
      {},
      {
        headers: {
          authorization: 'Bearer ddk_live_test_key',
          'x-forwarded-for': '1.2.3.4',
          'user-agent': 'jest-agent',
        },
      } as any
    );

    expect(auth).toMatchObject({
      playerId: 'player-1',
      authMethod: 'api_key',
      apiKeyId: 'key-1',
    });
    expect(apiKeysRepo.recordAuthSuccess).toHaveBeenCalledWith('key-1', {
      ip: '1.2.3.4',
      userAgent: 'jest-agent',
    });
  });

  it('keeps session-cookie authentication behavior unchanged', async () => {
    (readSessionFromRequest as jest.Mock).mockReturnValue({
      sessionId: 'sess-1',
      address: '0xabc',
    });
    (authSessionsRepo.getValidAuthSessionById as jest.Mock).mockResolvedValue({
      id: 'sess-1',
      walletAddress: '0xabc',
      playerId: 'player-1',
    });
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      walletAddress: '0xabc',
      isAuthorized: true,
      username: 'session-user',
    });

    const client: any = { sessionId: 'session-2' };
    const auth = await onAuth(
      {} as any,
      client,
      {},
      { headers: { cookie: 'dd-session=fake' } } as any
    );

    expect(auth).toMatchObject({
      playerId: 'player-1',
      authMethod: 'session',
      apiKeyId: null,
    });
    expect(apiKeysRepo.getActiveApiKeyByHash).not.toHaveBeenCalled();
  });

  it('does not authenticate revoked or invalid API keys', async () => {
    (readSessionFromRequest as jest.Mock).mockReturnValue(null);
    (apiKeysRepo.getActiveApiKeyByHash as jest.Mock).mockResolvedValue(null);

    const client: any = { sessionId: 'session-3' };
    const auth = await onAuth(
      {} as any,
      client,
      {},
      { headers: { authorization: 'Bearer ddk_live_revoked' } } as any
    );

    expect(auth).toMatchObject({
      isAuthorized: false,
    });
  });
});
