function createMockRes() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

async function loadAdminAuthWithEnv(opts: {
  allowlist?: string;
  resolvedSession?: { address: string; playerId: string | null } | null;
}) {
  // Ensure each test gets a fresh module instance (ADMIN_ALLOWLIST is computed at module load).
  jest.resetModules();

  if (opts.allowlist === undefined) {
    delete process.env.ADMIN_WALLET_ALLOWLIST;
  } else {
    process.env.ADMIN_WALLET_ALLOWLIST = opts.allowlist;
  }

  const sessionModulePath = require.resolve('../../lib/auth/session');

  jest.doMock(sessionModulePath, () => ({
    resolveSessionFromRequest: jest.fn().mockResolvedValue(opts.resolvedSession ?? null),
  }));

  const mod = await import('../admin-auth');
  const sessionMod = await import('../../lib/auth/session');

  return {
    adminAuth: mod,
    resolveSessionFromRequest: sessionMod.resolveSessionFromRequest as jest.Mock,
  };
}

describe('admin-auth', () => {
  afterEach(() => {
    delete process.env.ADMIN_WALLET_ALLOWLIST;
    jest.clearAllMocks();
  });

  it('isAdminAddress normalizes input and allowlist entries from env', async () => {
    const { adminAuth } = await loadAdminAuthWithEnv({
      allowlist: ' 0xAbC , 0xdef  ',
    });

    expect(adminAuth.isAdminAddress(null)).toBe(false);
    expect(adminAuth.isAdminAddress(undefined)).toBe(false);
    expect(adminAuth.isAdminAddress('')).toBe(false);

    expect(adminAuth.isAdminAddress('0xabc')).toBe(true);
    expect(adminAuth.isAdminAddress('  0xDeF  ')).toBe(true);
    expect(adminAuth.isAdminAddress('0xnope')).toBe(false);
  });

  it('requireAdminSession returns 401 when no session can be resolved', async () => {
    const { adminAuth, resolveSessionFromRequest } = await loadAdminAuthWithEnv({
      allowlist: '0xabc',
      resolvedSession: null,
    });

    const req: any = {};
    const res = createMockRes();

    const result = await adminAuth.requireAdminSession(req, res);

    expect(result).toBeNull();
    expect(resolveSessionFromRequest).toHaveBeenCalledWith(req);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('requireAdminSession returns 403 when session address is not allowlisted, otherwise returns the session', async () => {
    const req: any = {};

    // Forbidden
    {
      const { adminAuth } = await loadAdminAuthWithEnv({
        allowlist: '0xabc',
        resolvedSession: { address: '0xdef', playerId: 'p1' },
      });
      const res = createMockRes();

      const result = await adminAuth.requireAdminSession(req, res);

      expect(result).toBeNull();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    }

    // Allowed
    {
      const { adminAuth } = await loadAdminAuthWithEnv({
        allowlist: '0xabc',
        resolvedSession: { address: '0xAbC', playerId: null },
      });
      const res = createMockRes();

      const result = await adminAuth.requireAdminSession(req, res);

      expect(result).toEqual({ address: '0xAbC', playerId: null });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    }
  });
});
