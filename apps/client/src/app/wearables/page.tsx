'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react';
import { useQueryState } from 'nuqs';

import {
  getWearableById,
  itemTypes,
  ITEM_TYPES_BY_SLOT,
  resolveWearableEffectsByItemType,
  toItemTypeLabel,
  type AbilityEffect,
  type WearableDefinition,
  type EquipmentEffect,
  type EquipmentStatModifier,
  type EquipmentStat,
  type WearableSlot,
  type WearableItemType,
} from '../../data/wearables';
import type { AnyAbilityInstance } from '../../data/abilities';
import {
  isLifeSteal,
  isCriticalStrike,
  isCleave,
  isEvade,
  isPotionFarm,
  isGoldFarm,
} from '../../data/abilities';
import type { WeaponProfile } from '../../data/weapons';
import { getPrimarySlot } from '../../lib/wearable-utils';

const TRAIT_INFO = [
  { code: 'NRG', name: 'Attack Speed' },
  { code: 'AGG', name: 'Damage' },
  { code: 'SPK', name: 'HP' },
  { code: 'BRN', name: 'Mana' },
  { code: 'EYS', name: 'Eye Shape' },
  { code: 'EYC', name: 'Eye Color' },
] as const;

const SLOT_LABELS: Record<WearableSlot, string> = {
  head: 'Head',
  body: 'Body',
  face: 'Face',
  eyes: 'Eyes',
  handRight: 'Right Hand',
  handLeft: 'Left Hand',
  pet: 'Pet',
  background: 'Background',
  none: 'None',
};

const STAT_LABELS: Record<EquipmentStat, string> = {
  maxHealth: 'Max Health',
  damage: 'Damage',
  damageMin: 'Min Damage',
  damageMax: 'Max Damage',
  totalDamage: 'Total Damage',
  attackSpeed: 'Attack Speed (ms)',
  meleeAttackRange: 'Melee Attack Range (px)',
  rangedAttackRange: 'Ranged Attack Range (px)',
  projectileSpeed: 'Projectile Speed (px/s)',
  movementSpeed: 'Move Speed Multiplier',
  armor: 'Armor',
  hpRegen: 'HP Regen',
};

const PERCENT_STATS = new Set<EquipmentStat>();

const WEARABLES: WearableDefinition[] = Object.keys(itemTypes)
  .map((id) => getWearableById(Number(id)))
  .filter((wearable): wearable is WearableDefinition => Boolean(wearable))
  .filter((wearable) => wearable.category === 0)
  .sort((a, b) => a.id - b.id);

type ItemTypeMap = Record<number, WearableItemType | null | undefined>;

type WearableRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

const RARITY_BADGE_STYLES: Record<WearableRarity, string> = {
  common: 'border-slate-600 bg-slate-800/70 text-slate-200',
  uncommon: 'border-emerald-500/50 bg-emerald-600/20 text-emerald-200',
  rare: 'border-sky-500/50 bg-sky-600/20 text-sky-100',
  legendary: 'border-amber-500/60 bg-amber-600/20 text-amber-100',
  mythical: 'border-fuchsia-500/50 bg-fuchsia-600/20 text-fuchsia-100',
  godlike: 'border-indigo-500/50 bg-indigo-600/20 text-indigo-100',
};

const RARITY_ORDER: WearableRarity[] = [
  'common',
  'uncommon',
  'rare',
  'legendary',
  'mythical',
  'godlike',
];

function getWearableRarity(wearable: WearableDefinition): WearableRarity {
  const totalModifier = (wearable.traitModifiers ?? []).reduce(
    (acc, value) => acc + Math.abs(value || 0),
    0
  );

  if (totalModifier >= 6) return 'godlike';
  if (totalModifier >= 5) return 'mythical';
  if (totalModifier >= 4) return 'legendary';
  if (totalModifier >= 3) return 'rare';
  if (totalModifier >= 2) return 'uncommon';
  return 'common';
}

type AbilitySource = 'Wearable' | 'Weapon';

interface AbilityEntry {
  ability: AnyAbilityInstance;
  source: AbilitySource;
}

function formatDecimal(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatSignedDecimal(value: number, decimals = 2): string {
  if (value > 0) {
    return `+${formatDecimal(value, decimals)}`;
  }
  if (value < 0) {
    return `-${formatDecimal(Math.abs(value), decimals)}`;
  }
  return '0';
}

function formatPercent(
  value: number,
  { includeSign = false }: { includeSign?: boolean } = {}
): string {
  const percentage = value * 100;
  const decimals = Number.isInteger(percentage) ? 0 : 1;
  const formatted = formatDecimal(Math.abs(percentage), decimals);
  if (includeSign) {
    if (percentage > 0) return `+${formatted}%`;
    if (percentage < 0) return `-${formatted}%`;
    return '0%';
  }
  return `${percentage < 0 ? '-' : ''}${formatted}%`;
}

function formatClampValue(
  modifier: EquipmentStatModifier,
  value: number
): string {
  if (modifier.operation === 'mul') {
    return `×${formatDecimal(value, 2)}`;
  }
  if (
    modifier.operation === 'add_percent' ||
    PERCENT_STATS.has(modifier.stat)
  ) {
    return formatPercent(value);
  }
  return formatDecimal(value, 2);
}

function formatModifier(modifier: EquipmentStatModifier): string {
  const label = STAT_LABELS[modifier.stat] ?? modifier.stat;
  const operation = modifier.operation ?? 'add';
  let valueText: string;

  if (operation === 'mul') {
    valueText = `×${formatDecimal(modifier.value, 2)}`;
  } else if (operation === 'add_percent' || PERCENT_STATS.has(modifier.stat)) {
    valueText = formatPercent(modifier.value, { includeSign: true });
  } else {
    valueText = formatSignedDecimal(modifier.value, 2);
  }

  const clampParts: string[] = [];
  if (modifier.min !== undefined) {
    clampParts.push(`min ${formatClampValue(modifier, modifier.min)}`);
  }
  if (modifier.max !== undefined) {
    clampParts.push(`max ${formatClampValue(modifier, modifier.max)}`);
  }

  const clampText = clampParts.length > 0 ? ` (${clampParts.join(', ')})` : '';

  return `${label}: ${valueText}${clampText}`;
}

function describeEffect(effect: EquipmentEffect): string[] {
  if (effect.type === 'stat') {
    return effect.modifiers.map(formatModifier);
  }
  return [];
}

const ABILITY_NAMES: Record<string, string> = {
  'life-steal': 'Life Steal',
  'critical-strike': 'Critical Strike',
  cleave: 'Cleave',
  evade: 'Evade',
  'potion-farm': 'Potion Farm',
  'gold-farm': 'Gold Farm',
  'damage-reduction': 'Armor',
  'magic-find': 'Magic Find',
  'tongue-farm': 'Tongue Farm',
  thorns: 'Thorns',
};

function formatAppliesTo(applies?: 'melee' | 'ranged' | 'all'): string {
  if (!applies || applies === 'all') {
    return 'all attacks';
  }
  if (applies === 'melee') {
    return 'melee attacks';
  }
  return 'ranged attacks';
}

function describeAbility(ability: AnyAbilityInstance) {
  const name = ABILITY_NAMES[ability.id] ?? ability.id;

  if (isLifeSteal(ability)) {
    const percent = formatPercent(ability.params.percent);
    const scope = formatAppliesTo(ability.params.appliesTo);
    return {
      name,
      description: `Converts ${percent} of damage from ${scope} into healing.`,
    };
  }

  if (isCriticalStrike(ability)) {
    const chance = formatPercent(ability.params.chance);
    const scope = formatAppliesTo(ability.params.appliesTo);
    const multiplier = formatDecimal(ability.params.multiplier, 2);
    return {
      name,
      description: `${chance} chance for ${scope} to deal ${multiplier}× damage.`,
    };
  }

  if (isCleave(ability)) {
    const applies = ability.params.appliesTo ?? 'melee';
    const qualifier =
      applies === 'all' ? '' : applies === 'melee' ? 'melee ' : 'ranged ';
    const targets = ability.params.maxTargets
      ? `${ability.params.maxTargets} target${
          ability.params.maxTargets > 1 ? 's' : ''
        }`
      : 'multiple targets';
    const damagePercent = formatPercent(ability.params.damageMultiplier ?? 1);
    const cone = ability.params.coneAngleDeg
      ? ` in a ${formatDecimal(ability.params.coneAngleDeg, 0)}° arc`
      : '';
    const breakables = ability.params.includeBreakables
      ? ' Includes breakable objects.'
      : '';
    return {
      name,
      description: `Sweeping ${qualifier}attack hitting ${targets}${cone} at ${damagePercent} damage.${breakables}`,
    };
  }

  if (isEvade(ability)) {
    const chance = formatPercent(ability.params.chance);
    return {
      name,
      description: `${chance} chance to dodge incoming attacks.`,
    };
  }

  if (isPotionFarm(ability)) {
    const mode = ability.params.mode ?? 'both';
    const parts: string[] = [];

    if (mode === 'reweight' || mode === 'both') {
      const mult = ability.params.potionWeightMultiplier ?? 1;
      const multText =
        mult % 1 === 0
          ? `${formatDecimal(mult, 0)}x`
          : `${formatDecimal(mult, 2)}x`;
      parts.push(`${multText} potion drop weight when loot appears.`);
    }

    if (mode === 'extra-roll' || mode === 'both') {
      const chance = ability.params.extraPotionRollChance ?? 0;
      parts.push(
        `${formatPercent(chance)} chance to add a potion drop if none was rolled.`
      );
    }

    if (ability.params.hpToManaBias !== undefined) {
      const hpPercent = Math.round(
        Math.min(1, Math.max(0, ability.params.hpToManaBias)) * 100
      );
      const manaPercent = 100 - hpPercent;
      parts.push(`${hpPercent}% HP / ${manaPercent}% Mana split.`);
    }

    if (parts.length === 0) {
      parts.push('Increases potion drop chances.');
    }

    return {
      name,
      description: parts.join(' '),
    };
  }

  if (isGoldFarm(ability)) {
    const mode = ability.params.mode ?? 'both';
    const parts: string[] = [];

    if (mode === 'reweight' || mode === 'both') {
      const mult = ability.params.coinWeightMultiplier ?? 1;
      const multText =
        mult % 1 === 0
          ? `${formatDecimal(mult, 0)}x`
          : `${formatDecimal(mult, 2)}x`;
      parts.push(`${multText} coin drop weight when loot appears.`);
    }

    if (mode === 'extra-roll' || mode === 'both') {
      const chance = ability.params.extraCoinRollChance ?? 0;
      parts.push(
        `${formatPercent(chance)} chance to add a coin drop if none was rolled.`
      );
    }

    if (ability.params.amountMultiplier !== undefined) {
      const amountMult = Math.max(0, ability.params.amountMultiplier);
      if (amountMult > 1) {
        parts.push(
          `${formatPercent(amountMult - 1)} bonus coin quantity on drops.`
        );
      }
    }

    if (parts.length === 0) {
      parts.push('Increases coin drop chances.');
    }

    return {
      name,
      description: parts.join(' '),
    };
  }

  return {
    name,
    description: 'Ability details unavailable.',
  };
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getWeaponStats(weapon: WeaponProfile) {
  const stats: Array<{ label: string; value: string }> = [];

  const handedness = (weapon as any)?.handedness;
  const weaponTypeLabel = handedness
    ? `${toTitleCase(weapon.weaponType)} (${toTitleCase(String(handedness))})`
    : toTitleCase(weapon.weaponType);
  stats.push({
    label: 'Weapon Type',
    value: weaponTypeLabel,
  });

  if (weapon.aavegotchiId !== undefined) {
    stats.push({ label: 'Aavegotchi ID', value: `#${weapon.aavegotchiId}` });
  }

  if (weapon.damage !== undefined) {
    stats.push({
      label: 'Damage',
      value: formatDecimal(weapon.damage, 0),
    });
  }

  if (weapon.damageRange) {
    stats.push({
      label: 'Damage Range',
      value: `${formatDecimal(weapon.damageRange.min, 0)} - ${formatDecimal(
        weapon.damageRange.max,
        0
      )}`,
    });
  }

  if ((weapon as any).totalDamage !== undefined) {
    stats.push({
      label: 'Total Damage',
      value: formatDecimal((weapon as any).totalDamage as number, 2),
    });
  }

  if (weapon.attackSpeed !== undefined) {
    stats.push({
      label: 'Attack Speed',
      value: `${formatDecimal(weapon.attackSpeed, 0)} ms`,
    });
  }

  if (weapon.meleeAttackRange !== undefined) {
    stats.push({
      label: 'Melee Range',
      value: `${formatDecimal(weapon.meleeAttackRange, 0)} px`,
    });
  }

  if (weapon.rangedAttackRange !== undefined) {
    stats.push({
      label: 'Ranged Range',
      value: `${formatDecimal(weapon.rangedAttackRange, 0)} px`,
    });
  }

  if (weapon.projectileSpeed !== undefined) {
    stats.push({
      label: 'Projectile Speed',
      value: `${formatDecimal(weapon.projectileSpeed, 0)} px/s`,
    });
  }

  if (weapon.grenade) {
    const { grenade } = weapon;
    stats.push({
      label: 'Grenade Blast Radius',
      value: `${formatDecimal(grenade.blastRadiusPx, 0)} px`,
    });
    stats.push({
      label: 'Grenade Damage (Center)',
      value: formatDecimal(grenade.damageCenter, 0),
    });
    stats.push({
      label: 'Grenade Damage (Edge)',
      value: formatDecimal(grenade.damageEdge, 0),
    });
    stats.push({
      label: 'Grenade Throw Speed',
      value: `${formatDecimal(grenade.throwSpeedPxPerSec, 0)} px/s`,
    });
    if (grenade.maxRangePx !== undefined) {
      stats.push({
        label: 'Grenade Max Range',
        value: `${formatDecimal(grenade.maxRangePx, 0)} px`,
      });
    }
    stats.push({
      label: 'Grenade Cooldown',
      value: `${Math.ceil(grenade.cooldownMs / 1000)} turns`,
    });
    if (grenade.fuseMs !== undefined) {
      stats.push({
        label: 'Grenade Fuse',
        value: `${formatDecimal(grenade.fuseMs, 0)} ms`,
      });
    }
    stats.push({
      label: 'Grenade Ammo per Use',
      value: formatDecimal(grenade.ammoPerUse, 0),
    });
    stats.push({
      label: 'Explodes on Impact',
      value: grenade.explodeOnImpact ? 'Yes' : 'No',
    });
    // Healing splash grenades (e.g. milkshake)
    const g = grenade as any;
    if (typeof g?.healingSplash?.healAmount === 'number' && g.healingSplash.healAmount > 0) {
      stats.push({
        label: 'Heals',
        value: `${formatDecimal(g.healingSplash.healAmount, 0)} HP`,
      });
    }
  }

  return stats;
}

function getSlotLabel(slot: WearableSlot): string {
  return SLOT_LABELS[slot] ?? toTitleCase(slot);
}

export default function WearablesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [rarityQuery, setRarityQuery] = useQueryState('rarity', {
    history: 'replace',
  });
  const [slotQuery, setSlotQuery] = useQueryState('slot', {
    history: 'replace',
  });
  const [itemTypeQuery, setItemTypeQuery] = useQueryState('itemType', {
    history: 'replace',
  });
  const selectedItemType = itemTypeQuery ?? 'all';
  const [unclassifiedQuery, setUnclassifiedQuery] = useQueryState(
    'unclassified',
    { history: 'replace' }
  );

  const [appliedItemTypes, setAppliedItemTypes] = useState<ItemTypeMap>(() => {
    const map: ItemTypeMap = {};
    WEARABLES.forEach((wearable) => {
      map[wearable.id] = wearable.itemType ?? null;
    });
    return map;
  });
  const [pendingEdits, setPendingEdits] = useState<ItemTypeMap>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const editingEnabled = process.env.NODE_ENV !== 'production';

  const slotOptions = useMemo(() => {
    const unique = new Set<WearableSlot>();
    WEARABLES.forEach((wearable) => {
      wearable.slots.forEach((slot) => unique.add(slot));
    });
    return Array.from(unique).sort((a, b) =>
      getSlotLabel(a).localeCompare(getSlotLabel(b))
    );
  }, []);

  const rarityOptions = RARITY_ORDER;

  const selectedRarity = useMemo<'all' | WearableRarity>(() => {
    if (!rarityQuery) {
      return 'all';
    }
    return RARITY_ORDER.includes(rarityQuery as WearableRarity)
      ? (rarityQuery as WearableRarity)
      : 'all';
  }, [rarityQuery]);

  const selectedSlot = useMemo<'all' | WearableSlot>(() => {
    if (!slotQuery) {
      return 'all';
    }
    return slotOptions.includes(slotQuery as WearableSlot)
      ? (slotQuery as WearableSlot)
      : 'all';
  }, [slotQuery, slotOptions]);

  const showOnlyUnclassified = useMemo<boolean>(() => {
    if (!unclassifiedQuery) {
      return false;
    }
    const value = unclassifiedQuery.toLowerCase();
    return value === '1' || value === 'true';
  }, [unclassifiedQuery]);

  const availableItemTypeSlugs = useMemo(() => {
    const slugs = new Set<string>();
    (
      Object.entries(ITEM_TYPES_BY_SLOT) as Array<[WearableSlot, string[]]>
    ).forEach(([slot, types]) => {
      if (selectedSlot !== 'all' && slot !== selectedSlot) {
        return;
      }
      types.forEach((type) => slugs.add(type));
    });
    return Array.from(slugs).sort((a, b) =>
      toItemTypeLabel(a).localeCompare(toItemTypeLabel(b))
    );
  }, [selectedSlot]);

  useEffect(() => {
    if (!rarityQuery) {
      return;
    }
    if (!RARITY_ORDER.includes(rarityQuery as WearableRarity)) {
      setRarityQuery(null);
    }
  }, [rarityQuery, setRarityQuery]);

  useEffect(() => {
    if (!slotQuery) {
      return;
    }
    if (!slotOptions.includes(slotQuery as WearableSlot)) {
      setSlotQuery(null);
    }
  }, [slotQuery, slotOptions, setSlotQuery]);

  useEffect(() => {
    if (
      selectedItemType !== 'all' &&
      !availableItemTypeSlugs.includes(selectedItemType)
    ) {
      setItemTypeQuery(null);
    }
  }, [selectedItemType, availableItemTypeSlugs, setItemTypeQuery]);

  const hasUnsavedChanges = Object.keys(pendingEdits).length > 0;
  const pendingEditCount = Object.keys(pendingEdits).length;
  const itemTypeFilterDisabled = availableItemTypeSlugs.length === 0;
  const saveDisabled = !editingEnabled || !hasUnsavedChanges || isSaving;
  const saveButtonLabel = isSaving
    ? 'Saving…'
    : `Save${pendingEditCount > 0 ? ` (${pendingEditCount})` : ''}`;

  const getEffectiveItemType = useCallback(
    (wearable: WearableDefinition): WearableItemType | null => {
      const pendingValue = pendingEdits[wearable.id];
      if (pendingValue !== undefined) {
        return pendingValue ?? null;
      }
      const appliedValue = appliedItemTypes[wearable.id];
      if (appliedValue !== undefined) {
        return appliedValue ?? null;
      }
      return wearable.itemType ?? null;
    },
    [pendingEdits, appliedItemTypes]
  );

  const updateWearableItemType = useCallback(
    (wearable: WearableDefinition, value: WearableItemType | null) => {
      const normalized = value ?? null;
      const baseline =
        appliedItemTypes[wearable.id] ?? wearable.itemType ?? null;
      setPendingEdits((prev) => {
        const next = { ...prev };
        if (normalized === baseline) {
          delete next[wearable.id];
        } else {
          next[wearable.id] = normalized;
        }
        return next;
      });
    },
    [appliedItemTypes]
  );

  const handleRarityFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'all') {
        setRarityQuery(null);
      } else {
        setRarityQuery(value as WearableRarity);
      }
    },
    [setRarityQuery]
  );

  const handleSlotFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'all') {
        setSlotQuery(null);
      } else {
        setSlotQuery(value as WearableSlot);
      }
    },
    [setSlotQuery]
  );

  const handleItemTypeFilterChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'all') {
        setItemTypeQuery(null);
      } else {
        setItemTypeQuery(value);
      }
    },
    [setItemTypeQuery]
  );

  const handleSave = useCallback(async () => {
    if (!editingEnabled) {
      return;
    }
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const updates = entries
        .map(([idStr, value]) => {
          const wearableId = Number(idStr);
          const wearable = WEARABLES.find((entry) => entry.id === wearableId);
          if (!wearable) {
            return null;
          }
          return {
            id: wearableId,
            slug: wearable.slug,
            itemType: value ?? null,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            id: number;
            slug: string;
            itemType: WearableItemType | null;
          } => Boolean(entry)
        );

      if (updates.length === 0) {
        setPendingEdits({});
        setSaveSuccess('No updates required.');
        setIsSaving(false);
        return;
      }

      const response = await fetch('/api/wearables/item-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: updates.map(({ slug, itemType }) => ({
            wearableSlug: slug,
            itemType,
          })),
        }),
      });

      if (!response.ok) {
        const payload = await response
          .json()
          .catch(() => ({ error: 'Failed to update wearables.' }));
        throw new Error(payload.error || 'Failed to update wearables.');
      }

      setAppliedItemTypes((prev) => {
        const next = { ...prev };
        updates.forEach(({ id, itemType }) => {
          next[id] = itemType ?? null;
          const wearable = WEARABLES.find((entry) => entry.id === id);
          if (wearable) {
            if (itemType) {
              wearable.itemType = itemType as WearableItemType;
            } else {
              delete wearable.itemType;
            }
          }
        });
        return next;
      });
      setPendingEdits({});
      setSaveSuccess(
        `Saved ${updates.length} ${
          updates.length === 1 ? 'update' : 'updates'
        }.`
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to update wearables.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [pendingEdits, editingEnabled]);

  useEffect(() => {
    if (!saveSuccess) {
      return;
    }
    const timeout = setTimeout(() => setSaveSuccess(null), 4000);
    return () => clearTimeout(timeout);
  }, [saveSuccess]);

  useEffect(() => {
    if (!saveError) {
      return;
    }
    const timeout = setTimeout(() => setSaveError(null), 5000);
    return () => clearTimeout(timeout);
  }, [saveError]);

  const filteredWearables = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return WEARABLES.filter((wearable) => {
      if (
        selectedRarity !== 'all' &&
        getWearableRarity(wearable) !== selectedRarity
      ) {
        return false;
      }

      if (selectedSlot !== 'all' && !wearable.slots.includes(selectedSlot)) {
        return false;
      }

      const effectiveItemType = getEffectiveItemType(wearable);
      if (showOnlyUnclassified && (effectiveItemType ?? null) !== null) {
        return false;
      }
      if (
        selectedItemType !== 'all' &&
        (effectiveItemType ?? null) !== selectedItemType
      ) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      const searchableText = [
        wearable.name,
        wearable.slug,
        wearable.categoryLabel,
        String(wearable.id).padStart(3, '0'),
        ...wearable.abilities.map(
          (ability) => ABILITY_NAMES[ability.id] ?? ability.id
        ),
        ...(wearable.weapon?.abilities || []).map(
          (ability) => ABILITY_NAMES[ability.id] ?? ability.id
        ),
        ...wearable.slots.map((slot) => getSlotLabel(slot)),
        effectiveItemType ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [
    searchQuery,
    selectedRarity,
    selectedSlot,
    selectedItemType,
    showOnlyUnclassified,
    getEffectiveItemType,
  ]);

  const totalWearables = WEARABLES.length;
  const visibleWearables = filteredWearables.length;

  return (
    <div className="min-h-screen-safe bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-300">
            Wearable Compendium
          </p>
          <h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">
            Wearables & Abilities
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            Browse every wearable currently available in DeFi Dungeon, including
            their trait modifiers, additional stat effects, weapon data, and any
            passive abilities they bestow. Each entry displays the official
            in-game SVG icon so you can quickly recognize your gear.
          </p>
          <p className="mt-4 text-sm text-purple-200/80">
            Total wearables: {totalWearables}
            {visibleWearables !== totalWearables
              ? ` • Showing ${visibleWearables} after filters`
              : ''}
          </p>
        </header>

        <div className="sticky top-0 z-20 -mx-4 border-b border-white/5 bg-slate-950/95 px-4 py-4 backdrop-blur sm:-mx-6 lg:-mx-8">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[220px]">
              <label
                htmlFor="wearables-search"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200"
              >
                Search
              </label>
              <input
                id="wearables-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search wearables, abilities, or slots..."
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>

            <div className="min-w-[150px] shrink-0">
              <label
                htmlFor="rarity-filter"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200"
              >
                Rarity
              </label>
              <select
                id="rarity-filter"
                value={selectedRarity}
                onChange={handleRarityFilterChange}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                <option value="all">All rarities</option>
                {rarityOptions.map((rarity) => (
                  <option key={rarity} value={rarity} className="capitalize">
                    {toTitleCase(rarity)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px] shrink-0">
              <label
                htmlFor="slot-filter"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200"
              >
                Slot
              </label>
              <select
                id="slot-filter"
                value={selectedSlot}
                onChange={handleSlotFilterChange}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                <option value="all">All slots</option>
                {slotOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {getSlotLabel(slot)}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[180px] shrink-0">
              <label
                htmlFor="item-type-filter"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200"
              >
                Item Type
              </label>
              <select
                id="item-type-filter"
                value={selectedItemType}
                onChange={handleItemTypeFilterChange}
                disabled={itemTypeFilterDisabled}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
              >
                <option value="all">All item types</option>
                {availableItemTypeSlugs.map((slug) => (
                  <option key={slug} value={slug}>
                    {toItemTypeLabel(slug)}
                  </option>
                ))}
              </select>
              {itemTypeFilterDisabled ? (
                <p className="mt-1 text-xs text-white/40">
                  No item types registered for this slot yet.
                </p>
              ) : null}
            </div>

            <div className="min-w-[180px] shrink-0">
              <label
                htmlFor="unclassified-only"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200"
              >
                Unclassified
              </label>
              <div className="mt-2 flex items-center rounded-lg border border-white/10 bg-black/60 px-3 py-2">
                <input
                  id="unclassified-only"
                  type="checkbox"
                  checked={showOnlyUnclassified}
                  onChange={(e) =>
                    setUnclassifiedQuery(e.target.checked ? '1' : null)
                  }
                  className="h-4 w-4 accent-purple-500"
                />
                <span className="ml-2 text-sm text-white">
                  Only show unclassified
                </span>
              </div>
            </div>

            <div className="min-w-[140px] shrink-0">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
                Showing
              </span>
              <div className="mt-2 flex items-center justify-center rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white">
                <span className="font-semibold text-white">
                  {visibleWearables}
                </span>
                <span className="mx-1 text-white/40">/</span>
                {totalWearables}
              </div>
            </div>

            <div className="flex basis-full flex-col gap-2 md:ml-auto md:basis-auto md:items-end md:pl-2 md:text-right">
              {saveError ? (
                <span className="text-xs font-semibold text-rose-300">
                  {saveError}
                </span>
              ) : null}
              {saveSuccess ? (
                <span className="text-xs font-semibold text-emerald-300">
                  {saveSuccess}
                </span>
              ) : null}
              {!editingEnabled ? (
                <span className="text-xs uppercase tracking-[0.2em] text-white/30">
                  Editing disabled
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleSave}
                disabled={saveDisabled}
                className="inline-flex items-center justify-center rounded-lg border border-purple-400/40 bg-purple-600/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-600/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-white/40"
              >
                {saveButtonLabel}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {filteredWearables.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center text-sm text-muted-foreground">
              No wearables match your filters yet.
            </div>
          ) : (
            filteredWearables.map((wearable) => {
              const traitModifiers = wearable.traitModifiers || [];
              const traitBadges = traitModifiers
                .map((value, index) => {
                  if (!value) {
                    return null;
                  }
                  const trait = TRAIT_INFO[index];
                  if (!trait) {
                    return null;
                  }
                  const positive = value > 0;
                  return (
                    <span
                      key={`${wearable.id}-${trait.code}`}
                      title={trait.name}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        positive
                          ? 'border-emerald-500/40 bg-emerald-600/20 text-emerald-200'
                          : 'border-rose-500/40 bg-rose-600/20 text-rose-200'
                      }`}
                    >
                      {trait.code} {formatSignedDecimal(value, 2)}
                    </span>
                  );
                })
                .filter(Boolean);

              const effectiveEffects = resolveWearableEffectsByItemType(wearable);
              const statEffects = effectiveEffects.flatMap(describeEffect);
              const abilityEffectsFromItemType = effectiveEffects
                .filter((effect): effect is AbilityEffect => effect.type === 'ability')
                .map((effect) => ({
                  ability: {
                    id: effect.abilitySlug,
                    kind: 'passive',
                    params: effect.params ?? {},
                  } as AnyAbilityInstance,
                  source: 'Item type' as AbilitySource,
                }));
              const abilityEntries: AbilityEntry[] = [
                ...wearable.abilities.map((ability) => ({
                  ability,
                  source: 'Wearable' as AbilitySource,
                })),
                ...abilityEffectsFromItemType,
                ...((wearable.weapon?.abilities || []).map((ability) => ({
                  ability,
                  source: 'Weapon' as AbilitySource,
                })) as AbilityEntry[]),
              ];

              const weaponStats = wearable.weapon
                ? getWeaponStats(wearable.weapon)
                : [];

              const slotNames = wearable.slots
                .map((slot) => getSlotLabel(slot))
                .join(', ');

              const setSummary =
                wearable.setId && wearable.setId.length > 0
                  ? wearable.setId.map((id) => `#${id}`).join(', ')
                  : null;

              const rarity = getWearableRarity(wearable);
              const rarityLabel = toTitleCase(rarity);
              const rarityBadgeClass = RARITY_BADGE_STYLES[rarity];
              const primarySlot = getPrimarySlot(wearable);
              const slotItemTypes = (ITEM_TYPES_BY_SLOT[primarySlot] ??
                []) as WearableItemType[];
              const currentItemType = getEffectiveItemType(wearable);
              const hasPendingChange = pendingEdits[wearable.id] !== undefined;
              const isClassificationEditable =
                editingEnabled && slotItemTypes.length > 0;
              const classificationOptions: WearableItemType[] =
                currentItemType && !slotItemTypes.includes(currentItemType)
                  ? [currentItemType, ...slotItemTypes]
                  : slotItemTypes;

              return (
                <article
                  key={wearable.id}
                  className="overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg backdrop-blur-sm"
                >
                  <div className="flex flex-col gap-6 p-6 md:flex-row">
                    <div className="flex flex-col items-center gap-4 md:w-52">
                      <div className="flex h-32 w-32 items-center justify-center rounded-lg border border-white/10 bg-black/60 p-3 shadow-inner">
                        <img
                          src={`/wearables/${wearable.svgId}.svg`}
                          alt={`${wearable.name} icon`}
                          className="h-full w-full object-contain image-pixelated"
                          loading="lazy"
                        />
                      </div>
                      <div className="text-center text-sm text-muted-foreground">
                        <div className="font-mono text-xs uppercase tracking-widest text-purple-300">
                          #{wearable.id.toString().padStart(3, '0')}
                        </div>
                        <div className="mt-1 font-semibold text-white">
                          {toTitleCase(wearable.categoryLabel)}
                        </div>
                        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[0.7rem] uppercase tracking-wide">
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-muted-foreground">
                            Slots: {slotNames || 'None'}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold text-white shadow-sm ${rarityBadgeClass}`}
                          >
                            Rarity: {rarityLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-white">
                            {wearable.name}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            Min level {wearable.minLevel} • Rarity {rarityLabel}
                            {setSummary ? ` • Set ${setSummary}` : ''}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground md:text-right">
                          Primary slot: {getSlotLabel(primarySlot)}
                        </div>
                      </div>

                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                          Classification
                        </h3>
                        {slotItemTypes.length > 0 ? (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white/80">
                                {currentItemType
                                  ? `${toItemTypeLabel(currentItemType)} · ${currentItemType}`
                                  : 'None assigned'}
                              </span>
                              {hasPendingChange ? (
                                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                                  Unsaved
                                </span>
                              ) : null}
                            </div>
                            <select
                              value={currentItemType ?? ''}
                              onChange={(event) => {
                                const value = event.target.value;
                                const next = value
                                  ? (value as WearableItemType)
                                  : null;
                                updateWearableItemType(
                                  wearable,
                                  next && classificationOptions.includes(next)
                                    ? next
                                    : null
                                );
                              }}
                              disabled={!isClassificationEditable || isSaving}
                              className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30 sm:w-60"
                            >
                              <option value="">None</option>
                              {classificationOptions.map((type) => (
                                <option key={type} value={type}>
                                  {toItemTypeLabel(type)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No registered item types for the{' '}
                            {getSlotLabel(primarySlot)} slot yet.
                          </p>
                        )}
                      </section>

                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                          Trait Modifiers
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {traitBadges.length > 0 ? (
                            traitBadges
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              No trait modifiers
                            </span>
                          )}
                        </div>
                      </section>

                      {statEffects.length > 0 && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                            Stat Effects
                          </h3>
                          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {statEffects.map((effectText, index) => (
                              <li key={`${wearable.id}-effect-${index}`}>
                                {effectText}
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}

                      {weaponStats.length > 0 && (
                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                            Weapon Profile
                          </h3>
                          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                            {weaponStats.map(({ label, value }) => (
                              <div
                                key={`${wearable.id}-${label}`}
                                className="flex flex-col"
                              >
                                <dt className="font-medium text-white/80">
                                  {label}
                                </dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      )}

                      <section>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-200">
                          Abilities
                        </h3>
                        {abilityEntries.length > 0 ? (
                          <ul className="mt-2 space-y-3">
                            {abilityEntries.map(
                              ({ ability, source }, index) => {
                                const { name, description } =
                                  describeAbility(ability);
                                return (
                                  <li
                                    key={`${wearable.id}-${source}-${ability.id}-${index}`}
                                    className="rounded-lg border border-white/10 bg-white/5 p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="text-sm font-semibold text-white">
                                        {name}
                                      </div>
                                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
                                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-purple-200">
                                          {source}
                                        </span>
                                        <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-slate-200">
                                          {toTitleCase(ability.kind)}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {description}
                                    </p>
                                  </li>
                                );
                              }
                            )}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No abilities attached
                          </p>
                        )}
                      </section>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
