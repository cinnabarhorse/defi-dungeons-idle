import { resolvePreferredHandWeaponIndex } from '../hand-weapon-utils';

describe('resolvePreferredHandWeaponIndex', () => {
  it('returns -1 when weapons is empty or not an array', () => {
    // @ts-expect-error intentional bad input
    expect(resolvePreferredHandWeaponIndex(0, null)).toBe(-1);
    // @ts-expect-error intentional bad input
    expect(resolvePreferredHandWeaponIndex(0, undefined)).toBe(-1);
    expect(resolvePreferredHandWeaponIndex(0, [])).toBe(-1);
  });

  it('respects a valid previous index (floors floats)', () => {
    const weapons = [{ slot: 'handRight' as const }, { slot: 'handLeft' as const }];

    expect(resolvePreferredHandWeaponIndex(1, weapons)).toBe(1);
    expect(resolvePreferredHandWeaponIndex(1.9, weapons)).toBe(1);
    expect(resolvePreferredHandWeaponIndex(0.1, weapons)).toBe(0);
  });

  it('prefers left-hand weapon when previous index is invalid', () => {
    const weapons = [
      { slot: 'handRight' as const },
      { slot: 'handLeft' as const },
      { slot: 'handRight' as const },
    ];

    expect(resolvePreferredHandWeaponIndex(-1, weapons)).toBe(1);
    expect(resolvePreferredHandWeaponIndex('0', weapons)).toBe(1);
    expect(resolvePreferredHandWeaponIndex(999, weapons)).toBe(1);
  });

  it('falls back to 0 when no left-hand weapon exists', () => {
    const weapons = [{ slot: 'handRight' as const }, { slot: 'handRight' as const }];

    expect(resolvePreferredHandWeaponIndex(-1, weapons)).toBe(0);
    expect(resolvePreferredHandWeaponIndex(undefined, weapons)).toBe(0);
  });
});
