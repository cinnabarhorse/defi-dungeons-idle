import type {
  DepositApiRecord,
  TokenSymbol,
  TopupRecord,
  TopupStatus,
} from '../../types/topup';

function normalizeTokenSymbol(value: string): TokenSymbol {
  const upper = value?.toUpperCase();
  if (upper === 'GHO') return 'GHO';
  if (upper === 'GHST') return 'GHST';
  return 'USDC';
}

function safeParseNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapDepositToTopupRecord(
  deposit: DepositApiRecord
): TopupRecord {
  const token = normalizeTokenSymbol(deposit.tokenSymbol);
  const amount = safeParseNumber(deposit.amount);

  return {
    id: deposit.id,
    token,
    amount,
    amountWei: deposit.amountWei,
    createdAt: deposit.createdAt,
    unlockAt: deposit.unlockAt,
    autoRenew: Boolean(deposit.autoRenew),
    status: (deposit.txStatus as TopupStatus) ?? 'pending',
    txHash: deposit.txHash,
    chainId: deposit.chainId ?? undefined,
    depositId: deposit.depositId ?? undefined,
    pointsMinted: safeParseNumber(deposit.pointsMinted),
    yieldAmount: safeParseNumber(deposit.yieldAmount),
    withdrawn: deposit.withdrawn,
    withdrawalTx: deposit.withdrawalTx ?? undefined,
  };
}
