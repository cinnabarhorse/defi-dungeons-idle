import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CharacterDerivedStats } from '../lib/character-registry';
import {
  normalizeQualityTier,
  type QualityTier,
} from '../data/wearable-quality';
import { getAppServerBaseUrl } from '../lib/server-url';
import { fetchDedupe } from '../lib/fetch-dedupe';

export type EquipmentSlotName =
  | 'head'
  | 'body'
  | 'face'
  | 'eyes'
  | 'handLeft'
  | 'handRight'
  | 'pet'
  | 'background';

const EQUIPMENT_SLOT_NAMES: EquipmentSlotName[] = [
  'head',
  'body',
  'face',
  'eyes',
  'handLeft',
  'handRight',
  'pet',
  'background',
];

function isEquipmentSlotName(value: unknown): value is EquipmentSlotName {
  return (
    typeof value === 'string' &&
    EQUIPMENT_SLOT_NAMES.includes(value as EquipmentSlotName)
  );
}

export interface EquipmentAssignment {
  slot: EquipmentSlotName;
  slug: string;
  source: 'base' | 'override';
  inventoryItemId: string | null;
  quality: QualityTier;
  durabilityScore: number | null;
}

export interface EquipmentOverride {
  slot: EquipmentSlotName;
  slug: string;
  inventoryItemId: string | null;
  quality: QualityTier;
  durabilityScore: number | null;
}

export interface EquipmentState {
  characterId: string;
  equipment: EquipmentAssignment[];
  overrides: EquipmentOverride[];
  equippedInventoryItemIds: string[];
  equippedWearables: string[];
  equippedWearablesWithQuality: Array<{
    slug: string;
    slot: EquipmentSlotName;
    quality: QualityTier;
  }>;
  derivedStats: CharacterDerivedStats;
  version: number;
}

interface EquipmentApiResponse extends EquipmentState {
  playerId: string;
}

function normalizeDurabilityScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeEquipmentState(
  payload: EquipmentApiResponse
): EquipmentState {
  const equipmentAssignments = Array.isArray(payload.equipment)
    ? payload.equipment.map((entry) => {
        const source: 'base' | 'override' =
          entry.source === 'override' ? 'override' : 'base';
        return {
          slot: entry.slot as EquipmentSlotName,
          slug: entry.slug,
          source,
          inventoryItemId:
            typeof entry.inventoryItemId === 'string'
              ? entry.inventoryItemId
              : null,
          quality: normalizeQualityTier(entry.quality),
          durabilityScore: normalizeDurabilityScore(entry.durabilityScore),
        };
      })
    : [];

  const equipmentOverrides = Array.isArray(payload.overrides)
    ? payload.overrides.map((entry) => ({
        slot: entry.slot as EquipmentSlotName,
        slug: entry.slug,
        inventoryItemId:
          typeof entry.inventoryItemId === 'string'
            ? entry.inventoryItemId
            : null,
        quality: normalizeQualityTier(entry.quality),
        durabilityScore: normalizeDurabilityScore(entry.durabilityScore),
      }))
    : [];

  const equippedInventoryItemIds = Array.isArray(
    (payload as any).equippedInventoryItemIds
  )
    ? ((payload as any).equippedInventoryItemIds as unknown[])
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0
        )
        .map((value) => value.trim())
    : [];

  const equippedWithQuality = Array.isArray(
    payload.equippedWearablesWithQuality
  )
    ? payload.equippedWearablesWithQuality
        .map((entry) => {
          if (!entry) return null;
          const slug = typeof entry.slug === 'string' ? entry.slug : '';
          if (!slug) return null;
          const slot = isEquipmentSlotName(entry.slot) ? entry.slot : null;
          if (!slot) return null;
          return {
            slug,
            slot,
            quality: normalizeQualityTier(entry.quality),
          };
        })
        .filter(
          (
            entry
          ): entry is {
            slug: string;
            slot: EquipmentSlotName;
            quality: QualityTier;
          } => Boolean(entry)
        )
    : Array.isArray(payload.equippedWearables)
      ? payload.equippedWearables
          .map((value) => {
            if (value && typeof value === 'object') {
              const slug =
                typeof (value as any).slug === 'string'
                  ? (value as any).slug.trim()
                  : '';
              if (!slug) return null;
              const slot = isEquipmentSlotName((value as any).slot)
                ? ((value as any).slot as EquipmentSlotName)
                : ('handRight' as EquipmentSlotName);
              return {
                slug,
                slot,
                quality: normalizeQualityTier((value as any).quality),
              };
            }
            const raw = String(value ?? '').trim();
            if (!raw) return null;
            const parts = raw.split('::');
            const slotCandidate = parts[0];
            const slug = parts.length >= 2 ? parts[1] : raw;
            const quality = parts.length >= 3 ? parts[2] : undefined;
            if (!slug) return null;
            const slot = isEquipmentSlotName(slotCandidate)
              ? slotCandidate
              : ('handRight' as EquipmentSlotName);
            return {
              slug,
              slot,
              quality: normalizeQualityTier(quality as any),
            };
          })
          .filter(
            (
              entry
            ): entry is {
              slug: string;
              slot: EquipmentSlotName;
              quality: QualityTier;
            } => Boolean(entry)
          )
      : [];

  const equippedWearables = equippedWithQuality.map((entry) => entry.slug);

  return {
    characterId: payload.characterId,
    equipment: equipmentAssignments,
    overrides: equipmentOverrides,
    equippedInventoryItemIds,
    equippedWearables,
    equippedWearablesWithQuality: equippedWithQuality,
    derivedStats: payload.derivedStats ?? ({} as CharacterDerivedStats),
    version: Number.isFinite(payload.version) ? payload.version : Date.now(),
  };
}

export function useEquipment(
  playerId?: string | null,
  isSessionReady: boolean = true
) {
  const [state, setState] = useState<EquipmentState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = useMemo(() => getAppServerBaseUrl(), []);

  const endpoint = useMemo(
    () =>
      baseUrl ? `${baseUrl}/api/player/equipment` : '/api/player/equipment',
    [baseUrl]
  );

  const fetchEquipment = useCallback(async () => {
    if (!isSessionReady) {
      setState(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchDedupe(endpoint, {
        credentials: 'include',
      });
      if (response.status === 401 || response.status === 403) {
        setState(null);
        return;
      }
      if (!response.ok) {
        throw new Error('Failed to load equipment');
      }
      const payload = (await response.json()) as EquipmentApiResponse;
      const next = normalizeEquipmentState(payload);
      setState((prev) => {
        if (prev && prev.version === next.version) {
          return prev;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load equipment');
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, isSessionReady]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!isSessionReady) {
        setState(null);
        return;
      }
      await fetchEquipment();
    };
    if (active) {
      void run();
    }
    return () => {
      active = false;
    };
  }, [playerId, isSessionReady, fetchEquipment]);

  const equip = useCallback(
    async (slot: string, slug: string) => {
      if (!isSessionReady) {
        throw new Error('Player session unavailable');
      }

      setIsSaving(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ slot, slug }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const message =
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to equip wearable';
          throw new Error(message);
        }
        const next = normalizeEquipmentState(payload as EquipmentApiResponse);
        setState(next);
        return next;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to equip wearable';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [endpoint, isSessionReady]
  );

  const batchEquip = useCallback(
    async (assignments: Array<{ slot: string; slug: string }>) => {
      if (!isSessionReady) {
        throw new Error('Player session unavailable');
      }
      if (!Array.isArray(assignments) || assignments.length === 0) {
        return state;
      }

      setIsSaving(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ assignments }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const message =
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to equip wearables';
          throw new Error(message);
        }
        const next = normalizeEquipmentState(payload as EquipmentApiResponse);
        setState(next);
        return next;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to equip wearables';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [endpoint, isSessionReady, state]
  );

  const unequip = useCallback(
    async (slot: string) => {
      if (!isSessionReady) {
        throw new Error('Player session unavailable');
      }

      setIsSaving(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ slots: [slot] }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const message =
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to unequip';
          throw new Error(message);
        }
        const next = normalizeEquipmentState(payload as EquipmentApiResponse);
        setState(next);
        return next;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to unequip';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [endpoint, isSessionReady]
  );

  const batchUnequip = useCallback(
    async (slots: string[]) => {
      if (!isSessionReady) {
        throw new Error('Player session unavailable');
      }
      if (!Array.isArray(slots) || slots.length === 0) {
        return state;
      }

      setIsSaving(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ slots }),
        });
        const payload = await response.json();
        if (!response.ok) {
          const message =
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to unequip wearables';
          throw new Error(message);
        }
        const next = normalizeEquipmentState(payload as EquipmentApiResponse);
        setState(next);
        return next;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to unequip wearables';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [endpoint, isSessionReady, state]
  );

  return useMemo(
    () =>
      ({
        state,
        isLoading,
        isSaving,
        error,
        refresh: fetchEquipment,
        equip,
        unequip,
        batchEquip,
        batchUnequip,
        setState,
      }) as const,
    [
      state,
      isLoading,
      isSaving,
      error,
      fetchEquipment,
      equip,
      unequip,
      batchEquip,
      batchUnequip,
    ]
  );
}
