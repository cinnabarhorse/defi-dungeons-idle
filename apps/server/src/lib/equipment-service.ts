import { matchMaker } from 'colyseus';
import type { PoolClient } from 'pg';
import {
  runTransaction,
  equipmentRepo,
  inventoryRepo,
  playersRepo,
} from './db';
import type { PlayerInventoryRecord } from './db/types';
import {
  AVAILABLE_CHARACTERS,
  getCharacterStats,
  getCharacterById,
  type CharacterDerivedStats,
} from './character-registry';
import { getWearableBySlug, type WearableDefinition } from '../data/wearables';
import {
  getGotchiWearables,
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../data/characters';
import {
  DEFAULT_QUALITY_TIER,
  isBrokenDurability,
  getQualityScalar,
  normalizeQualityTier,
  type QualityTier,
} from '../data/wearable-quality';
import { fetchAavegotchiById, type RawAavegotchi } from './aavegotchi';
import {
  normalizeForGenerator,
  type GeneratorAttribute,
  type GeneratorGotchi,
} from './gotchi-normalize';
import { generateOne } from './gotchi-sprites';

const EQUIPMENT_RATE_WINDOW_MS = 5_000;
const EQUIPMENT_RATE_LIMIT = 5;

export const EQUIPMENT_SLOTS = [
  'head',
  'body',
  'face',
  'eyes',
  'handLeft',
  'handRight',
  'pet',
  'background',
] as const;

export type EquipmentSlotName = (typeof EQUIPMENT_SLOTS)[number];

const SPRITE_SLOT_ORDER: EquipmentSlotName[] = [
  'body',
  'face',
  'eyes',
  'head',
  'handLeft',
  'handRight',
  'pet',
];

const SPRITE_TRAIT_BY_SLOT: Record<EquipmentSlotName, string | null> = {
  head: 'Wearable (Head)',
  body: 'Wearable (Body)',
  face: 'Wearable (Face)',
  eyes: 'Wearable (Eyes)',
  handLeft: 'Wearable (Hands)',
  handRight: 'Wearable (Hands)',
  pet: 'Wearable (Pet)',
  background: null,
};

const EQUIPMENT_SLOT_SET = new Set<string>(EQUIPMENT_SLOTS);
const WEARABLE_STORAGE_SEPARATOR = '::';

export interface StoredWearableEntry {
  slot: EquipmentSlotName;
  slug: string;
  quality: QualityTier;
  durabilityScore?: number | null;
}

export interface ParsedStoredWearableEntry {
  slot?: EquipmentSlotName | null;
  slug: string;
  quality?: QualityTier | null;
  durabilityScore?: number | null;
}

export function isEquipmentSlotName(
  value: unknown
): value is EquipmentSlotName {
  return typeof value === 'string' && EQUIPMENT_SLOT_SET.has(value);
}

export function serializeStoredWearable(
  entry: StoredWearableEntry
): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    slot: entry.slot,
    slug: entry.slug,
    quality: normalizeQualityTier(entry.quality),
  };
  if (typeof entry.durabilityScore === 'number' && Number.isFinite(entry.durabilityScore)) {
    serialized.durabilityScore = Math.max(
      0,
      Math.floor(entry.durabilityScore)
    );
  }
  return serialized;
}

export function deserializeStoredWearable(
  value: unknown
): ParsedStoredWearableEntry | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parts = trimmed.split(WEARABLE_STORAGE_SEPARATOR);
    if (parts.length >= 2 && isEquipmentSlotName(parts[0])) {
      const slot = parts[0] as EquipmentSlotName;
      const slug = parts[1]?.trim();
      if (!slug) return null;
      const quality =
        parts[2] && parts[2].trim().length
          ? normalizeQualityTier(parts[2])
          : null;
      return {
        slot,
        slug,
        quality,
        durabilityScore: null,
      };
    }
    return {
      slug: trimmed,
      durabilityScore: null,
    };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const rawSlot = record.slot;
    const rawSlug = record.slug;
    const slug =
      typeof rawSlug === 'string' && rawSlug.trim().length
        ? rawSlug.trim()
        : null;
    if (!slug) return null;
    const slot = isEquipmentSlotName(rawSlot)
      ? (rawSlot as EquipmentSlotName)
      : null;
    const quality =
      record.quality != null
        ? normalizeQualityTier(record.quality as any)
        : null;
    const durabilityScore =
      typeof record.durabilityScore === 'number' &&
      Number.isFinite(record.durabilityScore)
        ? Math.max(0, Math.floor(record.durabilityScore))
        : null;
    return {
      slot,
      slug,
      quality,
      durabilityScore,
    };
  }

  return null;
}

export function extractStoredWearableValues(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed.length) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [trimmed];
    }
    return [trimmed];
  }
  return [];
}

export function extractWearableSlugs(raw: unknown): string[] {
  return extractStoredWearableValues(raw)
    .map((value) => deserializeStoredWearable(value))
    .filter((entry): entry is ParsedStoredWearableEntry => Boolean(entry))
    .map((entry) => entry.slug);
}

export function normalizeStoredWearableList(
  raw: unknown,
  fallback: StoredWearableEntry[]
): unknown[] {
  const values = extractStoredWearableValues(raw);
  if (values.length === 0) {
    return fallback.map(serializeStoredWearable);
  }

  const remainingFallback = [...fallback];
  const usedFallbackIndices = new Set<number>();
  const results: unknown[] = [];

  for (const value of values) {
    const parsed = deserializeStoredWearable(value);
    if (!parsed) continue;
    let slot = parsed.slot ?? null;
    let quality = parsed.quality ?? null;
    let durabilityScore = parsed.durabilityScore ?? null;

    if (!slot) {
      const matchIndex = remainingFallback.findIndex(
        (entry, idx) =>
          !usedFallbackIndices.has(idx) && entry.slug === parsed.slug
      );
      if (matchIndex >= 0) {
        slot = remainingFallback[matchIndex].slot;
        if (!quality) {
          quality = remainingFallback[matchIndex].quality ?? null;
        }
        if (durabilityScore == null) {
          durabilityScore =
            remainingFallback[matchIndex].durabilityScore ?? null;
        }
        usedFallbackIndices.add(matchIndex);
      }
    } else {
      const slotMatchIndex = remainingFallback.findIndex(
        (entry, idx) =>
          !usedFallbackIndices.has(idx) &&
          entry.slot === slot &&
          entry.slug === parsed.slug
      );
      if (slotMatchIndex >= 0) {
        usedFallbackIndices.add(slotMatchIndex);
      }
    }

    if (!slot) {
      const fallbackIndex = remainingFallback.findIndex(
        (_entry, idx) => !usedFallbackIndices.has(idx)
      );
      if (fallbackIndex >= 0) {
        slot = remainingFallback[fallbackIndex].slot;
        if (!quality) {
          quality = remainingFallback[fallbackIndex].quality ?? null;
        }
        if (durabilityScore == null) {
          durabilityScore =
            remainingFallback[fallbackIndex].durabilityScore ?? null;
        }
        usedFallbackIndices.add(fallbackIndex);
      } else {
        console.warn(
          `[equipment] Unable to resolve slot for ${parsed.slug}; defaulting to handRight`
        );
        slot = 'handRight';
      }
    }

    const normalizedQuality =
      quality != null ? normalizeQualityTier(quality) : DEFAULT_QUALITY_TIER;

    results.push(
      serializeStoredWearable({
        slot,
        slug: parsed.slug,
        quality: normalizedQuality,
        durabilityScore,
      })
    );
  }

  if (results.length === 0) {
    return fallback.map(serializeStoredWearable);
  }

  return results;
}

export function mapStoredWearablesToAssignments(
  raw: unknown,
  fallback: StoredWearableEntry[]
): StoredWearableEntry[] {
  const normalized = normalizeStoredWearableList(raw, fallback);
  return normalized
    .map((entry) => deserializeStoredWearable(entry))
    .filter((entry): entry is ParsedStoredWearableEntry => Boolean(entry))
    .map((entry) => {
      const fallbackMatch = fallback.find(
        (candidate) => candidate.slug === entry.slug
      );
      const slot =
        entry.slot ?? fallbackMatch?.slot ?? ((): EquipmentSlotName => {
            console.warn(
              `[equipment] Unable to resolve slot assignment for ${entry.slug}; defaulting to handRight`
            );
            return 'handRight';
          })();
      const quality =
        entry.quality ?? fallbackMatch?.quality ?? DEFAULT_QUALITY_TIER;
      const durabilityScore =
        entry.durabilityScore ?? fallbackMatch?.durabilityScore ?? null;
      return {
        slot,
        slug: entry.slug,
        quality: normalizeQualityTier(quality),
        durabilityScore,
      };
    });
}

const RATE_HISTORY = new Map<string, number[]>();

const DEFAULT_CHARACTER_ID =
  AVAILABLE_CHARACTERS.find((entry) => entry.id === 'coderdan')?.id ??
  AVAILABLE_CHARACTERS[0]?.id ??
  'coderdan';

export type EquipmentErrorCode =
  | 'invalid_slot'
  | 'invalid_wearable'
  | 'not_owned'
  | 'insufficient_quantity'
  | 'broken_only'
  | 'gotchi_only'
  | 'state_disallowed'
  | 'rate_limited'
  | 'player_not_found'
  | 'cannot_unequip_base';

export class EquipmentError extends Error {
  public readonly code: EquipmentErrorCode;
  public readonly status: number;

  constructor(code: EquipmentErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface EquipmentOverride {
  slot: EquipmentSlotName;
  slug: string;
  inventoryItemId: string | null;
  quality: QualityTier;
  durabilityScore: number | null;
}

export interface EquipmentAssignment {
  slot: EquipmentSlotName;
  slug: string;
  source: 'base' | 'override';
  inventoryItemId: string | null;
  quality: QualityTier;
  durabilityScore: number | null;
}

function compareInventoryRecords(
  a: PlayerInventoryRecord,
  b: PlayerInventoryRecord
): number {
  const scalarA = getQualityScalar(normalizeQualityTier(a.quality));
  const scalarB = getQualityScalar(normalizeQualityTier(b.quality));
  if (scalarA !== scalarB) {
    return scalarB - scalarA;
  }

  const durabilityA = Number.isFinite(a.durabilityScore)
    ? a.durabilityScore
    : 0;
  const durabilityB = Number.isFinite(b.durabilityScore)
    ? b.durabilityScore
    : 0;
  if (durabilityA !== durabilityB) {
    return durabilityB - durabilityA;
  }

  const createdA = Date.parse(a.createdAt ?? '');
  const createdB = Date.parse(b.createdAt ?? '');
  if (Number.isFinite(createdA) && Number.isFinite(createdB)) {
    return createdA - createdB;
  }

  return 0;
}

function sortInventoryRecords(
  records: PlayerInventoryRecord[]
): PlayerInventoryRecord[] {
  return [...records].sort(compareInventoryRecords);
}

function isFlawlessWearableRestrictedForCharacter(
  characterId: string,
  quality: string | null | undefined
): boolean {
  return (
    !isGotchiCharacterId(characterId) &&
    normalizeQualityTier(quality) === 'flawless'
  );
}

function getEquipableInventoryRecordsForCharacter(input: {
  records: PlayerInventoryRecord[];
  occupiedIds: Set<string>;
  characterId: string;
}): PlayerInventoryRecord[] {
  return sortInventoryRecords(
    input.records.filter(
      (record) =>
        !input.occupiedIds.has(record.id) &&
        !isBrokenDurability(record.durabilityScore) &&
        !isFlawlessWearableRestrictedForCharacter(
          input.characterId,
          record.quality
        )
    )
  );
}

function hasRestrictedFlawlessInventoryForCharacter(input: {
  records: PlayerInventoryRecord[];
  occupiedIds: Set<string>;
  characterId: string;
}): boolean {
  return input.records.some(
    (record) =>
      !input.occupiedIds.has(record.id) &&
      !isBrokenDurability(record.durabilityScore) &&
      isFlawlessWearableRestrictedForCharacter(
        input.characterId,
        record.quality
      )
  );
}

export interface EquipmentState {
  characterId: string;
  equipment: EquipmentAssignment[];
  overrides: EquipmentOverride[];
  equippedWearables: unknown[];
  equippedWearablesWithQuality: Array<{
    slot: EquipmentSlotName;
    slug: string;
    quality: QualityTier;
  }>;
  derivedStats: CharacterDerivedStats;
  version: number;
}

export function resolveRuntimeEquipmentSnapshotForJoin(input: {
  equipmentState: Pick<EquipmentState, 'equipment' | 'derivedStats'>;
  progressionWearables?: unknown;
  progressionDerivedStats?: unknown;
  preferFreshState?: boolean;
}): {
  runtimeWearables: unknown[];
  runtimeDerivedStats: Record<string, unknown>;
} {
  const storageAssignments: StoredWearableEntry[] =
    input.equipmentState.equipment.map((assignment) => ({
      slot: assignment.slot,
      slug: assignment.slug,
      quality: assignment.quality,
      durabilityScore: assignment.durabilityScore,
    }));

  const freshWearables = storageAssignments.map(serializeStoredWearable);
  if (input.preferFreshState) {
    return {
      runtimeWearables: freshWearables,
      runtimeDerivedStats:
        input.equipmentState.derivedStats as unknown as Record<string, unknown>,
    };
  }

  return {
    runtimeWearables: normalizeStoredWearableList(
      input.progressionWearables,
      storageAssignments
    ),
    runtimeDerivedStats:
      input.progressionDerivedStats &&
      typeof input.progressionDerivedStats === 'object'
        ? (input.progressionDerivedStats as Record<string, unknown>)
        : (input.equipmentState.derivedStats as unknown as Record<
            string,
            unknown
          >),
  };
}

export interface EquipWearableInput {
  playerId: string;
  slot: string;
  slug: string;
}

export interface UnequipWearableInput {
  playerId: string;
  slot: string;
}

export interface BatchEquipInput {
  playerId: string;
  assignments: Array<{ slot: string; slug: string }>;
}

export interface BatchUnequipInput {
  playerId: string;
  slots: string[];
}

export interface EquipmentBroadcastPayload extends EquipmentState {
  playerId: string;
}

export async function getPlayerEquipmentState(
  playerId: string
): Promise<EquipmentState> {
  const characterId = await resolveEffectiveCharacterId(playerId);
  await ensureGotchiWearablesHydrated(playerId, characterId);
  const overridesRaw = await equipmentRepo.getEquippedWithInstances(
    playerId,
    characterId
  );
  const overrides = overridesRaw.map((entry) => ({
    slot: normalizeSlot(entry.slot),
    slug: entry.wearableSlug,
    inventoryItemId: entry.inventoryItemId ?? null,
    quality: normalizeQualityTier(entry.quality),
    durabilityScore:
      typeof entry.durabilityScore === 'number' ? entry.durabilityScore : null,
  }));
  return buildEquipmentState({ characterId, overrides });
}

export async function getEquippedInventoryItemIds(
  playerId: string,
  client?: PoolClient
): Promise<Set<string>> {
  const equipped = await equipmentRepo.getEquippedWithInstances(
    playerId,
    undefined,
    client
  );
  const ids = new Set<string>();
  for (const entry of equipped) {
    if (typeof entry.inventoryItemId === 'string' && entry.inventoryItemId) {
      ids.add(entry.inventoryItemId);
    }
  }
  return ids;
}

export async function isInventoryItemEquipped(
  playerId: string,
  inventoryItemId: string,
  client?: PoolClient
): Promise<boolean> {
  if (!inventoryItemId) {
    return false;
  }
  const equippedIds = await getEquippedInventoryItemIds(playerId, client);
  return equippedIds.has(inventoryItemId);
}

export async function equipWearable(
  input: EquipWearableInput
): Promise<EquipmentState> {
  const playerId = input.playerId;
  enforceRateLimit(playerId);
  await ensurePlayerCanModifyEquipment(playerId);

  const characterId = await resolveEffectiveCharacterId(playerId);
  await ensureGotchiWearablesHydrated(playerId, characterId);
  const { slot: requestedSlot, wearable } = validateWearableRequest(
    input.slot,
    input.slug
  );

  const state = await runTransaction(async (client) => {
    const overridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const overrides = overridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const targetSlot = resolveWearableSlot(wearable, requestedSlot);
    const existing = overrides.find((entry) => entry.slot === targetSlot);
    if (existing && existing.slug === wearable.slug) {
      const state = buildEquipmentState({ characterId, overrides });
      await persistEquipmentSnapshot(playerId, state, client);
      return state;
    }

    const inventoryRecords = await inventoryRepo.getWearableInventoryBySlug(
      playerId,
      wearable.slug,
      client
    );
    if (inventoryRecords.length <= 0) {
      throw new EquipmentError('not_owned', 'Wearable not found in inventory');
    }

    const occupiedIds = new Set(
      overrides
        .map((entry) => entry.inventoryItemId)
        .filter((id): id is string => Boolean(id))
    );
    const availableInventory = getEquipableInventoryRecordsForCharacter({
      records: inventoryRecords,
      occupiedIds,
      characterId,
    });
    const chosenRecord = availableInventory[0];
    if (!chosenRecord) {
      if (
        hasRestrictedFlawlessInventoryForCharacter({
          records: inventoryRecords,
          occupiedIds,
          characterId,
        })
      ) {
        throw new EquipmentError(
          'gotchi_only',
          'Flawless wearables can only be equipped by Aavegotchis.'
        );
      }
      const hasBrokenOnly = inventoryRecords.some(
        (record) =>
          !occupiedIds.has(record.id) && isBrokenDurability(record.durabilityScore)
      );
      if (hasBrokenOnly) {
        throw new EquipmentError(
          'broken_only',
          'All copies of this wearable are broken. Repair one to equip it.'
        );
      }
      throw new EquipmentError(
        'insufficient_quantity',
        'No available copies to equip'
      );
    }

    await equipmentRepo.setEquipment({
      playerId,
      characterId,
      slot: targetSlot,
      wearableSlug: wearable.slug,
      source: 'override',
      inventoryItemId: chosenRecord?.id ?? null,
      client,
    });

    const nextOverridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const nextOverrides = nextOverridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const nextState = buildEquipmentState({
      characterId,
      overrides: nextOverrides,
    });
    await persistEquipmentSnapshot(playerId, nextState, client);
    return nextState;
  });

  await broadcastEquipmentUpdate(playerId, state);
  maybeRegenerateGotchiSprite(state);
  return state;
}

export async function unequipWearable(
  input: UnequipWearableInput
): Promise<EquipmentState> {
  const playerId = input.playerId;
  enforceRateLimit(playerId);
  await ensurePlayerCanModifyEquipment(playerId);

  const characterId = await resolveEffectiveCharacterId(playerId);
  await ensureGotchiWearablesHydrated(playerId, characterId);
  const targetSlot = normalizeSlot(input.slot);

  const state = await runTransaction(async (client) => {
    const overridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const overrides = overridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const existing = overrides.find((entry) => entry.slot === targetSlot);
    if (!existing) {
      throw new EquipmentError(
        'cannot_unequip_base',
        'Cannot unequip base wearable'
      );
    }

    await equipmentRepo.removeEquipment(
      playerId,
      targetSlot,
      characterId,
      client
    );

    const nextOverridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const nextOverrides = nextOverridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const nextState = buildEquipmentState({
      characterId,
      overrides: nextOverrides,
    });
    await persistEquipmentSnapshot(playerId, nextState, client);
    return nextState;
  });

  await broadcastEquipmentUpdate(playerId, state);
  maybeRegenerateGotchiSprite(state);
  return state;
}

export async function batchEquipWearables(
  input: BatchEquipInput
): Promise<EquipmentState> {
  const assignments = Array.isArray(input.assignments)
    ? input.assignments.filter(
        (entry) =>
          entry &&
          typeof entry.slot === 'string' &&
          typeof entry.slug === 'string'
      )
    : [];
  if (assignments.length === 0) {
    return getPlayerEquipmentState(input.playerId);
  }

  const playerId = input.playerId;
  enforceRateLimit(playerId);
  await ensurePlayerCanModifyEquipment(playerId);

  const characterId = await resolveEffectiveCharacterId(playerId);
  await ensureGotchiWearablesHydrated(playerId, characterId);

  const state = await runTransaction(async (client) => {
    const baseOverridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const overrides = baseOverridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const operations: Array<{
      targetSlot: EquipmentSlotName;
      wearable: WearableDefinition;
    }> = [];

    for (const assignment of assignments) {
      const { slot: rawSlot, slug: rawSlug } = assignment;
      const { slot: requestedSlot, wearable } = validateWearableRequest(
        rawSlot,
        rawSlug
      );
      const targetSlot = resolveWearableSlot(wearable, requestedSlot);

      const existing = overrides.find((entry) => entry.slot === targetSlot);
      if (existing && existing.slug === wearable.slug) {
        continue;
      }
      operations.push({ targetSlot, wearable });
    }

    if (operations.length === 0) {
      const state = buildEquipmentState({ characterId, overrides });
      await persistEquipmentSnapshot(playerId, state, client);
      return state;
    }

    const occupiedInventoryIds = new Set(
      overrides
        .map((entry) => entry.inventoryItemId)
        .filter((id): id is string => Boolean(id))
    );
    const inventoryCache = new Map<string, PlayerInventoryRecord[]>();

    const takeNextInventoryInstance = async (slug: string) => {
      if (!inventoryCache.has(slug)) {
        const records = await inventoryRepo.getWearableInventoryBySlug(
          playerId,
          slug,
          client
        );
        inventoryCache.set(
          slug,
          getEquipableInventoryRecordsForCharacter({
            records,
            occupiedIds: occupiedInventoryIds,
            characterId,
          })
        );
      }
      const list = inventoryCache.get(slug)!;
      const next = list.shift();
      if (next) {
        occupiedInventoryIds.add(next.id);
      }
      return next;
    };

    for (const operation of operations) {
      const nextInstance = await takeNextInventoryInstance(
        operation.wearable.slug
      );
      if (!nextInstance) {
        const records = await inventoryRepo.getWearableInventoryBySlug(
          playerId,
          operation.wearable.slug,
          client
        );
        if (
          hasRestrictedFlawlessInventoryForCharacter({
            records,
            occupiedIds: occupiedInventoryIds,
            characterId,
          })
        ) {
          throw new EquipmentError(
            'gotchi_only',
            'Flawless wearables can only be equipped by Aavegotchis.'
          );
        }
        const hasBrokenOnly = records.some(
          (record) =>
            !occupiedInventoryIds.has(record.id) &&
            isBrokenDurability(record.durabilityScore)
        );
        if (hasBrokenOnly) {
          throw new EquipmentError(
            'broken_only',
            `All copies of ${operation.wearable.slug} are broken. Repair one to equip it.`
          );
        }
        throw new EquipmentError(
          'insufficient_quantity',
          `No available copies of ${operation.wearable.slug}`
        );
      }
      await equipmentRepo.setEquipment({
        playerId,
        characterId,
        slot: operation.targetSlot,
        wearableSlug: operation.wearable.slug,
        source: 'override',
        inventoryItemId: nextInstance.id,
        client,
      });
    }

    const nextOverridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const nextOverrides = nextOverridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const nextState = buildEquipmentState({
      characterId,
      overrides: nextOverrides,
    });
    await persistEquipmentSnapshot(playerId, nextState, client);
    return nextState;
  });

  await broadcastEquipmentUpdate(playerId, state);
  maybeRegenerateGotchiSprite(state);
  return state;
}

export async function batchUnequipWearables(
  input: BatchUnequipInput
): Promise<EquipmentState> {
  const slots = Array.isArray(input.slots)
    ? input.slots.filter((value) => typeof value === 'string')
    : [];
  if (slots.length === 0) {
    return getPlayerEquipmentState(input.playerId);
  }

  const playerId = input.playerId;
  enforceRateLimit(playerId);
  await ensurePlayerCanModifyEquipment(playerId);

  const characterId = await resolveEffectiveCharacterId(playerId);
  const state = await runTransaction(async (client) => {
    for (const rawSlot of slots) {
      try {
        const normalized = normalizeSlot(rawSlot);
        await equipmentRepo.removeEquipment(
          playerId,
          normalized,
          characterId,
          client
        );
      } catch (error) {
        if (error instanceof EquipmentError && error.code === 'invalid_slot') {
          continue;
        }
        throw error;
      }
    }

    const nextOverridesRaw = await equipmentRepo.getEquippedWithInstances(
      playerId,
      characterId,
      client
    );
    const nextOverrides = nextOverridesRaw.map((entry) => ({
      slot: normalizeSlot(entry.slot),
      slug: entry.wearableSlug,
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    }));

    const nextState = buildEquipmentState({
      characterId,
      overrides: nextOverrides,
    });
    await persistEquipmentSnapshot(playerId, nextState, client);
    return nextState;
  });

  await broadcastEquipmentUpdate(playerId, state);
  maybeRegenerateGotchiSprite(state);
  return state;
}

function buildEquipmentState(input: {
  characterId: string;
  overrides: EquipmentOverride[];
}): EquipmentState {
  const { characterId, overrides } = input;
  const baseStats = getCharacterStats(characterId);
  const slotAssignments = new Map<EquipmentSlotName, EquipmentAssignment>();

  for (const item of baseStats.equipment.items) {
    const slot = normalizeSlot(item.slot);
    slotAssignments.set(slot, {
      slot,
      slug: item.slug,
      source: 'base',
      inventoryItemId: null,
      quality: DEFAULT_QUALITY_TIER,
      durabilityScore: null,
    });
  }

  overrides.forEach((entry) => {
    slotAssignments.set(entry.slot, {
      slot: entry.slot,
      slug: entry.slug,
      source: 'override',
      inventoryItemId: entry.inventoryItemId ?? null,
      quality: normalizeQualityTier(entry.quality),
      durabilityScore:
        typeof entry.durabilityScore === 'number'
          ? entry.durabilityScore
          : null,
    });
  });

  const orderedAssignments: EquipmentAssignment[] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const assignment = slotAssignments.get(slot);
    if (assignment) {
      orderedAssignments.push(assignment);
    }
  }

  const activeAssignments = orderedAssignments.filter(
    (entry) => !isBrokenDurability(entry.durabilityScore)
  );

  const equippedWearablesWithQuality = activeAssignments.map((entry) => ({
    slot: entry.slot,
    slug: entry.slug,
    quality: entry.quality,
  }));

  const derivedStats = getCharacterStats(characterId, {
    equippedWearablesWithQuality,
  });

  const assignmentItems = orderedAssignments.map((assignment) => {
    const wearable = getWearableBySlug(assignment.slug);
    return {
      slug: assignment.slug,
      id: wearable?.id ?? 0,
      slot: assignment.slot,
      quality: assignment.quality,
      qualityScalar: getQualityScalar(assignment.quality),
      durabilityScore: assignment.durabilityScore,
    };
  });

  const equippedSlugs = activeAssignments.map((item) => item.slug);

  const storedAssignments: StoredWearableEntry[] = [];
  for (const item of assignmentItems) {
    storedAssignments.push({
      slot: item.slot,
      slug: item.slug,
      quality: item.quality,
      durabilityScore: item.durabilityScore,
    });
  }
  derivedStats.equipment = {
    ...derivedStats.equipment,
    items: assignmentItems,
    slugs: equippedSlugs,
  };

  // Use a stable hash of the equipped wearables as the version
  // to avoid unnecessary re-renders on the client during GET requests.
  const contentSignature = JSON.stringify(
    orderedAssignments.map(
      (w) =>
        `${w.slot}:${w.slug}:${w.quality}:${Number(w.durabilityScore ?? -1)}`
    )
  );
  let hash = 0;
  for (let i = 0; i < contentSignature.length; i++) {
    hash = (hash << 5) - hash + contentSignature.charCodeAt(i);
    hash |= 0;
  }
  const version = Math.abs(hash);

  return {
    characterId,
    equipment: orderedAssignments,
    overrides,
    equippedWearables: storedAssignments.map(serializeStoredWearable),
    equippedWearablesWithQuality,
    derivedStats,
    version,
  };
}

function validateWearableRequest(
  slot: string,
  slug: string
): {
  slot: EquipmentSlotName;
  wearable: WearableDefinition;
} {
  const normalizedSlot = normalizeSlot(slot);
  const sanitizedSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!sanitizedSlug) {
    throw new EquipmentError('invalid_wearable', 'Wearable slug is required');
  }

  const wearable = getWearableBySlug(sanitizedSlug);
  if (!wearable) {
    throw new EquipmentError('invalid_wearable', 'Wearable not recognized');
  }

  return { slot: normalizedSlot, wearable };
}

function normalizeSlot(slot: string): EquipmentSlotName {
  const trimmed = typeof slot === 'string' ? slot.trim() : '';
  const lowered = trimmed.toLowerCase();
  switch (lowered) {
    case 'head':
      return 'head';
    case 'body':
      return 'body';
    case 'face':
      return 'face';
    case 'eyes':
      return 'eyes';
    case 'handleft':
    case 'hand_left':
    case 'left':
      return 'handLeft';
    case 'handright':
    case 'hand_right':
    case 'right':
      return 'handRight';
    case 'pet':
      return 'pet';
    case 'background':
      return 'background';
    default:
      throw new EquipmentError('invalid_slot', 'Slot is not supported');
  }
}

function resolveWearableSlot(
  wearable: WearableDefinition,
  requestedSlot: EquipmentSlotName
): EquipmentSlotName {
  const slots = new Set<EquipmentSlotName>();
  const rawSlots = Array.isArray(wearable.slots) ? wearable.slots : [];
  for (const rawSlot of rawSlots) {
    try {
      slots.add(normalizeSlot(rawSlot));
    } catch {
      // Ignore invalid slots on the definition
    }
  }

  if (slots.has(requestedSlot)) {
    return requestedSlot;
  }

  throw new EquipmentError(
    'invalid_slot',
    `Wearable ${wearable.slug} cannot be equipped in the ${requestedSlot} slot`
  );
}

async function resolveEffectiveCharacterId(playerId: string): Promise<string> {
  const player = await playersRepo.getPlayerById(playerId);
  if (!player) {
    throw new EquipmentError('player_not_found', 'Player not found', 404);
  }

  const unlocked = normalizeUnlockedCharacters(player.unlockedCharacters);
  const unlockedSet = new Set(unlocked);

  let selected: string | null = null;
  try {
    selected = normalizeCharacterId(player.selectedCharacterId);
  } catch {
    selected = null;
  }

  if (isCharacterSelectionAllowed(selected, unlockedSet)) {
    return selected!;
  }

  if (unlocked.length > 0) {
    return unlocked[0];
  }

  return DEFAULT_CHARACTER_ID;
}

function normalizeUnlockedCharacters(unlocked: unknown): string[] {
  const normalized = new Set<string>();

  // Add Tier 1 characters by default
  AVAILABLE_CHARACTERS.forEach((char) => {
    if (char.tier === 'tier1') {
      normalized.add(char.id);
    }
  });

  if (Array.isArray(unlocked)) {
    for (const entry of unlocked) {
      try {
        const candidate = normalizeCharacterId(entry);
        if (candidate && !normalized.has(candidate)) {
          normalized.add(candidate);
        }
      } catch {
        // Ignore invalid entries
      }
    }
  }

  return AVAILABLE_CHARACTERS.map((character) => character.id).filter((id) =>
    normalized.has(id)
  );
}

function normalizeCharacterId(input: unknown): string | null {
  if (input == null) {
    return null;
  }
  const raw = String(input).trim();
  if (!raw) {
    return null;
  }

  if (isGotchiCharacterId(raw)) {
    return raw.toLowerCase();
  }

  const direct = AVAILABLE_CHARACTERS.find((entry) => entry.id === raw);
  if (direct) {
    return direct.id;
  }

  const lowered = raw.toLowerCase();
  const lookup = AVAILABLE_CHARACTERS.find(
    (entry) => entry.id === lowered || entry.name.toLowerCase() === lowered
  );
  if (lookup) {
    return lookup.id;
  }

  return null;
}

function isGotchiCharacterId(value: string): boolean {
  return /^gotchi:\d{1,32}$/i.test(value);
}

function isCharacterSelectionAllowed(
  characterId: string | null,
  unlockedSet: Set<string>
): boolean {
  if (!characterId) {
    return false;
  }
  if (isGotchiCharacterId(characterId)) {
    return true;
  }

  // Tier 1 characters are free/unlocked by default
  const char = getCharacterById(characterId);
  if (char && char.tier === 'tier1') {
    return true;
  }

  return unlockedSet.has(characterId);
}

function enforceRateLimit(playerId: string) {
  const now = Date.now();
  const history = RATE_HISTORY.get(playerId) ?? [];
  const recent = history.filter(
    (timestamp) => now - timestamp < EQUIPMENT_RATE_WINDOW_MS
  );
  if (recent.length >= EQUIPMENT_RATE_LIMIT) {
    throw new EquipmentError(
      'rate_limited',
      'Too many equipment actions, please wait a moment',
      429
    );
  }
  recent.push(now);
  RATE_HISTORY.set(playerId, recent);
}

export async function ensurePlayerCanModifyEquipment(
  playerId: string
): Promise<void> {
  const rooms = await matchMaker.query({ name: 'game_room' });
  if (rooms.length === 0) {
    return;
  }

  await Promise.all(
    rooms.map(async (room) => {
      try {
        const response = await matchMaker.remoteRoomCall(
          room.roomId,
          'equipmentCanModify',
          [playerId]
        );
        if (
          response &&
          typeof response === 'object' &&
          response.allowed === false
        ) {
          const message =
            typeof response.reason === 'string'
              ? response.reason
              : 'Equipment changes are not allowed right now';
          throw new EquipmentError('state_disallowed', message, 409);
        }
      } catch (error) {
        const message = (error as Error)?.message || '';
        if (message.includes('equipmentCanModify')) {
          return;
        }
        if (message.includes('REMOTE_ROOM_DISCONNECTED')) {
          return;
        }
        throw error;
      }
    })
  );
}

async function broadcastEquipmentUpdate(
  playerId: string,
  state: EquipmentState
): Promise<void> {
  const payload: EquipmentBroadcastPayload = {
    ...state,
    playerId,
  };

  const rooms = await matchMaker.query({ name: 'game_room' });
  await Promise.all(
    rooms.map((room) =>
      matchMaker
        .remoteRoomCall(room.roomId, 'equipmentBroadcastUpdate', [payload])
        .catch((error) => {
          const message = (error as Error)?.message || '';
          if (message.includes('equipmentBroadcastUpdate')) {
            return;
          }
          console.warn('Failed to broadcast equipment update', {
            roomId: room.roomId,
            error,
          });
        })
    )
  );
}

export async function refreshAndBroadcastEquipmentState(
  playerId: string
): Promise<EquipmentState> {
  const state = await getPlayerEquipmentState(playerId);
  await runTransaction(async (client) => {
    await persistEquipmentSnapshot(playerId, state, client);
  });
  await broadcastEquipmentUpdate(playerId, state);
  maybeRegenerateGotchiSprite(state);
  return state;
}

async function persistEquipmentSnapshot(
  playerId: string,
  state: EquipmentState,
  client: PoolClient
) {
  await client.query(
    `update players
        set derived_stats = $2::jsonb,
            equipped_wearables = $3::jsonb,
            updated_at = now()
      where id = $1`,
    [
      playerId,
      JSON.stringify(state.derivedStats),
      JSON.stringify(state.equippedWearables),
    ]
  );
}

export function buildEquipmentStateForCharacter(
  characterId: string,
  overrides: EquipmentOverride[]
): EquipmentState {
  return buildEquipmentState({ characterId, overrides });
}

export function normalizeEquipmentSlotName(slot: string): EquipmentSlotName {
  return normalizeSlot(slot);
}

/**
 * Ensure dynamic gotchi wearables are hydrated in memory so that
 * getCharacterStats(characterId) can derive base equipment from them.
 * Falls back to persisted player_equipment rows if cache is empty.
 */
export async function ensureGotchiWearablesHydrated(
  playerId: string,
  characterId: string,
  client?: PoolClient
): Promise<void> {
  if (!isGotchiCharacterId(characterId)) return;
  const gotchiId = characterId.split(':')[1] || '';
  if (!gotchiId) return;
  const existing = getGotchiWearables(gotchiId);
  if (Array.isArray(existing) && existing.length > 0) return;

  const rows = await equipmentRepo.getEquippedWithInstances(
    playerId,
    characterId,
    client
  );
  if (!rows || rows.length === 0) return;
  const slugs: string[] = [];
  const seen = new Set<string>();
  const assignments: Array<{ slot: EquipmentSlotName; slug: string }> = [];
  for (const row of rows) {
    const slug = String(row.wearableSlug || '').trim();
    if (!slug) continue;
    if (!seen.has(slug)) {
      slugs.push(slug);
      seen.add(slug);
    }
    try {
      const slot = normalizeSlot(row.slot);
      assignments.push({ slot, slug });
    } catch {
      // ignore bad slot
    }
  }
  if (slugs.length > 0) {
    setGotchiWearables(gotchiId, slugs);
  }
  if (assignments.length > 0) {
    setGotchiWearableAssignments(gotchiId, assignments as any);
  }
}

function buildWearableAttributesForSprite(
  state: EquipmentState
): GeneratorAttribute[] {
  const attributes: GeneratorAttribute[] = [];
  for (const slot of SPRITE_SLOT_ORDER) {
    const trait = SPRITE_TRAIT_BY_SLOT[slot];
    if (!trait) continue;
    const assignment = state.equipment.find(
      (entry) => entry.slot === slot
    );
    if (!assignment) continue;
    const wearable = getWearableBySlug(assignment.slug);
    if (!wearable || !wearable.name) continue;
    attributes.push({
      trait_type: trait,
      value: wearable.name,
    });
  }
  return attributes;
}

async function buildGeneratorGotchiForState(
  state: EquipmentState
): Promise<GeneratorGotchi | null> {
  const characterId = state.characterId;
  if (!isGotchiCharacterId(characterId)) return null;
  const gotchiId = characterId.split(':')[1];
  if (!gotchiId) return null;

  let raw: RawAavegotchi | null = null;
  try {
    raw = await fetchAavegotchiById(gotchiId);
  } catch (error) {
    console.warn(
      `[equipment] Failed to fetch gotchi ${gotchiId} for sprite regeneration:`,
      error
    );
    return null;
  }
  if (!raw) return null;

  const base = normalizeForGenerator(raw);
  const wearableAttributes = buildWearableAttributesForSprite(state);
  const staticAttributes = base.attributes.filter(
    (attr) => !attr.trait_type.startsWith('Wearable')
  );

  return {
    ...base,
    attributes: [...staticAttributes, ...wearableAttributes],
  };
}

function maybeRegenerateGotchiSprite(state: EquipmentState): void {
  void (async () => {
    const generator = await buildGeneratorGotchiForState(state);
    if (!generator) return;
    try {
      await generateOne(generator);
    } catch (error) {
      console.warn(
        `[equipment] Failed to regenerate sprite for ${state.characterId}:`,
        error
      );
    }
  })();
}
