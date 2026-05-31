jest.mock('../aavegotchi', () => ({
  fetchAavegotchisOfOwner: jest.fn(),
}));

jest.mock('ethers', () => {
  const JsonRpcProvider = jest.fn(() => ({}));
  const Contract = jest.fn();
  return {
    ethers: {
      JsonRpcProvider,
      Contract,
    },
  };
});

import { fetchAavegotchisOfOwner } from '../aavegotchi';
import { ethers } from 'ethers';
import { verifyWalletOwnsAnyAavegotchi } from './gotchi-ownership';

describe('gotchi ownership helper', () => {
  const originalOwnershipRpcUrl = process.env.AAVEGOTCHI_OWNERSHIP_RPC_URL;
  const originalOwnershipContractAddress =
    process.env.AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS;
  const originalBaseRpcUrl = process.env.BASE_RPC_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS =
      '0x1111111111111111111111111111111111111111';
    process.env.AAVEGOTCHI_OWNERSHIP_RPC_URL = 'https://rpc.ownership.local';
    process.env.BASE_RPC_URL = 'https://rpc.base.local';
  });

  afterAll(() => {
    if (originalOwnershipRpcUrl === undefined) {
      delete process.env.AAVEGOTCHI_OWNERSHIP_RPC_URL;
    } else {
      process.env.AAVEGOTCHI_OWNERSHIP_RPC_URL = originalOwnershipRpcUrl;
    }

    if (originalOwnershipContractAddress === undefined) {
      delete process.env.AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS;
    } else {
      process.env.AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS =
        originalOwnershipContractAddress;
    }

    if (originalBaseRpcUrl === undefined) {
      delete process.env.BASE_RPC_URL;
    } else {
      process.env.BASE_RPC_URL = originalBaseRpcUrl;
    }
  });

  it('returns owned when subgraph shows at least one gotchi', async () => {
    (fetchAavegotchisOfOwner as jest.Mock).mockResolvedValue([{ id: '123' }]);

    const result = await verifyWalletOwnsAnyAavegotchi(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );

    expect(result).toEqual({
      owned: true,
      source: 'subgraph',
      unavailable: false,
      reason: 'subgraph_owned',
    });
    expect(ethers.Contract).not.toHaveBeenCalled();
  });

  it('returns not owned when subgraph returns empty list', async () => {
    (fetchAavegotchisOfOwner as jest.Mock).mockResolvedValue([]);

    const result = await verifyWalletOwnsAnyAavegotchi(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );

    expect(result).toEqual({
      owned: false,
      source: 'subgraph',
      unavailable: false,
      reason: 'subgraph_not_owned',
    });
    expect(ethers.Contract).not.toHaveBeenCalled();
  });

  it('falls back to rpc and returns owned when rpc balance is positive', async () => {
    (fetchAavegotchisOfOwner as jest.Mock).mockRejectedValue(
      new Error('subgraph down')
    );
    const balanceOf = jest.fn().mockResolvedValue(1n);
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      balanceOf,
    }));

    const result = await verifyWalletOwnsAnyAavegotchi(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );

    expect(result).toEqual({
      owned: true,
      source: 'rpc',
      unavailable: false,
      reason: 'rpc_owned',
    });
  });

  it('falls back to rpc and returns not owned when rpc balance is zero', async () => {
    (fetchAavegotchisOfOwner as jest.Mock).mockRejectedValue(
      new Error('subgraph down')
    );
    const balanceOf = jest.fn().mockResolvedValue(0n);
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      balanceOf,
    }));

    const result = await verifyWalletOwnsAnyAavegotchi(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );

    expect(result).toEqual({
      owned: false,
      source: 'rpc',
      unavailable: false,
      reason: 'rpc_not_owned',
    });
  });

  it('returns unavailable when subgraph and rpc both fail', async () => {
    (fetchAavegotchisOfOwner as jest.Mock).mockRejectedValue(
      new Error('subgraph down')
    );
    const balanceOf = jest.fn().mockRejectedValue(new Error('rpc down'));
    (ethers.Contract as unknown as jest.Mock).mockImplementation(() => ({
      balanceOf,
    }));

    const result = await verifyWalletOwnsAnyAavegotchi(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    );

    expect(result).toEqual({
      owned: false,
      source: 'none',
      unavailable: true,
      reason: 'subgraph_and_rpc_unavailable',
    });
  });
});
