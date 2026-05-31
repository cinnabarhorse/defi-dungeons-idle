jest.mock('../../routes/admin-auth', () => ({
  isAdminAddress: jest.fn(),
}));

// `PlayerSchema` is only used for TS typing in dev-mode; avoid loading full schema module.
jest.mock('../../schemas', () => ({}));

describe('lib/dev-mode', () => {
  const load = async () => {
    jest.resetModules();
    const adminAuth = require('../../routes/admin-auth') as {
      isAdminAddress: jest.Mock;
    };
    const devMode = require('../dev-mode') as typeof import('../dev-mode');
    return { adminAuth, devMode };
  };

  const basePlayer = () =>
    ({
      id: 'p1',
      characterId: 'c1',
      maxHp: 100,
      hp: 100,
      maxMana: 50,
      mana: 50,
      healthPotionCount: 0,
      manaPotionCount: 0,
      lickTongueCount: 0,
      idleRoom: { depth: 1, maxDepthReached: 1 },
      equippedWearables: '[]',
      derivedStats: '{}',
    }) as any;

  const withEnv = async (env: Record<string, string | undefined>, fn: () => any) => {
    const old = { ...process.env };
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      process.env = old;
    }
  };

  test('isDevModeAllowed: non-production always allows', async () => {
    await withEnv({ NODE_ENV: 'test' }, async () => {
      const { devMode, adminAuth } = await load();
      const { isDevModeAllowed } = devMode;
      adminAuth.isAdminAddress.mockReturnValue(false);

      expect(isDevModeAllowed(undefined)).toBe(true);
      expect(isDevModeAllowed('0xabc')).toBe(true);
    });
  });

  test('isDevModeAllowed: production requires admin address', async () => {
    await withEnv({ NODE_ENV: 'production' }, async () => {
      const { devMode, adminAuth } = await load();
      const { isDevModeAllowed } = devMode;

      adminAuth.isAdminAddress.mockReturnValue(false);
      expect(isDevModeAllowed('0xabc')).toBe(false);

      adminAuth.isAdminAddress.mockReturnValue(true);
      expect(isDevModeAllowed('0xabc')).toBe(true);
    });
  });

  test('applyDevModeToPlayer: no devMode request => not applied', async () => {
    await withEnv({ NODE_ENV: 'test' }, async () => {
      const { devMode } = await load();
      const { applyDevModeToPlayer } = devMode;
      const player = basePlayer();

      const res = applyDevModeToPlayer(player, { devMode: false, devHealthPotions: 99 });

      expect(res).toEqual({ applied: false, features: [] });
      expect(player.healthPotionCount).toBe(0);
    });
  });

  test('applyDevModeToPlayer: devMode requested but not allowed => not applied', async () => {
    await withEnv({ NODE_ENV: 'production' }, async () => {
      const { devMode, adminAuth } = await load();
      const { applyDevModeToPlayer } = devMode;
      const player = basePlayer();

      adminAuth.isAdminAddress.mockReturnValue(false);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const res = applyDevModeToPlayer(player, { devMode: true, devHealthPotions: 3 }, '0xnope');

      expect(res).toEqual({ applied: false, features: [] });
      expect(player.healthPotionCount).toBe(0);
      expect(warn).toHaveBeenCalledWith(
        '[DevMode] Dev mode requested but not allowed for this user'
      );

      warn.mockRestore();
    });
  });

  test('applyDevModeToPlayer: ignores invalid numeric inputs (negative/NaN/out-of-range)', async () => {
    await withEnv({ NODE_ENV: 'test' }, async () => {
      const { devMode } = await load();
      const { applyDevModeToPlayer } = devMode;
      const player = basePlayer();

      const res = applyDevModeToPlayer(player, {
        devMode: true,
        devHealthPotions: -1,
        devManaPotions: Number.NaN,
        devLickTongueCount: -5,
        devStartHpPercent: 101,
        devStartManaPercent: -1,
        devStartFloor: 0,
      });

      // devMode still applied, but nothing should change because everything is invalid
      expect(res.applied).toBe(true);
      expect(res.features).toEqual([]);
      expect(player.healthPotionCount).toBe(0);
      expect(player.manaPotionCount).toBe(0);
      expect(player.lickTongueCount).toBe(0);
      expect(player.hp).toBe(100);
      expect(player.mana).toBe(50);
      expect(player.idleRoom.depth).toBe(1);
      expect(player.idleRoom.maxDepthReached).toBe(1);
    });
  });

  test('applyDevModeToPlayer: applies deterministic overrides + flags when allowed', async () => {
    await withEnv({ NODE_ENV: 'test' }, async () => {
      const { devMode } = await load();
      const { applyDevModeToPlayer, hasInfiniteResources, shouldSkipEntryFee } = devMode;
      const player = basePlayer();

      const res = applyDevModeToPlayer(
        player,
        {
          devMode: true,
          devHealthPotions: 3,
          devManaPotions: 2,
          devLickTongueCount: 7,
          devStartHpPercent: 0,
          devStartManaPercent: 50,
          devStartFloor: 2,
          devInfiniteResources: true,
          devSkipEntryFee: true,
        },
        '0xwhatever'
      );

      expect(res.applied).toBe(true);
      expect(res.features).toEqual(
        expect.arrayContaining([
          'healthPotions=3',
          'manaPotions=2',
          'lickTongue=7',
          'startHp=0%',
          'startMana=50%',
          'startFloor=2',
          'infiniteResources',
          'skipEntryFee',
        ])
      );

      // hp=0% should be allowed to be 0 (special-case minimumHp)
      expect(player.hp).toBe(0);
      expect(player.mana).toBe(25);
      // floor 2 => (2-1)*10+1 = 11
      expect(player.idleRoom.depth).toBe(11);
      expect(player.idleRoom.maxDepthReached).toBe(11);
      expect(hasInfiniteResources(player)).toBe(true);
      expect(shouldSkipEntryFee(player)).toBe(true);
    });
  });

  test('generateDevModePotions: only includes finite, positive tiered potions', async () => {
    const { devMode } = await load();
    const { generateDevModePotions } = devMode;

    expect(
      generateDevModePotions({
        devHealthPotions: 0,
        devGreaterPotions: 2,
        devUltraPotions: Number.NaN,
      })
    ).toEqual([
      {
        id: 'dev_greater_health_potion',
        type: 'potion',
        itemType: 'greater_health_potion',
        name: 'Greater Healing Potion',
        quantity: 2,
        potionTier: 2,
      },
    ]);
  });

  test('applyDevModeEquipment: buildEquipmentState throw => does not crash or mutate player', async () => {
    const { devMode } = await load();
    const { applyDevModeEquipment } = devMode;

    const player = basePlayer();
    const beforeWearables = player.equippedWearables;
    const beforeStats = player.derivedStats;

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    applyDevModeEquipment(player, ['some-slug'], () => {
      throw new Error('boom');
    });

    expect(player.equippedWearables).toBe(beforeWearables);
    expect(player.derivedStats).toBe(beforeStats);
    expect(errorSpy).toHaveBeenCalledWith(
      '[DevMode] Failed to apply equipment:',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });
});
