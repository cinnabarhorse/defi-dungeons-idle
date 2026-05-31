import { ethers } from 'ethers';
import {
  playersRepo,
  tokenWithdrawalsRepo,
  withdrawalSettingsRepo,
  runTransaction,
  type TokenWithdrawalRecord,
} from '../db';
import { getBaseLogger, emitServerLog } from '../logging';
import {
  createWithdrawalTransaction,
  resolveThirdwebTransactionById,
} from './tx-creator';
import { getWithdrawalTokenConfig } from './token-config';
import { BASE_CHAIN_ID } from '../topup/config';
import { notifyWithdrawalFailure } from './discord';
import {
  MAX_WITHDRAWALS_PER_RUN,
  WITHDRAWAL_SENDING_TIMEOUT_MS,
  WITHDRAWAL_PROCESS_INTERVAL_MS,
} from './config';

const logger = getBaseLogger().child({ module: 'withdrawal_batch_processor' });

interface ProcessStats {
  attempted: number;
  processed: number;
  failures: number;
  reason?: string;
}

interface ProcessResultSuccess {
  state: 'success';
  withdrawalId: string;
  txHash: string;
  chainId: number;
}

interface ProcessResultQueued {
  state: 'queued';
  withdrawalId: string;
  transactionId: string;
}

interface ProcessResultFailure {
  state: 'failure';
  withdrawalId: string;
  reason: string;
}

interface ProcessResultEmpty {
  state: 'empty';
}

type ProcessResult =
  | ProcessResultSuccess
  | ProcessResultQueued
  | ProcessResultFailure
  | ProcessResultEmpty;

const THIRDWEB_TX_ID_KEY = 'thirdwebTransactionId';
const THIRDWEB_TX_STATUS_KEY = 'thirdwebTransactionStatus';
const THIRDWEB_TX_UPDATED_AT_KEY = 'thirdwebTransactionUpdatedAt';
const THIRDWEB_TX_ERROR_KEY = 'thirdwebTransactionError';
const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');
const DEFAULT_BASE_RPC_URL =
  process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const DEFAULT_ONCHAIN_LOOKBACK_MS = 30 * 60 * 1000; // 30m
const ONCHAIN_TIMESTAMP_SKEW_MS = 2 * 60 * 1000; // 2m
const APPROX_BASE_BLOCK_MS = 2_000;
const MAX_LOG_BLOCK_LOOKBACK = 120_000;

const providerCache = new Map<number, ethers.JsonRpcProvider>();
const blockTimestampCache = new Map<number, number>();

let processorTimer: ReturnType<typeof setInterval> | null = null;
let processorRunning = false;

export function isWithdrawalBatchProcessorRunning(): boolean {
  return Boolean(processorTimer);
}

async function claimNextWithdrawal(): Promise<TokenWithdrawalRecord | null> {
  return runTransaction(async (client) => {
    return tokenWithdrawalsRepo.claimNextApprovedWithdrawal(client);
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

function classifyBroadcastFailure(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();
  if (
    normalized.includes('insufficient') &&
    normalized.includes('balance')
  ) {
    return 'insufficient_server_token_balance';
  }
  if (
    normalized.includes('insufficient funds') ||
    normalized.includes('gas required exceeds allowance') ||
    normalized.includes('intrinsic gas too low')
  ) {
    return 'insufficient_gas_balance';
  }
  if (normalized.includes('unsupported chain')) {
    return 'unsupported_chain';
  }
  return 'tx_broadcast_error';
}

function withBroadcastFailureDetail(
  failureReason: string,
  errorMessage: string
): string {
  if (failureReason !== 'tx_broadcast_error') {
    return failureReason;
  }
  const compact = errorMessage.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return failureReason;
  }
  const max = 180;
  const short =
    compact.length > max ? `${compact.slice(0, max - 3)}...` : compact;
  return `tx_broadcast_error:${short}`;
}

function getMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return metadata && typeof metadata === 'object' ? { ...metadata } : {};
}

function getQueuedThirdwebTransactionId(
  withdrawal: TokenWithdrawalRecord
): string | null {
  const value = withdrawal.metadata?.[THIRDWEB_TX_ID_KEY];
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function withQueuedThirdwebMetadata(
  metadata: Record<string, unknown> | null | undefined,
  input: {
    transactionId: string;
    status: string;
    errorMessage?: string | null;
  }
): Record<string, unknown> {
  const next = getMetadata(metadata);
  next[THIRDWEB_TX_ID_KEY] = input.transactionId;
  next[THIRDWEB_TX_STATUS_KEY] = input.status;
  const existingUpdatedAt = next[THIRDWEB_TX_UPDATED_AT_KEY];
  if (
    typeof existingUpdatedAt !== 'string' ||
    readDateMs(existingUpdatedAt) == null
  ) {
    // Keep the original queued timestamp stable across poll cycles.
    next[THIRDWEB_TX_UPDATED_AT_KEY] = new Date().toISOString();
  }
  if (input.errorMessage && input.errorMessage.trim().length > 0) {
    next[THIRDWEB_TX_ERROR_KEY] = input.errorMessage.trim();
  } else {
    delete next[THIRDWEB_TX_ERROR_KEY];
  }
  return next;
}

function clearQueuedThirdwebMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const next = getMetadata(metadata);
  delete next[THIRDWEB_TX_ID_KEY];
  delete next[THIRDWEB_TX_STATUS_KEY];
  delete next[THIRDWEB_TX_UPDATED_AT_KEY];
  delete next[THIRDWEB_TX_ERROR_KEY];
  return next;
}

function readDateMs(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

function getQueuedStartedAtMs(withdrawal: TokenWithdrawalRecord): number | null {
  const candidates: number[] = [];

  const sendingAt = readDateMs(withdrawal.withdrawalSendingAt);
  if (sendingAt != null) {
    candidates.push(sendingAt);
  }

  const queuedAtRaw = withdrawal.metadata?.[THIRDWEB_TX_UPDATED_AT_KEY];
  const queuedAtMs = readDateMs(queuedAtRaw);
  if (queuedAtMs != null) {
    candidates.push(queuedAtMs);
  }

  const createdAt = readDateMs(withdrawal.createdAt);
  if (createdAt != null) {
    candidates.push(createdAt);
  }

  const updatedAt = readDateMs(withdrawal.updatedAt);
  if (updatedAt != null) {
    candidates.push(updatedAt);
  }

  if (candidates.length === 0) {
    return null;
  }
  return Math.min(...candidates);
}

function toAddressTopic(address: string): string {
  return ethers.zeroPadValue(ethers.getAddress(address), 32).toLowerCase();
}

function getProviderForChain(chainId: number): ethers.JsonRpcProvider {
  const normalized = Math.trunc(chainId);
  if (normalized !== BASE_CHAIN_ID) {
    throw new Error(`Unsupported chain id for queued reconciliation: ${normalized}`);
  }
  let provider = providerCache.get(normalized);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(DEFAULT_BASE_RPC_URL);
    providerCache.set(normalized, provider);
  }
  return provider;
}

async function getBlockTimestampMs(
  provider: ethers.JsonRpcProvider,
  blockNumber: number
): Promise<number | null> {
  const cached = blockTimestampCache.get(blockNumber);
  if (cached != null) {
    return cached;
  }
  const block = await provider.getBlock(blockNumber);
  if (!block) {
    return null;
  }
  const ms = block.timestamp * 1000;
  blockTimestampCache.set(blockNumber, ms);
  return ms;
}

async function findOnchainTransferHashForQueuedWithdrawal(
  withdrawal: TokenWithdrawalRecord,
  recipientWallet: string | null
): Promise<string | null> {
  if (!recipientWallet || !ethers.isAddress(recipientWallet)) {
    return null;
  }

  const serverWallet = process.env.THIRDWEB_SERVER_WALLET;
  if (!serverWallet || !ethers.isAddress(serverWallet)) {
    return null;
  }

  const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
  const chainId = withdrawal.chainId ?? tokenConfig.defaultChainId;
  const tokenAddress = withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress;
  if (!ethers.isAddress(tokenAddress)) {
    return null;
  }

  const startedAtMs = getQueuedStartedAtMs(withdrawal);
  if (startedAtMs == null) {
    return null;
  }

  const nowMs = Date.now();
  const lookbackMs = Math.max(
    DEFAULT_ONCHAIN_LOOKBACK_MS,
    nowMs - startedAtMs + ONCHAIN_TIMESTAMP_SKEW_MS
  );
  const estimatedBlockLookback = Math.ceil(lookbackMs / APPROX_BASE_BLOCK_MS);

  const provider = getProviderForChain(chainId);
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(
    0,
    latestBlock -
      Math.min(
        MAX_LOG_BLOCK_LOOKBACK,
        estimatedBlockLookback + 200 // extra safety margin
      )
  );

  const logs = await provider.getLogs({
    address: tokenAddress,
    topics: [
      TRANSFER_EVENT_TOPIC,
      toAddressTopic(serverWallet),
      toAddressTopic(recipientWallet),
    ],
    fromBlock,
    toBlock: latestBlock,
  });

  const amountMatched = logs.filter((log) => {
    try {
      return BigInt(log.data) === withdrawal.amountBaseUnits;
    } catch {
      return false;
    }
  });

  if (amountMatched.length === 0) {
    return null;
  }

  const candidates: Array<{ hash: string; deltaMs: number }> = [];
  const lowerBoundMs = startedAtMs - ONCHAIN_TIMESTAMP_SKEW_MS;
  for (const log of amountMatched) {
    const timestampMs = await getBlockTimestampMs(provider, log.blockNumber);
    if (timestampMs == null || timestampMs < lowerBoundMs) {
      continue;
    }
    candidates.push({
      hash: log.transactionHash,
      deltaMs: Math.abs(timestampMs - startedAtMs),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.deltaMs - b.deltaMs);
  if (
    candidates.length > 1 &&
    candidates[0].deltaMs === candidates[1].deltaMs
  ) {
    return null;
  }
  return candidates[0].hash;
}

async function notifyFailure(
  withdrawal: TokenWithdrawalRecord,
  failureReason: string,
  toWallet?: string | null,
  errorMessage?: string | null
): Promise<void> {
  try {
    await notifyWithdrawalFailure({
      withdrawal,
      failureReason,
      toWallet,
      errorMessage,
    });
  } catch {
    // Notification errors should not break withdrawal state transitions.
  }
}

async function recoverStuckSending(nowMs: number): Promise<number> {
  const cutoff = new Date(
    nowMs - Math.max(60_000, WITHDRAWAL_SENDING_TIMEOUT_MS)
  ).toISOString();
  const stuck = await tokenWithdrawalsRepo.getStuckSendingWithdrawals(
    cutoff,
    MAX_WITHDRAWALS_PER_RUN
  );
  let recovered = 0;
  for (const withdrawal of stuck) {
    if (getQueuedThirdwebTransactionId(withdrawal)) {
      continue;
    }

    let recoveredTxHash: string | null = null;
    try {
      const player = await playersRepo.getPlayerById(withdrawal.playerId);
      recoveredTxHash = await findOnchainTransferHashForQueuedWithdrawal(
        withdrawal,
        player?.walletAddress ?? null
      );
    } catch (error) {
      logger.warn(
        {
          msg: 'withdrawal_direct_hash_recovery_failed',
          withdrawalId: withdrawal.id,
          error: toErrorMessage(error),
        },
        'withdrawal_direct_hash_recovery_failed'
      );
    }

    if (recoveredTxHash) {
      const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
      await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_pending',
        onlyIfCurrentStatus: 'withdrawal_sending',
        txHash: recoveredTxHash,
        chainId: withdrawal.chainId ?? tokenConfig.defaultChainId,
        tokenContractAddress:
          withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress,
        metadata: clearQueuedThirdwebMetadata(withdrawal.metadata),
      });
      recovered += 1;
      continue;
    }

    await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
      id: withdrawal.id,
      status: 'withdrawal_approved',
      onlyIfCurrentStatus: 'withdrawal_sending',
      failureReason: 'sending_timeout_retry',
    });
    recovered += 1;
  }
  if (recovered > 0) {
    logger.warn(
      {
        msg: 'withdrawal_sending_recovered',
        count: recovered,
      },
      'withdrawal_sending_recovered'
    );
  }
  return recovered;
}

async function reconcileQueuedSendingWithdrawals(
  maxToCheck: number
): Promise<void> {
  const sending = await tokenWithdrawalsRepo.getTokenWithdrawalsByStatus(
    'withdrawal_sending'
  );
  if (sending.length === 0) {
    return;
  }

  let checked = 0;
  for (const withdrawal of sending) {
    if (checked >= maxToCheck) {
      break;
    }

    const transactionId = getQueuedThirdwebTransactionId(withdrawal);
    if (!transactionId) {
      continue;
    }
    checked += 1;

    try {
      const resolved = await resolveThirdwebTransactionById(transactionId);

      if (resolved.state === 'pending') {
        let recoveredTxHash: string | null = null;
        try {
          const player = await playersRepo.getPlayerById(withdrawal.playerId);
          recoveredTxHash = await findOnchainTransferHashForQueuedWithdrawal(
            withdrawal,
            player?.walletAddress ?? null
          );
        } catch (error) {
          logger.warn(
            {
              msg: 'withdrawal_queued_hash_recovery_failed',
              withdrawalId: withdrawal.id,
              transactionId,
              error: toErrorMessage(error),
            },
            'withdrawal_queued_hash_recovery_failed'
          );
        }

        if (recoveredTxHash) {
          const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
          await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
            id: withdrawal.id,
            status: 'withdrawal_pending',
            txHash: recoveredTxHash,
            chainId: withdrawal.chainId ?? tokenConfig.defaultChainId,
            tokenContractAddress:
              withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress,
            metadata: clearQueuedThirdwebMetadata(withdrawal.metadata),
          });
          logger.info(
            {
              msg: 'withdrawal_queued_hash_recovered',
              withdrawalId: withdrawal.id,
              transactionId,
              txHash: recoveredTxHash,
            },
            'withdrawal_queued_hash_recovered'
          );
          continue;
        }

        await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
          id: withdrawal.id,
          status: 'withdrawal_sending',
          chainId: withdrawal.chainId,
          tokenContractAddress: withdrawal.tokenContractAddress,
          metadata: withQueuedThirdwebMetadata(withdrawal.metadata, {
            transactionId,
            status: resolved.status || 'pending',
            errorMessage: null,
          }),
        });
        continue;
      }

      if (resolved.state === 'confirmed' && resolved.txHash) {
        const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
        await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
          id: withdrawal.id,
          status: 'withdrawal_pending',
          txHash: resolved.txHash,
          chainId: withdrawal.chainId ?? tokenConfig.defaultChainId,
          tokenContractAddress:
            withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress,
          metadata: clearQueuedThirdwebMetadata(withdrawal.metadata),
        });
        continue;
      }

      const errorMessage =
        resolved.errorMessage ||
        `Thirdweb queued transaction ${transactionId} failed`;
      const failureReason = withBroadcastFailureDetail(
        'tx_broadcast_error',
        errorMessage
      );
      const failedRow = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_failed',
        failureReason,
        metadata: withQueuedThirdwebMetadata(withdrawal.metadata, {
          transactionId,
          status: resolved.status || 'failed',
          errorMessage,
        }),
      });
      await notifyFailure(
        failedRow ?? withdrawal,
        failureReason,
        null,
        errorMessage
      );
    } catch (error) {
      logger.warn(
        {
          msg: 'withdrawal_thirdweb_reconcile_failed',
          withdrawalId: withdrawal.id,
          transactionId,
          error: toErrorMessage(error),
        },
        'withdrawal_thirdweb_reconcile_failed'
      );
    }
  }
}

async function processSingleWithdrawal(): Promise<ProcessResult> {
  const withdrawal = await claimNextWithdrawal();
  if (!withdrawal) {
    return { state: 'empty' } as ProcessResultEmpty;
  }

  if (withdrawal.amountBaseUnits <= 0n) {
    await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
      id: withdrawal.id,
      status: 'withdrawal_failed',
      failureReason: 'invalid_amount',
    });
    await notifyFailure(
      withdrawal,
      'invalid_amount',
      null,
      'amount_base_units must be greater than zero'
    );
    return {
      state: 'failure',
      withdrawalId: withdrawal.id,
      reason: 'invalid_amount',
    } as ProcessResultFailure;
  }

  const player = await playersRepo.getPlayerById(withdrawal.playerId);
  const walletAddress = player?.walletAddress ?? null;
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
      id: withdrawal.id,
      status: 'withdrawal_failed',
      failureReason: 'missing_player_wallet',
    });
    await notifyFailure(
      withdrawal,
      'missing_player_wallet',
      walletAddress,
      'Player wallet address is missing or invalid'
    );
    return {
      state: 'failure',
      withdrawalId: withdrawal.id,
      reason: 'missing_player_wallet',
    } as ProcessResultFailure;
  }

  const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
  const resolvedChainId = withdrawal.chainId ?? tokenConfig.defaultChainId;
  const resolvedTokenAddress =
    withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress;

  try {
    const tx = await createWithdrawalTransaction({
      to: walletAddress,
      amount: withdrawal.amountBaseUnits,
      tokenAddress: resolvedTokenAddress,
      chainId: resolvedChainId,
    });

    if (tx.txHash) {
      await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_pending',
        txHash: tx.txHash,
        chainId: tx.chainId ?? resolvedChainId,
        tokenContractAddress: tx.tokenAddress ?? resolvedTokenAddress,
        metadata: clearQueuedThirdwebMetadata(withdrawal.metadata),
      });

      return {
        state: 'success',
        withdrawalId: withdrawal.id,
        txHash: tx.txHash,
        chainId: tx.chainId ?? resolvedChainId,
      } as ProcessResultSuccess;
    }

    if (tx.transactionId) {
      await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_sending',
        chainId: tx.chainId ?? resolvedChainId,
        tokenContractAddress: tx.tokenAddress ?? resolvedTokenAddress,
        metadata: withQueuedThirdwebMetadata(withdrawal.metadata, {
          transactionId: tx.transactionId,
          status: 'queued',
          errorMessage: null,
        }),
      });

      logger.info(
        {
          msg: 'withdrawal_queued_for_broadcast',
          withdrawalId: withdrawal.id,
          transactionId: tx.transactionId,
          senderField: tx.senderField,
        },
        'withdrawal_queued_for_broadcast'
      );

      return {
        state: 'queued',
        withdrawalId: withdrawal.id,
        transactionId: tx.transactionId,
      } as ProcessResultQueued;
    }

    throw new Error('Thirdweb API did not return txHash or transactionId');
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const failureReason = classifyBroadcastFailure(errorMessage);
    const failureReasonWithDetail = withBroadcastFailureDetail(
      failureReason,
      errorMessage
    );
    logger.error(
      {
        msg: 'withdrawal_tx_broadcast_failed',
        withdrawalId: withdrawal.id,
        reason: failureReasonWithDetail,
        reasonCode: failureReason,
        error: errorMessage,
      },
      'withdrawal_tx_broadcast_failed'
    );
    await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
      id: withdrawal.id,
      status: 'withdrawal_failed',
      failureReason: failureReasonWithDetail,
    });
    emitServerLog('withdrawal.tx_failed', {
      message: `Withdrawal ${withdrawal.id} failed: ${failureReasonWithDetail}`,
      details: {
        withdrawalId: withdrawal.id,
        reason: failureReasonWithDetail,
        reasonCode: failureReason,
        error: errorMessage,
      },
    });
    await notifyFailure(
      withdrawal,
      failureReasonWithDetail,
      walletAddress,
      errorMessage
    );
    return {
      state: 'failure',
      withdrawalId: withdrawal.id,
      reason: failureReasonWithDetail,
    } as ProcessResultFailure;
  }
}

export async function processApprovedWithdrawals(
  maxPerRun = MAX_WITHDRAWALS_PER_RUN
): Promise<ProcessStats> {
  if (processorRunning) {
    return {
      attempted: 0,
      processed: 0,
      failures: 0,
      reason: 'already_running',
    };
  }

  processorRunning = true;
  try {
    const settings = await withdrawalSettingsRepo
      .getSettings()
      .catch((error) => {
        logger.error(
          {
            msg: 'withdrawal_settings_fetch_failed',
            error: error instanceof Error ? error.message : String(error),
          },
          'withdrawal_settings_fetch_failed'
        );
        return null;
      });

    if (!settings?.isAutoProcessingEnabled) {
      return {
        attempted: 0,
        processed: 0,
        failures: 0,
        reason: 'disabled',
      };
    }

    if (settings?.isBatchProcessingPaused) {
      return {
        attempted: 0,
        processed: 0,
        failures: 0,
        reason: 'paused',
      };
    }

    const softLimit = Math.max(1, Math.min(MAX_WITHDRAWALS_PER_RUN, maxPerRun));
    await reconcileQueuedSendingWithdrawals(softLimit);
    await recoverStuckSending(Date.now());

    let processed = 0;
    let failures = 0;
    let attempted = 0;

    while (attempted < softLimit) {
      const result = await processSingleWithdrawal();
      if (result.state === 'empty') {
        break;
      }
      attempted += 1;
      if (result.state === 'success' || result.state === 'queued') {
        processed += 1;
      } else {
        failures += 1;
      }
    }

    if (attempted > 0) {
      logger.info(
        {
          msg: 'withdrawal_batch_run',
          processed,
          failures,
          attempted,
        },
        'withdrawal_batch_run'
      );
    }

    return { attempted, processed, failures };
  } finally {
    processorRunning = false;
  }
}

export function startWithdrawalBatchProcessor(): void {
  if (processorTimer) {
    return;
  }
  void processApprovedWithdrawals();
  processorTimer = setInterval(() => {
    void processApprovedWithdrawals();
  }, WITHDRAWAL_PROCESS_INTERVAL_MS);
}

export function stopWithdrawalBatchProcessor(): void {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
  }
  processorRunning = false;
}
