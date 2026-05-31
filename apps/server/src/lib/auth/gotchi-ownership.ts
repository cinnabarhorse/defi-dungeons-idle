import { ethers } from 'ethers';
import { fetchAavegotchisOfOwner } from '../aavegotchi';

const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
const OWNERSHIP_BALANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

export type GotchiOwnershipSource = 'subgraph' | 'rpc' | 'none';

export interface GotchiOwnershipVerificationResult {
  owned: boolean;
  source: GotchiOwnershipSource;
  unavailable: boolean;
  reason: string;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function isValidAddress(value: string): boolean {
  return /^0x[0-9a-f]{40}$/.test(value);
}

function getOwnershipContractAddress(): string {
  const contractAddress =
    process.env.AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS?.trim() ?? '';
  if (!isValidAddress(contractAddress.toLowerCase())) {
    throw new Error('AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS is not configured');
  }
  return contractAddress.toLowerCase();
}

function getOwnershipRpcUrl(): string {
  const explicitOwnershipUrl =
    process.env.AAVEGOTCHI_OWNERSHIP_RPC_URL?.trim() ?? '';
  if (explicitOwnershipUrl) {
    return explicitOwnershipUrl;
  }

  const baseRpcUrl = process.env.BASE_RPC_URL?.trim() ?? '';
  if (baseRpcUrl) {
    return baseRpcUrl;
  }

  return DEFAULT_BASE_RPC_URL;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  if (value && typeof (value as { toString?: () => string }).toString === 'function') {
    return BigInt((value as { toString: () => string }).toString());
  }
  throw new Error('Unsupported balance value');
}

async function checkOwnershipViaSubgraph(address: string): Promise<boolean> {
  const ownedGotchis = await fetchAavegotchisOfOwner(address, { pageSize: 1 });
  return ownedGotchis.length > 0;
}

async function checkOwnershipViaRpc(address: string): Promise<boolean> {
  const contractAddress = getOwnershipContractAddress();
  const provider = new ethers.JsonRpcProvider(getOwnershipRpcUrl());
  const contract = new ethers.Contract(
    contractAddress,
    OWNERSHIP_BALANCE_ABI,
    provider
  );

  const balanceRaw = await contract.balanceOf(address);
  const balance = toBigInt(balanceRaw);
  return balance > 0n;
}

export async function verifyWalletOwnsAnyAavegotchi(
  address: string
): Promise<GotchiOwnershipVerificationResult> {
  const normalizedAddress = normalizeAddress(address);
  if (!isValidAddress(normalizedAddress)) {
    return {
      owned: false,
      source: 'none',
      unavailable: false,
      reason: 'invalid_address',
    };
  }

  try {
    const owned = await checkOwnershipViaSubgraph(normalizedAddress);
    return {
      owned,
      source: 'subgraph',
      unavailable: false,
      reason: owned ? 'subgraph_owned' : 'subgraph_not_owned',
    };
  } catch {
    try {
      const owned = await checkOwnershipViaRpc(normalizedAddress);
      return {
        owned,
        source: 'rpc',
        unavailable: false,
        reason: owned ? 'rpc_owned' : 'rpc_not_owned',
      };
    } catch {
      return {
        owned: false,
        source: 'none',
        unavailable: true,
        reason: 'subgraph_and_rpc_unavailable',
      };
    }
  }
}
