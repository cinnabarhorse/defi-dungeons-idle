import { MAX_SLIPPAGE_BPS, getTokenBySymbol } from './config';
import { applySlippageBps, parseAmountWei } from './utils';

export interface QuoteRequestInput {
  tokenSymbol: string;
  amountWei: string | number | bigint;
  slippageBps?: number;
}

export interface QuoteResponse {
  tokenSymbol: string;
  tokenAddress: string;
  decimals: number;
  amountWei: string;
  minAmountOut: string;
  appliedSlippageBps: number;
}

export function deriveQuote(input: QuoteRequestInput): QuoteResponse {
  const token = getTokenBySymbol(input.tokenSymbol);
  if (!token) {
    throw new Error('Unsupported token');
  }

  const amountWei = parseAmountWei(input.amountWei);
  if (amountWei <= 0n) {
    throw new Error('Amount must be positive');
  }

  const slippageBps =
    input.slippageBps === undefined ? MAX_SLIPPAGE_BPS : input.slippageBps;

  const minAmountOut = applySlippageBps(amountWei, slippageBps);

  return {
    tokenSymbol: token.symbol,
    tokenAddress: token.address,
    decimals: token.decimals,
    amountWei: amountWei.toString(),
    minAmountOut: minAmountOut.toString(),
    appliedSlippageBps: slippageBps,
  };
}
