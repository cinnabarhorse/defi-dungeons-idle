import type { Application } from 'express';
import { resolveAuthPrincipal } from '../lib/auth/principal';
import { depositsRepo } from '../lib/db';
import {
  fetchStakedBalancesFromSubgraph,
  syncWithdrawnDepositsFromSubgraph,
} from '../lib/topup/deposits-subgraph';
import {
  DIFFICULTY_TIER_SEQUENCE,
  isTierEligible,
} from '../data/difficulty-tiers';
import { logError } from '../lib/http-logging';

function toNonNegativeAmount(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseFloat(typeof value === 'string' ? value : '0');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildStakedBalances(
  deposits: Array<{
    tokenSymbol?: string | null;
    amount?: string | number | null;
    txStatus?: string | null;
    withdrawn?: boolean | null;
  }>
): { usdc: number; gho: number; ghst: number; total: number } {
  let usdc = 0;
  let gho = 0;
  let ghst = 0;

  for (const deposit of deposits) {
    if (deposit.txStatus !== 'credited') continue;
    if (deposit.withdrawn) continue;
    const amount = toNonNegativeAmount(deposit.amount);
    if (amount <= 0) continue;
    const symbol = deposit.tokenSymbol?.toUpperCase() ?? '';
    if (symbol === 'USDC') usdc += amount;
    if (symbol === 'GHO') gho += amount;
    if (symbol === 'GHST') ghst += amount;
  }

  return {
    usdc,
    gho,
    ghst,
    total: usdc + gho,
  };
}

export function registerPlayerStakedBalanceRoutes(app: Application): void {
  app.get('/api/player/staked-balance', async (req, res) => {
    const resolved = await resolveAuthPrincipal(req);
    res.setHeader('X-Request-Id', (req as any).id || '');

    if (!resolved) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!resolved.playerId) {
      return res.status(403).json({ error: 'Player not linked to session' });
    }

    try {
      const dbDeposits = await depositsRepo.listDepositsByUser(
        resolved.playerId,
        200
      );

      try {
        const candidates = dbDeposits.filter(
          (deposit) =>
            deposit.txStatus === 'credited' &&
            !deposit.withdrawn &&
            Boolean(deposit.txHash)
        );
        if (candidates.length > 0) {
          await syncWithdrawnDepositsFromSubgraph(candidates);
        }
      } catch (syncError) {
        logError(syncError, req);
      }

      let balances = buildStakedBalances(dbDeposits);
      try {
        const subgraphBalances = await fetchStakedBalancesFromSubgraph(
          resolved.address
        );
        if (subgraphBalances) {
          balances = subgraphBalances;
        }
      } catch (subgraphError) {
        logError(subgraphError, req);
      }
      const accessibleTiers = DIFFICULTY_TIER_SEQUENCE.filter((tierId) =>
        isTierEligible(tierId, balances.total)
      );
      res.json({
        usdc: balances.usdc,
        gho: balances.gho,
        ghst: balances.ghst,
        total: balances.total,
        accessibleTiers,
      });
    } catch (error) {
      logError(error, req);
      res.status(500).json({ error: 'Failed to load staked balance' });
    }
  });
}
