import { depositsRepo, playersRepo } from '../db';
import { isAdminWalletAddress } from './admin-allowlist';

export const API_KEY_REQUIRED_USDC_STAKE = 1000;
export const API_KEY_REQUIRED_GHST_STAKE = 1000;

export interface StakeEntitlement {
  usdc: number;
  ghst: number;
  requiredUsdc: number;
  requiredGhst: number;
  hasRequiredUsdc: boolean;
  hasRequiredGhst: boolean;
  eligible: boolean;
  reason: 'ok' | 'insufficient_usdc' | 'insufficient_ghst' | 'insufficient_both';
}

function toNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

export function evaluateStakeEntitlement(
  usdcInput: unknown,
  ghstInput: unknown
): StakeEntitlement {
  const usdc = toNonNegativeNumber(usdcInput);
  const ghst = toNonNegativeNumber(ghstInput);
  const hasRequiredUsdc = usdc >= API_KEY_REQUIRED_USDC_STAKE;
  const hasRequiredGhst = ghst >= API_KEY_REQUIRED_GHST_STAKE;
  const eligible = hasRequiredUsdc && hasRequiredGhst;

  let reason: StakeEntitlement['reason'] = 'ok';
  if (!hasRequiredUsdc && !hasRequiredGhst) {
    reason = 'insufficient_both';
  } else if (!hasRequiredUsdc) {
    reason = 'insufficient_usdc';
  } else if (!hasRequiredGhst) {
    reason = 'insufficient_ghst';
  }

  return {
    usdc,
    ghst,
    requiredUsdc: API_KEY_REQUIRED_USDC_STAKE,
    requiredGhst: API_KEY_REQUIRED_GHST_STAKE,
    hasRequiredUsdc,
    hasRequiredGhst,
    eligible,
    reason,
  };
}

export async function getStakeEntitlement(playerId: string) {
  const balances = await depositsRepo.getStakedTokenBalances(playerId, [
    'USDC',
    'GHST',
  ]);
  const usdc = balances.USDC ?? 0;
  const ghst = balances.GHST ?? 0;
  return evaluateStakeEntitlement(usdc, ghst);
}

export function isStakeExemptAddress(
  address: string | null | undefined
): boolean {
  return isAdminWalletAddress(address);
}

export async function isStakeExemptPlayer(playerId: string): Promise<boolean> {
  const player = await playersRepo.getPlayerById(playerId);
  if (!player) {
    return false;
  }
  return isStakeExemptAddress(player.walletAddress);
}

export function buildStakeEntitlementErrorMessage(entitlement: StakeEntitlement) {
  return `Insufficient staked balance: requires ${entitlement.requiredUsdc} USDC and ${entitlement.requiredGhst} GHST (current: ${entitlement.usdc} USDC, ${entitlement.ghst} GHST)`;
}
