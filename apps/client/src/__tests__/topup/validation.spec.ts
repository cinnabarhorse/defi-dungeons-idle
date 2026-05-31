import {
  clampAmount,
  getAmountError,
  isValidAmount,
} from '../../lib/topup/validation';
import { AMOUNT_MAX, AMOUNT_MIN } from '../../lib/topup/constants';

describe('clampAmount', () => {
  it('clamps values below minimum', () => {
    expect(clampAmount(0.5)).toBe(AMOUNT_MIN);
  });

  it('clamps values above maximum', () => {
    expect(clampAmount(200)).toBe(AMOUNT_MAX);
  });

  it('returns value when within range', () => {
    expect(clampAmount(25)).toBe(25);
  });
});

describe('isValidAmount', () => {
  it('validates range', () => {
    expect(isValidAmount(AMOUNT_MIN - 0.1)).toBe(false);
    expect(isValidAmount(AMOUNT_MIN)).toBe(true);
    expect(isValidAmount(AMOUNT_MAX)).toBe(true);
    expect(isValidAmount(AMOUNT_MAX + 1)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isValidAmount(Number.NaN)).toBe(false);
  });
});

describe('getAmountError', () => {
  it('returns null for valid amounts', () => {
    expect(getAmountError(AMOUNT_MIN)).toBeNull();
  });

  it('describes invalid states', () => {
    expect(getAmountError(Number.NaN)).toBe('Enter a valid amount.');
    expect(getAmountError(AMOUNT_MIN - 0.1)).toContain('Minimum top-up');
    expect(getAmountError(AMOUNT_MAX + 1)).toContain('Maximum top-up');
  });
});
