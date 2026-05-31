import { getAppServerBaseUrl } from '../server-url';
import type {
  DepositApiRecord,
  TokenSymbol,
  TopupConfig,
} from '../../types/topup';

interface QuoteResponse {
  quote: {
    tokenSymbol: string;
    tokenAddress: string;
    decimals: number;
    amountWei: string;
    minAmountOut: string;
    appliedSlippageBps: number;
  };
}

interface DepositsResponse {
  deposits: DepositApiRecord[];
}

export async function fetchTopupConfig(): Promise<TopupConfig> {
  const baseUrl = getAppServerBaseUrl();
  const response = await fetch(`${baseUrl}/api/topup/config`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to load top-up configuration');
  }

  const data = (await response.json().catch(() => ({}))) as TopupConfig;
  if (!data || typeof data.chainId !== 'number') {
    throw new Error('Invalid top-up configuration');
  }
  return data;
}

export async function fetchTopupQuote(params: {
  token: TokenSymbol;
  amountWei: string;
}): Promise<QuoteResponse['quote']> {
  const baseUrl = getAppServerBaseUrl();
  const response = await fetch(`${baseUrl}/api/topup/quote`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenSymbol: params.token,
      amountWei: params.amountWei,
    }),
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: 'Failed to derive quote' }));
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Failed to derive quote'
    );
  }

  const data = (await response.json().catch(() => ({}))) as QuoteResponse;
  if (!data?.quote) {
    throw new Error('Invalid quote response');
  }
  return data.quote;
}

export interface CreatePendingDepositRequest {
  token: TokenSymbol;
  amountDecimal: string;
  amountWei: string;
  txHash: string;
  autoRenew: boolean;
  minAmountOut: string;
  expiresAt?: string;
}

export async function createPendingDeposit(
  input: CreatePendingDepositRequest
): Promise<DepositApiRecord> {
  const baseUrl = getAppServerBaseUrl();
  const response = await fetch(`${baseUrl}/api/topup/deposits`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenSymbol: input.token,
      amount: input.amountDecimal,
      amountWei: input.amountWei,
      txHash: input.txHash,
      autoRenew: input.autoRenew,
      minAmountOut: input.minAmountOut,
      expiresAt: input.expiresAt,
    }),
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ error: 'Failed to create deposit' }));
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Failed to create deposit'
    );
  }

  const data = (await response.json().catch(() => ({}))) as {
    deposit: DepositApiRecord;
  };
  if (!data?.deposit) {
    throw new Error('Invalid deposit response');
  }
  return data.deposit;
}

export async function fetchDeposits(
  signal?: AbortSignal
): Promise<DepositApiRecord[]> {
  const baseUrl = getAppServerBaseUrl();
  const response = await fetch(`${baseUrl}/api/topup/deposits`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to load deposits');
  }

  const data = (await response.json().catch(() => ({}))) as DepositsResponse;
  return Array.isArray(data.deposits) ? data.deposits : [];
}

