export function parseTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return undefined;
  }
  return d.toISOString();
}


