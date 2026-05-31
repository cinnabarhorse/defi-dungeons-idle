import { gql, request } from 'graphql-request';

export interface RawAavegotchi {
  id: string;
  collateral: string;
  eyeShape: number;
  eyeColor: number;
  equippedWearables: string[];
}

export interface FetchOptions {
  endpoint?: string;
  pageSize?: number;
}

type QueryFactory = (skip: number) => string;

const DEFAULT_PAGE_SIZE = 1000;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

function getEndpointOverride(options?: FetchOptions) {
  return options?.endpoint ?? process.env.SUBGRAPH_CORE_BASE ?? process.env.SUBGRAPH_CORE ?? 'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';
}

function createAllAavegotchisQuery(skip: number, pageSize: number) {
  return gql`
    {
      aavegotchis(
        first: ${pageSize}
        skip: ${skip}
        orderBy: gotchiId
        orderDirection: asc
        where: { collateral_not: "${NULL_ADDRESS}" }
      ) {
        id
        collateral
        eyeShape
        eyeColor
        equippedWearables
      }
    }
  `;
}

function createAavegotchisByOwnerQuery(
  skip: number,
  pageSize: number,
  ownerAddress: string
) {
  return gql`
    {
      aavegotchis(
        first: ${pageSize}
        skip: ${skip}
        orderBy: gotchiId
        orderDirection: asc
        where: {
          owner_: { id: "${ownerAddress}" }
          collateral_not: "${NULL_ADDRESS}"
        }
      ) {
        id
        collateral
        eyeShape
        eyeColor
        equippedWearables
      }
    }
  `;
}

async function fetchPaged(
  factory: QueryFactory,
  options?: FetchOptions
): Promise<RawAavegotchi[]> {
  const endpoint = getEndpointOverride(options);

  if (!endpoint) {
    throw new Error('SUBGRAPH_CORE_BASE endpoint is not configured.');
  }

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  let skip = 0;
  const results: RawAavegotchi[] = [];

  while (true) {
    const query = factory(skip);
    const response = await request<{ aavegotchis: RawAavegotchi[] }>(
      endpoint,
      query
    );

    const page = response.aavegotchis ?? [];
    if (page.length === 0) {
      break;
    }

    results.push(...page);

    if (page.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return results;
}

export function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

export async function fetchAllAavegotchis(options?: FetchOptions) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  return fetchPaged((skip) => createAllAavegotchisQuery(skip, pageSize), options);
}

export async function fetchAavegotchisOfOwner(
  address: string,
  options?: FetchOptions
) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return [];
  }

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  return fetchPaged(
    (skip) => createAavegotchisByOwnerQuery(skip, pageSize, normalized),
    options
  );
}

