import type { TokenSymbol } from '../../types/topup';

export type StakeCurrencyMode = 'USDC' | 'GHST';

export interface StakeQueryStateInput {
  mode: StakeCurrencyMode;
  selectedStakeThreshold: number;
  normalizedGhstStaked: number;
  totalStaked: number;
}

export interface StakeQueryState {
  token: TokenSymbol;
  amount: string | null;
}

export interface InitialTopupQueryUpdateInput {
  initialToken?: TokenSymbol;
  initialAmount?: number;
  tokenParam: string | null;
  amountParam: string | null;
}

export interface InitialTopupQueryUpdate {
  token?: TokenSymbol;
  amount?: string;
}

export function resolveTopupTokenFromQuery(tokenParam: string | null): TokenSymbol {
  if (tokenParam === 'GHO') return 'GHO';
  if (tokenParam === 'GHST') return 'GHST';
  return 'USDC';
}

export function buildStakeQueryState({
  mode,
  selectedStakeThreshold,
  normalizedGhstStaked,
  totalStaked,
}: StakeQueryStateInput): StakeQueryState {
  const token: TokenSymbol = mode === 'GHST' ? 'GHST' : 'USDC';
  const stakeBaseline = mode === 'GHST' ? normalizedGhstStaked : totalStaked;
  const amount = Math.max(0, selectedStakeThreshold - stakeBaseline);

  return {
    token,
    amount: amount > 0 ? String(Math.floor(amount)) : null,
  };
}

export function buildInitialTopupQueryUpdate({
  initialToken,
  initialAmount,
  tokenParam,
  amountParam,
}: InitialTopupQueryUpdateInput): InitialTopupQueryUpdate | null {
  const normalizedAmount =
    typeof initialAmount === 'number' && Number.isFinite(initialAmount)
      ? Math.max(0, Math.floor(initialAmount))
      : null;
  const amountValue =
    normalizedAmount != null && normalizedAmount > 0
      ? String(normalizedAmount)
      : null;

  const update: InitialTopupQueryUpdate = {};
  if (initialToken && tokenParam !== initialToken) {
    update.token = initialToken;
  }
  if (amountValue && amountParam !== amountValue) {
    update.amount = amountValue;
  }

  return Object.keys(update).length > 0 ? update : null;
}
