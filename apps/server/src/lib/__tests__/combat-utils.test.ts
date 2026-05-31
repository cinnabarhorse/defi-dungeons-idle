describe('combat-utils', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('getRandomIntInclusive is inclusive, supports swapped bounds, and floors inputs', async () => {
    const mod = await import('../combat-utils');

    const spy = jest.spyOn(Math, 'random');
    spy.mockReturnValue(0);
    expect(mod.getRandomIntInclusive(1.2, 3.8)).toBe(1);

    spy.mockReturnValue(0.999999);
    expect(mod.getRandomIntInclusive(1.2, 3.8)).toBe(3);

    // swapped bounds still works
    spy.mockReturnValue(0);
    const v = mod.getRandomIntInclusive(5, 2);
    expect(v).toBeGreaterThanOrEqual(2);
    expect(v).toBeLessThanOrEqual(5);

    spy.mockRestore();
  });

  it('computeBaseDamageForCharacter prefers derivedStats.damageRange over fallback and rounds derivedStats.damage', async () => {
    jest.doMock('../character-registry', () => ({
      getCharacterStats: jest.fn(() => ({ damage: 999 })),
    }));

    const mod = await import('../combat-utils');

    const spy = jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(
      mod.computeBaseDamageForCharacter('any', 7, {
        damageRange: { min: 10, max: 20 },
      })
    ).toBe(10);

    expect(mod.computeBaseDamageForCharacter('any', 7, { damage: 12.4 })).toBe(
      12
    );

    spy.mockRestore();
  });

  it('computeBaseDamageForCharacter uses getCharacterStats when derivedStats is missing and returns fallback on errors', async () => {
    const getCharacterStats = jest.fn(() => ({ damage: 12.7 }));
    jest.doMock('../character-registry', () => ({ getCharacterStats }));

    const mod = await import('../combat-utils');

    expect(mod.computeBaseDamageForCharacter('char-1', 7)).toBe(13);
    expect(getCharacterStats).toHaveBeenCalledWith('char-1');

    getCharacterStats.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(mod.computeBaseDamageForCharacter('char-2', 42)).toBe(42);
  });
});
