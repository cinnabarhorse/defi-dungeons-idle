import { formatAmount, formatDate } from '../../lib/topup/format';

describe('formatAmount', () => {
  it('formats amounts with token-aware precision', () => {
    const formatted = formatAmount(1234.56789, 'USDC');
    expect(Number(formatted.replace(/,/g, ''))).toBeCloseTo(1234.56789, 4);
  });

  it('defaults to zero for invalid values', () => {
    expect(formatAmount(Number.NaN, 'USDC')).toBe('0');
  });
});

describe('formatDate', () => {
  it('formats ISO dates to locale string', () => {
    const iso = '2025-10-01T12:00:00.000Z';
    const expected = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
    expect(formatDate(iso)).toBe(expected);
  });

  it('returns input when date is invalid', () => {
    expect(formatDate('invalid-date')).toBe('invalid-date');
  });
});
