import { ethers } from 'ethers';
import { BASE_CHAIN_ID } from '../topup/config';
import { DEFAULT_USDC_ADDRESS } from './token-config';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) external returns (bool)',
] as const;

export interface CreateWithdrawalTransactionInput {
  to: string;
  amount: bigint;
  tokenAddress?: string;
  chainId?: number;
}

export interface CreateWithdrawalTransactionResult {
  txHash: string | null;
  transactionId: string | null;
  senderField: ThirdwebSenderField | null;
  chainId: number;
  tokenAddress: string;
}

export interface ResolveThirdwebTransactionResult {
  state: 'pending' | 'confirmed' | 'failed';
  txHash: string | null;
  status: string | null;
  errorMessage: string | null;
}

type ThirdwebSenderField = 'from' | 'fromAddress';

const STATUS_POLL_INTERVAL_MS = 1_000;
const STATUS_POLL_TIMEOUT_MS = 15_000;

function readPositiveNumberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function getThirdwebBaseUrl(): string {
  return (
    process.env.THIRDWEB_TRANSACTIONS_URL?.replace(/\/$/, '') ||
    'https://api.thirdweb.com/v1/transactions'
  );
}

function getThirdwebSecretKey(): string {
  return String(process.env.THIRDWEB_SECRET_KEY || '');
}

function getTransactionIds(payload: unknown): string[] {
  const result = readKey(payload, 'result');
  const resultIds = readKey(result, 'transactionIds');
  const rootIds = readKey(payload, 'transactionIds');
  const idsSource = Array.isArray(resultIds)
    ? resultIds
    : Array.isArray(rootIds)
      ? rootIds
      : [];

  return idsSource.filter((v): v is string => typeof v === 'string');
}

function normalizeStatus(status: string | null): string | null {
  if (!status) return null;
  const trimmed = status.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function isTerminalFailureStatus(status: string | null): boolean {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  return (
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized.includes('revert') ||
    normalized.includes('cancel') ||
    normalized.includes('dropped')
  );
}

function extractStatus(payload: unknown): string | null {
  const result = readKey(payload, 'result');
  const candidates = [
    readKey(result, 'status'),
    readKey(payload, 'status'),
    readKey(result, 'executionStatus'),
    readKey(payload, 'executionStatus'),
    readKey(result, 'state'),
    readKey(payload, 'state'),
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractErrorMessage(payload: unknown): string | null {
  const result = readKey(payload, 'result');
  const candidates = [
    readKey(result, 'errorMessage'),
    readKey(payload, 'errorMessage'),
    readKey(result, 'error'),
    readKey(payload, 'error'),
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (value && typeof value === 'object') {
      const message = readKey(value, 'message');
      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trim();
      }
      const reason = readKey(value, 'reason');
      if (typeof reason === 'string' && reason.trim().length > 0) {
        return reason.trim();
      }
      const code = readKey(value, 'code');
      const details = readKey(value, 'details');
      if (
        (typeof code === 'string' && code.trim().length > 0) ||
        (typeof details === 'string' && details.trim().length > 0)
      ) {
        return stringifyCompact(value, 220);
      }
    }
  }

  return null;
}

function stringifyCompact(value: unknown, maxLength = 280): string {
  let text = '';
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readKey(obj: unknown, key: string): unknown {
  if (
    obj &&
    typeof obj === 'object' &&
    key in (obj as Record<string, unknown>)
  ) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function extractTxHash(payload: unknown): string | null {
  const direct = readKey(payload, 'transactionHash');
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }
  const result = readKey(payload, 'result');
  const resultTx = readKey(result, 'transactionHash');
  if (typeof resultTx === 'string' && resultTx.length > 0) {
    return resultTx;
  }
  const resultReceipts = readKey(result, 'receipts');
  if (Array.isArray(resultReceipts) && resultReceipts.length > 0) {
    const firstReceiptTx = readKey(resultReceipts[0], 'transactionHash');
    if (typeof firstReceiptTx === 'string' && firstReceiptTx.length > 0) {
      return firstReceiptTx;
    }
  }
  const receipts = readKey(payload, 'receipts');
  if (Array.isArray(receipts) && receipts.length > 0) {
    const firstReceiptTx = readKey(receipts[0], 'transactionHash');
    if (typeof firstReceiptTx === 'string' && firstReceiptTx.length > 0) {
      return firstReceiptTx;
    }
  }
  return null;
}

function hasTransactionsApiConfig(): boolean {
  return Boolean(
    process.env.THIRDWEB_SECRET_KEY && process.env.THIRDWEB_SERVER_WALLET
  );
}

function buildThirdwebCreateBody(input: {
  chainId: number;
  fromWallet: string;
  tokenAddress: string;
  data: string;
  senderField: ThirdwebSenderField;
}) {
  const sender: Record<string, string> = {
    [input.senderField]: input.fromWallet,
  };
  return {
    chainId: input.chainId,
    ...sender,
    transactions: [
      {
        to: input.tokenAddress,
        data: input.data,
        value: '0',
      },
    ],
  };
}

export async function resolveThirdwebTransactionById(
  transactionId: string
): Promise<ResolveThirdwebTransactionResult> {
  const id = transactionId.trim();
  if (!id) {
    throw new Error('Thirdweb transactionId is required');
  }
  if (!process.env.THIRDWEB_SECRET_KEY) {
    throw new Error(
      'Thirdweb Transactions API is not configured (set THIRDWEB_SECRET_KEY)'
    );
  }

  const response = await fetch(`${getThirdwebBaseUrl()}/${id}`, {
    method: 'GET',
    headers: { 'x-secret-key': getThirdwebSecretKey() },
  });

  const text = await response
    .text()
    .catch(() => (response.ok ? '{}' : 'Thirdweb status request failed'));

  if (!response.ok) {
    const status = `http_${response.status}`;
    if (response.status === 401 || response.status === 403) {
      return {
        state: 'failed',
        txHash: null,
        status,
        errorMessage: `Thirdweb status auth failed: ${stringifyCompact(text, 180)}`,
      };
    }
    return {
      state: 'pending',
      txHash: null,
      status,
      errorMessage: null,
    };
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }

  const txHash = extractTxHash(payload);
  const status = extractStatus(payload);
  const errorMessage = extractErrorMessage(payload);

  if (txHash) {
    return {
      state: 'confirmed',
      txHash,
      status,
      errorMessage,
    };
  }

  if (isTerminalFailureStatus(status) || (!status && Boolean(errorMessage))) {
    return {
      state: 'failed',
      txHash: null,
      status,
      errorMessage:
        errorMessage ||
        `Thirdweb transaction ${id} failed with status ${
          status || 'unknown'
        }`,
    };
  }

  return {
    state: 'pending',
    txHash: null,
    status,
    errorMessage: null,
  };
}

async function waitForThirdwebTransaction(
  transactionId: string
): Promise<ResolveThirdwebTransactionResult> {
  const timeoutMs = readPositiveNumberEnv(
    process.env.THIRDWEB_STATUS_POLL_TIMEOUT_MS,
    STATUS_POLL_TIMEOUT_MS
  );
  const intervalMs = readPositiveNumberEnv(
    process.env.THIRDWEB_STATUS_POLL_INTERVAL_MS,
    STATUS_POLL_INTERVAL_MS
  );

  const startedAt = Date.now();
  let lastStatus: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const resolved = await resolveThirdwebTransactionById(transactionId);
    if (resolved.state !== 'pending') {
      return resolved;
    }
    lastStatus = resolved.status ?? lastStatus;
    await sleep(intervalMs);
  }

  return {
    state: 'pending',
    txHash: null,
    status: lastStatus ?? 'queued',
    errorMessage: null,
  };
}

async function createViaThirdwebTransactionsApi(
  input: CreateWithdrawalTransactionInput
): Promise<CreateWithdrawalTransactionResult> {
  const secretKey = getThirdwebSecretKey();
  const fromWallet = String(process.env.THIRDWEB_SERVER_WALLET);
  const chainId = input.chainId ?? BASE_CHAIN_ID;
  const tokenAddress = input.tokenAddress ?? DEFAULT_USDC_ADDRESS;

  // Encode ERC20 transfer(to, amount) calldata
  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData('transfer', [input.to, input.amount]);

  const baseUrl = getThirdwebBaseUrl();

  const sendCreateRequest = async (senderField: ThirdwebSenderField) =>
    fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-secret-key': secretKey,
      },
      body: JSON.stringify(
        buildThirdwebCreateBody({
          chainId,
          fromWallet,
          tokenAddress,
          data,
          senderField,
        })
      ),
    });

  const attemptWithSenderField = async (senderField: ThirdwebSenderField) => {
    const res = await sendCreateRequest(senderField);
    if (!res.ok) {
      const text = await res.text().catch(() => 'Thirdweb API request failed');
      return {
        txHash: null as string | null,
        transactionId: null as string | null,
        senderField,
        error: `request_failed (${senderField}): ${text}`,
      };
    }

    const payload: unknown = await res.json().catch(() => null);
    const txHash: string | null = extractTxHash(payload);
    if (txHash) {
      return {
        txHash,
        transactionId: null as string | null,
        senderField,
        error: null as string | null,
      };
    }

    const firstId = getTransactionIds(payload)[0] ?? null;
    if (firstId) {
      const resolved = await waitForThirdwebTransaction(firstId);
      if (resolved.state === 'confirmed' && resolved.txHash) {
        return {
          txHash: resolved.txHash,
          transactionId: firstId,
          senderField,
          error: null as string | null,
        };
      }

      if (resolved.state === 'failed') {
        return {
          txHash: null as string | null,
          transactionId: firstId,
          senderField,
          error: `transaction_failed (${senderField}) [${firstId}]: ${
            resolved.errorMessage || resolved.status || 'unknown'
          }`,
        };
      }

      return {
        txHash: null as string | null,
        transactionId: firstId,
        senderField,
        error: null as string | null,
      };
    }

    return {
      txHash: null as string | null,
      transactionId: null as string | null,
      senderField,
      error: `missing_tx_hash (${senderField}): ${stringifyCompact(payload)}`,
    };
  };

  // Prefer the previously working legacy field first; retry with the new field.
  const senderFieldOrder: ThirdwebSenderField[] = ['fromAddress', 'from'];
  const errors: string[] = [];
  for (const senderField of senderFieldOrder) {
    const attempt = await attemptWithSenderField(senderField);
    if (attempt.txHash) {
      return {
        txHash: attempt.txHash,
        transactionId: attempt.transactionId,
        senderField: attempt.senderField,
        chainId,
        tokenAddress,
      };
    }
    if (attempt.transactionId && !attempt.error) {
      return {
        txHash: null,
        transactionId: attempt.transactionId,
        senderField: attempt.senderField,
        chainId,
        tokenAddress,
      };
    }
    if (attempt.error) {
      errors.push(attempt.error);
    }
  }

  throw new Error(
    `Thirdweb API did not return a transactionHash. Attempts: ${errors.join(' | ')}`
  );
}

export async function createWithdrawalTransaction(
  input: CreateWithdrawalTransactionInput
): Promise<CreateWithdrawalTransactionResult> {
  if (input.amount <= 0n) {
    throw new Error('Withdrawal amount must be greater than zero');
  }
  if (!ethers.isAddress(input.to)) {
    throw new Error('Invalid recipient wallet address');
  }

  if (!hasTransactionsApiConfig()) {
    throw new Error(
      'Thirdweb Transactions API is not configured (set THIRDWEB_SECRET_KEY and THIRDWEB_SERVER_WALLET)'
    );
  }

  return await createViaThirdwebTransactionsApi(input);
}

export { DEFAULT_USDC_ADDRESS as USDC_CONTRACT_ADDRESS };
