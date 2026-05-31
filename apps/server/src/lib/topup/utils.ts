import type { TokenConfig } from './config';

export function parseAmountWei(value: unknown): bigint {
  if (typeof value === 'bigint') {
    if (value <= 0n) {
      throw new Error('Amount must be positive');
    }
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Amount must be positive');
    }
    if (!Number.isInteger(value)) {
      throw new Error('Amount must be an integer');
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^0x[0-9a-f]+$/i.test(trimmed) && !/^[0-9]+$/.test(trimmed)) {
      throw new Error('Invalid amount format');
    }
    const normalized = trimmed.startsWith('0x')
      ? BigInt(trimmed)
      : BigInt(trimmed);
    if (normalized <= 0n) {
      throw new Error('Amount must be positive');
    }
    return normalized;
  }

  throw new Error('Unsupported amount type');
}

export function formatAmountFromWei(
  amountWei: bigint,
  token: TokenConfig
): string {
  if (amountWei === 0n) return '0';
  const decimals = BigInt(token.decimals);
  if (decimals === 0n) {
    return amountWei.toString();
  }

  const base = 10n ** decimals;
  const integer = amountWei / base;
  const remainder = amountWei % base;

  if (remainder === 0n) {
    return integer.toString();
  }

  const remainderStr = remainder.toString().padStart(Number(decimals), '0');
  const trimmed = remainderStr.replace(/0+$/, '');
  return `${integer.toString()}.${trimmed}`;
}

export function applySlippageBps(amount: bigint, slippageBps: number): bigint {
  if (slippageBps <= 0) {
    return amount;
  }
  const numerator = 10_000 - Math.min(10_000, Math.max(0, slippageBps));
  return (amount * BigInt(numerator)) / 10_000n;
}
