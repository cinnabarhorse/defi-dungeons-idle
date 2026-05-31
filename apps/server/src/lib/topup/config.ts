export const BASE_CHAIN_ID = 8453;

export const GAMEPOINTS_CONTRACT_ADDRESS =
  '0xb27fa55e15be89e69b9e5babcfb30a8f67ad92a0';

export const DEADLINE_WINDOW_SECONDS = 20 * 60;

export type TopupTokenSymbol = 'USDC' | 'GHO' | 'GHST';

export interface TokenConfig {
  symbol: TopupTokenSymbol;
  address: string;
  decimals: number;
}

const TOKENS: TokenConfig[] = [
  {
    symbol: 'USDC',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  {
    symbol: 'GHO',
    address: '0x6bb7a212910682dcfdbd5bcbb3e28fb4e8da10ee',
    decimals: 18,
  },
  {
    symbol: 'GHST',
    address: '0xcd2f22236dd9dfe2356d7c543161d4d260fd9bcb',
    decimals: 18,
  },
];

export const SUPPORTED_TOKENS: Record<TopupTokenSymbol, TokenConfig> =
  TOKENS.reduce((acc, token) => {
    acc[token.symbol] = token;
    return acc;
  }, {} as Record<TopupTokenSymbol, TokenConfig>);

export const SUPPORTED_TOKEN_ADDRESSES = TOKENS.reduce(
  (acc, token) => {
    acc[token.address.toLowerCase()] = token;
    return acc;
  },
  {} as Record<string, TokenConfig>
);

export const MAX_SLIPPAGE_BPS = 50;

export function getTokenBySymbol(
  symbol: string | null | undefined
): TokenConfig | null {
  if (!symbol) return null;
  const upper = symbol.toUpperCase() as TopupTokenSymbol;
  return SUPPORTED_TOKENS[upper] ?? null;
}

export function getTokenByAddress(
  address: string | null | undefined
): TokenConfig | null {
  if (!address) return null;
  return SUPPORTED_TOKEN_ADDRESSES[address.toLowerCase()] ?? null;
}

export function listSupportedTokens(): TokenConfig[] {
  return TOKENS.slice();
}
