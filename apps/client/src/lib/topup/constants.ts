import type { TokenSymbol } from '../../types/topup';

export const BASE_CHAIN_ID = 8453;
export const DEFAULT_CHAIN = 'base' as const;

export const GAMEPOINTS_CONTRACT_ADDRESS =
  '0xb27fa55e15be89e69b9e5babcfb30a8f67ad92a0';

export const DEADLINE_WINDOW_SECONDS = 20 * 60;

export interface TokenMetadata {
  symbol: TokenSymbol;
  address: `0x${string}`;
  decimals: number;
}

const TOKEN_METADATA_MAP: Record<TokenSymbol, TokenMetadata> = {
  USDC: {
    symbol: 'USDC',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  GHO: {
    symbol: 'GHO',
    address: '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee',
    decimals: 18,
  },
  GHST: {
    symbol: 'GHST',
    address: '0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb',
    decimals: 18,
  },
};

export const TOKEN_METADATA = TOKEN_METADATA_MAP;
export const TOKEN_DECIMALS: Record<TokenSymbol, number> = {
  USDC: TOKEN_METADATA_MAP.USDC.decimals,
  GHO: TOKEN_METADATA_MAP.GHO.decimals,
  GHST: TOKEN_METADATA_MAP.GHST.decimals,
};

export const TOKENS = Object.values(TOKEN_METADATA_MAP);

export const TOKEN_BY_ADDRESS = TOKENS.reduce(
  (acc, token) => {
    acc[token.address.toLowerCase()] = token;
    return acc;
  },
  {} as Record<string, TokenMetadata>
);

export function getTokenMetadata(symbol: TokenSymbol): TokenMetadata {
  return TOKEN_METADATA_MAP[symbol];
}

export function getTokenByAddress(address: string): TokenMetadata | null {
  return TOKEN_BY_ADDRESS[address.toLowerCase()] ?? null;
}

export const AMOUNT_MIN = 1;
export const AMOUNT_MAX = 1000;
