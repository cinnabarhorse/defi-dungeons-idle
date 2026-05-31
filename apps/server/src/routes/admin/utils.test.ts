import { parseTimestamp } from './utils';

describe('parseTimestamp', () => {
  it('returns undefined for non-string inputs', () => {
    expect(parseTimestamp(undefined)).toBeUndefined();
    expect(parseTimestamp(null)).toBeUndefined();
    expect(parseTimestamp(123)).toBeUndefined();
    expect(parseTimestamp({})).toBeUndefined();
  });

  it('returns undefined for empty/whitespace strings', () => {
    expect(parseTimestamp('')).toBeUndefined();
    expect(parseTimestamp('   ')).toBeUndefined();
  });

  it('returns undefined for invalid dates', () => {
    expect(parseTimestamp('not-a-date')).toBeUndefined();
    expect(parseTimestamp('2020-99-99T00:00:00Z')).toBeUndefined();
  });

  it('normalizes valid timestamps to ISO, trimming whitespace', () => {
    expect(parseTimestamp('  2020-01-01T00:00:00Z  ')).toBe(
      '2020-01-01T00:00:00.000Z'
    );
  });
});
