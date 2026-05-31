export type TokenSymbol = 'USDC' | 'GHO' | 'GHST';

export type TopupStatus = 'pending' | 'confirmed' | 'credited' | 'failed';

export interface CreateTopupParams {
  token: TokenSymbol;
  amount: number;
  autoRenew: boolean;
}

export interface TopupRecord {
  id: string;
  token: TokenSymbol;
  amount: number;
  amountWei?: string | null;
  createdAt: string | null;
  unlockAt: string | null;
  autoRenew: boolean;
  status: TopupStatus;
  txHash?: string | null;
  chainId?: number | null;
  depositId?: string | null;
  pointsMinted?: number | null;
  yieldAmount?: number | null;
  withdrawn?: boolean;
  withdrawalTx?: string | null;
}

export interface DepositApiRecord {
  id: string;
  userId: string | null;
  chainId: number | null;
  contractAddress: string;
  depositorAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  amountWei: string;
  txHash: string | null;
  txStatus: TopupStatus;
  depositId: string | null;
  yieldAmount: string | null;
  pointsMinted: string | null;
  unlockAt: string | null;
  autoRenew: boolean;
  withdrawn?: boolean;
  withdrawalTx?: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TopupConfig {
  chainId: number;
  contractAddress: string;
  maxSlippageBps: number;
  deadlineWindowSeconds: number;
  tokens: Array<{
    symbol: TokenSymbol;
    address: string;
    decimals: number;
  }>;
}
