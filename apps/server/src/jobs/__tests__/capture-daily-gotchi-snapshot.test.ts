jest.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: jest.fn(),
  },
}));

jest.mock('graphql-request', () => ({
  gql: (parts: TemplateStringsArray) => parts.join(''),
  request: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  gotchiSnapshotsRepo: {
    upsertForDate: jest.fn(),
  },
}));

import { ethers } from 'ethers';
import { request } from 'graphql-request';
import { gotchiSnapshotsRepo } from '../../lib/db';
import { captureDailyGotchiSnapshot } from '../capture-daily-gotchi-snapshot';

describe('captureDailyGotchiSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BASE_RPC_URL = 'https://base.example.invalid';
    process.env.SUBGRAPH_CORE_BASE = 'https://subgraph.example.invalid';
  });

  it('chooses min(baseHead, subgraphHead) for snapshot block', async () => {
    const getBlockNumber = jest.fn().mockResolvedValue(8453123);
    (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => ({
      getBlockNumber,
    }));
    (request as jest.Mock).mockResolvedValue({
      _meta: { block: { number: 8453100 } },
    });
    (gotchiSnapshotsRepo.upsertForDate as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 8453100,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });

    const result = await captureDailyGotchiSnapshot({ date: '2026-02-18' });

    expect(gotchiSnapshotsRepo.upsertForDate).toHaveBeenCalledWith(
      '2026-02-18',
      8453100
    );
    expect(result).toEqual({
      date: '2026-02-18',
      blockNumber: 8453100,
      baseHeadBlock: 8453123,
      subgraphHeadBlock: 8453100,
    });
  });

  it('upserts same-day snapshot idempotently', async () => {
    const getBlockNumber = jest
      .fn()
      .mockResolvedValueOnce(1005)
      .mockResolvedValueOnce(1008);
    (ethers.JsonRpcProvider as jest.Mock).mockImplementation(() => ({
      getBlockNumber,
    }));
    (request as jest.Mock)
      .mockResolvedValueOnce({ _meta: { block: { number: 1000 } } })
      .mockResolvedValueOnce({ _meta: { block: { number: 1004 } } });
    (gotchiSnapshotsRepo.upsertForDate as jest.Mock).mockResolvedValue({
      snapshotDate: '2026-02-18',
      blockNumber: 1000,
      capturedAt: '2026-02-18T00:00:00.000Z',
    });

    await captureDailyGotchiSnapshot({ date: '2026-02-18' });
    await captureDailyGotchiSnapshot({ date: '2026-02-18' });

    expect(gotchiSnapshotsRepo.upsertForDate).toHaveBeenNthCalledWith(
      1,
      '2026-02-18',
      1000
    );
    expect(gotchiSnapshotsRepo.upsertForDate).toHaveBeenNthCalledWith(
      2,
      '2026-02-18',
      1004
    );
  });
});
