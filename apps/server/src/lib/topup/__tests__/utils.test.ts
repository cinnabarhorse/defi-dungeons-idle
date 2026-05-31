import { applySlippageBps, formatAmountFromWei, parseAmountWei } from '../utils';

describe('topup/utils', () => {
  describe('parseAmountWei', () => {
    it('accepts positive bigint', () => {
      expect(parseAmountWei(123n)).toBe(123n);
    });

    it('rejects non-positive bigint', () => {
      expect(() => parseAmountWei(0n)).toThrow('Amount must be positive');
      expect(() => parseAmountWei(-1n)).toThrow('Amount must be positive');
    });

    it('accepts positive integer number', () => {
      expect(parseAmountWei(42)).toBe(42n);
    });

    it('rejects non-finite / non-positive / non-integer numbers', () => {
      expect(() => parseAmountWei(NaN)).toThrow('Amount must be positive');
      expect(() => parseAmountWei(Infinity)).toThrow('Amount must be positive');
      expect(() => parseAmountWei(0)).toThrow('Amount must be positive');
      expect(() => parseAmountWei(-5)).toThrow('Amount must be positive');
      expect(() => parseAmountWei(1.23)).toThrow('Amount must be an integer');
    });

    it('accepts decimal and hex strings with whitespace', () => {
      expect(parseAmountWei('  1000  ')).toBe(1000n);
      expect(parseAmountWei('0x10')).toBe(16n);
      expect(parseAmountWei('0Xff')).toBe(255n);
    });

    it('rejects invalid string formats and non-positive values', () => {
      expect(() => parseAmountWei('')).toThrow('Invalid amount format');
      expect(() => parseAmountWei('not-a-number')).toThrow('Invalid amount format');
      expect(() => parseAmountWei('1.5')).toThrow('Invalid amount format');
      expect(() => parseAmountWei('-1')).toThrow('Invalid amount format');
      expect(() => parseAmountWei('0')).toThrow('Amount must be positive');
    });

    it('rejects unsupported types', () => {
      expect(() => parseAmountWei(null)).toThrow('Unsupported amount type');
      expect(() => parseAmountWei(undefined)).toThrow('Unsupported amount type');
      expect(() => parseAmountWei({ amount: '1' })).toThrow('Unsupported amount type');
    });
  });

  describe('formatAmountFromWei', () => {
    it('formats zero', () => {
      expect(formatAmountFromWei(0n, { symbol: 'USDC', address: '0x0', decimals: 6 })).toBe('0');
    });

    it('formats integer-only amounts (no remainder)', () => {
      expect(formatAmountFromWei(2_000_000n, { symbol: 'USDC', address: '0x0', decimals: 6 })).toBe('2');
    });

    it('formats fractional amounts and trims trailing zeros', () => {
      const token = { symbol: 'USDC' as const, address: '0x0', decimals: 6 };

      expect(formatAmountFromWei(1_500_000n, token)).toBe('1.5');
      expect(formatAmountFromWei(1_234_500n, token)).toBe('1.2345');
      expect(formatAmountFromWei(1_234_567n, token)).toBe('1.234567');
    });

    it('handles tokens with 0 decimals', () => {
      expect(formatAmountFromWei(123n, { symbol: 'USDC', address: '0x0', decimals: 0 })).toBe('123');
    });
  });

  describe('applySlippageBps', () => {
    it('returns same amount when slippage is <= 0', () => {
      expect(applySlippageBps(100n, 0)).toBe(100n);
      expect(applySlippageBps(100n, -5)).toBe(100n);
    });

    it('applies slippage and floors the result', () => {
      // 50 bps = 0.50% => multiply by 9950/10000
      expect(applySlippageBps(10_000n, 50)).toBe(9_950n);
      expect(applySlippageBps(3n, 50)).toBe(2n);
    });

    it('caps slippage at 10_000 bps (100%)', () => {
      expect(applySlippageBps(123n, 10_000)).toBe(0n);
      expect(applySlippageBps(123n, 99_999)).toBe(0n);
    });
  });
});
