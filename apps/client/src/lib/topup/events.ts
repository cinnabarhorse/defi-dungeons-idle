import type { TokenSymbol } from '../../types/topup';

export const TOPUP_DEPOSIT_CREDITED_EVENT = 'topup:deposit-credited';
const MAX_TRACKED_TX_HASHES = 2000;
const dispatchedCreditedTxHashes = new Set<string>();

export interface TopupDepositCreditedEventDetail {
  txHash: string;
  token: TokenSymbol;
}

function normalizeTxHash(txHash: string): string {
  return txHash.trim().toLowerCase();
}

function rememberDispatch(txHash: string): void {
  dispatchedCreditedTxHashes.add(txHash);
  if (dispatchedCreditedTxHashes.size <= MAX_TRACKED_TX_HASHES) {
    return;
  }
  const oldest = dispatchedCreditedTxHashes.values().next().value;
  if (typeof oldest === 'string') {
    dispatchedCreditedTxHashes.delete(oldest);
  }
}

export function dispatchTopupDepositCredited(
  detail: TopupDepositCreditedEventDetail
) {
  if (typeof window === 'undefined') return;
  const txHash = normalizeTxHash(detail.txHash);
  if (!txHash) return;
  if (dispatchedCreditedTxHashes.has(txHash)) return;

  rememberDispatch(txHash);
  window.dispatchEvent(
    new CustomEvent<TopupDepositCreditedEventDetail>(
      TOPUP_DEPOSIT_CREDITED_EVENT,
      { detail: { ...detail, txHash } }
    )
  );
}
