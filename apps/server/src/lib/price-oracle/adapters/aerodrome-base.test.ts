const mockGetBlock = jest.fn();
const mockGetBlockNumber = jest.fn();
const mockGetReserves = jest.fn();

jest.mock('ethers', () => {
  class JsonRpcProvider {
    getBlock(tag: number | 'latest') {
      return mockGetBlock(tag);
    }

    getBlockNumber() {
      return mockGetBlockNumber();
    }
  }

  class Contract {
    address: string;

    constructor(address: string) {
      this.address = address;
    }

    getReserves(options?: { blockTag?: number }) {
      return mockGetReserves(this.address, options);
    }
  }

  return {
    Contract,
    JsonRpcProvider,
  };
});

describe('aerodromeBaseOracleAdapter', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetBlock.mockReset();
    mockGetBlockNumber.mockReset();
    mockGetReserves.mockReset();
  });

  it('timestamps GHST historical TWAP samples using the sampled block time', async () => {
    const atMs = Date.parse('2026-02-28T07:49:00.000Z');
    const latestBlockMs = atMs + 60_000;
    const latestBlockNumber = 1_000;
    const expectedBlockTag = 970;
    const staleReserveTimestampSec = Math.floor(
      Date.parse('2026-02-28T03:17:29.000Z') / 1000
    );

    mockGetBlock.mockImplementation((tag: number | 'latest') => {
      if (tag === 'latest') {
        return Promise.resolve({
          number: latestBlockNumber,
          timestamp: Math.floor(latestBlockMs / 1000),
        });
      }
      if (tag === expectedBlockTag) {
        return Promise.resolve({
          number: expectedBlockTag,
          timestamp: Math.floor(atMs / 1000),
        });
      }
      throw new Error(`unexpected block lookup: ${String(tag)}`);
    });

    mockGetReserves.mockResolvedValue([
      91_274n,
      1_000_000_000_000_000_000n,
      staleReserveTimestampSec,
    ]);

    const { aerodromeBaseOracleAdapter } = require('./aerodrome-base');

    const quote = await aerodromeBaseOracleAdapter.sampleTwapUsd('GHST', {
      atMs,
      windowMs: 60_000,
    });

    expect(mockGetReserves).toHaveBeenCalledWith(
      '0x8263c80ba82ffb3506eb731dca78546244ce2fc6',
      { blockTag: expectedBlockTag }
    );
    expect(quote.sampledAtMs).toBe(atMs);
    expect(quote.meta).toEqual(
      expect.objectContaining({
        atMs,
        sampledBlockTags: [expectedBlockTag],
        samplesUsed: 1,
      })
    );
  });
});
