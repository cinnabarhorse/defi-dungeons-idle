describe('enemy-difficulty', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('getEnemyDifficultyConfig() sanitizes and clamps raw GAME_CONFIG values', async () => {
    jest.doMock('../constants', () => ({
      GAME_CONFIG: {
        enemyDifficultyMeter: {
          // enabled omitted to ensure default is used
          tickIntervalMs: '500', // should clamp to >= 1000
          damagePerMinute: '-1', // should clamp to >= 0
          hpPerMinute: '0.25',
          speedPerMinute: undefined,
          maxDamageMultiplier: 0, // should clamp to >= 1
          maxHpMultiplier: 'not-a-number', // fallback + clamp
          maxSpeedMultiplier: null, // fallback + clamp
          rescaleBatchSize: '3.7', // floor
          rescaleBatchDelayMs: -5, // clamp to >= 0
        },
        MAX_PLAYERS: 3,
      },
    }));

    const { getEnemyDifficultyConfig } = await import('../enemy-difficulty');

    const cfg = getEnemyDifficultyConfig();

    expect(cfg.enabled).toBe(true);
    expect(cfg.tickIntervalMs).toBe(1000);
    expect(cfg.damagePerMinute).toBe(0);
    expect(cfg.hpPerMinute).toBeCloseTo(0.25);
    expect(cfg.maxDamageMultiplier).toBe(1);
    // fallback (DEFAULT_CONFIG.maxHpMultiplier=6) then clamp >= 1
    expect(cfg.maxHpMultiplier).toBe(6);
    // fallback (DEFAULT_CONFIG.maxSpeedMultiplier=1.75) then clamp >= 1
    expect(cfg.maxSpeedMultiplier).toBe(1.75);
    expect(cfg.rescaleBatchSize).toBe(3);
    expect(cfg.rescaleBatchDelayMs).toBe(0);
  });

  it('getEnemyDifficultyMultipliers() caps multipliers at configured maximums', async () => {
    jest.doMock('../constants', () => ({
      GAME_CONFIG: {
        enemyDifficultyMeter: {
          damagePerMinute: 0.5,
          hpPerMinute: 1,
          speedPerMinute: 10,
          maxDamageMultiplier: 2,
          maxHpMultiplier: 3,
          maxSpeedMultiplier: 1.5,
        },
      },
    }));

    const { getEnemyDifficultyMultipliers } = await import('../enemy-difficulty');

    const mul = getEnemyDifficultyMultipliers(10);
    expect(mul.damageMultiplier).toBe(2); // 1 + 10*0.5 = 6 -> capped at 2
    expect(mul.hpMultiplier).toBe(3); // 1 + 10*1 = 11 -> capped at 3
    expect(mul.speedMultiplier).toBe(1.5); // 1 + 10*10 = 101 -> capped at 1.5
  });

  it('getRoomEnemyDifficultyMultipliers() scales damage/hp with party size but not speed (and clamps party size)', async () => {
    jest.doMock('../constants', () => ({
      GAME_CONFIG: {
        enemyDifficultyMeter: {
          // keep level multipliers at 1 so party scaling is obvious
          damagePerMinute: 0,
          hpPerMinute: 0,
          speedPerMinute: 0,
          maxDamageMultiplier: 10,
          maxHpMultiplier: 10,
          maxSpeedMultiplier: 10,
        },
        MAX_PLAYERS: 3,
      },
    }));

    const { getRoomEnemyDifficultyMultipliers } = await import('../enemy-difficulty');

    const mul = getRoomEnemyDifficultyMultipliers({
      enemyDifficultyLevel: 0,
      players: { size: 99 }, // should clamp to MAX_PLAYERS
    });

    expect(mul.damageMultiplier).toBe(3);
    expect(mul.hpMultiplier).toBe(3);
    expect(mul.speedMultiplier).toBe(1);
  });

  it('snapshotEnemyDifficultyBase() stores base values using safe minimum multipliers', async () => {
    jest.doMock('../constants', () => ({
      GAME_CONFIG: {},
    }));

    const { snapshotEnemyDifficultyBase } = await import('../enemy-difficulty');

    const enemy: any = {
      maxHp: 100,
      damage: 10,
      speed: 2,
    };

    snapshotEnemyDifficultyBase(enemy, {
      hpMultiplier: 2,
      damageMultiplier: 5,
      speedMultiplier: 0, // falsy -> falls back to 1 (via `|| 1`)
    });

    expect(enemy._tierScaledMaxHpBase).toBeCloseTo(50);
    expect(enemy._tierScaledDamageBase).toBeCloseTo(2);
    expect(enemy._tierScaledSpeedBase).toBeCloseTo(2);
  });
});
