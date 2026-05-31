'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryState, parseAsStringLiteral } from 'nuqs';
import { Info, Wrench, X } from 'lucide-react';
import { useSession } from '../../../components/providers/SessionProvider';
import {
  QUALITY_ORDER,
  type DestroyInventoryRequest,
} from '../../../hooks/useInventory';
import {
  type EquipmentState,
  type EquipmentSlotName,
} from '../../../hooks/useEquipment';
import type { InventoryItem } from '../../../types/inventory';
import {
  getInventorySelectionKey as getSelectionKeyShared,
  getWearableStackKey as getWearableStackKeyShared,
} from '../../../lib/inventory-keys';
import {
  formatWearableDisplayName,
  getPrimarySlot,
} from '../../../lib/wearable-utils';
import {
  getWearableBySlug,
  isWeaponWearable,
  EQUIPMENT_STAT_LABELS,
  STAT,
  STAT_CONFIG,
  ITEM_TYPE_EFFECTS,
  getWearableRarity,
  getWearableById,
  toItemTypeLabel,
  WEARABLE_RARITIES,
  type WearableRarity,
  type EquipmentStatModifier,
  type WearableDefinition,
  type WearableSlot,
  type WearableItemType,
} from '../../../data/wearables';
import {
  durabilityCapForQuality,
  getRepairCostForDurability,
  isBrokenDurability,
  normalizeQualityTier,
  getQualityScalar,
  QUALITY_DEFAULT_LABELS,
  type QualityTier,
} from '../../../data/wearable-quality';
import { Button } from '../../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
} from '../../../components/ui/Dialog';
import {
  CHARACTERS,
  getCharacterStats as getClientCharacterStats,
} from '../../../lib/character-registry';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { cn } from '../../../lib/utils';
import { CharacterPreview } from '../../../components/CharacterPreview';
import { usePlayer } from '../../../components/providers/PlayerProvider';
import {
  shouldShowNftEquipmentChip,
} from './wearable-picker-utils';
import { buildWearableInstanceSummaries } from './wearable-picker-utils';
import { getEquipmentCardSummaryLayout } from './equipment-card-summary';
import { isFlawlessWearableRestrictedForCharacter } from '../../../lib/forge';
import {
  classifyAttackSpeedDelta,
  enhanceHandsWithEquipmentModifiers,
  handAttackSpeedAps,
  type EquipmentCombatModifiers,
} from './combat-stat-helpers';

const INVENTORY_SELECTION_QUERY_KEY = 'sel';
const GOLD_ICON_SRC = '/loot-icons/coin.svg';

// Filter constants
const ITEM_TYPE_OPTIONS = ['all', 'wearable', 'coin', 'potion', 'material'] as const;
type ItemTypeFilter = (typeof ITEM_TYPE_OPTIONS)[number];

const SLOT_OPTIONS = ['all', 'head', 'body', 'face', 'eyes', 'handLeft', 'handRight', 'pet'] as const;
type SlotFilter = (typeof SLOT_OPTIONS)[number];

const RARITY_OPTIONS = ['all', 'common', 'uncommon', 'rare', 'legendary', 'mythical', 'godlike'] as const;
type RarityFilter = (typeof RARITY_OPTIONS)[number];

// Weapon types for filtering
const WEAPON_TYPE_OPTIONS = ['all', 'sword', 'axe', 'hammer', 'dagger', 'spear', 'claw', 'gun', 'bow', 'staff', 'grenade'] as const;
type WeaponTypeFilter = (typeof WEAPON_TYPE_OPTIONS)[number];

// Wearable item type categories (non-weapon)
const WEARABLE_CATEGORY_OPTIONS = [
  'all',
  'basic-hat',
  'fancy-hat',
  'helmet',
  'mask',
  'face-mask',
  'glasses',
  'shades',
  'eyes',
  'hair',
  'beard',
  'fancy-shirt',
  't-shirt',
  'robe',
  'vest',
  'dress',
  'pants',
  'light-armor',
  'heavy-armor',
  'shield',
  'token',
  'electronics',
  'accessories',
] as const;
type WearableCategoryFilter = (typeof WEARABLE_CATEGORY_OPTIONS)[number];

const SLOT_FILTER_LABELS: Record<SlotFilter, string> = {
  all: 'All Slots',
  head: 'Head',
  body: 'Body',
  face: 'Face',
  eyes: 'Eyes',
  handLeft: 'Left Hand',
  handRight: 'Right Hand',
  pet: 'Pet',
};

const RARITY_FILTER_LABELS: Record<RarityFilter, string> = {
  all: 'All Rarities',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
  mythical: 'Mythical',
  godlike: 'Godlike',
};

const ITEM_TYPE_FILTER_LABELS: Record<ItemTypeFilter, string> = {
  all: 'All Items',
  wearable: 'Wearables',
  coin: 'Coins',
  potion: 'Potions',
  material: 'Materials',
};

function encodeSelection(set: Set<string>): string | null {
  if (set.size === 0) {
    return null;
  }
  return Array.from(set)
    .map((key) => encodeURIComponent(key))
    .join('.');
}

function decodeSelection(value: string | null | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    value
      .split('.')
      .map((segment) => decodeURIComponent(segment))
      .filter((segment) => segment.length > 0)
  );
}

const getInventorySelectionKey = getSelectionKeyShared;

// Grouping key for stacking identical wearable tiles in the grid (client-only)
const getWearableStackKey = getWearableStackKeyShared;

interface DisplayEntry {
  item: InventoryItem; // representative item for the tile
  selectionKeys: string[]; // all instance keys represented by the tile
  quantityDisplay: number; // badge quantity for the tile
  displayKey: string; // stable React key
  isWearableStack: boolean;
}

// Removed optimistic destroy toast

type DestroyFormEntry = {
  key: string;
  item: InventoryItem;
  quantity: number;
  maxQuantity: number;
  isWearable: boolean;
};

function sortInventoryItemsByQuality(items: InventoryItem[]): InventoryItem[] {
  return items.slice().sort((a, b) => {
    const ar = QUALITY_ORDER[a.quality ?? 'average'] ?? QUALITY_ORDER.average;
    const br = QUALITY_ORDER[b.quality ?? 'average'] ?? QUALITY_ORDER.average;
    if (ar !== br) return ar - br;
    const da = a.durabilityScore ?? 0;
    const db = b.durabilityScore ?? 0;
    if (da !== db) return db - da;
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return (a.id || '').localeCompare(b.id || '');
  });
}

function getWearableDurabilityMetrics(item: {
  quality?: string | QualityTier | null;
  durabilityScore?: number | null;
}) {
  const quality = normalizeQualityTier(item.quality);
  const cap = durabilityCapForQuality(quality);
  const current = Number.isFinite(item.durabilityScore)
    ? Math.max(0, Math.min(cap, Math.floor(Number(item.durabilityScore))))
    : 0;
  return {
    quality,
    cap,
    current,
    isBroken: isBrokenDurability(current),
    ratio: cap > 0 ? Math.max(0, Math.min(1, current / cap)) : 0,
  };
}

function getDurabilityStateClasses(ratio: number): {
  fill: string;
  badge: string;
} {
  if (ratio >= 2 / 3) {
    return {
      fill: 'bg-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300',
    };
  }
  if (ratio >= 1 / 3) {
    return {
      fill: 'bg-amber-400',
      badge: 'bg-amber-500/20 text-amber-300',
    };
  }
  return {
    fill: 'bg-red-400',
    badge: 'bg-red-500/20 text-red-300',
  };
}

function getWearableRepairCost(item: {
  quality?: string | QualityTier | null;
  durabilityScore?: number | null;
}) {
  return getRepairCostForDurability({
    quality: item.quality,
    durabilityScore: item.durabilityScore,
  });
}

function getWearableRepairTooltip(item: {
  quality?: string | QualityTier | null;
  durabilityScore?: number | null;
}) {
  const quality = normalizeQualityTier(item.quality);
  const cap = durabilityCapForQuality(quality);
  const current = Number.isFinite(item.durabilityScore)
    ? Math.max(0, Math.floor(Number(item.durabilityScore)))
    : 0;
  const missing = Math.max(0, cap - current);
  const cost = getWearableRepairCost(item);
  return `Repair cost = ceil(((${cap} - ${current}) * quality multiplier) / 10) = ${cost}`;
}

function RepairCostInfo({
  item,
}: {
  item: {
    quality?: string | QualityTier | null;
    durabilityScore?: number | null;
  };
}) {
  const quality = normalizeQualityTier(item.quality);
  const cap = durabilityCapForQuality(quality);
  const current = Number.isFinite(item.durabilityScore)
    ? Math.max(0, Math.floor(Number(item.durabilityScore)))
    : 0;
  const multiplier =
    quality === 'flawless'
      ? 2
      : quality === 'excellent'
        ? 1.5
        : quality === 'average'
          ? 1
          : quality === 'budget'
            ? 0.75
            : 0.5;
  const cost = getWearableRepairCost(item);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white/60 transition-colors hover:text-white"
          aria-label="Show repair cost calculation"
          onClick={(event) => event.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-w-xs border border-white/10 bg-black/90 text-white"
        style={{ top: '50%', bottom: 'auto' }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">Repair Cost</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-white/80">
          <div>Current durability: {current}</div>
          <div>Quality cap: {cap}</div>
          <div>Missing durability: {cap - current}</div>
          <div>Quality multiplier: {multiplier}x</div>
          <div className="font-medium text-white">
            Cost = ceil((({cap} - {current}) * {multiplier}) / 10) = {cost}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function scaleModifierForQuality(
  modifier: EquipmentStatModifier,
  scalar: number
): EquipmentStatModifier {
  const op = modifier.operation ?? 'add';
  const value = modifier.value;
  if (!Number.isFinite(value)) {
    return modifier;
  }

  if (op === 'add') {
    return {
      ...modifier,
      value: value * scalar,
    };
  }

  if (op === 'mul') {
    return {
      ...modifier,
      value: 1 + (value - 1) * scalar,
    };
  }

  if (op === 'add_percent') {
    return {
      ...modifier,
      value: value * scalar,
    };
  }

  return modifier;
}

// Multiplier to convert per-second HP regen to per-turn (idle mode)
const HP_REGEN_PER_TURN_MULTIPLIER = 25;

// Format equipment stat modifier into a compact human-readable token
function formatModifier(mod: {
  stat: keyof typeof STAT;
  value: number;
  operation?: 'add' | 'mul' | 'add_percent';
}): string {
  const op = mod.operation ?? 'add';
  let label = EQUIPMENT_STAT_LABELS[
    mod.stat as keyof typeof EQUIPMENT_STAT_LABELS
  ] as string;
  // Abbreviate for compact UI
  label = label.replace(/Health/g, 'HP').replace(/Damage/g, 'DMG');
  // Remove leading percent symbol in label to avoid duplicates like "% % DMG"
  let normalizedLabel = label.replace(/^%\s*/, '');
  // For health, prefer simply "HP" instead of "Max HP"
  if ((mod.stat as any) === (STAT as any).maxHealth) {
    normalizedLabel = 'HP';
  }
  if (mod.stat === STAT.armor) {
    normalizedLabel = 'Armor';
  }
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  if (op === 'mul') {
    const pct = Math.round((mod.value - 1) * 100);
    return `${pct >= 0 ? '+' : ''}${pct}% ${normalizedLabel}`;
  }
  const cfg = (STAT_CONFIG as Record<string, { isPercent?: boolean }>)[
    mod.stat
  ];
  if (op === 'add_percent' || cfg?.isPercent) {
    const pct = Math.round(mod.value * 100);
    return `${pct >= 0 ? '+' : ''}${pct}% ${normalizedLabel}`;
  }
  // Special handling for hpRegen: display as per-turn value
  if (mod.stat === STAT.hpRegen && op === 'add') {
    const perTurn = Math.floor(mod.value * HP_REGEN_PER_TURN_MULTIPLIER);
    return `${sign(perTurn)} HP per turn`;
  }
  // add (flat)
  const value =
    Math.abs(mod.value) % 1 === 0
      ? Math.trunc(mod.value)
      : Number(mod.value.toFixed(2));
  return `${sign(value)} ${normalizedLabel}`;
}

// Convert slug-like strings (e.g., "melee-weapon") into human-friendly title case labels
function toTitleCaseFromSlug(input: string): string {
  return input
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function summarizeWearable(
  wearable: ReturnType<typeof getWearableBySlug> | undefined,
  options: { quality?: QualityTier } = {}
): string | null {
  if (!wearable) return null;
  const quality = normalizeQualityTier(options.quality);
  const qualityScalar = getQualityScalar(quality);
  const parts: string[] = [];

  // Weapon profile quick summary (quality-scaled)
  if (isWeaponWearable(wearable) && wearable.weapon) {
    const w = wearable.weapon;
    if (w.grenade) {
      const g = w.grenade as any;
      const edge =
        typeof g?.damageEdge === 'number'
          ? Math.max(0, Math.round(g.damageEdge * qualityScalar))
          : 0;
      const center =
        typeof g?.damageCenter === 'number'
          ? Math.max(0, Math.round(g.damageCenter * qualityScalar))
          : edge;
      const min = Math.min(edge, center);
      const max = Math.max(edge, center);
      if (min > 0 || max > 0) {
        parts.push(`GREN DMG ${min}-${max}`);
      }
      // Healing splash grenades (e.g. milkshake)
      if (typeof g?.healingSplash?.healAmount === 'number' && g.healingSplash.healAmount > 0) {
        const healAmount = Math.round(g.healingSplash.healAmount * qualityScalar);
        parts.push(`Heals ${healAmount} HP`);
      }
      if (typeof g?.cooldownMs === 'number') {
        parts.push(`Cooldown ${Math.ceil(g.cooldownMs / 1000)} turns`);
      }
    } else {
      if (w.damageRange) {
        const min = Math.round(w.damageRange.min * qualityScalar);
        const max = Math.round(w.damageRange.max * qualityScalar);
        parts.push(`DMG ${min}-${max}`);
      } else if (typeof w.damage === 'number') {
        parts.push(`DMG ${Math.round(w.damage * qualityScalar)}`);
      }
      if (typeof w.attackSpeed === 'number') {
        parts.push(`Attack Speed ${w.attackSpeed} ms`);
      }
    }
  }

  // Prefer explicit wearable effects; otherwise fall back to base type effects by rarity
  const resolvedEffects = (() => {
    if (Array.isArray(wearable.effects) && wearable.effects.length > 0) {
      return wearable.effects;
    }
    const slot = getPrimarySlot(wearable) as keyof typeof ITEM_TYPE_EFFECTS;
    const itemType = (wearable as any).itemType as string | undefined;
    if (!itemType) return [] as any[];
    const rarity = getWearableRarity(wearable);
    const bySlot = (ITEM_TYPE_EFFECTS as any)[slot] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const byType = bySlot?.[itemType] as
      | Record<string, { type: 'stat'; modifiers: any[] }[]>
      | undefined;
    const effects = byType?.[rarity] || byType?.common || [];
    return Array.isArray(effects) ? effects : [];
  })();

  // Effects (stat modifiers) scaled by quality
  for (const effect of resolvedEffects) {
    if (!effect || effect.type !== 'stat') continue;
    const modifiers = Array.isArray(effect.modifiers) ? effect.modifiers : [];
    for (const mod of modifiers) {
      try {
        const scaled = scaleModifierForQuality(
          mod as EquipmentStatModifier,
          qualityScalar
        );
        parts.push(formatModifier(scaled as any));
      } catch {
        // ignore formatting issues
      }
    }
  }

  // Abilities (unchanged by quality for now)
  if (wearable.abilities && wearable.abilities.length) {
    for (const ability of wearable.abilities) {
      const id = ability.id;
      const p: any = ability.params ?? {};
      if (id === 'evade' && typeof p.chance === 'number') {
        parts.push(`Evade ${Math.round(p.chance * 100)}%`);
      } else if (id === 'regen' && typeof p.perSecond === 'number') {
        const perTurn = Math.floor(p.perSecond * HP_REGEN_PER_TURN_MULTIPLIER);
        parts.push(`+${perTurn} HP per turn`);
      } else if (
        id === 'augmented-vision' &&
        typeof p.multiplier === 'number'
      ) {
        parts.push(`Vision +${Math.round((p.multiplier - 1) * 100)}%`);
      } else if (id === 'damage-reduction') {
        if (typeof p.armor === 'number') {
          parts.push(`Armor +${Math.round(p.armor)}`);
        } else if (typeof p.percent === 'number') {
          parts.push(`Armor +${Math.round(p.percent * 100)}`);
        }
      } else if (id === 'attack-speed' && typeof p.multiplier === 'number') {
        parts.push(`Atk Spd +${Math.round((p.multiplier - 1) * 100)}%`);
      } else if (id === 'move-speed' && typeof p.multiplier === 'number') {
        parts.push(`Move +${Math.round((p.multiplier - 1) * 100)}%`);
      } else if (
        id === 'damage-multiplier' &&
        typeof p.multiplier === 'number'
      ) {
        parts.push(`DMG +${Math.round((p.multiplier - 1) * 100)}%`);
      } else if (id === 'critical-strike' && typeof p.chance === 'number') {
        parts.push(`Crit ${Math.round(p.chance * 100)}% x${p.multiplier ?? 2}`);
      } else if (id === 'tongue-farm' && typeof p.bonusChance === 'number') {
        parts.push(`Tongue +${Math.round(p.bonusChance * 100)}%`);
      }
    }
  }

  if (parts.length === 0) return null;
  return parts.join(' • ');
}

function getWearableKindLabel(
  wearable: ReturnType<typeof getWearableBySlug> | undefined
): string | null {
  if (!wearable) return null;
  const raw = (wearable as any)?.itemType as string | undefined;
  if (typeof raw === 'string' && raw.length > 0) {
    return toTitleCaseFromSlug(raw);
  }
  return 'Wearable';
}

export default function InventoryClient({
  initialItems = [] as InventoryItem[],
}: {
  initialItems?: InventoryItem[];
}) {
  const { hasValidSession, playerId } = useSession();
  const {
    effectivePreferences,
    arePreferencesHydrated,
    inventory,
    equipment,
  } = usePlayer();

  const {
    inventoryItems,
    setInventoryItems,
    refreshInventory,
    requestDestroy,
    destroyError,
    setDestroyError,
  } = inventory;
  const repairEndpoint = useMemo(() => {
    const baseUrl = getAppServerBaseUrl();
    return baseUrl
      ? `${baseUrl}/api/player/inventory/repair`
      : '/api/player/inventory/repair';
  }, []);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairingItemId, setRepairingItemId] = useState<string | null>(null);
  const [repairingAll, setRepairingAll] = useState(false);

  const hydratedCharacterId = useMemo(() => {
    if (!arePreferencesHydrated) return null;
    return effectivePreferences.selectedCharacterId ?? null;
  }, [arePreferencesHydrated, effectivePreferences.selectedCharacterId]);

  const activeCharacterId = useMemo(() => {
    if (hydratedCharacterId) return hydratedCharacterId;
    return equipment.state?.characterId ?? null;
  }, [hydratedCharacterId, equipment.state?.characterId]);

  const heroName = useMemo(() => {
    const characterId = activeCharacterId;
    if (!characterId) {
      return 'your selected hero';
    }
    if (characterId.startsWith('gotchi:')) {
      const idPart = characterId.split(':')[1];
      return idPart ? `Gotchi #${idPart}` : 'your gotchi';
    }
    const match = CHARACTERS.find((character) => character.id === characterId);
    return match?.info.name ?? 'your selected hero';
  }, [activeCharacterId]);

  useEffect(() => {
    if (initialItems?.length) {
      setInventoryItems(initialItems);
    }
  }, [initialItems, setInventoryItems]);

  // Ensure equipment state reflects the currently selected hero
  useEffect(() => {
    if (!hasValidSession || !arePreferencesHydrated) return;
    void equipment.refresh();
  }, [hasValidSession, arePreferencesHydrated, hydratedCharacterId]);

  const totalItems = useMemo(() => {
    return inventoryItems.reduce(
      (acc, item) => acc + Math.max(0, Number(item.quantity) || 0),
      0
    );
  }, [inventoryItems]);

  const wearableCount = useMemo(
    () => inventoryItems.filter((item) => item.type === 'wearable').length,
    [inventoryItems]
  );
  const goldCount = useMemo(() => {
    const goldItem = inventoryItems.find(
      (item) =>
        item.type === 'coin' &&
        String(item.name ?? '').trim().toLowerCase() === 'gold'
    );
    return Math.max(0, Number(goldItem?.quantity) || 0);
  }, [inventoryItems]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectionParam, setSelectionParam] = useQueryState(
    INVENTORY_SELECTION_QUERY_KEY,
    { history: 'replace' }
  );
  const selectedKeys = useMemo(
    () => decodeSelection(selectionParam),
    [selectionParam]
  );

  // Filter state with URL persistence
  const [itemTypeFilter, setItemTypeFilter] = useQueryState(
    'type',
    parseAsStringLiteral(ITEM_TYPE_OPTIONS).withDefault('all')
  );
  const [slotFilter, setSlotFilter] = useQueryState(
    'slot',
    parseAsStringLiteral(SLOT_OPTIONS).withDefault('all')
  );
  const [rarityFilter, setRarityFilter] = useQueryState(
    'rarity',
    parseAsStringLiteral(RARITY_OPTIONS).withDefault('all')
  );
  const [weaponTypeFilter, setWeaponTypeFilter] = useQueryState(
    'weapon',
    parseAsStringLiteral(WEAPON_TYPE_OPTIONS).withDefault('all')
  );
  const [wearableCategoryFilter, setWearableCategoryFilter] = useQueryState(
    'category',
    parseAsStringLiteral(WEARABLE_CATEGORY_OPTIONS).withDefault('all')
  );
  const [showFilters, setShowFilters] = useState(false);

  const repairWearable = useCallback(
    async (inventoryItemId: string) => {
      if (!inventoryItemId) {
        return;
      }
      setRepairingItemId(inventoryItemId);
      setRepairError(null);
      try {
        const response = await fetch(repairEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inventoryItemId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to repair wearable'
          );
        }
        await Promise.all([refreshInventory(true), equipment.refresh()]);
      } catch (error) {
        setRepairError(
          error instanceof Error ? error.message : 'Failed to repair wearable'
        );
      } finally {
        setRepairingItemId(null);
      }
    },
    [equipment, refreshInventory, repairEndpoint]
  );

  const repairWearables = useCallback(
    async (inventoryItemIds: string[]) => {
      const targetIds = Array.from(
        new Set(
          inventoryItemIds.filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0
          )
        )
      );
      if (targetIds.length === 0) {
        return;
      }
      setRepairingAll(true);
      setRepairError(null);
      try {
        const response = await fetch(repairEndpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inventoryItemIds: targetIds }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof payload?.message === 'string'
              ? payload.message
              : 'Failed to repair wearables'
          );
        }
        await Promise.all([refreshInventory(true), equipment.refresh()]);
      } catch (error) {
        setRepairError(
          error instanceof Error ? error.message : 'Failed to repair wearables'
        );
      } finally {
        setRepairingAll(false);
      }
    },
    [equipment, refreshInventory, repairEndpoint]
  );

  const hasActiveFilters = useMemo(() => {
    return (
      itemTypeFilter !== 'all' ||
      slotFilter !== 'all' ||
      rarityFilter !== 'all' ||
      weaponTypeFilter !== 'all' ||
      wearableCategoryFilter !== 'all'
    );
  }, [itemTypeFilter, slotFilter, rarityFilter, weaponTypeFilter, wearableCategoryFilter]);

  const clearAllFilters = useCallback(() => {
    setItemTypeFilter('all');
    setSlotFilter('all');
    setRarityFilter('all');
    setWeaponTypeFilter('all');
    setWearableCategoryFilter('all');
  }, [setItemTypeFilter, setSlotFilter, setRarityFilter, setWeaponTypeFilter, setWearableCategoryFilter]);

  const setSelectionFromSet = useCallback(
    (nextSet: Set<string>) => {
      const encoded = encodeSelection(nextSet);
      if (encoded) {
        setSelectionParam(encoded);
      } else {
        setSelectionParam(null);
      }
    },
    [setSelectionParam]
  );

  const toggleSelection = useCallback(
    (key: string, explicit?: boolean) => {
      if (!key) {
        return;
      }
      const next = new Set(selectedKeys);
      const shouldSelect = explicit !== undefined ? explicit : !next.has(key);
      if (shouldSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }
      setSelectionFromSet(next);
    },
    [selectedKeys, setSelectionFromSet]
  );

  const clearSelection = useCallback(() => {
    setSelectionParam(null);
  }, [setSelectionParam]);

  // Build display entries with client-only stacking for identical wearables
  const displayEntries = useMemo<DisplayEntry[]>(() => {
    const entries: DisplayEntry[] = [];
    const wearableGroups = new Map<
      string,
      { items: InventoryItem[]; keys: string[] }
    >();

    for (const item of inventoryItems) {
      const key = getInventorySelectionKey(item);
      if (item.type === 'wearable') {
        const groupKey = getWearableStackKey(item);
        if (groupKey) {
          const group = wearableGroups.get(groupKey);
          if (group) {
            group.items.push(item);
            group.keys.push(key);
          } else {
            wearableGroups.set(groupKey, { items: [item], keys: [key] });
          }
          continue;
        }
      }
      // Non-wearables or unstackable wearables render as-is
      const quantity = Math.max(0, Number(item.quantity) || 0);
      entries.push({
        item,
        selectionKeys: [key],
        quantityDisplay: quantity,
        displayKey: key,
        isWearableStack: false,
      });
    }

    // Emit wearable stacks
    wearableGroups.forEach((group, groupKey) => {
      const representative =
        sortInventoryItemsByQuality(group.items)[0] ?? group.items[0];
      entries.push({
        item: representative,
        selectionKeys: group.keys,
        quantityDisplay: group.items.length,
        displayKey: `stack::${groupKey}`,
        isWearableStack: true,
      });
    });

    return entries;
  }, [inventoryItems]);

  // Apply filters to display entries
  const filteredDisplayEntries = useMemo<DisplayEntry[]>(() => {
    return displayEntries.filter((entry) => {
      const item = entry.item;

      // Item type filter
      if (itemTypeFilter !== 'all') {
        if (item.type !== itemTypeFilter) {
          return false;
        }
      }

      // For non-wearables, no further filtering
      if (item.type !== 'wearable') {
        return true;
      }

      // Wearable-specific filters
      const wearable = item.wearableSlug
        ? getWearableBySlug(item.wearableSlug)
        : undefined;

      // Slot filter
      if (slotFilter !== 'all' && wearable) {
        const slots = wearable.slots || [];
        const hasSlot = slots.some((s) => s === slotFilter);
        // For hand slots, also check 'hands' for backwards compatibility
        const isHandSlot = slotFilter === 'handLeft' || slotFilter === 'handRight';
        const hasHandsSlot = isHandSlot && slots.some((s) => s === 'handLeft' || s === 'handRight');
        if (!hasSlot && !hasHandsSlot) {
          return false;
        }
      }

      // Rarity filter
      if (rarityFilter !== 'all' && wearable) {
        const wearableRarity = getWearableRarity(wearable);
        if (wearableRarity !== rarityFilter) {
          return false;
        }
      }

      // Weapon type filter (only applies to weapons)
      if (weaponTypeFilter !== 'all') {
        if (!wearable || !isWeaponWearable(wearable)) {
          return false;
        }
        const itemType = (wearable as any).itemType as WearableItemType | undefined;
        if (itemType !== weaponTypeFilter) {
          return false;
        }
      }

      // Wearable category filter (non-weapon wearables)
      if (wearableCategoryFilter !== 'all') {
        if (!wearable) {
          return false;
        }
        const itemType = (wearable as any).itemType as WearableItemType | undefined;
        if (itemType !== wearableCategoryFilter) {
          return false;
        }
      }

      return true;
    });
  }, [displayEntries, itemTypeFilter, slotFilter, rarityFilter, weaponTypeFilter, wearableCategoryFilter]);

  const displayCount = useMemo(() => filteredDisplayEntries.length, [filteredDisplayEntries]);

  const selectedItems = useMemo(() => {
    if (selectedKeys.size === 0) {
      return [] as Array<{ key: string; item: InventoryItem }>;
    }
    const map = new Map<string, InventoryItem>();
    inventoryItems.forEach((item) => {
      map.set(getInventorySelectionKey(item), item);
    });
    const results: Array<{ key: string; item: InventoryItem }> = [];
    selectedKeys.forEach((key) => {
      const item = map.get(key);
      if (item) {
        results.push({ key, item });
      }
    });
    return results;
  }, [inventoryItems, selectedKeys]);

  const hasSelection = selectedItems.length > 0;

  const [isDestroyDialogOpen, setIsDestroyDialogOpen] = useState(false);
  const [destroyFormEntries, setDestroyFormEntries] = useState<
    DestroyFormEntry[]
  >([]);
  const [isDestroying, setIsDestroying] = useState(false);
  const isDestroyDialogValid = destroyFormEntries.every(
    (entry) => entry.isWearable || entry.quantity > 0
  );
  // Optimistic destroy removed – no pending state

  useEffect(() => {
    if (!isEditMode) {
      clearSelection();
    }
  }, [isEditMode, clearSelection]);

  useEffect(() => {
    if (!selectionParam) {
      return;
    }
    const parsed = decodeSelection(selectionParam);
    if (parsed.size === 0) {
      return;
    }
    const validKeys = new Set<string>();
    inventoryItems.forEach((item) => {
      validKeys.add(getInventorySelectionKey(item));
    });
    const trimmed = new Set<string>();
    let changed = false;
    parsed.forEach((key) => {
      if (validKeys.has(key)) {
        trimmed.add(key);
      } else {
        changed = true;
      }
    });
    if (changed) {
      setSelectionFromSet(trimmed);
    }
  }, [inventoryItems, selectionParam, setSelectionFromSet]);

  const openDestroyDialog = useCallback(() => {
    if (!selectedItems.length) {
      return;
    }
    const entries: DestroyFormEntry[] = selectedItems.map(({ key, item }) => {
      const maxQuantity =
        item.type === 'wearable'
          ? 1
          : Math.max(1, Math.floor(Number(item.quantity) || 0));
      return {
        key,
        item,
        quantity: maxQuantity,
        maxQuantity,
        isWearable: item.type === 'wearable',
      };
    });
    setDestroyFormEntries(entries);
    setIsDestroyDialogOpen(true);
  }, [selectedItems]);

  useEffect(() => {
    if (!isDestroyDialogOpen) {
      return;
    }
    if (!selectedItems.length) {
      setIsDestroyDialogOpen(false);
      return;
    }
    setDestroyFormEntries((prev) => {
      const map = new Map(prev.map((entry) => [entry.key, entry]));
      const nextEntries: DestroyFormEntry[] = [];
      selectedItems.forEach(({ key, item }) => {
        const maxQuantity =
          item.type === 'wearable'
            ? 1
            : Math.max(1, Math.floor(Number(item.quantity) || 0));
        const existing = map.get(key);
        const quantity =
          item.type === 'wearable'
            ? 1
            : Math.min(existing?.quantity ?? maxQuantity, maxQuantity);
        nextEntries.push({
          key,
          item,
          maxQuantity,
          quantity,
          isWearable: item.type === 'wearable',
        });
      });
      return nextEntries;
    });
  }, [isDestroyDialogOpen, selectedItems]);

  const handleQuantityChange = useCallback((key: string, value: number) => {
    setDestroyFormEntries((prev) =>
      prev.map((entry) => {
        if (entry.key !== key || entry.isWearable) {
          return entry;
        }
        const normalized = Math.floor(Number(value) || 0);
        const nextQuantity = Math.max(
          1,
          Math.min(entry.maxQuantity, normalized)
        );
        return {
          ...entry,
          quantity: nextQuantity,
        };
      })
    );
  }, []);

  const handleSetMaxQuantity = useCallback((key: string) => {
    setDestroyFormEntries((prev) =>
      prev.map((entry) =>
        entry.key === key && !entry.isWearable
          ? { ...entry, quantity: entry.maxQuantity }
          : entry
      )
    );
  }, []);

  const handleConfirmDestroy = useCallback(async () => {
    if (!destroyFormEntries.length) {
      return;
    }
    setIsDestroying(true);
    const requests: DestroyInventoryRequest[] = destroyFormEntries.map(
      (entry) =>
        entry.isWearable
          ? {
              kind: 'wearable' as const,
              inventoryItemId:
                entry.item.inventoryItemId ?? entry.item.id ?? entry.key,
            }
          : {
              kind: 'fungible' as const,
              itemType: entry.item.type,
              itemName: entry.item.name ?? 'item',
              quantity: entry.quantity,
              stackKey: entry.key,
            }
    );
    try {
      const ok = await requestDestroy(requests);
      if (ok) {
        setIsDestroyDialogOpen(false);
        clearSelection();
      }
    } finally {
      setIsDestroying(false);
    }
  }, [destroyFormEntries, requestDestroy, clearSelection]);

  if (!hasValidSession) {
    return (
      <div className="text-white/70">
        Connect your wallet and sign in to view your inventory.
      </div>
    );
  }

  return (
    <>
      <section>
        <EquipmentSection
          equipment={equipment.state}
          isLoading={equipment.isLoading}
          isSaving={equipment.isSaving}
          error={equipment.error}
          onEquip={equipment.equip}
          onUnequip={equipment.unequip}
          onBatchEquip={equipment.batchEquip}
          onBatchUnequip={equipment.batchUnequip}
          onRepair={repairWearable}
          onRepairAll={repairWearables}
          repairingItemId={repairingItemId}
          repairingAll={repairingAll}
          inventoryItems={inventoryItems}
          goldCount={goldCount}
          heroName={heroName}
          characterId={activeCharacterId}
        />

        {repairError ? (
          <div className="mb-4 text-sm text-red-400">{repairError}</div>
        ) : null}

        <div className="mb-4 grid gap-2 text-sm text-white/70 sm:grid-cols-3">
          <span>
            <span className="font-semibold text-white">{displayCount}</span>{' '}
            unique entries
          </span>
          <span>
            <span className="font-semibold text-white">{wearableCount}</span>{' '}
            wearable instances
          </span>
          <span>
            <span className="font-semibold text-white">{totalItems}</span> total
            quantity
          </span>
        </div>

        {destroyError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-600/10 px-4 py-3 text-sm text-red-200">
            <div className="flex items-start justify-between gap-3">
              <span>{destroyError}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-200 hover:text-red-100"
                onClick={() => setDestroyError(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {inventoryItems.length === 0 ? (
          <div className="text-white/60">Your inventory is empty.</div>
        ) : (
          <>
            {/* Filter Controls */}
            <div className="mb-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={showFilters ? 'secondary' : 'outline'}
                  onClick={() => setShowFilters(!showFilters)}
                  className="gap-2"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs font-bold">
                      !
                    </span>
                  )}
                </Button>
                {hasActiveFilters && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearAllFilters}
                    className="text-white/60 hover:text-white"
                  >
                    Clear filters
                  </Button>
                )}
              </div>

              {showFilters && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                  {/* Item Type Filter */}
                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/70">
                      Item Type
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ITEM_TYPE_OPTIONS.map((option) => (
                        <button
                          key={option}
                          onClick={() => setItemTypeFilter(option)}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                            itemTypeFilter === option
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                          )}
                        >
                          {ITEM_TYPE_FILTER_LABELS[option]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Show wearable-specific filters only when wearable is selected or all */}
                  {(itemTypeFilter === 'all' || itemTypeFilter === 'wearable') && (
                    <>
                      {/* Slot Filter */}
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/70">
                          Slot
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {SLOT_OPTIONS.map((option) => (
                            <button
                              key={option}
                              onClick={() => {
                                setSlotFilter(option);
                                if (option !== 'all') {
                                  setItemTypeFilter('wearable');
                                }
                              }}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                slotFilter === option
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                              )}
                            >
                              {SLOT_FILTER_LABELS[option]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rarity Filter */}
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/70">
                          Rarity
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {RARITY_OPTIONS.map((option) => (
                            <button
                              key={option}
                              onClick={() => {
                                setRarityFilter(option);
                                if (option !== 'all') {
                                  setItemTypeFilter('wearable');
                                }
                              }}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                rarityFilter === option
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                              )}
                            >
                              {RARITY_FILTER_LABELS[option]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Weapon Type Filter */}
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/70">
                          Weapon Type
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {WEAPON_TYPE_OPTIONS.map((option) => (
                            <button
                              key={option}
                              onClick={() => {
                                setWeaponTypeFilter(option);
                                if (option !== 'all') {
                                  setWearableCategoryFilter('all');
                                  setItemTypeFilter('wearable');
                                }
                              }}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                weaponTypeFilter === option
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                              )}
                            >
                              {option === 'all' ? 'All Weapons' : toTitleCaseFromSlug(option)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Wearable Category Filter */}
                      <div>
                        <label className="mb-2 block text-xs font-medium text-white/70">
                          Wearable Category
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {WEARABLE_CATEGORY_OPTIONS.slice(0, 12).map((option) => (
                            <button
                              key={option}
                              onClick={() => {
                                setWearableCategoryFilter(option);
                                if (option !== 'all') {
                                  setWeaponTypeFilter('all');
                                  setItemTypeFilter('wearable');
                                }
                              }}
                              className={cn(
                                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                wearableCategoryFilter === option
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                              )}
                            >
                              {option === 'all' ? 'All Categories' : toTitleCaseFromSlug(option)}
                            </button>
                          ))}
                        </div>
                        {WEARABLE_CATEGORY_OPTIONS.length > 12 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {WEARABLE_CATEGORY_OPTIONS.slice(12).map((option) => (
                              <button
                                key={option}
                                onClick={() => {
                                  setWearableCategoryFilter(option);
                                  if (option !== 'all') {
                                    setWeaponTypeFilter('all');
                                    setItemTypeFilter('wearable');
                                  }
                                }}
                                className={cn(
                                  'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                  wearableCategoryFilter === option
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                )}
                              >
                                {toTitleCaseFromSlug(option)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-white/60">
                {hasSelection
                  ? `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} selected`
                  : hasActiveFilters
                    ? `Showing ${displayCount} of ${displayEntries.length} items`
                    : 'Tap Edit to select items for removal.'}
              </div>
              <Button
                size="sm"
                variant={isEditMode ? 'secondary' : 'outline'}
                onClick={() => {
                  if (isEditMode) {
                    setIsEditMode(false);
                    clearSelection();
                  } else {
                    setIsEditMode(true);
                  }
                }}
              >
                {isEditMode ? 'Done' : 'Edit'}
              </Button>
            </div>

            {filteredDisplayEntries.length === 0 && hasActiveFilters ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                <p className="text-white/60">No items match your filters.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAllFilters}
                  className="mt-3"
                >
                  Clear filters
                </Button>
              </div>
            ) : (
            <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredDisplayEntries.map((entry) => {
                const item = entry.item;
                const allSelected = entry.selectionKeys.every((k) =>
                  selectedKeys.has(k)
                );
                const handleItemClick = () => {
                  if (!isEditMode) return;
                  const next = new Set(selectedKeys);
                  const shouldSelect = !entry.selectionKeys.every((k) =>
                    next.has(k)
                  );
                  if (shouldSelect) {
                    entry.selectionKeys.forEach((k) => next.add(k));
                  } else {
                    entry.selectionKeys.forEach((k) => next.delete(k));
                  }
                  setSelectionFromSet(next);
                };
                const shouldShowQtyBadge = entry.quantityDisplay > 1;
                const formattedQty =
                  entry.quantityDisplay > 9999
                    ? '9999+'
                    : String(entry.quantityDisplay);
                return (
                  <li
                    key={entry.displayKey}
                    className={cn(
                      'relative group overflow-hidden rounded-xl border transition',
                      allSelected
                        ? 'border-emerald-400/70 bg-emerald-500/10 ring-2 ring-emerald-400/40'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    )}
                    onClick={handleItemClick}
                  >
                    {isEditMode && (
                      <label
                        className="absolute right-3 top-3 z-10 flex items-center justify-center rounded-full bg-black/60 p-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/50 bg-black/40"
                          checked={allSelected}
                          onChange={(event) => {
                            const next = new Set(selectedKeys);
                            const shouldSelect = event.target.checked;
                            if (shouldSelect) {
                              entry.selectionKeys.forEach((k) => next.add(k));
                            } else {
                              entry.selectionKeys.forEach((k) =>
                                next.delete(k)
                              );
                            }
                            setSelectionFromSet(next);
                          }}
                        />
                      </label>
                    )}
                    {shouldShowQtyBadge ? (
                      <div
                        className={cn(
                          'absolute top-2 z-[1] bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold',
                          isEditMode ? 'right-10' : 'right-2'
                        )}
                      >
                        {formattedQty}
                      </div>
                    ) : null}
                    <div className={cn('p-4', isEditMode ? 'pr-10' : '')}>
                      {item.type === 'wearable' ? (
                        <div className="flex flex-col items-center text-center gap-3">
                          <ItemIcon item={item} />
                          <div className="w-full min-w-0">
                            <div
                              className="text-sm font-medium leading-tight truncate"
                              style={{ minHeight: '1.3em' }}
                            >
                              {formatWearableDisplayName({
                                quality: item.quality,
                                wearableId: item.wearableId,
                                wearableSlug: item.wearableSlug,
                                fallbackName: item.name,
                              })}
                            </div>
                            {(() => {
                              const wearableDef = item.wearableSlug
                                ? getWearableBySlug(item.wearableSlug)
                                : item.wearableId
                                  ? getWearableById(item.wearableId)
                                  : undefined;
                              if (!wearableDef) return null;
                              const rarity = getWearableRarity(wearableDef);
                              const typeLabel =
                                getWearableKindLabel(wearableDef);
                              const combined = typeLabel
                                ? `${rarity} / ${typeLabel}`
                                : rarity;
                              return (
                                <div className="mt-0.5 text-[11px] uppercase tracking-wide text-white/60">
                                  {combined}
                                </div>
                              );
                            })()}
                            {(() => {
                              const wearableDef = item.wearableSlug
                                ? getWearableBySlug(item.wearableSlug)
                                : item.wearableId
                                  ? getWearableById(item.wearableId)
                                  : undefined;
                              if (!wearableDef) return null;
                              const qualityTier = normalizeQualityTier(
                                item.quality
                              );
                              const qualityScalar =
                                getQualityScalar(qualityTier);
                              let lines: string[] = [];
                              // Weapon summary
                              if (
                                isWeaponWearable(wearableDef) &&
                                wearableDef.weapon
                              ) {
                                const w = wearableDef.weapon;
                                if (w.grenade) {
                                  const g = w.grenade as any;
                                  const damageEdge =
                                    typeof g?.damageEdge === 'number'
                                      ? g.damageEdge * qualityScalar
                                      : 0;
                                  const damageCenter =
                                    typeof g?.damageCenter === 'number'
                                      ? g.damageCenter * qualityScalar
                                      : damageEdge;
                                  const min = Math.max(
                                    0,
                                    Math.round(
                                      Math.min(damageEdge, damageCenter)
                                    )
                                  );
                                  const max = Math.max(
                                    min,
                                    Math.round(
                                      Math.max(damageEdge, damageCenter)
                                    )
                                  );
                                  if (min > 0 || max > 0) {
                                    lines.push(`DMG ${min}-${max}`);
                                  }
                                  // Healing splash grenades (e.g. milkshake)
                                  if (typeof g?.healingSplash?.healAmount === 'number' && g.healingSplash.healAmount > 0) {
                                    const healAmount = Math.round(g.healingSplash.healAmount * qualityScalar);
                                    lines.push(`Heals ${healAmount} HP`);
                                  }
                                  if (typeof g.cooldownMs === 'number') {
                                    lines.push(`Cooldown ${Math.ceil(g.cooldownMs / 1000)} turns`);
                                  }
                                } else {
                                  if (w.damageRange) {
                                    lines.push(
                                      `DMG ${Math.round(w.damageRange.min * qualityScalar)}-${Math.round(w.damageRange.max * qualityScalar)}`
                                    );
                                  } else if (typeof w.damage === 'number') {
                                    lines.push(
                                      `DMG ${Math.round(w.damage * qualityScalar)}`
                                    );
                                  }
                                  if (typeof w.attackSpeed === 'number') {
                                    lines.push(
                                      `Attack Speed ${w.attackSpeed} ms`
                                    );
                                  }
                                }
                              }
                              // Effects
                              const resolvedEffects = (() => {
                                if (
                                  Array.isArray(wearableDef.effects) &&
                                  wearableDef.effects.length > 0
                                ) {
                                  return wearableDef.effects;
                                }
                                const slot = getPrimarySlot(
                                  wearableDef
                                ) as keyof typeof ITEM_TYPE_EFFECTS;
                                const itemType = (wearableDef as any)
                                  .itemType as string | undefined;
                                if (!itemType) return [] as any[];
                                const rarity = getWearableRarity(wearableDef);
                                const bySlot = (ITEM_TYPE_EFFECTS as any)[
                                  slot
                                ] as
                                  | Record<string, Record<string, unknown>>
                                  | undefined;
                                const byType = bySlot?.[itemType] as
                                  | Record<
                                      string,
                                      { type: 'stat'; modifiers: any[] }[]
                                    >
                                  | undefined;
                                const effects =
                                  byType?.[rarity] || byType?.common || [];
                                return Array.isArray(effects) ? effects : [];
                              })();
                              for (const effect of resolvedEffects) {
                                if (!effect || effect.type !== 'stat') continue;
                                const modifiers = (
                                  Array.isArray(effect.modifiers)
                                    ? effect.modifiers
                                    : []
                                )
                                  // Prioritize key combat stats so the most important details are visible first
                                  .slice()
                                  .sort((a: any, b: any) => {
                                    const priority = (s: string) =>
                                      s === 'totalDamage'
                                        ? 0
                                        : s === 'attackSpeed'
                                          ? 1
                                          : s === 'projectileSpeed'
                                            ? 2
                                            : s === 'rangedAttackRange' ||
                                                s === 'meleeAttackRange'
                                              ? 3
                                              : s === 'damage' ||
                                                  s === 'damageMin' ||
                                                  s === 'damageMax'
                                                ? 4
                                                : 5;
                                    return (
                                      priority((a as any)?.stat) -
                                      priority((b as any)?.stat)
                                    );
                                  });
                                for (const mod of modifiers) {
                                  try {
                                    const scaled = scaleModifierForQuality(
                                      mod as EquipmentStatModifier,
                                      qualityScalar
                                    );
                                    lines.push(formatModifier(scaled as any));
                                  } catch {
                                    // ignore formatting
                                  }
                                }
                              }
                              // Abilities (common quick lines)
                              if (
                                wearableDef.abilities &&
                                wearableDef.abilities.length
                              ) {
                                for (const ability of wearableDef.abilities) {
                                  const id = ability.id;
                                  const p: any = ability.params ?? {};
                                  if (
                                    id === 'evade' &&
                                    typeof p.chance === 'number'
                                  ) {
                                    lines.push(
                                      `Evade ${Math.round(p.chance * 100)}%`
                                    );
                                  } else if (
                                    id === 'regen' &&
                                    typeof p.perSecond === 'number'
                                  ) {
                                    const perTurn = Math.floor(p.perSecond * HP_REGEN_PER_TURN_MULTIPLIER);
                                    lines.push(`+${perTurn} HP per turn`);
                                  } else if (
                                    id === 'augmented-vision' &&
                                    typeof p.multiplier === 'number'
                                  ) {
                                    lines.push(
                                      `Vision +${Math.round((p.multiplier - 1) * 100)}%`
                                    );
                                  } else if (id === 'damage-reduction') {
                                    if (typeof p.armor === 'number') {
                                      lines.push(
                                        `Armor +${Math.round(p.armor)}`
                                      );
                                    } else if (typeof p.percent === 'number') {
                                      lines.push(
                                        `Armor +${Math.round(p.percent * 100)}`
                                      );
                                    }
                                  } else if (
                                    id === 'attack-speed' &&
                                    typeof p.multiplier === 'number'
                                  ) {
                                    lines.push(
                                      `Atk Spd +${Math.round((p.multiplier - 1) * 100)}%`
                                    );
                                  } else if (
                                    id === 'move-speed' &&
                                    typeof p.multiplier === 'number'
                                  ) {
                                    lines.push(
                                      `Move +${Math.round((p.multiplier - 1) * 100)}%`
                                    );
                                  } else if (
                                    id === 'damage-multiplier' &&
                                    typeof p.multiplier === 'number'
                                  ) {
                                    lines.push(
                                      `DMG +${Math.round((p.multiplier - 1) * 100)}%`
                                    );
                                  } else if (
                                    id === 'critical-strike' &&
                                    typeof p.chance === 'number'
                                  ) {
                                    lines.push(
                                      `Crit ${Math.round(p.chance * 100)}% x${p.multiplier ?? 2}`
                                    );
                                  } else if (
                                    id === 'tongue-farm' &&
                                    typeof p.bonusChance === 'number'
                                  ) {
                                    lines.push(
                                      `Tongue +${Math.round(p.bonusChance * 100)}%`
                                    );
                                  }
                                }
                              }
                              // Fallback to compact summary if no lines resolved
                              if (lines.length === 0) {
                                const fallback = summarizeWearable(
                                  wearableDef,
                                  {
                                    quality: item.quality,
                                  }
                                );
                                if (fallback) {
                                  lines = fallback.split(' • ');
                                }
                              }
                              if (lines.length === 0) return null;
                              return (
                                <ul className="mt-2 text-xs text-white/80 space-y-1 list-none pl-0 text-left">
                                  {lines.map((line, i) => (
                                    <li
                                      key={i}
                                      className="break-words leading-tight"
                                    >
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                            {typeof item.durabilityScore === 'number' ? (
                              (() => {
                                const durability = getWearableDurabilityMetrics(item);
                                const durabilityState = getDurabilityStateClasses(
                                  durability.ratio
                                );
                                const repairCost = getWearableRepairCost(item);
                                const repairTooltip = getWearableRepairTooltip(item);
                                return (
                                  <div className="mt-3 text-xs text-white/70">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <span>
                                        Durability {durability.current}/{durability.cap}
                                      </span>
                                      {durability.isBroken ? (
                                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                                          Broken
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="h-1.5 w-full rounded bg-white/10">
                                      <div
                                        className={cn(
                                          'h-full rounded',
                                          durability.isBroken
                                            ? 'bg-red-400'
                                            : durabilityState.fill
                                        )}
                                        style={{
                                          width: `${Math.max(
                                            0,
                                            Math.min(100, durability.ratio * 100)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                    {durability.current < durability.cap &&
                                    item.inventoryItemId ? (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 flex-1 border-white/20 bg-white/5 px-2 text-[11px] text-white hover:bg-white/15"
                                          disabled={
                                            repairingItemId === item.inventoryItemId ||
                                            repairCost > goldCount
                                          }
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void repairWearable(item.inventoryItemId!);
                                          }}
                                        >
                                          {repairingItemId === item.inventoryItemId
                                            ? 'Repairing…'
                                            : (
                                              <span className="inline-flex items-center gap-1">
                                                <span>Repair</span>
                                                <img
                                                  src={GOLD_ICON_SRC}
                                                  alt="Gold"
                                                  className="h-3 w-3 object-contain"
                                                />
                                                <span>{repairCost}</span>
                                              </span>
                                          )}
                                        </Button>
                                        <div className="flex h-7 w-7 items-center justify-center shrink-0">
                                          <RepairCostInfo item={item} />
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })()
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center gap-3">
                          <ItemIcon item={item} />
                          <div className="w-full min-w-0">
                            <div className="text-sm font-medium leading-tight break-words">
                              {item.name}
                            </div>
                            <div className="mt-2 text-xs text-white/70">
                              Qty: {item.quantity}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
            {isEditMode && hasSelection && (
              <div className="sticky bottom-0 z-10 mt-4 rounded-xl border border-white/10 bg-black/70 px-4 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-white/80">
                    {selectedItems.length} selected
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      Clear
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={openDestroyDialog}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <Dialog open={isDestroyDialogOpen} onOpenChange={setIsDestroyDialogOpen}>
        <DialogContent className="max-w-lg border border-white/10 bg-gray-950/95 text-white">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Destroy Items</h3>
              <p className="mt-1 text-sm text-white/70">
                Removal is permanent. This cannot be undone.
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10">
              {destroyFormEntries.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-white/60">
                  Select at least one item to destroy.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {destroyFormEntries.map((entry) => (
                      <tr
                        key={entry.key}
                        className="border-b border-white/10 last:border-none"
                      >
                        <td className="px-3 py-2 text-left text-white/80">
                          {entry.item.name || 'Item'}
                        </td>
                        <td className="px-3 py-2 text-right text-white/70">
                          {entry.isWearable ? (
                            '1'
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="number"
                                min={1}
                                max={entry.maxQuantity}
                                value={entry.quantity}
                                disabled={isDestroying}
                                onChange={(event) =>
                                  handleQuantityChange(
                                    entry.key,
                                    Number(event.target.value)
                                  )
                                }
                                className="w-20 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-right text-white focus:outline-none focus:ring-1 focus:ring-white/40"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isDestroying}
                                onClick={() => handleSetMaxQuantity(entry.key)}
                              >
                                Max
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>
                {destroyFormEntries.length} item
                {destroyFormEntries.length === 1 ? '' : 's'} selected for
                destruction.
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                disabled={isDestroying}
                onClick={() => setIsDestroyDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={
                  isDestroying ||
                  !isDestroyDialogValid ||
                  destroyFormEntries.length === 0
                }
                onClick={handleConfirmDestroy}
              >
                {isDestroying ? 'Destroying…' : 'Destroy'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* No pending toast in synchronous flow */}
    </>
  );
}

const SLOT_ORDER: EquipmentSlotName[] = [
  'head',
  'body',
  'face',
  'eyes',
  'handLeft',
  'handRight',
  'pet',
  'background',
];

const SLOT_LABELS: Record<EquipmentSlotName, string> = {
  head: 'Head',
  body: 'Body',
  face: 'Face',
  eyes: 'Eyes',
  handLeft: 'Left Hand',
  handRight: 'Right Hand',
  pet: 'Pet',
  background: 'Background',
};

interface EquipmentSectionProps {
  equipment: EquipmentState | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onEquip: (slot: string, slug: string) => Promise<unknown>;
  onUnequip: (slot: string) => Promise<unknown>;
  onBatchEquip: (
    assignments: Array<{ slot: string; slug: string }>
  ) => Promise<unknown>;
  onBatchUnequip: (slots: string[]) => Promise<unknown>;
  onRepair: (inventoryItemId: string) => Promise<void>;
  onRepairAll: (inventoryItemIds: string[]) => Promise<void>;
  repairingItemId: string | null;
  repairingAll: boolean;
  inventoryItems: InventoryItem[];
  goldCount: number;
  heroName: string;
  characterId: string | null;
}

interface EquipmentOption {
  slug: string;
  label: string;
  available: number;
  qualityRank: number; // lower is better
  durabilityScore: number; // for tie-breaker (desc)
  quality: QualityTier;
}

interface FilterDropdownOption {
  value: string;
  label: string;
  className?: string;
  count?: number;
}

interface FilterDropdownProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: FilterDropdownOption[];
  width?: string;
  fontSize?: string;
}

function renderFilterDropdown({
  id,
  label,
  value,
  onChange,
  options,
  width = 'w-[120px]',
  fontSize,
}: FilterDropdownProps) {
  return (
    <div className="flex flex-col">
      <span className="uppercase tracking-wide text-white/60">{label}</span>
      <div className="mt-1">
        <select
          id={id}
          value={value}
          onChange={onChange}
          className={cn(
            'rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white !text-[14px]',
            width,
            fontSize
          )}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className={option.className}
            >
              {option.count !== undefined
                ? `${option.label} (${option.count})`
                : option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function EquipmentSection({
  equipment,
  isLoading,
  isSaving,
  error,
  onEquip,
  onUnequip,
  onBatchEquip,
  onBatchUnequip,
  onRepair,
  onRepairAll,
  repairingItemId,
  repairingAll,
  inventoryItems,
  goldCount,
  heroName,
  characterId,
}: EquipmentSectionProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [isBatching, setIsBatching] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [openSlot, setOpenSlot] = useState<EquipmentSlotName | null>(null);
  const [qualityFilter, setQualityFilter] = useState<'all' | QualityTier>(
    'all'
  );
  const [rarityFilter, setRarityFilter] = useState<'all' | WearableRarity>(
    'all'
  );
  type StatFilterKey =
    | 'hp'
    | 'armor'
    | 'movement'
    | 'attackSpeed'
    | 'damage'
    | 'range'
    | 'hpRegen'
    | 'projectileSpeed'
    | 'evade'
    | 'crit'
    | 'vision';
  const [statFilter, setStatFilter] = useState<'all' | StatFilterKey>('all');
  const [expandedOptionBySlug, setExpandedOptionBySlug] = useState<
    Record<string, boolean>
  >({});
  const previewCharacterId = characterId ?? 'coderdan';
  const QUALITY_FILTER_ORDER: QualityTier[] = [
    'flawless',
    'excellent',
    'average',
    'budget',
    'broken',
  ];
  const hasActiveFilters =
    qualityFilter !== 'all' || rarityFilter !== 'all' || statFilter !== 'all';
  const [selectedBySlot, setSelectedBySlot] = useState<
    Record<EquipmentSlotName, string>
  >(() => ({
    head: '',
    body: '',
    face: '',
    eyes: '',
    handLeft: '',
    handRight: '',
    pet: '',
    background: '',
  }));

  const wearableInventory = useMemo(
    () =>
      inventoryItems.filter(
        (item) =>
          item.type === 'wearable' &&
          typeof item.wearableSlug === 'string' &&
          item.wearableSlug.length > 0
      ),
    [inventoryItems]
  );

  const inventoryBySlug = useMemo(() => {
    const map = new Map<string, InventoryItem[]>();
    wearableInventory.forEach((item) => {
      if (!item.wearableSlug) return;
      const list = map.get(item.wearableSlug);
      if (list) {
        list.push(item);
      } else {
        map.set(item.wearableSlug, [item]);
      }
    });
    return map;
  }, [wearableInventory]);

  const inventoryItemById = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    wearableInventory.forEach((item) => {
      const key = item.inventoryItemId ?? item.id;
      if (key) {
        map.set(key, item);
      }
    });
    return map;
  }, [wearableInventory]);

  const overrideCounts = useMemo(() => {
    const map = new Map<string, number>();
    (equipment?.overrides ?? []).forEach((override) => {
      map.set(override.slug, (map.get(override.slug) ?? 0) + 1);
    });
    return map;
  }, [equipment?.overrides]);

  const assignmentMap = useMemo(() => {
    const map = new Map<
      EquipmentSlotName,
      EquipmentState['equipment'][number]
    >();
    (equipment?.equipment ?? []).forEach((entry) => {
      map.set(entry.slot, entry);
    });
    return map;
  }, [equipment?.equipment]);

  const optionsBySlot = useMemo(() => {
    const result: Record<EquipmentSlotName, EquipmentOption[]> = {
      head: [],
      body: [],
      face: [],
      eyes: [],
      handLeft: [],
      handRight: [],
      pet: [],
      background: [],
    };

    for (const slot of SLOT_ORDER) {
      const slotOptions: EquipmentOption[] = [];
      for (const [slug, items] of inventoryBySlug.entries()) {
        const activeItems = items.filter(
          (item) =>
            !isBrokenDurability(item.durabilityScore) &&
            !isFlawlessWearableRestrictedForCharacter(characterId, item.quality)
        );
        const wearable = getWearableBySlug(slug);
        if (!wearable || !wearableSupportsSlot(wearable, slot)) {
          continue;
        }
        const owned = activeItems.length;
        const equipped = overrideCounts.get(slug) ?? 0;
        const available = Math.max(0, owned - equipped);
        if (available <= 0) {
          continue;
        }
        // Prefer the best-quality instance for labeling and sorting
        const sorted = sortInventoryItemsByQuality(activeItems);
        const primary = sorted[0];
        const primaryQuality = normalizeQualityTier(primary?.quality);
        const wearableName = wearable.name ?? slug;
        // Do not append quantity (xN) to label; quantity is shown on the right
        const label = formatWearableDisplayName({
          quality: primaryQuality,
          wearableId: primary?.wearableId,
          wearableSlug: slug,
          fallbackName: wearableName,
        });
        slotOptions.push({
          slug,
          label,
          available,
          qualityRank: QUALITY_ORDER[primaryQuality] ?? QUALITY_ORDER.average,
          durabilityScore: primary?.durabilityScore ?? 0,
          quality: primaryQuality,
        });
      }
      slotOptions.sort((a, b) => {
        if (a.qualityRank !== b.qualityRank)
          return a.qualityRank - b.qualityRank;
        if (a.durabilityScore !== b.durabilityScore)
          return b.durabilityScore - a.durabilityScore;
        return a.label.localeCompare(b.label);
      });
      result[slot] = slotOptions;
    }
    return result;
  }, [characterId, inventoryBySlug, overrideCounts]);

  useEffect(() => {
    setSelectedBySlot((prev) => {
      const next = { ...prev };
      for (const slot of SLOT_ORDER) {
        const options = optionsBySlot[slot];
        if (!options.some((option) => option.slug === next[slot])) {
          next[slot] = '';
        }
      }
      return next;
    });
  }, [optionsBySlot]);

  useEffect(() => {
    setExpandedOptionBySlug({});
  }, [openSlot, qualityFilter, rarityFilter, statFilter]);

  // Radix Dialog handles outside clicks and Escape; no manual handlers needed
  // for closing the wearable picker.

  const controlsDisabled = isSaving || isClearing || !equipment;
  const pendingSlots = useMemo(
    () =>
      SLOT_ORDER.filter((slot) => {
        const value = selectedBySlot[slot];
        return typeof value === 'string' && value.length > 0;
      }),
    [selectedBySlot]
  );
  const hasOverrides = Boolean(equipment?.overrides?.length);
  const wornEquippedAssignments = useMemo(
    () =>
      (equipment?.equipment ?? []).filter(
        (entry) =>
          entry.source === 'override' &&
          typeof entry.inventoryItemId === 'string' &&
          typeof entry.durabilityScore === 'number' &&
          entry.durabilityScore < durabilityCapForQuality(entry.quality)
      ),
    [equipment?.equipment]
  );
  const repairAllCost = useMemo(
    () =>
      wornEquippedAssignments.reduce(
        (sum, entry) => sum + getWearableRepairCost(entry),
        0
      ),
    [wornEquippedAssignments]
  );

  const derivedStats = equipment?.derivedStats;

  // Build preview stats when there are pending selections
  const previewWearablesWithQuality = useMemo(() => {
    if (!equipment) return null;

    const availableBySlug = new Map<string, InventoryItem[]>();
    const occupiedIds = new Set<string>();
    assignmentMap.forEach((entry) => {
      if (entry?.inventoryItemId) {
        occupiedIds.add(entry.inventoryItemId);
      }
    });

    inventoryBySlug.forEach((items, slug) => {
      const filtered = items.filter((item) => {
        const key = item.inventoryItemId ?? item.id;
        return key
          ? !occupiedIds.has(key) &&
              !isBrokenDurability(item.durabilityScore) &&
              !isFlawlessWearableRestrictedForCharacter(characterId, item.quality)
          : !isBrokenDurability(item.durabilityScore) &&
              !isFlawlessWearableRestrictedForCharacter(characterId, item.quality);
      });
      availableBySlug.set(slug, sortInventoryItemsByQuality(filtered));
    });

    const availablePools = new Map<string, InventoryItem[]>();
    availableBySlug.forEach((items, slug) => {
      availablePools.set(slug, items.slice());
    });

    const result: Array<{
      slot: EquipmentSlotName;
      slug: string;
      quality: QualityTier;
    }> = [];

    for (const slot of SLOT_ORDER) {
      const selectedSlug = selectedBySlot[slot];
      const current = assignmentMap.get(slot);

      if (selectedSlug) {
        if (current && current.slug === selectedSlug) {
          if (!isBrokenDurability(current.durabilityScore)) {
            result.push({
              slot,
              slug: current.slug,
              quality: current.quality,
            });
          }
          continue;
        }

        if (current && current.inventoryItemId) {
          const currentItem = inventoryItemById.get(current.inventoryItemId);
          if (currentItem) {
            const currentSlug = currentItem.wearableSlug ?? current.slug;
            const pool = availablePools.get(currentSlug) ?? [];
            pool.push(currentItem);
            availablePools.set(currentSlug, sortInventoryItemsByQuality(pool));
          }
        }

        const pool = availablePools.get(selectedSlug) ?? [];
        const next = pool.shift();
        availablePools.set(selectedSlug, pool);
        if (next) {
          result.push({
            slot,
            slug: selectedSlug,
            quality: normalizeQualityTier(next.quality),
          });
        } else {
          result.push({
            slot,
            slug: selectedSlug,
            quality: normalizeQualityTier(undefined),
          });
        }
      } else if (current) {
        if (isBrokenDurability(current.durabilityScore)) {
          continue;
        }
        result.push({
          slot,
          slug: current.slug,
          quality: current.quality,
        });
      }
    }

    return result.length > 0 ? result : null;
  }, [
    assignmentMap,
    inventoryBySlug,
    inventoryItemById,
    selectedBySlot,
    equipment,
  ]);

  // Compute a local baseline (current equipment only) and a local preview (pending selection applied)
  // Using the same client-side character stats function for both ensures deltas are accurate
  // regardless of additional server-side modifiers like progression.
  const currentWearablesWithQuality = useMemo(() => {
    const result: Array<{
      slot: EquipmentSlotName;
      slug: string;
      quality: QualityTier;
    }> = [];
    assignmentMap.forEach((entry, slot) => {
      if (!entry) return;
      if (isBrokenDurability(entry.durabilityScore)) return;
      result.push({ slot, slug: entry.slug, quality: entry.quality });
    });
    return result.length > 0 ? result : null;
  }, [assignmentMap]);

  const localBaselineStats = useMemo(() => {
    if (!currentWearablesWithQuality) return null;
    try {
      return getClientCharacterStats(previewCharacterId, {
        equippedWearablesWithQuality: currentWearablesWithQuality,
      });
    } catch {
      return null;
    }
  }, [currentWearablesWithQuality, previewCharacterId]);

  const previewStats = useMemo(() => {
    if (pendingSlots.length === 0) return null;
    if (!previewWearablesWithQuality) return null;
    try {
      return getClientCharacterStats(previewCharacterId, {
        equippedWearablesWithQuality: previewWearablesWithQuality,
      });
    } catch {
      return null;
    }
  }, [pendingSlots, previewWearablesWithQuality, previewCharacterId]);

  const statRows = useMemo(() => {
    const rows: {
      label: string;
      value: string;
      delta?: string;
      colorClass?: string;
    }[] = [];
    const base = derivedStats as any;
    if (!base) return rows;

    // Determine deltas by comparing local preview vs local baseline.
    // Fall back to server-derived vs preview if baseline is unavailable.
    const baseline = (localBaselineStats as any) || base;
    const candidate =
      previewStats && pendingSlots.length > 0 ? (previewStats as any) : null;

    function regenPerSecond(stats: any): number {
      let total = 0;

      // Add stat-provided regen (hpRegen) from equipment modifiers/derived stat
      const mod = (stats?.equipment?.modifiers as any)?.hpRegen;
      if (mod) {
        const base = Number(stats?.hpRegen) || 0;
        const add = Number(mod.add || 0);
        const mul = Number(mod.multiply || 1);
        let value = base * mul + add;
        if (typeof mod.min === 'number') value = Math.max(value, mod.min);
        if (typeof mod.max === 'number') value = Math.min(value, mod.max);
        if (Number.isFinite(value) && value > 0) total += value;
      } else if (typeof stats?.hpRegen === 'number') {
        const baseOnly = Math.max(0, Number(stats.hpRegen));
        if (baseOnly > 0) total += baseOnly;
      }

      return Math.max(0, total);
    }

    type HandKey = 'handLeft' | 'handRight';
    type HandDetails = {
      slug: string | null;
      damageRange: { min: number; max: number } | null;
      grenadeRange: { min: number; max: number } | null;
      attackSpeedMs: number | null;
      weaponType: string | null;
      baseTotalDamageScalar: number | null;
    };

    const getHandDetails = (stats: any): Record<HandKey, HandDetails> => {
      const result: Record<HandKey, HandDetails> = {
        handLeft: {
          slug: null,
          damageRange: null,
          grenadeRange: null,
          attackSpeedMs: null,
          weaponType: null,
          baseTotalDamageScalar: null,
        },
        handRight: {
          slug: null,
          damageRange: null,
          grenadeRange: null,
          attackSpeedMs: null,
          weaponType: null,
          baseTotalDamageScalar: null,
        },
      };

      const weapons = Array.isArray(stats?.weapons) ? stats.weapons : [];
      const weaponBySlug = new Map<string, any>();
      for (const weapon of weapons) {
        if (weapon && typeof weapon.slug === 'string') {
          weaponBySlug.set(weapon.slug, weapon);
        }
      }

      // Prefer the authoritative slot → slug mapping from current assignments.
      const leftAssignedSlug = assignmentMap.get('handLeft')?.slug ?? null;
      const rightAssignedSlug = assignmentMap.get('handRight')?.slug ?? null;

      const buildDetailsForSlug = (slug: string | null): HandDetails => {
        if (!slug) {
          return {
            slug: null,
            damageRange: null,
            grenadeRange: null,
            attackSpeedMs: null,
            weaponType: null,
            baseTotalDamageScalar: null,
          };
        }
        const weapon = weaponBySlug.get(slug) ?? null;
        let damageRange: { min: number; max: number } | null = null;
        let grenadeRange: { min: number; max: number } | null = null;
        if (weapon) {
          const grenade = (weapon as any).grenade;
          if ((weapon as any).weaponType === 'grenades' || grenade) {
            const edge = Number(grenade?.damageEdge || 0);
            const center = Number(grenade?.damageCenter || 0);
            const min = Math.max(0, Math.round(Math.min(edge, center)));
            const max = Math.max(min, Math.round(Math.max(edge, center)));
            if (min > 0 || max > 0) grenadeRange = { min, max };
          } else if (weapon?.damageRange) {
            damageRange = {
              min: Number(weapon.damageRange.min ?? 0),
              max: Number(weapon.damageRange.max ?? 0),
            };
          } else if (typeof weapon?.damage === 'number') {
            const dmg = Number(weapon.damage);
            damageRange = { min: dmg, max: dmg };
          }
        }
        const attackSpeedMs =
          weapon && typeof weapon.attackSpeed === 'number'
            ? Number(weapon.attackSpeed)
            : null;
        const weaponType =
          weapon && typeof weapon.weaponType === 'string'
            ? weapon.weaponType
            : null;
        const baseTotalDamageScalar =
          weapon && typeof (weapon as any).totalDamage === 'number'
            ? Number((weapon as any).totalDamage)
            : null;
        return {
          slug,
          damageRange,
          grenadeRange,
          attackSpeedMs,
          weaponType,
          baseTotalDamageScalar,
        };
      };

      // Populate from assignments; this works even if server summary uses
      // the generic "hands" slot in equipment items.
      result.handLeft = buildDetailsForSlug(leftAssignedSlug);
      result.handRight = buildDetailsForSlug(rightAssignedSlug);

      return result;
    };

    const formatDamageHand = (hand: HandDetails): string => {
      if (!hand.damageRange) return '-';
      const min = Math.max(0, Math.round(hand.damageRange.min));
      const max = Math.max(min, Math.round(hand.damageRange.max));
      if (min === 0 && max === 0) return '-';
      return `${min}-${max}`;
    };

    const formatGrenadeHand = (hand: HandDetails): string => {
      if (!hand.grenadeRange) return '-';
      const min = Math.max(0, Math.round(hand.grenadeRange.min));
      const max = Math.max(min, Math.round(hand.grenadeRange.max));
      if (min === 0 && max === 0) return '-';
      return `${min}-${max}`;
    };

    const handAverageDamage = (hand: HandDetails): number => {
      if (!hand.damageRange) return 0;
      return (
        (Number(hand.damageRange.min || 0) +
          Number(hand.damageRange.max || 0)) /
        2
      );
    };

    const formatDamageValue = (hands: Record<HandKey, HandDetails>): string => {
      const parts: string[] = [];
      const leftIsGrenade =
        hands.handLeft.weaponType === 'grenades' ||
        !!hands.handLeft.grenadeRange;
      const rightIsGrenade =
        hands.handRight.weaponType === 'grenades' ||
        !!hands.handRight.grenadeRange;

      if (!leftIsGrenade && hands.handLeft.damageRange) {
        const txt = formatDamageHand(hands.handLeft);
        if (txt !== '-') parts.push(`L: ${txt}`);
      }
      if (!rightIsGrenade && hands.handRight.damageRange) {
        const txt = formatDamageHand(hands.handRight);
        if (txt !== '-') parts.push(`R: ${txt}`);
      }

      const grenadeTxt = leftIsGrenade
        ? formatGrenadeHand(hands.handLeft)
        : rightIsGrenade
          ? formatGrenadeHand(hands.handRight)
          : null;
      if (grenadeTxt && grenadeTxt !== '-') parts.push(`G: ${grenadeTxt}`);

      return parts.length > 0 ? parts.join(' / ') : '-';
    };

    const formatAttackSpeedHand = (hand: HandDetails): string => {
      const ms = hand.attackSpeedMs;
      if (!ms || ms <= 0) return '-';
      const aps = 1000 / ms;
      const numeric =
        Math.abs(aps) % 1 === 0 ? String(Math.trunc(aps)) : aps.toFixed(2);
      return `${numeric}/s`;
    };

    const formatAttackSpeedValue = (
      hands: Record<HandKey, HandDetails>
    ): string => {
      return `L: ${formatAttackSpeedHand(
        hands.handLeft
      )} / R: ${formatAttackSpeedHand(hands.handRight)}`;
    };

    const baseHands = getHandDetails(base);
    const baselineHands = getHandDetails(baseline);
    const candidateHands = candidate ? getHandDetails(candidate) : null;

    const getEquipmentModifiers = (stats: any) =>
      ((stats?.equipment?.modifiers as any) || {}) as EquipmentCombatModifiers;

    const displayHands = enhanceHandsWithEquipmentModifiers(
      candidateHands ?? baseHands,
      getEquipmentModifiers(candidate ?? base)
    );
    const enhancedBaselineHands = enhanceHandsWithEquipmentModifiers(
      baselineHands,
      getEquipmentModifiers(baseline)
    );

    // Determine if any equipped weapon is ranged using the richer weapons list
    // from the active stats snapshot (candidate if present, else base).
    const rangedSource = (candidate?.weapons ?? base?.weapons ?? []) as any[];
    const anyRangedWeapon = Array.isArray(rangedSource)
      ? rangedSource.some((w) => w && w.weaponType === 'ranged')
      : false;
    const anyMeleeWeapon = Array.isArray(rangedSource)
      ? rangedSource.some((w) => w && w.weaponType === 'melee')
      : false;

    const baseRegen = regenPerSecond(base);
    const baselineRegen = regenPerSecond(baseline);

    // Damage: show L/R only when present; show G when grenade equipped
    {
      const value = formatDamageValue(displayHands);

      let delta: string | undefined;
      if (candidateHands) {
        const deltas: string[] = [];
        // Left non-grenade
        if (
          displayHands.handLeft.damageRange &&
          displayHands.handLeft.weaponType !== 'grenades'
        ) {
          const diff =
            Math.round(
              handAverageDamage(displayHands.handLeft) -
                handAverageDamage(enhancedBaselineHands.handLeft)
            ) || 0;
          if (diff !== 0) deltas.push(`L: ${diff > 0 ? '+' : ''}${diff}`);
        }
        // Right non-grenade
        if (
          displayHands.handRight.damageRange &&
          displayHands.handRight.weaponType !== 'grenades'
        ) {
          const diff =
            Math.round(
              handAverageDamage(displayHands.handRight) -
                handAverageDamage(enhancedBaselineHands.handRight)
            ) || 0;
          if (diff !== 0) deltas.push(`R: ${diff > 0 ? '+' : ''}${diff}`);
        }
        // Grenade
        const grenadeAvg = (h: HandDetails) =>
          h.grenadeRange ? (h.grenadeRange.min + h.grenadeRange.max) / 2 : 0;
        const candGrenade =
          grenadeAvg(displayHands.handLeft) ||
          grenadeAvg(displayHands.handRight);
        const baseGrenade =
          grenadeAvg(enhancedBaselineHands.handLeft) ||
          grenadeAvg(enhancedBaselineHands.handRight);
        const gDiff = Math.round(candGrenade - baseGrenade);
        if (gDiff !== 0) deltas.push(`G: ${gDiff > 0 ? '+' : ''}${gDiff}`);

        delta = deltas.length > 0 ? deltas.join(' / ') : undefined;
      }

      rows.push({
        label: 'Damage',
        value,
        delta,
        colorClass: delta
          ? delta.includes('+')
            ? 'text-emerald-400'
            : 'text-red-400'
          : 'text-white',
      });
    }

    // Attack Speed (attacks per second, higher is better)
    {
      const value = formatAttackSpeedValue(displayHands);
      if (candidateHands) {
        const leftDelta =
          handAttackSpeedAps(displayHands.handLeft) -
          handAttackSpeedAps(enhancedBaselineHands.handLeft);
        const rightDelta =
          handAttackSpeedAps(displayHands.handRight) -
          handAttackSpeedAps(enhancedBaselineHands.handRight);
        const formatDelta = (label: string, diff: number) => {
          if (Math.abs(diff) < 0.01) return null;
          const numeric =
            Math.abs(diff) % 1 === 0
              ? String(Math.trunc(diff))
              : diff.toFixed(2);
          return `${label}: ${diff > 0 ? '+' : ''}${numeric}/s`;
        };
        const deltaParts = [
          formatDelta('L', leftDelta),
          formatDelta('R', rightDelta),
        ].filter((part): part is string => Boolean(part));
        const { improved, worse } = classifyAttackSpeedDelta(
          leftDelta,
          rightDelta
        );
        rows.push({
          label: anyRangedWeapon ? 'Ranged Attack Speed' : 'Attack Speed',
          value,
          delta: deltaParts.length > 0 ? deltaParts.join(' / ') : undefined,
          colorClass: improved
            ? 'text-emerald-400'
            : worse
              ? 'text-red-400'
              : 'text-white',
        });
      } else {
        rows.push({
          label: anyRangedWeapon ? 'Ranged Attack Speed' : 'Attack Speed',
          value,
          colorClass: 'text-white',
        });
      }
    }

    // Ranged-only: Projectile Speed (higher is better)
    if (anyRangedWeapon) {
      const basePs = Number(base?.projectileSpeed) || 0;
      const baselinePs = Number(baseline?.projectileSpeed) || basePs;
      const targetPs = candidate
        ? Number(candidate?.projectileSpeed) || basePs
        : basePs;
      const delta = candidate
        ? Math.round(targetPs) - Math.round(baselinePs)
        : 0;
      const improved = delta > 0;
      const worse = delta < 0;
      rows.push({
        label: 'Projectile Speed',
        value: targetPs ? String(Math.round(targetPs)) : '-',
        delta: delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : undefined,
        colorClass: improved
          ? 'text-emerald-400'
          : worse
            ? 'text-red-400'
            : 'text-white',
      });
    }

    // Max Health
    {
      const baseHp = Number(base?.maxHealth) || 0;
      const baselineHp = Number(baseline?.maxHealth) || baseHp;
      const targetHp = candidate
        ? Number(candidate?.maxHealth) || baseHp
        : baseHp;
      const delta = candidate
        ? Math.round(targetHp) - Math.round(baselineHp)
        : 0;
      rows.push({
        label: 'Max Health',
        value: targetHp ? String(Math.round(targetHp)) : '-',
        delta: delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : undefined,
        colorClass:
          delta > 0
            ? 'text-emerald-400'
            : delta < 0
              ? 'text-red-400'
              : 'text-white',
      });
    }

    // Armor
    {
      const baseAr = Number(base?.armor) || 0;
      const baselineAr = Number(baseline?.armor) || baseAr;
      const targetAr = candidate
        ? Number(candidate?.armor) || baselineAr
        : baseAr;
      const delta = candidate
        ? Math.round(targetAr) - Math.round(baselineAr)
        : 0;
      rows.push({
        label: 'Armor',
        value: Number.isFinite(targetAr) ? String(Math.round(targetAr)) : '-',
        delta: delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : undefined,
        colorClass:
          delta > 0
            ? 'text-emerald-400'
            : delta < 0
              ? 'text-red-400'
              : 'text-white',
      });
    }

    // Ranged-only: Ranged Attack Range (higher is better)
    if (anyRangedWeapon) {
      const baseRar = Number(base?.rangedAttackRange) || 0;
      const baselineRar = Number(baseline?.rangedAttackRange) || baseRar;
      const targetRar = candidate
        ? Number(candidate?.rangedAttackRange) || baselineRar
        : baseRar;
      const delta = candidate
        ? Math.round(targetRar) - Math.round(baselineRar)
        : 0;
      const improved = delta > 0;
      const worse = delta < 0;
      rows.push({
        label: 'Ranged Attack Range',
        value: targetRar ? String(Math.round(targetRar)) : '-',
        delta: delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : undefined,
        colorClass: improved
          ? 'text-emerald-400'
          : worse
            ? 'text-red-400'
            : 'text-white',
      });
    }

    // Melee-only: Melee Attack Range (higher is better)
    if (anyMeleeWeapon) {
      const baseMar = Number(base?.meleeAttackRange) || 0;
      const baselineMar = Number(baseline?.meleeAttackRange) || baseMar;
      const targetMar = candidate
        ? Number(candidate?.meleeAttackRange) || baselineMar
        : baseMar;
      const delta = candidate
        ? Math.round(targetMar) - Math.round(baselineMar)
        : 0;
      const improved = delta > 0;
      const worse = delta < 0;
      rows.push({
        label: 'Melee Attack Range',
        value: targetMar ? String(Math.round(targetMar)) : '-',
        delta: delta !== 0 ? `${delta > 0 ? '+' : ''}${delta}` : undefined,
        colorClass: improved
          ? 'text-emerald-400'
          : worse
            ? 'text-red-400'
            : 'text-white',
      });
    }

    // Movement
    {
      const baseMs = Number(base?.movementSpeed) || 0;
      const baselineMs = Number(baseline?.movementSpeed) || baseMs;
      const targetMs = candidate
        ? Number(candidate?.movementSpeed) || baselineMs
        : baseMs;
      const delta = candidate ? targetMs - baselineMs : 0;
      rows.push({
        label: 'Movement',
        value: targetMs ? targetMs.toFixed(2) : '-',
        delta:
          delta !== 0
            ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`
            : undefined,
        colorClass:
          delta > 0
            ? 'text-emerald-400'
            : delta < 0
              ? 'text-red-400'
              : 'text-white',
      });
    }

    // HP Regen (show if present in either base or preview)
    // Display as per-turn value for idle mode (×25 multiplier)
    {
      const IDLE_HP_REGEN_MULTIPLIER = 25;
      const candRegenPerSec = candidate
        ? regenPerSecond(candidate)
        : baselineRegen;
      const baseRegenPerTurn = Math.floor(baseRegen * IDLE_HP_REGEN_MULTIPLIER);
      const candRegenPerTurn = Math.floor(
        candRegenPerSec * IDLE_HP_REGEN_MULTIPLIER
      );
      const delta = candidate ? candRegenPerTurn - baseRegenPerTurn : 0;
      const displayValue = baseRegenPerTurn + delta;
      if (baseRegenPerTurn > 0 || candRegenPerTurn > 0) {
        rows.push({
          label: 'HP Regen',
          value: `${displayValue}/turn`,
          delta:
            delta !== 0
              ? `${delta > 0 ? '+' : ''}${delta}/turn`
              : undefined,
          colorClass:
            delta > 0
              ? 'text-emerald-400'
              : delta < 0
                ? 'text-red-400'
                : 'text-white',
        });
      }
    }

    return rows;
  }, [
    derivedStats,
    previewStats,
    pendingSlots,
    localBaselineStats,
    assignmentMap,
  ]);

  const handleEquip = useCallback(
    async (slot: EquipmentSlotName) => {
      const selected = selectedBySlot[slot];
      if (!selected) {
        return;
      }
      try {
        await onEquip(slot, selected);
        setSelectedBySlot((prev) => ({ ...prev, [slot]: '' }));
        setLocalError(null);
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : 'Failed to equip wearable'
        );
      }
    },
    [onEquip, selectedBySlot]
  );

  const handleBatchEquip = useCallback(async () => {
    if (pendingSlots.length === 0) {
      return;
    }
    setIsBatching(true);
    setLocalError(null);
    try {
      const assignments = pendingSlots
        .map((slot) => ({ slot, slug: selectedBySlot[slot] }))
        .filter(
          (entry): entry is { slot: EquipmentSlotName; slug: string } =>
            Boolean(entry.slot) && Boolean(entry.slug)
        );
      if (assignments.length > 0) {
        await onBatchEquip(assignments);
      }
      setOpenSlot(null);
      setSelectedBySlot((prev) => {
        const next = { ...prev };
        pendingSlots.forEach((slot) => {
          next[slot] = '';
        });
        return next;
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to equip wearables'
      );
    } finally {
      setIsBatching(false);
    }
  }, [pendingSlots, selectedBySlot, onBatchEquip]);

  const handleUnequip = useCallback(
    async (slot: EquipmentSlotName) => {
      try {
        await onUnequip(slot);
        setLocalError(null);
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : 'Failed to unequip wearable'
        );
      }
    },
    [onUnequip]
  );

  const handleBatchUnequip = useCallback(async () => {
    if (!equipment || !equipment.overrides.length) {
      return;
    }
    setIsClearing(true);
    setLocalError(null);
    try {
      const slotsToClear = equipment.overrides.map((override) => override.slot);
      if (slotsToClear.length > 0) {
        await onBatchUnequip(slotsToClear);
      }
      setOpenSlot(null);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Failed to unequip wearables'
      );
    } finally {
      setIsClearing(false);
    }
  }, [equipment, onBatchUnequip]);

  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-[100px] h-[100px]">
            <CharacterPreview
              characterId={previewCharacterId}
              size="sm"
              isSelected
              className="border border-white/10 bg-black/20 p-1 rounded-none"
            />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Change Gear</h2>
            <p className="text-sm text-white/60">
              Customize gear for{' '}
              <span className="text-white font-semibold">{heroName}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isLoading && !equipment ? (
            <div className="text-xs text-white/60">Loading…</div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={pendingSlots.length > 0 ? 'default' : 'secondary'}
            className="min-w-[120px]"
            disabled={
              controlsDisabled ||
              pendingSlots.length === 0 ||
              isBatching ||
              isSaving
            }
            onClick={() => void handleBatchEquip()}
          >
            {isBatching ? 'Equipping…' : 'Equip All'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={hasOverrides ? 'outline' : 'secondary'}
            className="min-w-[120px] border-white/20 bg-white/5 text-white hover:bg-white/15"
            disabled={
              controlsDisabled || !hasOverrides || isClearing || isSaving
            }
            onClick={() => void handleBatchUnequip()}
          >
            {isClearing ? 'Clearing…' : 'Unequip All'}
          </Button>
        </div>
      </div>

      {error || localError ? (
        <div className="mb-4 text-sm text-red-400">{error || localError}</div>
      ) : null}

      {statRows.length > 0 ? (
        <div className="my-6 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-white/70">
          {statRows.map((entry) => (
            <div
              key={entry.label}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 backdrop-blur"
            >
              <div className="text-xs uppercase tracking-wide text-white/50">
                {entry.label}
              </div>
              <div
                className={cn(
                  'text-base font-medium',
                  entry.colorClass || 'text-white'
                )}
              >
                {entry.value}
                {entry.delta ? (
                  <span className="ml-2 text-xs font-normal opacity-80">
                    {entry.delta}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {wornEquippedAssignments.length > 1 ? (
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-w-[140px]"
            disabled={
              controlsDisabled ||
              repairingAll ||
              repairAllCost <= 0 ||
              repairAllCost > goldCount
            }
            onClick={() =>
              void onRepairAll(
                wornEquippedAssignments
                  .map((entry) => entry.inventoryItemId)
                  .filter((value): value is string => Boolean(value))
              )
            }
          >
            {repairingAll ? (
              'Repairing…'
            ) : (
              <span className="inline-flex items-center gap-1">
                <span>Repair All</span>
                <img
                  src={GOLD_ICON_SRC}
                  alt="Gold"
                  className="h-3 w-3 object-contain"
                />
                <span>{repairAllCost}</span>
              </span>
            )}
          </Button>
          <div className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-white/70">
            <img
              src={GOLD_ICON_SRC}
              alt="Gold"
              className="h-3 w-3 object-contain"
            />
            <span>{goldCount}</span>
          </div>
        </div>
      ) : null}

      {equipment ? (
        <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">
          {SLOT_ORDER.map((slot) => {
            const assignment = assignmentMap.get(slot);
            const wearableDef = assignment
              ? getWearableBySlug(assignment.slug)
              : null;
            const wearableName = assignment
              ? formatWearableDisplayName({
                  quality: assignment.quality,
                  wearableId: wearableDef?.id,
                  wearableSlug: assignment.slug,
                  fallbackName: wearableDef?.name ?? assignment.slug,
                })
              : 'None';
            const isEmptySlot = !assignment;
            const isOverride = assignment?.source === 'override';
            const options = optionsBySlot[slot];
            const selected = selectedBySlot[slot] ?? '';
            const selectedOption = options.find(
              (option) => option.slug === selected
            );
            const wearableIconSrc = resolveWearableIcon(wearableDef);
            const slotLabel = SLOT_LABELS[slot];
            const selectedOptionIcon = selectedOption
              ? resolveWearableIcon(getWearableBySlug(selectedOption.slug))
              : null;
            const displayIconSrc = selectedOptionIcon ?? wearableIconSrc;
            const displayName = selectedOption
              ? selectedOption.label
              : wearableName;
            const selectedSummary = selectedOption
              ? summarizeWearable(
                  getWearableBySlug(selectedOption.slug) ?? undefined,
                  { quality: selectedOption.quality }
                )
              : null;
            const assignmentDurability =
              assignment &&
              assignment.source === 'override' &&
              typeof assignment.inventoryItemId === 'string' &&
              typeof assignment.durabilityScore === 'number'
                ? getWearableDurabilityMetrics(assignment)
              : null;
            const isDisplayEmpty = !selectedOption && isEmptySlot;
            const hasPendingSelection = Boolean(selected);
            const showNftChip =
              !selectedOption &&
              shouldShowNftEquipmentChip({
                characterId,
                assignment,
              });
            const totalAvailableForSlot = options.reduce(
              (sum, option) => sum + (option.available || 0),
              0
            );
            const equippedSummary = summarizeWearable(
              wearableDef ?? undefined,
              { quality: assignment?.quality }
            );
            const summaryToShow = selectedSummary ?? equippedSummary;
            const summaryLayout = getEquipmentCardSummaryLayout(summaryToShow);
            const openSlotPicker = () => {
              if (controlsDisabled || options.length === 0) return;
              setOpenSlot(slot);
            };
            return (
              <div
                key={slot}
                className="relative self-start flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-4 pt-4 pb-3 backdrop-blur"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-white/50">
                    {slotLabel}
                    {totalAvailableForSlot > 0
                      ? ` (${totalAvailableForSlot})`
                      : ''}
                  </div>
                  {showNftChip ? (
                    <div className="rounded bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                      NFT
                    </div>
                  ) : null}
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'mt-1 flex flex-col items-center gap-2 rounded-md p-2 transition-colors',
                    options.length > 0 && !controlsDisabled
                      ? 'cursor-pointer hover:bg-white/5'
                      : 'cursor-default'
                  )}
                  onClick={openSlotPicker}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openSlotPicker();
                    }
                  }}
                >
                  {displayIconSrc ? (
                    <img
                      src={displayIconSrc}
                      alt={displayName}
                      className="h-10 w-10 rounded-md bg-white/10 p-1"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10 text-[10px] uppercase tracking-wide text-white/50">
                      {slotLabel.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 w-full">
                    <div
                      className={cn(
                        'mt-1 w-full text-center text-sm leading-tight',
                        isDisplayEmpty
                          ? 'text-white/60'
                          : 'font-medium text-white'
                      )}
                    >
                      {displayName}
                    </div>
                    {!isDisplayEmpty && summaryLayout.primaryTrait ? (
                      <div
                        className="mt-0.5 grid min-h-[2rem] w-full content-start text-xs leading-tight text-center text-white/60"
                        title={summaryToShow ?? undefined}
                      >
                        <div>{summaryLayout.primaryTrait}</div>
                        <div
                          className={cn(
                            summaryLayout.secondaryLabel ? '' : 'invisible'
                          )}
                        >
                          {summaryLayout.secondaryLabel ?? '\u00a0'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {assignment && assignmentDurability ? (
                  <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                    {(() => {
                      const durabilityState = getDurabilityStateClasses(
                        assignmentDurability.ratio
                      );
                      return (
                        <>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span>
                              Durability {assignmentDurability.current}/
                              {assignmentDurability.cap}
                            </span>
                            {assignmentDurability.isBroken ? (
                              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                                Broken
                              </span>
                            ) : null}
                          </div>
                          <div className="h-1.5 w-full rounded bg-white/10">
                            <div
                              className={cn(
                                'h-full rounded',
                                assignmentDurability.isBroken
                                  ? 'bg-red-400'
                                  : durabilityState.fill
                              )}
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(100, assignmentDurability.ratio * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </>
                      );
                    })()}
                    {assignmentDurability.isBroken ? (
                      <div className="mt-2 text-[11px] text-red-300">
                        Inactive in runs until repaired.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-0.5 flex flex-col gap-2">
                  {((assignment?.inventoryItemId &&
                    assignmentDurability &&
                    assignmentDurability.current < assignmentDurability.cap) ||
                    (isOverride && !hasPendingSelection)) ? (
                    <div className="flex items-center gap-2">
                      {assignment?.inventoryItemId &&
                      assignmentDurability &&
                      assignmentDurability.current <
                        assignmentDurability.cap ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-white/20 bg-white/5 text-white hover:bg-white/15"
                          onClick={() =>
                            void onRepair(assignment.inventoryItemId!)
                          }
                          disabled={
                            controlsDisabled ||
                            repairingItemId === assignment.inventoryItemId ||
                            getWearableRepairCost(assignment) > goldCount
                          }
                          aria-label={`Repair for ${getWearableRepairCost(assignment)} gold`}
                          title={getWearableRepairTooltip(assignment)}
                        >
                          {repairingItemId === assignment.inventoryItemId ? (
                            'Repairing…'
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Wrench className="h-4 w-4" />
                              <img
                                src={GOLD_ICON_SRC}
                                alt="Gold"
                                className="h-3 w-3 object-contain"
                              />
                              <span>{getWearableRepairCost(assignment)}</span>
                            </span>
                          )}
                        </Button>
                      ) : null}

                      {isOverride && !hasPendingSelection ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 border-white/20 bg-white/5 text-white hover:bg-white/15"
                          onClick={() => void handleUnequip(slot)}
                          disabled={controlsDisabled}
                          aria-label="Unequip"
                          title="Unequip"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {hasPendingSelection ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-purple-600/80 text-white hover:bg-purple-500"
                      onClick={() => void handleEquip(slot)}
                      disabled={controlsDisabled || !selected}
                    >
                      {isSaving ? 'Saving…' : 'Equip'}
                    </Button>
                  ) : null}
                </div>

                {/* Removed pending preview per feedback */}

                {options.length > 0 ? (
                  <div
                    className="mt-2"
                    data-slot-selector
                  >
                        <Dialog
                          open={openSlot === slot}
                          onOpenChange={(isOpen) =>
                            setOpenSlot(isOpen ? slot : null)
                          }
                        >
                          <DialogContent
                            className="z-[60] max-w-lg border border-white/10 bg-black/90 p-0 text-white shadow-2xl [&>div:first-child]:pt-5 [&>div:first-child]:pb-4 [&>div:last-child]:pt-0 [&>div:last-child]:px-0 [&>div:last-child]:pb-0"
                            style={{
                              bottom: 'auto',
                              top: '50%',
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            <DialogHeader className="border-b border-white/10">
                              <DialogTitle className="text-sm font-medium">
                                Select {slotLabel} wearable
                              </DialogTitle>
                            </DialogHeader>
                            <div className="max-h-[70vh] overflow-y-auto px-3 pb-3">
                              <div className="sticky top-0 z-10 mb-2 bg-black/90 px-0 pt-2 pb-2 border-b border-white/10">
                                <div className="flex flex-nowrap items-start gap-3 sm:gap-4 text-xs text-white/80">
                                  {renderFilterDropdown({
                                    id: 'quality-filter',
                                    label: 'Quality',
                                    value: qualityFilter,
                                    onChange: (e) =>
                                      setQualityFilter(
                                        e.target.value as 'all' | QualityTier
                                      ),
                                    options: [
                                      { value: 'all', label: 'All', count: options.length },
                                      ...QUALITY_FILTER_ORDER.map((q) => {
                                        const count = options.filter(
                                          (opt) => opt.quality === q
                                        ).length;
                                        return {
                                          value: q,
                                          label: QUALITY_DEFAULT_LABELS[q],
                                          count,
                                        };
                                      }),
                                    ],
                                  })}
                                  {renderFilterDropdown({
                                    id: 'rarity-filter',
                                    label: 'Rarity',
                                    value: rarityFilter,
                                    onChange: (e) =>
                                      setRarityFilter(
                                        e.target.value as 'all' | WearableRarity
                                      ),
                                    options: [
                                      { value: 'all', label: 'All', count: options.length },
                                      ...Array.from(WEARABLE_RARITIES).map(
                                        (r) => {
                                          const count = options.filter((opt) => {
                                            const def = getWearableBySlug(opt.slug);
                                            return def && getWearableRarity(def) === r;
                                          }).length;
                                          return {
                                            value: r,
                                            label: r,
                                            className: 'capitalize',
                                            count,
                                          };
                                        }
                                      ),
                                    ],
                                  })}
                                  {(() => {
                                    const statOptions: { value: string; label: string }[] = [
                                      { value: 'hp', label: 'HP' },
                                      { value: 'armor', label: 'Armor' },
                                      { value: 'movement', label: 'Movement' },
                                      { value: 'attackSpeed', label: 'Attack Speed' },
                                      { value: 'damage', label: 'Damage' },
                                      { value: 'range', label: 'Range' },
                                      { value: 'hpRegen', label: 'HP Regen' },
                                      { value: 'projectileSpeed', label: 'Projectile Speed' },
                                      { value: 'evade', label: 'Evade' },
                                      { value: 'crit', label: 'Crit' },
                                      { value: 'vision', label: 'Vision' },
                                    ];
                                    return renderFilterDropdown({
                                      id: 'stat-filter',
                                      label: 'Stat',
                                      value: statFilter,
                                      onChange: (e) =>
                                        setStatFilter(
                                          e.target.value as 'all' | StatFilterKey
                                        ),
                                      options: [
                                        { value: 'all', label: 'All', count: options.length },
                                        ...statOptions.map((s) => {
                                          const count = options.filter((opt) => {
                                            const def = getWearableBySlug(opt.slug);
                                            return wearableMatchesStatFilter(
                                              def,
                                              slot,
                                              s.value as StatFilterKey
                                            );
                                          }).length;
                                          return { ...s, count };
                                        }),
                                      ],
                                      fontSize: 'text-[11px]',
                                    });
                                  })()}
                                  {hasActiveFilters ? (
                                    <button
                                      type="button"
                                      className="ml-auto rounded px-2 py-1 text-white/70 hover:text-white hover:bg-white/10"
                                      onClick={() => {
                                        setQualityFilter('all');
                                        setRarityFilter('all');
                                        setStatFilter('all');
                                      }}
                                    >
                                      Clear
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                              <div className="pt-4 pb-2 border-b border-white/10">
                                <div className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
                                  Currently equipped
                                </div>
                                <button
                                  type="button"
                                  className="w-full rounded-md text-left hover:bg-white/10"
                                  onClick={() => {
                                    // Reset pending selection back to current equipment/default
                                    setSelectedBySlot((prev) => ({
                                      ...prev,
                                      [slot]: '',
                                    }));
                                    setOpenSlot(null);
                                  }}
                                >
                                  <div className="grid grid-cols-[auto,1fr,auto] items-start gap-3 px-2 py-1">
                                    {wearableIconSrc ? (
                                      <img
                                        src={wearableIconSrc}
                                        alt={wearableName}
                                        className="h-7 w-7 rounded bg-white/10 p-1"
                                      />
                                    ) : (
                                      <div className="h-7 w-7 rounded bg-white/10" />
                                    )}
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 text-sm">
                                        <span className="truncate">
                                          {wearableName}
                                        </span>
                                        {(() => {
                                          const itemType = (wearableDef as any)
                                            ?.itemType as string | undefined;
                                          const rarityLabel = wearableDef
                                            ? getWearableRarity(wearableDef)
                                            : null;
                                          return (
                                            <>
                                              {itemType ? (
                                                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                                                  {toItemTypeLabel(itemType)}
                                                </span>
                                              ) : null}
                                              {rarityLabel ? (
                                                <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                                                  {rarityLabel}
                                                </span>
                                              ) : null}
                                            </>
                                          );
                                        })()}
                                      </div>
                                      {equippedSummary ? (
                                        <div className="mt-0.5 text-xs text-white/50">
                                          {equippedSummary
                                            .split(' • ')
                                            .map((part, i) => (
                                              <div key={i}>{part}</div>
                                            ))}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="justify-self-end self-start text-[11px] text-white/50">
                                      {isOverride ? 'Equipped' : 'Default'}
                                    </div>
                                  </div>
                                </button>
                              </div>
                              {(() => {
                                const filteredOptions = options.filter(
                                  (option) => {
                                    if (qualityFilter !== 'all') {
                                      if (option.quality !== qualityFilter) {
                                        return false;
                                      }
                                    }
                                    if (rarityFilter !== 'all') {
                                      const def = getWearableBySlug(
                                        option.slug
                                      );
                                      if (
                                        !def ||
                                        getWearableRarity(def) !== rarityFilter
                                      ) {
                                        return false;
                                      }
                                    }
                                    if (statFilter !== 'all') {
                                      const def = getWearableBySlug(
                                        option.slug
                                      );
                                      if (
                                        !wearableMatchesStatFilter(
                                          def,
                                          slot,
                                          statFilter
                                        )
                                      ) {
                                        return false;
                                      }
                                    }
                                    return true;
                                  }
                                );
                                if (filteredOptions.length === 0) {
                                  return (
                                    <div className="px-3 py-4 text-sm text-white/60">
                                      No wearables match the selected filters.
                                    </div>
                                  );
                                }
                                return filteredOptions.map((option) => {
                                  const optionDef = getWearableBySlug(
                                    option.slug
                                  );
                                  const optionIcon =
                                    resolveWearableIcon(optionDef);
                                  const optionItems =
                                    (inventoryBySlug.get(option.slug) ?? []).filter(
                                      (item) =>
                                        !isFlawlessWearableRestrictedForCharacter(
                                          characterId,
                                          item.quality
                                        )
                                    );
                                  const instanceSummaries =
                                    buildWearableInstanceSummaries(optionItems);
                                  const isExpanded = Boolean(
                                    expandedOptionBySlug[option.slug]
                                  );
                                  const summary = summarizeWearable(optionDef, {
                                    quality: option.quality,
                                  });
                                  return (
                                    <div
                                      key={option.slug}
                                      className="rounded-md hover:bg-white/10"
                                    >
                                      <div className="grid w-full grid-cols-[1fr,auto] items-start gap-2 px-3 py-2">
                                        <button
                                          type="button"
                                          className="min-w-0 text-left text-sm text-white"
                                          onClick={() => {
                                            setSelectedBySlot((prev) => ({
                                              ...prev,
                                              [slot]: option.slug,
                                            }));
                                            setOpenSlot(null);
                                          }}
                                        >
                                          <div className="grid w-full grid-cols-[auto,1fr,auto] items-start gap-3">
                                            {optionIcon ? (
                                              <img
                                                src={optionIcon}
                                                alt={optionDef?.name ?? option.slug}
                                                className="h-7 w-7 rounded bg-white/10 p-1"
                                              />
                                            ) : (
                                              <div className="h-7 w-7 rounded bg-white/10" />
                                            )}
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className="truncate">
                                                  {option.label}
                                                </span>
                                                {(() => {
                                                  const itemType = (
                                                    optionDef as any
                                                  )?.itemType as string | undefined;
                                                  const rarityLabel = optionDef
                                                    ? getWearableRarity(optionDef)
                                                    : null;
                                                  return (
                                                    <>
                                                      {itemType ? (
                                                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                                                          {toItemTypeLabel(
                                                            itemType
                                                          )}
                                                        </span>
                                                      ) : null}
                                                      {rarityLabel ? (
                                                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70">
                                                          {rarityLabel}
                                                        </span>
                                                      ) : null}
                                                    </>
                                                  );
                                                })()}
                                              </div>
                                              {summary ? (
                                                <div className="mt-0.5 text-xs text-white/50">
                                                  {summary
                                                    .split(' • ')
                                                    .map((part, i) => (
                                                      <div key={i}>{part}</div>
                                                    ))}
                                                </div>
                                              ) : null}
                                            </div>
                                            <span className="justify-self-end self-start text-xs text-white/50">
                                              {option.available}
                                            </span>
                                          </div>
                                        </button>
                                        <button
                                          type="button"
                                          className="mt-0.5 h-6 w-6 rounded border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                          aria-label={
                                            isExpanded
                                              ? `Hide ${option.label} copies`
                                              : `Show ${option.label} copies`
                                          }
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            setExpandedOptionBySlug((prev) => ({
                                              ...prev,
                                              [option.slug]: !prev[option.slug],
                                            }));
                                          }}
                                        >
                                          {isExpanded ? '▾' : '▸'}
                                        </button>
                                      </div>
                                      {isExpanded ? (
                                        <div className="border-t border-white/10 px-3 pb-3 pt-2">
                                          <div className="mb-2 text-[10px] uppercase tracking-wide text-white/40">
                                            Copies
                                          </div>
                                          <div className="space-y-1.5">
                                            {instanceSummaries.map((instance, index) => (
                                              <div
                                                key={instance.id}
                                                className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-xs"
                                              >
                                                <div className="min-w-0">
                                                  <div className="text-white/80">
                                                    #{index + 1} {instance.qualityLabel}
                                                  </div>
                                                  <div className="text-white/50">
                                                    Durability {instance.currentDurability}/
                                                    {instance.maxDurability}
                                                  </div>
                                                </div>
                                                <div className="shrink-0 text-[10px] uppercase tracking-wide text-white/50">
                                                  {instance.isBroken ? 'Broken' : 'Ready'}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </DialogContent>
                        </Dialog>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-white/50">
                      No compatible wearables available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 backdrop-blur">
          Equipment data will load once available.
        </div>
      )}
    </div>
  );
}

function resolveWearableIcon(
  wearable: ReturnType<typeof getWearableBySlug> | null | undefined
): string | null {
  if (!wearable) {
    return null;
  }
  const rawId =
    typeof (wearable as any).svgId === 'number'
      ? (wearable as any).svgId
      : wearable.id;
  const numericId = Number(rawId);
  if (!Number.isFinite(numericId)) {
    return null;
  }
  return `/wearables/${numericId}.svg`;
}

function wearableSupportsSlot(
  wearable: ReturnType<typeof getWearableBySlug>,
  slot: EquipmentSlotName
): boolean {
  if (!wearable) {
    return false;
  }
  const slots = wearable.slots ?? [];
  return slots.includes(slot);
}

function wearableMatchesStatFilter(
  wearable: ReturnType<typeof getWearableBySlug> | undefined,
  slot: EquipmentSlotName,
  filter:
    | 'hp'
    | 'armor'
    | 'movement'
    | 'attackSpeed'
    | 'damage'
    | 'range'
    | 'hpRegen'
    | 'projectileSpeed'
    | 'evade'
    | 'crit'
    | 'vision'
): boolean {
  if (!wearable) return false;
  if (filter === 'evade' || filter === 'crit' || filter === 'vision') {
    const ids = (wearable.abilities ?? []).map((a) => a.id);
    if (filter === 'evade') return ids.includes('evade');
    if (filter === 'crit') return ids.includes('critical-strike');
    if (filter === 'vision') return ids.includes('augmented-vision');
  }
  if (filter === 'attackSpeed') {
    if ((wearable.abilities ?? []).some((a) => a.id === 'attack-speed')) {
      return true;
    }
  }
  if (filter === 'movement') {
    if ((wearable.abilities ?? []).some((a) => a.id === 'move-speed')) {
      return true;
    }
  }
  if (filter === 'hpRegen') {
    if ((wearable.abilities ?? []).some((a) => a.id === 'regen')) {
      return true;
    }
  }
  if (filter === 'damage') {
    if ((wearable.abilities ?? []).some((a) => a.id === 'damage-multiplier')) {
      return true;
    }
  }

  const statKeysByFilter: Record<string, string[]> = {
    hp: ['maxHealth'],
    armor: ['armor'],
    movement: ['movementSpeed'],
    attackSpeed: ['attackSpeed'],
    damage: ['damage', 'damageMin', 'damageMax', 'totalDamage'],
    range: ['rangedAttackRange', 'meleeAttackRange'],
    hpRegen: ['hpRegen'],
    projectileSpeed: ['projectileSpeed'],
  };

  const resolvedEffects = (() => {
    if (Array.isArray(wearable.effects) && wearable.effects.length > 0) {
      return wearable.effects as any[];
    }
    const itemType = (wearable as any).itemType as string | undefined;
    if (!itemType) return [] as any[];
    const rarity = getWearableRarity(wearable);
    const bySlot = (ITEM_TYPE_EFFECTS as any)[slot] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const byType = bySlot?.[itemType] as
      | Record<string, { type: 'stat'; modifiers: any[] }[]>
      | undefined;
    const effects = byType?.[rarity] || byType?.common || [];
    return Array.isArray(effects) ? effects : [];
  })();

  const keys = statKeysByFilter[filter] ?? [];
  for (const effect of resolvedEffects) {
    if (!effect || effect.type !== 'stat') continue;
    const mods = Array.isArray(effect.modifiers) ? effect.modifiers : [];
    for (const mod of mods) {
      const statKey = (mod as any)?.stat as string | undefined;
      if (statKey && keys.includes(statKey)) {
        return true;
      }
    }
  }
  return false;
}

function ItemIcon({ item }: { item: InventoryItem }) {
  const size = 'w-16 h-16';
  const base = 'rounded bg-gray-800 flex items-center justify-center';
  return (
    <div className={`relative ${size} ${base}`}>
      {/* Quality badge removed for wearable items in inventory pages */}
      {item.type === 'wearable' && item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className={`${size} object-contain`}
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement;
            target.style.display = 'none';
          }}
        />
      ) : item.type === 'coin' &&
        (item.name === 'USDC Coin' || typeof item.usdcAmount === 'number') ? (
        <img
          src="/loot-icons/usdc.svg"
          alt="USDC"
          className={`${size} object-contain`}
        />
      ) : item.type === 'coin' && item.name === 'GHST' ? (
        <img
          src="/sprites/coins/ghst.gif"
          alt="GHST"
          className={`${size} object-contain`}
        />
      ) : item.spriteId ? (
        <img
          src={`/wearables/${item.spriteId}.svg`}
          alt={item.name}
          className={`${size} object-contain`}
        />
      ) : (
        <div className={`${size}`} />
      )}
    </div>
  );
}
