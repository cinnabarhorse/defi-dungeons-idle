export interface DecodedDeposit {
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  user: string;
  depositId: string;
  depositToken: string;
  depositAmountRaw: string;
  depositAmount: number;
  yieldAmountRaw: string;
  pointsMintedRaw: string;
  pointsMinted: number;
  unlockAt?: string;
  supabaseStatus?:
    | 'pending'
    | 'confirmed'
    | 'credited'
    | 'failed'
    | 'not_found';
  supabaseTxStatus?: string | null;
}
