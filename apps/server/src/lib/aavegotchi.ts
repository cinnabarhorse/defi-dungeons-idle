import { gql, request } from 'graphql-request';
import { charactersRepo } from '../lib/db';
import {
  itemTypes,
  slugifyWearableName,
  type WearableSlot,
} from '../data/wearables';
import {
  setGotchiWearableAssignments,
  setGotchiWearables as setGotchiWearablesCache,
} from '../data/characters';

export interface RawAavegotchi {
  id: string;
  name?: string;
  collateral: string;
  eyeShape: number;
  eyeColor: number;
  equippedWearables: string[];
  // Optional owner; present in some queries
  owner?: { id: string };
}

const CACHE_TTL_MS = 5 * 60 * 1000;

// Map the Aavegotchi equippedWearables array indices to our slot model
// Assumption (stable in subgraph):
// 0: body, 1: face, 2: eyes, 3: head, 4: left hand, 5: right hand, 6: pet, 7: background
const SLOT_BY_INDEX: Record<number, WearableSlot> = {
  0: 'body',
  1: 'face',
  2: 'eyes',
  3: 'head',
  4: 'handLeft',
  5: 'handRight',
  6: 'pet',
  7: 'background',
};

function resolveAllowedSlots(
  slotPositions: string | string[] | undefined
): string[] {
  if (Array.isArray(slotPositions)) {
    return slotPositions;
  }
  if (typeof slotPositions === 'string') {
    if (slotPositions === 'hands') {
      return ['handLeft', 'handRight'];
    }
    return [slotPositions];
  }
  return [];
}

export function toWearableSlugsFromSvgIds(svgIds: string[]): string[] {
  // Convert numeric strings to numbers and map via wearables table
  try {
    const slugs: string[] = [];
    const numeric = Array.isArray(svgIds)
      ? svgIds.map((s) => Number(s)).map((n) => (Number.isFinite(n) ? n : 0))
      : [];
    for (let i = 0; i < numeric.length; i++) {
      const id = numeric[i];
      if (!id || id <= 0) continue;
      const slot = SLOT_BY_INDEX[i];
      if (!slot) continue;
      const itemType = itemTypes[id];
      if (!itemType) continue;
      const allowedSlots = resolveAllowedSlots(itemType.slotPositions);
      if (!allowedSlots.includes(slot)) continue;
      const slug = slugifyWearableName(itemType.name);
      if (slug) slugs.push(slug);
    }
    return slugs;
  } catch {
    console.log('error converting svgIds to slugs', svgIds);
    return [];
  }
}

export function toWearableAssignmentsFromSvgIds(
  svgIds: string[]
): Array<{ slot: WearableSlot; slug: string }> {
  const result: Array<{ slot: WearableSlot; slug: string }> = [];
  const numeric = Array.isArray(svgIds)
    ? svgIds.map((s) => Number(s)).map((n) => (Number.isFinite(n) ? n : 0))
    : [];
  for (let i = 0; i < numeric.length; i++) {
    const id = numeric[i];
    if (!id || id <= 0) continue;
    const slot = SLOT_BY_INDEX[i];
    if (!slot) continue;
    const def = itemTypes[id];
    if (!def) continue;
    const slug = slugifyWearableName(def.name);
    if (!slug) continue;
    
    // Handle slotPositions: expand 'hands' to ['handLeft', 'handRight']
    const allowedSlots = resolveAllowedSlots(def.slotPositions);
    if (!allowedSlots.includes(slot)) continue;

    result.push({ slot, slug });
  }
  return result;
}

export interface FetchOptions {
  endpoint?: string;
  pageSize?: number;
}

type QueryFactory = (skip: number) => string;

const DEFAULT_PAGE_SIZE = 1000;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_SUBGRAPH_CORE_BASE =
  'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';
const EVM_ADDRESS_REGEX = /^0x[a-f0-9]{40}$/;
const GOTCHI_ID_REGEX = /^\d{1,32}$/;

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function getEndpointOverride(options?: FetchOptions) {
  return (
    firstNonEmpty(
      options?.endpoint,
      process.env.SUBGRAPH_CORE_BASE,
      process.env.SUBGRAPH_CORE
    ) ?? DEFAULT_SUBGRAPH_CORE_BASE
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? 'unknown');
}

function normalizeOwnerAddress(address: string): string | null {
  const normalized = normalizeAddress(address);
  if (!EVM_ADDRESS_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeGotchiId(gotchiId: string): string | null {
  const normalized = String(gotchiId ?? '').trim();
  if (!GOTCHI_ID_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
}

async function requestWithEndpointFallback<T>(
  endpoint: string,
  query: string
): Promise<T> {
  try {
    return await request<T>(endpoint, query);
  } catch (primaryError) {
    if (endpoint === DEFAULT_SUBGRAPH_CORE_BASE) {
      throw primaryError;
    }

    console.warn(
      '[aavegotchi] Primary subgraph request failed, retrying default endpoint',
      {
        endpoint,
        fallbackEndpoint: DEFAULT_SUBGRAPH_CORE_BASE,
        error: errorMessage(primaryError),
      }
    );

    return request<T>(DEFAULT_SUBGRAPH_CORE_BASE, query);
  }
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
        name
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
        name
        collateral
        eyeShape
        eyeColor
        equippedWearables
      }
    }
  `;
}

function createAavegotchisByOwnerAtBlockQuery(
  skip: number,
  pageSize: number,
  ownerAddress: string,
  blockNumber: number
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
        block: { number: ${Math.floor(blockNumber)} }
      ) {
        id
        name
        collateral
        eyeShape
        eyeColor
        equippedWearables
      }
    }
  `;
}

function createAavegotchiByIdQuery(gotchiId: string) {
  return gql`
    {
      aavegotchis(
        first: 1
        where: { id: "${gotchiId}", collateral_not: "${NULL_ADDRESS}" }
      ) {
        id
        name
        collateral
        eyeShape
        eyeColor
        equippedWearables
        owner { id }
      }
    }
  `;
}

function createAavegotchiByIdAtBlockQuery(gotchiId: string, blockNumber: number) {
  return gql`
    {
      aavegotchis(
        first: 1
        where: { id: "${gotchiId}", collateral_not: "${NULL_ADDRESS}" }
        block: { number: ${Math.floor(blockNumber)} }
      ) {
        id
        name
        collateral
        eyeShape
        eyeColor
        equippedWearables
        owner { id }
      }
    }
  `;
}

function createOwnerHasAnyGotchiAtBlockQuery(
  ownerAddress: string,
  blockNumber: number
) {
  return gql`
    {
      aavegotchis(
        first: 1
        where: {
          owner_: { id: "${ownerAddress}" }
          collateral_not: "${NULL_ADDRESS}"
        }
        block: { number: ${Math.floor(blockNumber)} }
      ) {
        id
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
    // Log which envs are present to help debug configuration
    console.error('[aavegotchi] Missing subgraph endpoint. Env present:', {
      has_SUBGRAPH_CORE_BASE: Boolean(process.env.SUBGRAPH_CORE_BASE),
      has_SUBGRAPH_CORE: Boolean(process.env.SUBGRAPH_CORE),
    });
    throw new Error(
      'Subgraph endpoint not configured. Set SUBGRAPH_CORE_BASE (or SUBGRAPH_CORE).'
    );
  }

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;

  let skip = 0;
  const results: RawAavegotchi[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = factory(skip);
    const response = await requestWithEndpointFallback<{
      aavegotchis: RawAavegotchi[];
    }>(
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

export async function fetchAavegotchiById(
  gotchiId: string,
  options?: FetchOptions
): Promise<RawAavegotchi | null> {
  const endpoint = getEndpointOverride(options);
  if (!endpoint) {
    console.error('[aavegotchi] Missing subgraph endpoint for by-id fetch.');
    return null;
  }
  const query = createAavegotchiByIdQuery(gotchiId);
  try {
    const response = await requestWithEndpointFallback<{
      aavegotchis: RawAavegotchi[];
    }>(
      endpoint,
      query
    );
    const match = (response.aavegotchis ?? [])[0];
    return match ?? null;
  } catch (error) {
    console.warn('[aavegotchi] by-id fetch failed', { gotchiId, error });
    return null;
  }
}

export async function fetchAavegotchiByIdAtBlock(
  gotchiId: string,
  blockNumber: number,
  options?: FetchOptions
): Promise<RawAavegotchi | null> {
  const endpoint = getEndpointOverride(options);
  if (!endpoint) {
    console.error('[aavegotchi] Missing subgraph endpoint for by-id-at-block fetch.');
    return null;
  }
  const normalizedBlock = Math.floor(Number(blockNumber));
  if (!Number.isFinite(normalizedBlock) || normalizedBlock <= 0) {
    return null;
  }
  const query = createAavegotchiByIdAtBlockQuery(gotchiId, normalizedBlock);
  try {
    const response = await requestWithEndpointFallback<{
      aavegotchis: RawAavegotchi[];
    }>(
      endpoint,
      query
    );
    const match = (response.aavegotchis ?? [])[0];
    return match ?? null;
  } catch (error) {
    console.warn('[aavegotchi] by-id-at-block fetch failed', {
      gotchiId,
      blockNumber: normalizedBlock,
      error,
    });
    return null;
  }
}

export function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

export async function fetchAllAavegotchis(options?: FetchOptions) {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  return fetchPaged(
    (skip) => createAllAavegotchisQuery(skip, pageSize),
    options
  );
}

async function upsertOwnerCharacters(
  ownerAddress: string,
  gotchis: RawAavegotchi[]
) {
  if (gotchis.length === 0) return;
  const nowIso = new Date().toISOString();
  await charactersRepo.upsertCharacters(
    gotchis.map((gotchi) => ({
      gotchiId: String(gotchi.id),
      ownerAddress,
      wearableSlugs: toWearableSlugsFromSvgIds(gotchi.equippedWearables || []),
      lastSyncedAt: nowIso,
    }))
  );
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
  const result = await fetchPaged(
    (skip) => createAavegotchisByOwnerQuery(skip, pageSize, normalized),
    options
  );

  try {
    await upsertOwnerCharacters(normalized, result);
  } catch (error) {
    console.warn('Failed to cache Aavegotchi characters', {
      owner: normalized,
      error,
    });
  }

  return result;
}

export async function fetchAavegotchisOfOwnerAtBlock(
  address: string,
  blockNumber: number,
  options?: FetchOptions
) {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return [];
  }
  const normalizedBlock = Math.floor(Number(blockNumber));
  if (!Number.isFinite(normalizedBlock) || normalizedBlock <= 0) {
    return [];
  }
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const result = await fetchPaged(
    (skip) =>
      createAavegotchisByOwnerAtBlockQuery(
        skip,
        pageSize,
        normalized,
        normalizedBlock
      ),
    options
  );

  try {
    await upsertOwnerCharacters(normalized, result);
  } catch (error) {
    console.warn('Failed to cache Aavegotchi characters', {
      owner: normalized,
      error,
    });
  }

  return result;
}

export async function listCachedAavegotchis(ownerAddress: string) {
  const normalized = normalizeAddress(ownerAddress);
  if (!normalized) return [];
  return charactersRepo.listByOwner(normalized);
}

export async function getWearableSlugsForGotchi(
  ownerAddress: string,
  gotchiId: string,
  options?: { maxAgeMs?: number }
): Promise<string[]> {
  const normalizedOwner = normalizeAddress(ownerAddress);
  const normalizedGotchi = String(gotchiId);
  if (!normalizedOwner || !normalizedGotchi) {
    return [];
  }

  const maxAge = options?.maxAgeMs ?? CACHE_TTL_MS;
  const now = Date.now();

  // Fast path: if we have a fresh DB cache for this owner+gotchi, avoid hitting the subgraph.
  try {
    const cached = await charactersRepo.getByGotchiId(normalizedGotchi);
    if (cached && cached.ownerAddress === normalizedOwner && cached.lastSyncedAt) {
      const cachedAt = new Date(cached.lastSyncedAt).getTime();
      const ageMs = now - cachedAt;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAge) {
        return cached.wearableSlugs || [];
      }
    }
  } catch {
    // Cache is best-effort; proceed to network fetch.
  }

  const fetched = await fetchAavegotchisOfOwner(normalizedOwner, {
    endpoint:
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn',
  });

  let match = fetched.find((raw) => String(raw.id) === normalizedGotchi);

  // If not found under the requesting owner, fall back to by-id fetch
  if (!match) {
    const byId = await fetchAavegotchiById(normalizedGotchi);
    if (byId) {
      match = byId;
    }
  }

  if (!match) {
    const record = await charactersRepo.getByGotchiId(normalizedGotchi);
    return record ? record.wearableSlugs : [];
  }

  const slugs = toWearableSlugsFromSvgIds(match.equippedWearables || []);
  try {
    const assignments = toWearableAssignmentsFromSvgIds(
      match.equippedWearables || []
    );
    setGotchiWearablesCache(normalizedGotchi, slugs);
    if (assignments.length > 0) {
      setGotchiWearableAssignments(normalizedGotchi, assignments);
    }
    // Best-effort: cache to DB with owner from subgraph when available
    if ((match as any).owner?.id) {
      try {
        await charactersRepo.upsertCharacters([
          {
            gotchiId: normalizedGotchi,
            ownerAddress: (match as any).owner.id,
            wearableSlugs: slugs,
            lastSyncedAt: new Date().toISOString(),
          },
        ]);
      } catch {
        // Ignore cache errors, continue without caching
      }
    }
  } catch {
    // Ignore errors in fetching/caching, return empty slugs
  }
  return slugs;
}

export async function getWearableAssignmentsForGotchi(
  ownerAddress: string,
  gotchiId: string
): Promise<Array<{ slot: WearableSlot; slug: string }>> {
  const normalizedOwner = normalizeAddress(ownerAddress);
  const normalizedGotchi = String(gotchiId);
  if (!normalizedOwner || !normalizedGotchi) return [];
  const fetched = await fetchAavegotchisOfOwner(normalizedOwner, {
    endpoint:
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn',
  });
  let match = fetched.find((raw) => String(raw.id) === normalizedGotchi);
  if (!match) {
    const byId = await fetchAavegotchiById(normalizedGotchi);
    if (byId) {
      match = byId;
    }
  }
  if (match) {
    const assignments = toWearableAssignmentsFromSvgIds(
      match.equippedWearables || []
    );
    // Opportunistically cache
    try {
      setGotchiWearableAssignments(normalizedGotchi, assignments);
      setGotchiWearablesCache(
        normalizedGotchi,
        toWearableSlugsFromSvgIds(match.equippedWearables || [])
      );
    } catch {
      // Ignore cache errors, continue without caching
    }
    return assignments;
  }
  const record = await charactersRepo.getByGotchiId(normalizedGotchi);
  if (record && record.ownerAddress === normalizedOwner) {
    // Best effort from cached slugs; we cannot reconstruct exact hands, so fallback to left->right order
    const fallbacks = (record.wearableSlugs || []).slice(0, 8);
    const mapped: Array<{ slot: WearableSlot; slug: string }> = [];
    const slotOrder: WearableSlot[] = [
      'body',
      'face',
      'eyes',
      'head',
      'handLeft',
      'handRight',
      'pet',
      'background',
    ];
    for (let i = 0; i < fallbacks.length && i < slotOrder.length; i++) {
      const slug = fallbacks[i];
      if (slug) mapped.push({ slot: slotOrder[i], slug });
    }
    return mapped;
  }
  return [];
}

/**
 * Verify that a gotchi is owned by the provided wallet address.
 * Returns ownership boolean along with derived wearable slugs and slot assignments.
 * Slugs/assignments may be empty for naked gotchis; that should not invalidate ownership.
 */
export async function verifyGotchiOwnership(
  ownerAddress: string,
  gotchiId: string
): Promise<{
  owned: boolean;
  slugs: string[];
  assignments: Array<{ slot: WearableSlot; slug: string }>;
}> {
  const normalizedOwner = normalizeAddress(ownerAddress);
  const normalizedGotchi = String(gotchiId);
  if (!normalizedOwner || !normalizedGotchi) {
    return { owned: false, slugs: [], assignments: [] };
  }

  // First try listing by owner (fast path and authoritative for ownership)
  const fetched = await fetchAavegotchisOfOwner(normalizedOwner, {
    endpoint:
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn',
  });
  let match = fetched.find((raw) => String(raw.id) === normalizedGotchi);
  let owned = Boolean(match);

  // If not found, fetch by id and compare owner explicitly
  if (!match) {
    const byId = await fetchAavegotchiById(normalizedGotchi);
    if (byId) {
      match = byId;
      owned = (byId.owner?.id?.toLowerCase() ?? '') === normalizedOwner;
    }
  }

  const slugs = match
    ? toWearableSlugsFromSvgIds(match.equippedWearables || [])
    : [];
  const assignments = match
    ? toWearableAssignmentsFromSvgIds(match.equippedWearables || [])
    : [];

  // Best-effort cache updates (do not throw)
  try {
    setGotchiWearablesCache(normalizedGotchi, slugs);
    if (assignments.length > 0) {
      setGotchiWearableAssignments(normalizedGotchi, assignments);
    }
    if ((match as any)?.owner?.id) {
      try {
        await charactersRepo.upsertCharacters([
          {
            gotchiId: normalizedGotchi,
            ownerAddress: (match as any).owner.id,
            wearableSlugs: slugs,
            lastSyncedAt: new Date().toISOString(),
          },
        ]);
      } catch {
        // Ignore character upsert failures; cache population is best-effort.
      }
    }
  } catch {
    // Ignore cache update failures; upstream caller handles fallbacks.
  }

  return { owned, slugs, assignments };
}

export async function verifyGotchiOwnershipAtBlock(
  ownerAddress: string,
  gotchiId: string,
  blockNumber: number
): Promise<{
  owned: boolean;
  slugs: string[];
  assignments: Array<{ slot: WearableSlot; slug: string }>;
}> {
  const normalizedOwner = normalizeOwnerAddress(ownerAddress);
  const normalizedGotchi = normalizeGotchiId(gotchiId);
  const normalizedBlock = Math.floor(Number(blockNumber));
  if (
    !normalizedOwner ||
    !normalizedGotchi ||
    !Number.isFinite(normalizedBlock) ||
    normalizedBlock <= 0
  ) {
    return { owned: false, slugs: [], assignments: [] };
  }

  const fetched = await fetchAavegotchisOfOwnerAtBlock(
    normalizedOwner,
    normalizedBlock
  );
  let match = fetched.find((raw) => String(raw.id) === normalizedGotchi);
  let owned = Boolean(match);

  if (!match) {
    const byId = await fetchAavegotchiByIdAtBlock(normalizedGotchi, normalizedBlock);
    if (byId) {
      match = byId;
      owned = (byId.owner?.id?.toLowerCase() ?? '') === normalizedOwner;
    }
  }

  const slugs = match
    ? toWearableSlugsFromSvgIds(match.equippedWearables || [])
    : [];
  const assignments = match
    ? toWearableAssignmentsFromSvgIds(match.equippedWearables || [])
    : [];

  try {
    setGotchiWearablesCache(normalizedGotchi, slugs);
    if (assignments.length > 0) {
      setGotchiWearableAssignments(normalizedGotchi, assignments);
    }
  } catch {
    // Ignore cache update failures.
  }

  return { owned, slugs, assignments };
}

export async function hasAnyGotchiAtBlock(
  ownerAddress: string,
  blockNumber: number,
  options?: FetchOptions
): Promise<boolean> {
  const normalizedOwner = normalizeOwnerAddress(ownerAddress);
  const normalizedBlock = Math.floor(Number(blockNumber));
  const endpoint = getEndpointOverride(options);
  if (!normalizedOwner || !endpoint) {
    return false;
  }
  if (!Number.isFinite(normalizedBlock) || normalizedBlock <= 0) {
    return false;
  }

  const query = createOwnerHasAnyGotchiAtBlockQuery(
    normalizedOwner,
    normalizedBlock
  );
  const response = await requestWithEndpointFallback<{
    aavegotchis: Array<{ id: string }>;
  }>(endpoint, query);
  return (response.aavegotchis ?? []).length > 0;
}
