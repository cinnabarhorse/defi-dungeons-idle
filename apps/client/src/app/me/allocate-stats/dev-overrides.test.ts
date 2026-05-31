import {
  isAllocateStatsDevModeEnabled,
  parseAllocateStatsDevLevelOverride,
} from './dev-overrides';

function createSearchParams(
  entries: Array<[string, string]>
): URLSearchParams {
  return new URLSearchParams(entries);
}

describe('allocate stats dev overrides', () => {
  test('detects dev mode via dev=true', () => {
    const params = createSearchParams([['dev', 'true']]);
    expect(isAllocateStatsDevModeEnabled(params)).toBe(true);
  });

  test('detects dev mode via devMode=1', () => {
    const params = createSearchParams([['devMode', '1']]);
    expect(isAllocateStatsDevModeEnabled(params)).toBe(true);
  });

  test('does not enable dev mode when dev params are missing', () => {
    const params = createSearchParams([['devLevel', '99']]);
    expect(isAllocateStatsDevModeEnabled(params)).toBe(false);
  });

  test('parses devLevel override when dev mode is on', () => {
    const params = createSearchParams([
      ['dev', 'true'],
      ['devLevel', '99'],
    ]);
    expect(parseAllocateStatsDevLevelOverride(params)).toBe(99);
  });

  test('falls back to levelOverride when devLevel is missing', () => {
    const params = createSearchParams([
      ['dev', 'true'],
      ['levelOverride', '120'],
    ]);
    expect(parseAllocateStatsDevLevelOverride(params)).toBe(120);
  });

  test('returns null for invalid numeric values', () => {
    const params = createSearchParams([
      ['dev', 'true'],
      ['devLevel', 'not-a-number'],
    ]);
    expect(parseAllocateStatsDevLevelOverride(params)).toBeNull();
  });

  test('clamps override level to supported bounds', () => {
    const lowParams = createSearchParams([
      ['dev', 'true'],
      ['devLevel', '-5'],
    ]);
    const highParams = createSearchParams([
      ['dev', 'true'],
      ['devLevel', '999'],
    ]);

    expect(parseAllocateStatsDevLevelOverride(lowParams)).toBe(1);
    expect(parseAllocateStatsDevLevelOverride(highParams)).toBe(199);
  });

  test('ignores level override when dev mode is off', () => {
    const params = createSearchParams([['devLevel', '99']]);
    expect(parseAllocateStatsDevLevelOverride(params)).toBeNull();
  });
});
