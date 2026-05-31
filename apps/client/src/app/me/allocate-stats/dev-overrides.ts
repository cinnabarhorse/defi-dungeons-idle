type SearchParamsLike = {
  get: (key: string) => string | null;
};

const DEV_MODE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEV_LEVEL_MIN = 1;
const DEV_LEVEL_MAX = 199;

function isTruthyQueryValue(value: string | null): boolean {
  if (!value) {
    return false;
  }
  return DEV_MODE_TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isAllocateStatsDevModeEnabled(
  searchParams: SearchParamsLike | null | undefined
): boolean {
  if (!searchParams) {
    return false;
  }

  return (
    isTruthyQueryValue(searchParams.get('dev')) ||
    isTruthyQueryValue(searchParams.get('devMode'))
  );
}

export function parseAllocateStatsDevLevelOverride(
  searchParams: SearchParamsLike | null | undefined
): number | null {
  if (!isAllocateStatsDevModeEnabled(searchParams)) {
    return null;
  }

  const raw =
    searchParams?.get('devLevel') ??
    searchParams?.get('levelOverride') ??
    searchParams?.get('level');

  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(DEV_LEVEL_MIN, Math.min(DEV_LEVEL_MAX, Math.floor(numeric)));
}
