import { AMOUNT_MAX, AMOUNT_MIN } from './constants';

export function clampAmount(amount: number): number {
  if (!Number.isFinite(amount)) {
    return AMOUNT_MIN;
  }

  return Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, amount));
}

export function isValidAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) {
    return false;
  }

  return amount >= AMOUNT_MIN && amount <= AMOUNT_MAX;
}

export function getAmountError(amount: number): string | null {
  if (!Number.isFinite(amount) || Number.isNaN(amount)) {
    return 'Enter a valid amount.';
  }

  if (amount < AMOUNT_MIN) {
    return `Minimum top-up is ${AMOUNT_MIN}.`;
  }

  if (amount > AMOUNT_MAX) {
    return `Maximum top-up is ${AMOUNT_MAX}.`;
  }

  return null;
}
