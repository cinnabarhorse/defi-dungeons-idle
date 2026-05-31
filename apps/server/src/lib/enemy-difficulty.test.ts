describe('enemy-difficulty', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('getEnemyDifficultyConfig sanitizes invalid values and applies minimums', async () => {
    jest.doMock('./constants', () => ({
      GAME_CONFIG: {
        enemyDifficultyMeter: {
          enabled: 'not-a-boolean',
          tickIntervalMs: 10, // below 1000 minimum
          damagePerMinute: -5, // should clamp to 0
          hpPerMinute: '0.25',
          speedPerMinute: undefined,
          maxDamageMultiplier: 0, // should clamp to >= 1
          maxHpMultiplier: 'not-a-number',
          maxSpeedMultiplier: -123,
          rescaleBatchSize: 0,
          rescaleBatchDelayMs: -1,
        },
        MAX_PLAYERS: 3,
      },
    }));

    const mod = await import('./enemy-difficulty');
    const cfg = mod.getEnemyDifficultyConfig();

    expect(cfg.enabled).toBe(true); // Boolean('not-a-boolean') === true
    expect(cfg.tickIntervalMs).toBe(1000);
    expect(cfg.damagePerMinute).toBe(0);
    expect(cfg.hpPerMinute).toBe(0.25);
    expect(cfg.speedPerMinute).toBeGreaterThanOrEqual(0);
    expect(cfg.maxDamageMultiplier).toBeGreaterThanOrEqual(1);
    expect(cfg.maxHpMultiplier).toBeGreaterThanOrEqual(1);
    expect(cfg.maxSpeedMultiplier).toBeGreaterThanOrEqual(1);
    expect(cfg.rescaleBatchSize).toBeGreaterThanOrEqual(1);
    expect(cfg.rescaleBatchDelayMs).toBeGreaterThanOrEqual(0);
  });

  it('getRoomEnemyDifficultyMultipliers scales damage/hp by party size but not speed', async () => {
    jest.doMock('./constants', () => ({
      GAME_CONFIG: {
        enemyDifficultyMeter: {
          enabled: true,
          damagePerMinute: 0.1,
          hpPerMinute: 0.2,
          speedPerMinute: 0.3,
          maxDamageMultiplier: 10,
          maxHpMultiplier: 10,
          maxSpeedMultiplier: 10,
        },
        MAX_PLAYERS: 3,
      },
    }));

    const mod = await import('./enemy-difficulty');

    const base = mod.getEnemyDifficultyMultipliers(10);
    const scaled = mod.getRoomEnemyDifficultyMultipliers({
      enemyDifficultyLevel: 10,
      players: { size: 3 },
    });

    expect(scaled.damageMultiplier).toBeCloseTo(base.damageMultiplier * 3);
    expect(scaled.hpMultiplier).toBeCloseTo(base.hpMultiplier * 3);
    expect(scaled.speedMultiplier).toBeCloseTo(base.speedMultiplier);
  });

  it('snapshotEnemyDifficultyBase captures pre-scaled values on the enemy schema', async () => {
    jest.doMock('./constants', () => ({
      GAME_CONFIG: { enemyDifficultyMeter: {}, MAX_PLAYERS: 3 },
    }));

    const mod = await import('./enemy-difficulty');

    const enemy: any = {
      maxHp: 200,
      damage: 30,
      speed: 2,
    };

    mod.snapshotEnemyDifficultyBase(enemy, {
      hpMultiplier: 2,
      damageMultiplier: 3,
      speedMultiplier: 4,
    });

    expect(enemy._tierScaledMaxHpBase).toBeCloseTo(100);
    expect(enemy._tierScaledDamageBase).toBeCloseTo(10);
    expect(enemy._tierScaledSpeedBase).toBeCloseTo(0.5);
  });
});
