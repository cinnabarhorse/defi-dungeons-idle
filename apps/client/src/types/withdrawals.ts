export type TokenWithdrawalStatus =
  | 'received'
  | 'withdrawal_waiting'
  | 'withdrawal_approved'
  | 'withdrawal_sending'
  | 'withdrawal_pending'
  | 'withdrawal_confirmed'
  | 'withdrawal_failed'
  | 'withdrawal_rejected';

export interface TokenWithdrawal {
  id: string;
  playerId?: string;
  currency: string;
  amount: string;
  amountBaseUnits: string;
  source: string;
  gameId: string | null;
  lootDistributionId: string | null;
  economyTransactionId: string | null;
  status: TokenWithdrawalStatus;
  txHash: string | null;
  chainId: number | null;
  tokenContractAddress: string | null;
  receivedAt: string | null;
  withdrawalRequestedAt: string | null;
  withdrawalApprovedAt: string | null;
  withdrawalSendingAt: string | null;
  withdrawalPendingAt: string | null;
  withdrawalConfirmedAt: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
  playerWalletAddress?: string | null;
  characterId?: string | null;
  characterName?: string | null;
}

export interface WithdrawalAutomationSettings {
  isAutoProcessingEnabled: boolean;
  isBatchProcessingPaused: boolean;
  isConfirmationPaused: boolean;
}

export interface WithdrawalSettingsResponse {
  featureEnabled: boolean;
  settings: WithdrawalAutomationSettings;
  runtime?: {
    isBatchProcessorRunning?: boolean;
  };
}
