import { Contract, JsonRpcProvider } from 'ethers';
import type { TradeToken } from '../../trading-game';
import type {
  OracleAdapter,
  OracleAdapterQuote,
  OracleSampleOptions,
} from '../types';

const BASE_CHAIN_ID = 8453;
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const BASE_BLOCK_TIME_MS = 2_000;

const TOKEN_DECIMALS = {
  USDC: 6,
  WETH: 18,
  GHST: 18,
  CBBTC: 8,
} as const;

// Source: Aerodrome (Base) pools listed on GeckoTerminal.
const AERODROME_POOLS = {
  WETH_USDC_VOLATILE: '0xcdac0d6c6c59727a65f871236188350531885c43',
  WETH_USDC_STABLE: '0x3548029694fbb241d45fb24ba0cd9c9d4e745f16',
  CBBTC_USDC: '0x9c38b55f9a9aba91bbcedeb12bf4428f47a6a0b8',
  GHST_USDC: '0x8263c80ba82ffb3506eb731dca78546244ce2fc6',
  GHST_WETH: '0x0dfb9cb66a18468850d6216fcc691aa20ad1e091',
} as const;

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

type PairKey = keyof typeof AERODROME_POOLS;
type TokenKey = keyof typeof TOKEN_DECIMALS;

interface PairRuntime {
  address: string;
  contract: Contract;
}

interface PairPriceSample {
  price: number;
  sampledAtMs: number;
}

let provider: JsonRpcProvider | null = null;
const pairRuntimeCache = new Map<PairKey, Promise<PairRuntime>>();

const AERODROME_PAIR_LAYOUT: Record<
  PairKey,
  { token0: TokenKey; token1: TokenKey }
> = {
  WETH_USDC_VOLATILE: { token0: 'WETH', token1: 'USDC' },
  WETH_USDC_STABLE: { token0: 'WETH', token1: 'USDC' },
  CBBTC_USDC: { token0: 'USDC', token1: 'CBBTC' },
  GHST_USDC: { token0: 'USDC', token1: 'GHST' },
  GHST_WETH: { token0: 'WETH', token1: 'GHST' },
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withReadRetries<T>(
  label: string,
  operation: () => Promise<T>,
  maxAttempts: number = 6
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(75 * attempt);
    }
  }
  throw new Error(
    `${label} failed after ${maxAttempts} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function getProvider(): JsonRpcProvider {
  if (provider) {
    return provider;
  }
  provider = new JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID);
  return provider;
}

function estimateBlockTag(
  targetMs: number,
  latestBlockNumber: number,
  latestBlockMs: number
): number {
  const safeTargetMs = Math.max(0, Math.floor(targetMs || 0));
  if (safeTargetMs >= latestBlockMs) {
    return latestBlockNumber;
  }
  const blocksAgo = Math.max(
    0,
    Math.round((latestBlockMs - safeTargetMs) / BASE_BLOCK_TIME_MS)
  );
  return Math.max(1, latestBlockNumber - blocksAgo);
}

async function getPairRuntime(pairKey: PairKey): Promise<PairRuntime> {
  const cached = pairRuntimeCache.get(pairKey);
  if (cached) {
    return cached;
  }

  const runtimePromise = (async () => {
    const address = AERODROME_POOLS[pairKey];
    const contract = new Contract(address, PAIR_ABI, getProvider());
    return {
      address,
      contract,
    };
  })();

  pairRuntimeCache.set(pairKey, runtimePromise);
  runtimePromise.catch(() => {
    pairRuntimeCache.delete(pairKey);
  });
  return runtimePromise;
}

function parsePositiveAmount(value: bigint, decimals: number): number {
  const scaled = Number(value) / 10 ** decimals;
  if (!Number.isFinite(scaled) || scaled <= 0) {
    return 0;
  }
  return scaled;
}

async function samplePairPriceAtBlock(options: {
  pairKey: PairKey;
  baseToken: TokenKey;
  quoteToken: TokenKey;
  blockTag?: number;
}): Promise<PairPriceSample> {
  const runtime = await getPairRuntime(options.pairKey);
  const layout = AERODROME_PAIR_LAYOUT[options.pairKey];
  const layoutTokens = [layout.token0, layout.token1];
  if (
    !(
      layoutTokens.includes(options.baseToken) &&
      layoutTokens.includes(options.quoteToken)
    )
  ) {
    throw new Error(`Aerodrome layout mismatch for ${options.pairKey}`);
  }

  const blockTag = options.blockTag ?? (await getProvider().getBlockNumber());
  const reserveResult = await withReadRetries(`${options.pairKey}.getReserves`, () =>
    runtime.contract.getReserves({ blockTag })
  );

  const reserve0 = BigInt(reserveResult[0] ?? 0n);
  const reserve1 = BigInt(reserveResult[1] ?? 0n);
  const blockTimestampLast = Number(reserveResult[2] ?? 0n);

  const baseIsToken0 = layout.token0 === options.baseToken;
  const baseReserveRaw = baseIsToken0 ? reserve0 : reserve1;
  const quoteReserveRaw = baseIsToken0 ? reserve1 : reserve0;

  const baseReserve = parsePositiveAmount(
    baseReserveRaw,
    TOKEN_DECIMALS[options.baseToken]
  );
  const quoteReserve = parsePositiveAmount(
    quoteReserveRaw,
    TOKEN_DECIMALS[options.quoteToken]
  );
  if (baseReserve <= 0 || quoteReserve <= 0) {
    throw new Error(`Aerodrome reserves invalid for ${options.pairKey}`);
  }

  return {
    price: quoteReserve / baseReserve,
    sampledAtMs:
      Number.isFinite(blockTimestampLast) && blockTimestampLast > 0
        ? blockTimestampLast * 1000
        : Date.now(),
  };
}

async function sampleWethUsdAtBlock(blockTag?: number): Promise<{
  sample: PairPriceSample;
  pools: string[];
}> {
  const wethUsdPairKeys: PairKey[] = ['WETH_USDC_VOLATILE', 'WETH_USDC_STABLE'];
  const wethUsdErrors: string[] = [];
  for (const pairKey of wethUsdPairKeys) {
    try {
      const sample = await samplePairPriceAtBlock({
        pairKey,
        baseToken: 'WETH',
        quoteToken: 'USDC',
        blockTag,
      });
      return {
        sample,
        pools: [AERODROME_POOLS[pairKey]],
      };
    } catch (error) {
      wethUsdErrors.push(
        `${pairKey}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  throw new Error(
    `No WETH/USDC Aerodrome pool quote available (${wethUsdErrors.join(
      ' | '
    )})`
  );
}

async function sampleTokenUsdAtBlock(
  token: TradeToken,
  blockTag?: number,
  blockTimestampMs?: number
): Promise<{ priceUsd: number; sampledAtMs: number; pools: string[] }> {
  if (token === 'ETH') {
    const wethUsd = await sampleWethUsdAtBlock(blockTag);
    return {
      priceUsd: wethUsd.sample.price,
      sampledAtMs: blockTimestampMs ?? wethUsd.sample.sampledAtMs,
      pools: wethUsd.pools,
    };
  }

  if (token === 'BTC') {
    const sample = await samplePairPriceAtBlock({
      pairKey: 'CBBTC_USDC',
      baseToken: 'CBBTC',
      quoteToken: 'USDC',
      blockTag,
    });
    return {
      priceUsd: sample.price,
      sampledAtMs: blockTimestampMs ?? sample.sampledAtMs,
      pools: [AERODROME_POOLS.CBBTC_USDC],
    };
  }

  if (token === 'GHST') {
    const ghstErrors: string[] = [];
    try {
      const ghstUsdc = await samplePairPriceAtBlock({
        pairKey: 'GHST_USDC',
        baseToken: 'GHST',
        quoteToken: 'USDC',
        blockTag,
      });
      return {
        priceUsd: ghstUsdc.price,
        sampledAtMs: blockTimestampMs ?? ghstUsdc.sampledAtMs,
        pools: [AERODROME_POOLS.GHST_USDC],
      };
    } catch (error) {
      ghstErrors.push(
        `GHST_USDC: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      const [ghstWeth, wethUsd] = await Promise.all([
        samplePairPriceAtBlock({
          pairKey: 'GHST_WETH',
          baseToken: 'GHST',
          quoteToken: 'WETH',
          blockTag,
        }),
        sampleWethUsdAtBlock(blockTag),
      ]);
      return {
        priceUsd: ghstWeth.price * wethUsd.sample.price,
        sampledAtMs:
          blockTimestampMs ??
          Math.min(ghstWeth.sampledAtMs, wethUsd.sample.sampledAtMs),
        pools: [AERODROME_POOLS.GHST_WETH, ...wethUsd.pools],
      };
    } catch (error) {
      ghstErrors.push(
        `GHST_WETH_ROUTE: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    throw new Error(
      `No GHST Aerodrome price route available (${ghstErrors.join(' | ')})`
    );
  }

  throw new Error(`Unsupported token for Aerodrome adapter: ${token}`);
}

async function getSpotQuote(token: TradeToken): Promise<OracleAdapterQuote> {
  const latestBlock = await withReadRetries('latestBlock', () =>
    getProvider().getBlock('latest')
  );
  if (!latestBlock) {
    throw new Error('Base latest block unavailable');
  }
  const latestBlockNumber = Number(latestBlock.number);
  const latestBlockMs = Number(latestBlock.timestamp) * 1000;
  const sample = await sampleTokenUsdAtBlock(
    token,
    latestBlockNumber,
    latestBlockMs
  );
  return {
    priceUsd: sample.priceUsd,
    sampledAtMs: sample.sampledAtMs,
    ticks: 1,
    meta: {
      endpoint: 'base_rpc_reserves',
      chainId: BASE_CHAIN_ID,
      rpcUrl: BASE_RPC_URL,
      pools: sample.pools,
    },
  };
}

async function getTwapQuote(
  token: TradeToken,
  options: OracleSampleOptions
): Promise<OracleAdapterQuote> {
  const atMs = Math.floor(options.atMs ?? Date.now());
  const windowMs = Math.max(60_000, Math.floor(options.windowMs ?? 60_000));

  const latestBlock = await getProvider().getBlock('latest');
  if (!latestBlock) {
    throw new Error('Base latest block unavailable');
  }
  const latestBlockMs = Number(latestBlock.timestamp) * 1000;
  const latestBlockNumber = Number(latestBlock.number);

  const sampleOffsets =
    token === 'ETH' || token === 'GHST'
      ? [0]
      : [windowMs, Math.floor(windowMs / 2), 0];
  const blockTags = Array.from(
    new Set(
      sampleOffsets.map((offsetMs) =>
        estimateBlockTag(atMs - offsetMs, latestBlockNumber, latestBlockMs)
      )
    )
  );

  const pointSamples: Array<{ priceUsd: number; sampledAtMs: number }> = [];
  for (const blockTag of blockTags) {
    try {
      let sampledBlockMs: number | undefined;
      if (blockTag === latestBlockNumber) {
        sampledBlockMs = latestBlockMs;
      } else {
        try {
          const historicalBlock = await withReadRetries(`block.${blockTag}`, () =>
            getProvider().getBlock(blockTag)
          );
          const historicalBlockMs = Number(historicalBlock?.timestamp) * 1000;
          if (Number.isFinite(historicalBlockMs) && historicalBlockMs > 0) {
            sampledBlockMs = historicalBlockMs;
          }
        } catch {
          // Fall back to reserve timestamps when historical block lookup fails.
        }
      }

      const sample = await sampleTokenUsdAtBlock(
        token,
        blockTag,
        sampledBlockMs
      );
      pointSamples.push({
        priceUsd: sample.priceUsd,
        sampledAtMs: sample.sampledAtMs,
      });
    } catch {
      // Skip failed historical sample points and continue.
    }
  }

  if (pointSamples.length === 0) {
    const fallbackSpot = await sampleTokenUsdAtBlock(token);
    pointSamples.push({
      priceUsd: fallbackSpot.priceUsd,
      sampledAtMs: fallbackSpot.sampledAtMs,
    });
  }

  const priceUsd =
    pointSamples.reduce((sum, sample) => sum + sample.priceUsd, 0) /
    pointSamples.length;
  const sampledAtMs =
    pointSamples.reduce((sum, sample) => sum + sample.sampledAtMs, 0) /
    pointSamples.length;

  return {
    priceUsd,
    sampledAtMs: Math.round(sampledAtMs),
    ticks: pointSamples.length,
    meta: {
      endpoint: 'base_rpc_reserves_twap',
      chainId: BASE_CHAIN_ID,
      rpcUrl: BASE_RPC_URL,
      atMs,
      windowMs,
      sampledBlockTags: blockTags,
      samplesUsed: pointSamples.length,
      poolsUsed:
        token === 'GHST'
          ? [
              AERODROME_POOLS.GHST_USDC,
              AERODROME_POOLS.GHST_WETH,
              AERODROME_POOLS.WETH_USDC_VOLATILE,
              AERODROME_POOLS.WETH_USDC_STABLE,
            ]
          : (
              [
                token === 'BTC'
                  ? AERODROME_POOLS.CBBTC_USDC
                  : AERODROME_POOLS.WETH_USDC_VOLATILE,
                token === 'ETH' ? AERODROME_POOLS.WETH_USDC_STABLE : null,
              ] as Array<string | null>
            ).filter((pool): pool is string => Boolean(pool)),
    },
  };
}

export const aerodromeBaseOracleAdapter: OracleAdapter = {
  id: 'aerodrome_base',
  async getSpotUsd(token: TradeToken): Promise<OracleAdapterQuote> {
    return getSpotQuote(token);
  },
  async sampleTwapUsd(
    token: TradeToken,
    options: OracleSampleOptions
  ): Promise<OracleAdapterQuote> {
    return getTwapQuote(token, options);
  },
};
