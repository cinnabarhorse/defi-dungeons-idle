import { ethers } from 'ethers';
import { BASE_CHAIN_ID } from '../topup/config';
// Avoid importing from tx-creator to prevent circular dependencies

export type WithdrawalCurrency = 'USDC' | 'GHST';

export interface WithdrawalTokenConfig {
  symbol: WithdrawalCurrency;
  decimals: number;
  minWithdrawalAmount: number;
  defaultChainId: number;
  tokenAddress: string;
}

export const DEFAULT_GHST_CONTRACT_ADDRESS =
  '0xcD2F22236DD9Dfe2356D7C543161D4d260FD9BcB';

export const DEFAULT_USDC_ADDRESS =
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

const TOKEN_CONFIGS: Record<WithdrawalCurrency, WithdrawalTokenConfig> = {
  USDC: {
    symbol: 'USDC',
    decimals: 6,
    minWithdrawalAmount: 0.1,
    defaultChainId: BASE_CHAIN_ID,
    tokenAddress: DEFAULT_USDC_ADDRESS,
  },
  GHST: {
    symbol: 'GHST',
    decimals: 18,
    minWithdrawalAmount: 0.1,
    defaultChainId: BASE_CHAIN_ID,
    tokenAddress: DEFAULT_GHST_CONTRACT_ADDRESS,
  },
};

function buildMinBaseUnitMap() {
  return {
    USDC: parseAmountToBaseUnits(
      TOKEN_CONFIGS.USDC.minWithdrawalAmount,
      TOKEN_CONFIGS.USDC.decimals
    ),
    GHST: parseAmountToBaseUnits(
      TOKEN_CONFIGS.GHST.minWithdrawalAmount,
      TOKEN_CONFIGS.GHST.decimals
    ),
  } as Record<WithdrawalCurrency, bigint>;
}

const MIN_WITHDRAWAL_BASE_UNITS = buildMinBaseUnitMap();

export function listWithdrawalCurrencies(): WithdrawalCurrency[] {
  return ['USDC', 'GHST'];
}

export function resolveWithdrawalCurrency(
  currency: string | null | undefined
): WithdrawalCurrency {
  if (!currency) {
    return 'USDC';
  }
  const upper = currency.toUpperCase();
  return upper === 'GHST' ? 'GHST' : 'USDC';
}

export function getWithdrawalTokenConfig(
  currency: string | null | undefined
): WithdrawalTokenConfig {
  return TOKEN_CONFIGS[resolveWithdrawalCurrency(currency)];
}

export function getMinWithdrawalAmountMap(): Record<
  WithdrawalCurrency,
  number
> {
  return {
    USDC: TOKEN_CONFIGS.USDC.minWithdrawalAmount,
    GHST: TOKEN_CONFIGS.GHST.minWithdrawalAmount,
  };
}

export function getMinWithdrawalBaseUnits(
  currency: string | null | undefined
): bigint {
  return MIN_WITHDRAWAL_BASE_UNITS[resolveWithdrawalCurrency(currency)];
}

export function parseAmountToBaseUnits(
  amount: number,
  decimals: number
): bigint {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0n;
  }
  const precision = Math.max(0, Math.min(decimals, 18));
  const fixed = amount.toFixed(precision);
  return ethers.parseUnits(fixed, decimals);
}

export function formatBaseUnits(
  amountBaseUnits: bigint,
  decimals: number
): string {
  const formatted = ethers.formatUnits(amountBaseUnits, decimals);
  const trimmed = formatted.replace(/\.?0+$/, '');
  return trimmed.length > 0 ? trimmed : '0';
}
