export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Invalid numeric value');
    }
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0n;
    }
    if (/^0x[0-9a-f]+$/i.test(trimmed) || /^[0-9]+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    return BigInt(trimmed);
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const str = (value as { toString(): string }).toString();
    return toBigInt(str);
  }
  throw new Error('Unable to convert value to bigint');
}


