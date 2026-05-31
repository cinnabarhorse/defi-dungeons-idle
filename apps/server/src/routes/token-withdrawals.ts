import type { Application, Request } from 'express';
import { ethers } from 'ethers';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { logError } from '../lib/http-logging';
import {
  tokenWithdrawalsRepo,
  playersRepo,
  gamesRepo,
  gamePlayersRepo,
  withdrawalSettingsRepo,
  runTransaction,
  type TokenWithdrawalRecord,
  type TokenWithdrawalStatus,
  type WithdrawalSettingsRecord,
} from '../lib/db';
import { getCharacterById } from '../data/characters';
import { requireAdminSession } from './admin-auth';
import {
  createWithdrawalTransaction,
  USDC_CONTRACT_ADDRESS,
} from '../lib/withdrawals/tx-creator';
import { isWithdrawalBatchProcessorRunning } from '../lib/withdrawals/batch-processor';
import { BASE_CHAIN_ID } from '../lib/topup/config';
import {
  getMinWithdrawalAmountMap,
  getMinWithdrawalBaseUnits,
  getWithdrawalTokenConfig,
  parseAmountToBaseUnits,
} from '../lib/withdrawals/token-config';
import { COMPETITION_TIERS } from '../lib/daily-quest-competition';

const STATUS_VALUES: TokenWithdrawalStatus[] = [
  'received',
  'withdrawal_waiting',
  'withdrawal_approved',
  'withdrawal_sending',
  'withdrawal_pending',
  'withdrawal_confirmed',
  'withdrawal_failed',
  'withdrawal_rejected',
];

const MIN_WITHDRAWAL_AMOUNT_BY_CURRENCY = Object.freeze(
  getMinWithdrawalAmountMap()
);
const DEFAULT_MIN_WITHDRAWAL_AMOUNT =
  MIN_WITHDRAWAL_AMOUNT_BY_CURRENCY.USDC ?? 0.1;

// Provider and ERC20 read config for wallet balance endpoint
const DEFAULT_BASE_RPC_URL =
  process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const ERC20_READ_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
] as const;
const GHST_CONTRACT_ADDRESS = getWithdrawalTokenConfig('GHST').tokenAddress;
const DAILY_QUEST_PRIZE_SOURCE_PREFIX = 'daily_quest_prize_';
const AUTO_APPROVAL_MAX_AMOUNT_BY_CURRENCY = {
  USDC: 10,
  GHST: 100,
} as const;
const COMPETITION_TIER_SET = new Set<string>(COMPETITION_TIERS);

function isAutoApprovalCurrency(currency: string | null | undefined): boolean {
  const normalized = typeof currency === 'string' ? currency.toUpperCase() : '';
  return normalized === 'USDC' || normalized === 'GHST';
}

function isDailyQuestPrizeSource(source: string | null | undefined): boolean {
  if (typeof source !== 'string') {
    return false;
  }
  if (!source.startsWith(DAILY_QUEST_PRIZE_SOURCE_PREFIX)) {
    return false;
  }
  const remainder = source.slice(DAILY_QUEST_PRIZE_SOURCE_PREFIX.length);
  const [tier] = remainder.split('_');
  return Boolean(tier) && COMPETITION_TIER_SET.has(tier);
}

function isBelowAutoApprovalLimit(
  currency: string | null | undefined,
  amountBaseUnits: bigint,
  decimals: number
): boolean {
  const normalized =
    typeof currency === 'string' ? currency.toUpperCase() : 'USDC';
  const maxAmount =
    normalized === 'GHST'
      ? AUTO_APPROVAL_MAX_AMOUNT_BY_CURRENCY.GHST
      : AUTO_APPROVAL_MAX_AMOUNT_BY_CURRENCY.USDC;
  const limitBaseUnits = parseAmountToBaseUnits(
    maxAmount,
    decimals
  );
  return amountBaseUnits < limitBaseUnits;
}

function normalizeStatusParam(
  value: unknown
): TokenWithdrawalStatus | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const lowered = value.trim().toLowerCase();
  return STATUS_VALUES.find((status) => status === lowered) as
    | TokenWithdrawalStatus
    | undefined;
}

function shouldAutoApproveWithdrawal(
  withdrawal: TokenWithdrawalRecord
): boolean {
  const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
  const isGhstAuto =
    withdrawal.currency?.toUpperCase() === 'GHST' &&
    isBelowAutoApprovalLimit(
      withdrawal.currency,
      withdrawal.amountBaseUnits,
      tokenConfig.decimals
    );
  const isUsdcAuto =
    withdrawal.currency?.toUpperCase() === 'USDC' &&
    isDailyQuestPrizeSource(withdrawal.source) &&
    isBelowAutoApprovalLimit(
      withdrawal.currency,
      withdrawal.amountBaseUnits,
      tokenConfig.decimals
    );
  return (
    isAutoApprovalCurrency(withdrawal.currency) && (isGhstAuto || isUsdcAuto)
  );
}

function buildMinWithdrawalPayload() {
  return {
    minWithdrawalAmount: DEFAULT_MIN_WITHDRAWAL_AMOUNT,
    minWithdrawalAmountByCurrency: {
      ...MIN_WITHDRAWAL_AMOUNT_BY_CURRENCY,
    },
  };
}

function buildWithdrawalSettingsPayload(
  settings?: WithdrawalSettingsRecord | null
) {
  return {
    featureEnabled: settings?.isAutoProcessingEnabled ?? false,
    settings: {
      isAutoProcessingEnabled: settings?.isAutoProcessingEnabled ?? false,
      isBatchProcessingPaused: settings?.isBatchProcessingPaused ?? false,
      isConfirmationPaused: settings?.isConfirmationPaused ?? false,
    },
    runtime: {
      isBatchProcessorRunning: isWithdrawalBatchProcessorRunning(),
    },
  };
}

function serializeWithdrawal(withdrawal: TokenWithdrawalRecord) {
  return {
    id: withdrawal.id,
    playerId: withdrawal.playerId,
    currency: withdrawal.currency,
    amount: withdrawal.amount,
    amountBaseUnits: withdrawal.amountBaseUnits.toString(),
    source: withdrawal.source,
    gameId: withdrawal.gameId,
    lootDistributionId: withdrawal.lootDistributionId,
    economyTransactionId: withdrawal.economyTransactionId,
    status: withdrawal.status,
    txHash: withdrawal.txHash,
    chainId: withdrawal.chainId,
    tokenContractAddress: withdrawal.tokenContractAddress,
    receivedAt: withdrawal.receivedAt,
    withdrawalRequestedAt: withdrawal.withdrawalRequestedAt,
    withdrawalApprovedAt: withdrawal.withdrawalApprovedAt,
    withdrawalSendingAt: withdrawal.withdrawalSendingAt,
    withdrawalPendingAt: withdrawal.withdrawalPendingAt,
    withdrawalConfirmedAt: withdrawal.withdrawalConfirmedAt,
    failureReason: withdrawal.failureReason,
    metadata: withdrawal.metadata,
    createdAt: withdrawal.createdAt,
    updatedAt: withdrawal.updatedAt,
  };
}

async function getSessionPlayerId(req: Request): Promise<string | null> {
  const resolved = await resolveAuthPrincipal(req);
  if (!resolved?.playerId) {
    return null;
  }
  return resolved.playerId;
}

export function registerTokenWithdrawalRoutes(app: Application) {
  app.get('/api/tokens/withdrawals', async (req, res) => {
    try {
      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const status = normalizeStatusParam(req.query.status);
      const withdrawals =
        await tokenWithdrawalsRepo.getTokenWithdrawalsByPlayer(
          playerId,
          status
        );

      res.json({
        withdrawals: withdrawals.map(serializeWithdrawal),
        ...buildMinWithdrawalPayload(),
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load token withdrawals' });
    }
  });

  app.post('/api/tokens/withdraw/:tokenId', async (req, res) => {
    try {
      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const tokenId = req.params.tokenId;
      if (typeof tokenId !== 'string' || tokenId.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid token id' });
      }

      const withdrawal =
        await tokenWithdrawalsRepo.getTokenWithdrawalById(tokenId);

      if (!withdrawal || withdrawal.playerId !== playerId) {
        return res.status(404).json({
          error: 'Token withdrawal not found',
          ...buildMinWithdrawalPayload(),
        });
      }

      if (withdrawal.status !== 'received') {
        return res.status(400).json({
          error: 'Token not available for withdrawal',
          status: withdrawal.status,
          ...buildMinWithdrawalPayload(),
        });
      }

      const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
      const minBaseUnits = getMinWithdrawalBaseUnits(withdrawal.currency);

      if (withdrawal.amountBaseUnits < minBaseUnits) {
        return res.status(400).json({
          error: `Minimum withdrawal amount is ${tokenConfig.minWithdrawalAmount} ${tokenConfig.symbol}`,
          currency: tokenConfig.symbol,
          ...buildMinWithdrawalPayload(),
        });
      }

      const isGhstAutoApproval =
        withdrawal.currency?.toUpperCase() === 'GHST' &&
        isBelowAutoApprovalLimit(
          withdrawal.currency,
          withdrawal.amountBaseUnits,
          tokenConfig.decimals
        );
      const isUsdcAutoApproval =
        withdrawal.currency?.toUpperCase() === 'USDC' &&
        isDailyQuestPrizeSource(withdrawal.source) &&
        isBelowAutoApprovalLimit(
          withdrawal.currency,
          withdrawal.amountBaseUnits,
          tokenConfig.decimals
        );
      const shouldAutoApprove =
        isAutoApprovalCurrency(withdrawal.currency) &&
        (isGhstAutoApproval || isUsdcAutoApproval);

      const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: tokenId,
        status: shouldAutoApprove ? 'withdrawal_approved' : 'withdrawal_waiting',
      });

      if (!updated) {
        return res.status(500).json({
          error: 'Failed to update withdrawal status',
          ...buildMinWithdrawalPayload(),
        });
      }

      res.json({
        withdrawal: serializeWithdrawal(updated),
        ...buildMinWithdrawalPayload(),
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({
        error: 'Failed to request withdrawal',
        ...buildMinWithdrawalPayload(),
      });
    }
  });

  app.post('/api/tokens/withdraw-batch', async (req, res) => {
    try {
      const playerId = await getSessionPlayerId(req);
      if (!playerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const body = (req.body || {}) as { ids?: unknown };
      const rawIds = Array.isArray(body.ids) ? body.ids : [];
      const ids: string[] = [];
      const seen = new Set<string>();
      for (const entry of rawIds) {
        if (typeof entry !== 'string') {
          continue;
        }
        const trimmed = entry.trim();
        if (!trimmed) {
          continue;
        }
        if (seen.has(trimmed)) {
          continue;
        }
        seen.add(trimmed);
        ids.push(trimmed);
      }

      if (ids.length === 0) {
        return res.status(400).json({
          error: 'No withdrawal ids provided',
          ...buildMinWithdrawalPayload(),
        });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: 'Cannot withdraw more than 100 items in a single batch',
          ...buildMinWithdrawalPayload(),
        });
      }

      const withdrawals = await Promise.all(
        ids.map((id) => tokenWithdrawalsRepo.getTokenWithdrawalById(id))
      );

      for (let i = 0; i < withdrawals.length; i++) {
        const w = withdrawals[i];
        if (!w || w.playerId !== playerId) {
          return res.status(404).json({
            error: 'Token withdrawal not found',
            id: ids[i],
            ...buildMinWithdrawalPayload(),
          });
        }
        if (w.status !== 'received') {
          return res.status(400).json({
            error: 'Token not available for withdrawal',
            id: w.id,
            status: w.status,
            ...buildMinWithdrawalPayload(),
          });
        }
      }

      const validWithdrawals = withdrawals as TokenWithdrawalRecord[];

      // Group by currency and check aggregate threshold
      const byCurrency = new Map<string, bigint>();
      for (const w of validWithdrawals) {
        const key = (w.currency ?? 'USDC').toUpperCase();
        byCurrency.set(key, (byCurrency.get(key) ?? 0n) + w.amountBaseUnits);
      }

      for (const [currency, total] of byCurrency) {
        const minBaseUnits = getMinWithdrawalBaseUnits(currency);
        if (total < minBaseUnits) {
          const tokenConfig = getWithdrawalTokenConfig(currency);
          return res.status(400).json({
            error: `Combined ${currency} amount is below the minimum withdrawal threshold of ${tokenConfig.minWithdrawalAmount} ${tokenConfig.symbol}`,
            currency: tokenConfig.symbol,
            ...buildMinWithdrawalPayload(),
          });
        }
      }

      // Process each withdrawal individually
      const results: Array<{
        id: string;
        success: boolean;
        error?: string;
        withdrawal?: ReturnType<typeof serializeWithdrawal>;
      }> = [];

      for (const w of validWithdrawals) {
        const autoApprove = shouldAutoApproveWithdrawal(w);
        const updated =
          await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
            id: w.id,
            status: autoApprove
              ? 'withdrawal_approved'
              : 'withdrawal_waiting',
          });
        if (!updated) {
          results.push({
            id: w.id,
            success: false,
            error: 'Failed to update status',
          });
        } else {
          results.push({
            id: w.id,
            success: true,
            withdrawal: serializeWithdrawal(updated),
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      res.json({
        ok: successCount > 0,
        withdrawals: results
          .filter((r) => r.withdrawal)
          .map((r) => r.withdrawal),
        successCount,
        failCount,
        ...buildMinWithdrawalPayload(),
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({
        error: 'Failed to request batch withdrawal',
        ...buildMinWithdrawalPayload(),
      });
    }
  });

  app.get('/api/admin/withdrawals', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const status =
        normalizeStatusParam(req.query.status) ?? 'withdrawal_waiting';
      const withdrawals =
        await tokenWithdrawalsRepo.getTokenWithdrawalsByStatus(status);

      const playerCache = new Map<string, string | null>();
      const enriched = await Promise.all(
        withdrawals.map(async (withdrawal) => {
          if (!playerCache.has(withdrawal.playerId)) {
            const player = await playersRepo.getPlayerById(withdrawal.playerId);
            playerCache.set(withdrawal.playerId, player?.walletAddress ?? null);
          }
          const walletAddress = playerCache.get(withdrawal.playerId) ?? null;
          return {
            ...serializeWithdrawal(withdrawal),
            playerWalletAddress: walletAddress,
          };
        })
      );

      res.json({
        withdrawals: enriched,
        status,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load admin withdrawals' });
    }
  });

  app.get('/api/admin/withdrawals/settings', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const settings = await withdrawalSettingsRepo.getSettings();
      res.json(buildWithdrawalSettingsPayload(settings));
    } catch (error) {
      logError(error, req);
      res
        .status(500)
        .json({ error: 'Failed to load withdrawal automation settings' });
    }
  });

  app.post('/api/admin/withdrawals/settings', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const body = (req.body || {}) as {
        isAutoProcessingEnabled?: unknown;
        isBatchProcessingPaused?: unknown;
        isConfirmationPaused?: unknown;
      };
      const updates: {
        isAutoProcessingEnabled?: boolean;
        isBatchProcessingPaused?: boolean;
        isConfirmationPaused?: boolean;
      } = {};

      if (typeof body.isAutoProcessingEnabled === 'boolean') {
        updates.isAutoProcessingEnabled = body.isAutoProcessingEnabled;
      }
      if (typeof body.isBatchProcessingPaused === 'boolean') {
        updates.isBatchProcessingPaused = body.isBatchProcessingPaused;
      }
      if (typeof body.isConfirmationPaused === 'boolean') {
        updates.isConfirmationPaused = body.isConfirmationPaused;
      }

      if (
        updates.isAutoProcessingEnabled === undefined &&
        updates.isBatchProcessingPaused === undefined &&
        updates.isConfirmationPaused === undefined
      ) {
        return res.status(400).json({
          error: 'At least one setting must be provided',
        });
      }

      const updated = await withdrawalSettingsRepo.updateSettings(updates);
      res.json(buildWithdrawalSettingsPayload(updated));
    } catch (error) {
      logError(error, req);
      res
        .status(500)
        .json({ error: 'Failed to update withdrawal automation settings' });
    }
  });

  app.post('/api/admin/withdrawals/batch-approve', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const body = (req.body || {}) as { ids?: unknown };
      const ids = Array.isArray(body.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string')
        : [];

      if (ids.length === 0) {
        return res.status(400).json({ error: 'No ids provided' });
      }

      if (ids.length > 100) {
        return res.status(400).json({
          error: 'Cannot approve more than 100 withdrawals in a single batch',
        });
      }

      const settings = await withdrawalSettingsRepo
        .getSettings()
        .catch(() => null);
      const autoProcessingEnabled = settings?.isAutoProcessingEnabled ?? false;

      const results: Array<{
        id: string;
        success: boolean;
        error?: string;
        status?: string;
        mode?: 'queued' | 'broadcast';
        txHash?: string;
        transactionId?: string;
        withdrawal?: ReturnType<typeof serializeWithdrawal>;
      }> = [];

      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        try {
          if (typeof id !== 'string' || id.trim().length === 0) {
            results.push({
              id,
              success: false,
              error: 'Invalid token id',
            });
            continue;
          }

          const withdrawal =
            await tokenWithdrawalsRepo.getTokenWithdrawalById(id);

          if (!withdrawal) {
            results.push({
              id,
              success: false,
              error: 'Withdrawal not found',
            });
            continue;
          }

          if (withdrawal.status !== 'withdrawal_waiting') {
            results.push({
              id,
              success: false,
              error: 'Withdrawal is not awaiting approval',
              status: withdrawal.status,
            });
            continue;
          }

          if (withdrawal.amountBaseUnits <= 0n) {
            results.push({
              id,
              success: false,
              error: 'Withdrawal amount is invalid',
            });
            continue;
          }

          const player = await playersRepo.getPlayerById(withdrawal.playerId);
          const walletAddress = player?.walletAddress;

          if (!walletAddress || !ethers.isAddress(walletAddress)) {
            results.push({
              id,
              success: false,
              error: 'Player wallet address not found or invalid',
            });
            continue;
          }

          const tokenConfig = getWithdrawalTokenConfig(withdrawal.currency);
          const resolvedChainId =
            withdrawal.chainId ?? tokenConfig.defaultChainId;
          const resolvedTokenAddress =
            withdrawal.tokenContractAddress ?? tokenConfig.tokenAddress;

          if (autoProcessingEnabled) {
            const updated = await runTransaction(async (client) => {
              return tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
                id: withdrawal.id,
                status: 'withdrawal_approved',
                onlyIfCurrentStatus: 'withdrawal_waiting',
                chainId: resolvedChainId,
                tokenContractAddress: resolvedTokenAddress,
                client,
              });
            });

            if (!updated) {
              results.push({
                id,
                success: false,
                error: 'Withdrawal is already being processed',
              });
              continue;
            }

            results.push({
              id,
              success: true,
              mode: 'queued',
              withdrawal: serializeWithdrawal(updated),
            });
            continue;
          }

          const claimed = await runTransaction(async (client) => {
            return tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
              id: withdrawal.id,
              status: 'withdrawal_sending',
              onlyIfCurrentStatus: 'withdrawal_waiting',
              chainId: resolvedChainId,
              tokenContractAddress: resolvedTokenAddress,
              client,
            });
          });

          if (!claimed) {
            results.push({
              id,
              success: false,
              error: 'Withdrawal is already being processed',
            });
            continue;
          }

          let txHash: string | null = null;
          let queuedTransactionId: string | null = null;
          try {
            const result = await createWithdrawalTransaction({
              to: walletAddress,
              amount: withdrawal.amountBaseUnits,
              tokenAddress: resolvedTokenAddress,
              chainId: resolvedChainId,
            });
            txHash = result.txHash;
            queuedTransactionId = result.transactionId;
            if (!txHash && !queuedTransactionId) {
              throw new Error(
                'Thirdweb did not return txHash or transactionId'
              );
            }
          } catch (error) {
            logError(error, req);
            results.push({
              id,
              success: false,
              error: 'Failed to broadcast withdrawal transaction',
            });
            continue;
          }

          const baseMetadata =
            claimed.metadata &&
            typeof claimed.metadata === 'object' &&
            !Array.isArray(claimed.metadata)
              ? {
                  ...(claimed.metadata as Record<string, unknown>),
                }
              : {};
          delete baseMetadata.thirdwebTransactionId;
          delete baseMetadata.thirdwebTransactionStatus;
          delete baseMetadata.thirdwebTransactionUpdatedAt;
          delete baseMetadata.thirdwebTransactionError;

          const nextMetadata = txHash
            ? baseMetadata
            : {
                ...baseMetadata,
                thirdwebTransactionId: queuedTransactionId,
                thirdwebTransactionStatus: 'queued',
                thirdwebTransactionUpdatedAt: new Date().toISOString(),
              };

          const updated = await runTransaction(async (client) => {
            return tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
              id: withdrawal.id,
              status: txHash ? 'withdrawal_pending' : 'withdrawal_sending',
              onlyIfCurrentStatus: 'withdrawal_sending',
              txHash,
              chainId: resolvedChainId,
              tokenContractAddress: resolvedTokenAddress,
              metadata: nextMetadata,
              client,
            });
          });

          if (!updated) {
            results.push({
              id,
              success: false,
              error: 'Failed to finalize withdrawal after broadcast',
            });
            continue;
          }

          results.push({
            id,
            success: true,
            mode: txHash ? 'broadcast' : 'queued',
            txHash: txHash ?? undefined,
            transactionId: queuedTransactionId ?? undefined,
            withdrawal: serializeWithdrawal(updated),
          });
        } catch (error) {
          logError(error, req);
          results.push({
            id,
            success: false,
            error: 'Failed to approve withdrawal',
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      return res.json({
        ok: successCount > 0,
        total: results.length,
        successCount,
        failureCount,
        results,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to batch approve withdrawals' });
    }
  });

  app.post('/api/admin/withdrawals/:tokenId/reject', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const tokenId = req.params.tokenId;
      if (typeof tokenId !== 'string' || tokenId.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid token id' });
      }

      const body = req.body as { reason?: string } | undefined;
      const reason =
        typeof body?.reason === 'string' ? body.reason.trim() : null;

      if (!reason || reason.length === 0) {
        return res.status(400).json({
          error: 'Rejection reason is required',
        });
      }

      if (reason.length > 500) {
        return res.status(400).json({
          error: 'Rejection reason must be 500 characters or less',
        });
      }

      const withdrawal =
        await tokenWithdrawalsRepo.getTokenWithdrawalById(tokenId);

      if (!withdrawal) {
        return res.status(404).json({ error: 'Withdrawal not found' });
      }

      if (withdrawal.status !== 'withdrawal_waiting') {
        return res.status(400).json({
          error: 'Withdrawal is not awaiting approval',
          status: withdrawal.status,
        });
      }

      const updated = await tokenWithdrawalsRepo.updateTokenWithdrawalStatus({
        id: withdrawal.id,
        status: 'withdrawal_rejected',
        failureReason: reason,
      });

      if (!updated) {
        return res
          .status(500)
          .json({ error: 'Failed to update withdrawal after rejection' });
      }

      res.json({
        withdrawal: serializeWithdrawal(updated),
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to reject withdrawal' });
    }
  });

  // Admin: POST /api/admin/withdrawals/test-discord
  // Sends a test Discord webhook message to verify configuration
  app.post('/api/admin/withdrawals/test-discord', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const webhookUrl =
        process.env.DISCORD_WITHDRAWALS_WEBHOOK_URL ||
        'https://discord.com/api/webhooks/1436343527146786878/aZk5mnB8NPM4vDpMtDBN3nuL3VlWzvG0F7jzEqRCRc--irTaKKg2x1R-EP1ZCI9pO5v-';

      if (!webhookUrl) {
        return res
          .status(400)
          .json({ error: 'Discord webhook URL not configured' });
      }

      const txid = `TEST-${Date.now().toString(16)}`;
      const content = `**Withdrawal processed!**\n\n0.00 USDC was sent to ${adminSession.address}.\n\ntxid: ${txid}`;

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const text = await response
          .text()
          .catch(() => 'Discord request failed');
        return res.status(502).json({ error: text });
      }

      res.json({ ok: true, txid });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to send test Discord message' });
    }
  });

  // Admin: GET /api/admin/withdrawals/wallet-balances
  // Returns ETH, GHST, and USDC balances for the configured server wallet
  app.get('/api/admin/withdrawals/wallet-balances', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }
    try {
      const walletAddress = process.env.THIRDWEB_SERVER_WALLET;
      if (!walletAddress || !ethers.isAddress(walletAddress)) {
        return res.status(500).json({
          error:
            'Server wallet address not configured (THIRDWEB_SERVER_WALLET)',
        });
      }

      const provider = new ethers.JsonRpcProvider(DEFAULT_BASE_RPC_URL);

      // ETH balance
      let ethRaw: bigint = 0n;
      try {
        ethRaw = await provider.getBalance(walletAddress);
      } catch {
        ethRaw = 0n;
      }

      // USDC balance (Base)
      let usdcRaw: bigint = 0n;
      try {
        const usdc = new ethers.Contract(
          USDC_CONTRACT_ADDRESS,
          ERC20_READ_ABI,
          provider
        );
        usdcRaw = (await usdc.balanceOf(walletAddress)) as bigint;
      } catch {
        usdcRaw = 0n;
      }

      // GHST balance (optional - requires GHST_CONTRACT_ADDRESS*)
      let ghstRaw: bigint | null = null;
      if (GHST_CONTRACT_ADDRESS && ethers.isAddress(GHST_CONTRACT_ADDRESS)) {
        try {
          const ghst = new ethers.Contract(
            GHST_CONTRACT_ADDRESS,
            ERC20_READ_ABI,
            provider
          );
          ghstRaw = (await ghst.balanceOf(walletAddress)) as bigint;
        } catch {
          ghstRaw = 0n;
        }
      }

      const toFormatted = (
        raw: bigint | null,
        decimals: number,
        maximumFractionDigits: number
      ): string | null => {
        if (raw === null) return null;
        const asStr = ethers.formatUnits(raw, decimals);
        const num = Number(asStr);
        if (!Number.isFinite(num)) return asStr;
        return new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits,
        }).format(num);
      };

      return res.json({
        walletAddress,
        chainId: BASE_CHAIN_ID,
        balances: {
          eth: {
            raw: ethRaw.toString(),
            decimals: 18,
            formatted: toFormatted(ethRaw, 18, 6),
          },
          ghst: {
            raw: ghstRaw !== null ? ghstRaw.toString() : null,
            decimals: 18,
            formatted: toFormatted(ghstRaw, 18, 6),
          },
          usdc: {
            raw: usdcRaw.toString(),
            decimals: 6,
            formatted: toFormatted(usdcRaw, 6, 2),
          },
        },
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load server wallet balances' });
    }
  });

  app.get('/api/admin/games/:gameId', async (req, res) => {
    const adminSession = await requireAdminSession(req, res);
    if (!adminSession) {
      return;
    }

    try {
      const gameId = req.params.gameId;
      if (typeof gameId !== 'string' || gameId.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid game id' });
      }

      const game = await gamesRepo.getById(gameId);

      if (!game) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const gamePlayers = await gamePlayersRepo.getByGameId(gameId);
      const playersWithCharacters = await Promise.all(
        gamePlayers.map(async (gp) => {
          const player = await playersRepo.getPlayerById(gp.playerId);
          const character = gp.characterId
            ? getCharacterById(gp.characterId)
            : null;
          return {
            playerId: gp.playerId,
            walletAddress: player?.walletAddress ?? null,
            characterId: gp.characterId,
            characterName: character?.name ?? null,
            joinedAt: gp.joinedAt,
            leftAt: gp.leftAt,
            kills: gp.kills,
            deaths: gp.deaths,
            levelBefore: gp.levelBefore,
            levelAfter: gp.levelAfter,
          };
        })
      );

      res.json({
        game: {
          ...game,
          players: playersWithCharacters,
        },
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load game details' });
    }
  });
}
