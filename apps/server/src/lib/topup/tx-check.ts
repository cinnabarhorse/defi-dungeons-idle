import { ethers } from 'ethers';
import { BASE_CHAIN_ID, GAMEPOINTS_CONTRACT_ADDRESS } from './config';
import { GAMEPOINTS_ABI } from './abi';
import { depositsRepo } from '../db';
import type { DepositStatus } from '../db/types';

// Base RPC URL - can be overridden via env var
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org'; // Public Base RPC
interface TransactionReceipt {
  status: 0 | 1; // 0 = failed, 1 = success
  blockNumber: number;
  blockTimestamp?: number;
  depositor?: string;
  depositId?: string;
  depositToken?: string;
  depositAmount?: string;
  pointsMinted?: string;
  yieldAmount?: string;
  unlockAt?: string; // Already in event, don't calculate
}

interface ParsedDepositedEvent {
  user: string;
  depositId: string;
  depositToken: string;
  depositAmount: string;
  yieldAmount: string;
  pointsMinted: string;
  unlockAt?: string;
}

const gamePointsInterface = new ethers.Interface(GAMEPOINTS_ABI);
const depositedEventFragment = gamePointsInterface.getEvent('Deposited');
const depositedTopicHash = depositedEventFragment?.topicHash;

function parseDepositedEventFromLogs(
  logs: ReadonlyArray<{ address: string; topics: ReadonlyArray<string>; data: string }>
): ParsedDepositedEvent | null {
  if (!depositedTopicHash) {
    throw new Error('Gamepoints ABI missing Deposited event definition');
  }

  for (const log of logs) {
    if (
      log.address.toLowerCase() !== GAMEPOINTS_CONTRACT_ADDRESS.toLowerCase()
    ) {
      continue;
    }
    if (log.topics[0] !== depositedTopicHash) {
      continue;
    }

    try {
      const parsed = gamePointsInterface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });

      if (!parsed || parsed.name !== 'Deposited') {
        continue;
      }

      const unlockAtBigInt = parsed.args.unlockAt;
      const unlockAt =
        unlockAtBigInt && unlockAtBigInt > 0n
          ? new Date(Number(unlockAtBigInt) * 1000).toISOString()
          : undefined;

      return {
        user: parsed.args.user,
        depositId: parsed.args.depositId.toString(),
        depositToken: parsed.args.depositToken,
        depositAmount: parsed.args.depositAmount.toString(),
        yieldAmount: parsed.args.yieldAmount.toString(),
        pointsMinted: parsed.args.pointsMinted.toString(),
        unlockAt,
      };
    } catch (error) {
      console.error('Failed to parse deposit event', error);
    }
  }

  return null;
}

/**
 * Get a provider for Base network
 */
export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(BASE_RPC_URL);
}

/**
 * Verify transaction sender matches expected address
 */
export async function verifyTransactionSender(
  txHash: string,
  expectedSender: string
): Promise<boolean> {
  try {
    const provider = getProvider();
    const normalizedHash = txHash.toLowerCase();
    const tx = await provider.getTransaction(normalizedHash);

    if (!tx) {
      return false;
    }

    if (tx.from.toLowerCase() === expectedSender.toLowerCase()) {
      return true;
    }

    // ERC-4337 transactions are bundled; tx.from is the bundler, not the user.
    // Fallback to the Deposited event user emitted by the GamePoints contract.
    const receipt = await provider.getTransactionReceipt(normalizedHash);
    if (!receipt || receipt.status !== 1) {
      return false;
    }
    const parsedDeposit = parseDepositedEventFromLogs(
      receipt.logs as ReadonlyArray<{
        address: string;
        topics: readonly string[];
        data: string;
      }>
    );
    if (!parsedDeposit?.user) {
      return false;
    }

    return parsedDeposit.user.toLowerCase() === expectedSender.toLowerCase();
  } catch (error) {
    console.error('Failed to verify transaction sender', error);
    return false;
  }
}

/**
 * Check transaction receipt and parse deposit events
 */
export async function checkTransactionReceipt(
  txHash: string
): Promise<TransactionReceipt | null> {
  const provider = getProvider();
  const normalizedHash = txHash.toLowerCase();

  // Check if transaction exists
  const receipt = await provider.getTransactionReceipt(normalizedHash);
  if (!receipt) {
    // Transaction not mined yet
    return null;
  }

  const status: 0 | 1 = receipt.status === 1 ? 1 : 0;

  // If transaction failed, return early
  if (status === 0) {
    return {
      status: 0,
      blockNumber: receipt.blockNumber,
    };
  }

  // Parse events from successful transaction
  let depositor: string | undefined;
  let depositId: string | undefined;
  let depositToken: string | undefined;
  let depositAmount: string | undefined;
  let pointsMinted: string | undefined;
  let yieldAmount: string | undefined;
  let unlockAt: string | undefined;

  const parsedDeposit = parseDepositedEventFromLogs(
    receipt.logs as ReadonlyArray<{
      address: string;
      topics: readonly string[];
      data: string;
    }>
  );
  if (parsedDeposit) {
    depositor = parsedDeposit.user;
    depositId = parsedDeposit.depositId;
    depositToken = parsedDeposit.depositToken;
    depositAmount = parsedDeposit.depositAmount;
    pointsMinted = parsedDeposit.pointsMinted;
    yieldAmount = parsedDeposit.yieldAmount;
    unlockAt = parsedDeposit.unlockAt;
  }

  // Get block timestamp
  let blockTimestamp: number | undefined;
  try {
    const block = await provider.getBlock(receipt.blockNumber);
    blockTimestamp = block?.timestamp;
  } catch (error) {
    console.error('Failed to fetch block timestamp', error);
  }

  return {
    status: 1,
    blockNumber: receipt.blockNumber,
    blockTimestamp,
    depositor,
    depositId,
    depositToken,
    depositAmount,
    pointsMinted,
    yieldAmount,
    unlockAt,
  };
}

/**
 * Check and update pending deposits for a user
 */
export interface PendingDepositDeps {
  // Kept for backwards compatibility in tests and fallback checks.
  verifyTransactionSender?: typeof verifyTransactionSender;
  checkTransactionReceipt?: typeof checkTransactionReceipt;
}

export async function checkPendingDeposits(
  userId?: string | null,
  depositorAddress?: string,
  deps?: PendingDepositDeps
): Promise<{
  checked: number;
  updated: number;
}> {
  const verifySender = deps?.verifyTransactionSender ?? verifyTransactionSender;
  const checkReceipt = deps?.checkTransactionReceipt ?? checkTransactionReceipt;
  const { getPgPool } = await import('../db/client');
  const pool = getPgPool();

  // Get all pending deposits AND confirmed deposits that need crediting
  let query: string;
  let params: unknown[];

  if (userId) {
    query = `
      select *
      from public.deposits
      where user_id = $1 
        and tx_hash is not null
        and (
          tx_status = 'pending'
          or tx_status = 'confirmed'
        )
      order by created_at desc
      limit 20
    `;
    params = [userId];
  } else if (depositorAddress) {
    query = `
      select *
      from public.deposits
      where depositor_address = $1 
        and tx_hash is not null
        and (
          tx_status = 'pending'
          or tx_status = 'confirmed'
        )
      order by created_at desc
      limit 20
    `;
    params = [depositorAddress.toLowerCase()];
  } else {
    return { checked: 0, updated: 0 };
  }

  const result = await pool.query(query, params);
  const pendingDeposits = result.rows;

  let checked = 0;
  let updated = 0;

  for (const deposit of pendingDeposits) {
    if (!deposit.tx_hash) continue;

    checked++;
    try {
      // Verify transaction sender matches depositor address
      const depositDepositorAddress = deposit.depositor_address?.toLowerCase();
      if (!depositDepositorAddress) {
        console.warn(`Deposit ${deposit.id} missing depositor_address`);
        continue;
      }

      const receipt = await checkReceipt(deposit.tx_hash);

      if (!receipt) {
        // Still pending, skip
        continue;
      }

      const newStatus: DepositStatus =
        receipt.status === 1 ? 'confirmed' : 'failed';

      if (newStatus === 'confirmed') {
        const receiptDepositor = receipt.depositor?.toLowerCase() ?? null;
        const senderMatches = receiptDepositor
          ? receiptDepositor === depositDepositorAddress
          : await verifySender(deposit.tx_hash, depositDepositorAddress);

        if (!senderMatches) {
          console.error(
            `Deposit ${deposit.id}: Transaction sender does not match depositor_address. ` +
              `Tx: ${deposit.tx_hash}, Expected: ${depositDepositorAddress}`
          );
          // Mark as failed - transaction doesn't belong to this deposit
          await depositsRepo.updateDeposit({
            id: deposit.id,
            txStatus: 'failed',
          });
          updated++;
          continue;
        }
      }

      // Use unlockAt from event if available, otherwise calculate from block timestamp
      let unlockAt: string | null = receipt.unlockAt ?? null;
      if (!unlockAt && receipt.status === 1 && receipt.blockTimestamp) {
        // Fallback: calculate unlock_at if not in event (30 days lock period)
        const lockPeriodSeconds = 30 * 24 * 60 * 60;
        const unlockTimestamp = receipt.blockTimestamp + lockPeriodSeconds;
        unlockAt = new Date(unlockTimestamp * 1000).toISOString();
      }

      // Update deposit record - set status and other fields, but NOT points_minted yet
      // (points_minted will be set atomically by creditDepositIfNotCredited)
      const updatedDeposit = await depositsRepo.updateDeposit({
        id: deposit.id,
        txStatus: newStatus,
        depositId: receipt.depositId ?? null,
        yieldAmount: receipt.yieldAmount ?? null,
        unlockAt,
      });

      if (newStatus === 'confirmed' && updatedDeposit && receipt.depositId) {
        const pointsMinted = receipt.pointsMinted ?? '0';
        const pointsMintedNum = Number.parseFloat(pointsMinted);
        if (Number.isFinite(pointsMintedNum) && pointsMintedNum >= 0) {
          // Atomic check: only credit if deposit didn't already have points_minted
          // This prevents double crediting even if multiple processes check simultaneously
          // Also atomically sets points_minted and status to 'credited'
          const creditedDeposit = await depositsRepo.creditDepositIfNotCredited(
            deposit.id,
            pointsMinted
          );

          if (!creditedDeposit) {
            // Deposit was already credited by another process - this is expected in concurrent scenarios
            // Just ensure status is set to 'credited' if it's still 'confirmed'
            if (updatedDeposit.txStatus === 'confirmed') {
              await depositsRepo.updateDeposit({
                id: deposit.id,
                txStatus: 'credited',
              });
            }
          }
        }
      }

      updated++;
    } catch (error) {
      console.error(`Failed to check deposit ${deposit.id}`, error);
      // Continue with next deposit
    }
  }

  return { checked, updated };
}
