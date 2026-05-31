import { ethers } from 'ethers';
import { gql, request } from 'graphql-request';
import { gotchiSnapshotsRepo } from '../lib/db';
import { getTodayUtcDateString } from '../lib/gotchi-snapshot';

const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';

interface SubgraphMetaResponse {
  _meta?: {
    block?: {
      number?: number;
    };
  };
}

function getBaseRpcUrl() {
  return (process.env.BASE_RPC_URL || DEFAULT_BASE_RPC_URL).trim();
}

function getCoreSubgraphEndpoint() {
  return (
    process.env.SUBGRAPH_CORE_BASE?.trim() ||
    process.env.SUBGRAPH_CORE?.trim() ||
    'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn'
  );
}

async function getBaseHeadBlock(): Promise<number> {
  const provider = new ethers.JsonRpcProvider(getBaseRpcUrl());
  const blockNumber = await provider.getBlockNumber();
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    throw new Error('Failed to resolve Base head block number');
  }
  return blockNumber;
}

async function getSubgraphHeadBlock(): Promise<number> {
  const endpoint = getCoreSubgraphEndpoint();
  const query = gql`
    {
      _meta {
        block {
          number
        }
      }
    }
  `;
  const result = await request<SubgraphMetaResponse>(endpoint, query);
  const blockNumber = Number(result?._meta?.block?.number);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    throw new Error('Failed to resolve subgraph indexed head block number');
  }
  return blockNumber;
}

function normalizeTargetDate(date?: string) {
  if (!date) {
    return getTodayUtcDateString();
  }
  const trimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }
  return trimmed;
}

export interface CaptureDailyGotchiSnapshotResult {
  date: string;
  blockNumber: number;
  baseHeadBlock: number;
  subgraphHeadBlock: number;
}

export async function captureDailyGotchiSnapshot(options?: {
  date?: string;
}): Promise<CaptureDailyGotchiSnapshotResult> {
  const date = normalizeTargetDate(options?.date);

  const [baseHeadBlock, subgraphHeadBlock] = await Promise.all([
    getBaseHeadBlock(),
    getSubgraphHeadBlock(),
  ]);

  const blockNumber = Math.min(baseHeadBlock, subgraphHeadBlock);
  if (!Number.isFinite(blockNumber) || blockNumber <= 0) {
    throw new Error('Resolved snapshot block number is invalid');
  }

  await gotchiSnapshotsRepo.upsertForDate(date, blockNumber);

  return {
    date,
    blockNumber,
    baseHeadBlock,
    subgraphHeadBlock,
  };
}

