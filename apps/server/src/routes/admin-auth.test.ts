describe('isAdminAddress', () => {
  const ORIGINAL_ENV = process.env.ADMIN_WALLET_ALLOWLIST;

  afterEach(() => {
    // Restore for other tests, and force re-evaluation of module-level allowlist.
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_WALLET_ALLOWLIST;
    } else {
      process.env.ADMIN_WALLET_ALLOWLIST = ORIGINAL_ENV;
    }
    jest.resetModules();
  });

  it('uses the default admin address allowlist when env var is unset', async () => {
    delete process.env.ADMIN_WALLET_ALLOWLIST;
    jest.resetModules();

    const { isAdminAddress } = await import('./admin-auth');
    const { DEFAULT_ADMIN_ADDRESS } = await import('../lib/constants');

    expect(isAdminAddress(DEFAULT_ADMIN_ADDRESS)).toBe(true);
    expect(isAdminAddress(`  ${DEFAULT_ADMIN_ADDRESS.toUpperCase()}  `)).toBe(
      true
    );
    expect(isAdminAddress('0x0000000000000000000000000000000000000000')).toBe(
      false
    );
    expect(isAdminAddress(null)).toBe(false);
  });

  it('parses and normalizes a comma-separated allowlist from env', async () => {
    process.env.ADMIN_WALLET_ALLOWLIST = ' 0xabc ,0xDEF,  , 0x123 ';
    jest.resetModules();

    const { isAdminAddress } = await import('./admin-auth');

    expect(isAdminAddress('0xabc')).toBe(true);
    expect(isAdminAddress('0xdef')).toBe(true);
    expect(isAdminAddress('  0x123  ')).toBe(true);
    expect(isAdminAddress('0x456')).toBe(false);
  });
});
