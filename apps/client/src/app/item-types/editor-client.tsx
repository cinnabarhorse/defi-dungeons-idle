'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useQueryState } from 'nuqs';

import {
  getWearableById,
  itemTypes,
  type WearableDefinition,
} from '../../data/wearables';
import type {
  AbilityEffect,
  AuraEffect,
  EquipmentEffect,
  EquipmentStat,
  EquipmentStatModifier,
  ItemTypeEffectsByRarity,
  StatEquipmentEffect,
  TagEffect,
  WearableRarity,
  WearableSlot,
} from '../../data/wearables';
import { ABILITIES } from '../../data/abilities';
import { cn } from '../../lib/utils';

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function getPrimarySlot(wearable: WearableDefinition): WearableSlot {
  const slots = Array.isArray(wearable.slots) ? wearable.slots : [];
  for (const slot of slots) {
    if (slot !== 'none') {
      return slot;
    }
  }
  return 'none';
}

function toTitleCaseFromSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

type EquipmentModifierOperation = NonNullable<
  EquipmentStatModifier['operation']
>;

type AbilityParamEntry = {
  key: string;
  value: string;
};

type EditableAbilityEffect = AbilityEffect & {
  __abilityParams: AbilityParamEntry[];
};

type EditableEffect =
  | StatEquipmentEffect
  | TagEffect
  | AuraEffect
  | EditableAbilityEffect;

type EditableEffectsByRarity = Partial<
  Record<WearableRarity, EditableEffect[]>
>;

type EditableTypeEffects = Record<string, EditableEffectsByRarity>;

type EditableItemTypeEffects = Partial<Record<WearableSlot, EditableTypeEffects>>;

interface ItemTypeEffectsEditorProps {
  slotTypes: Record<WearableSlot, string[]>;
  initialEffects: ItemTypeEffectsByRarity;
  statLabels: Record<EquipmentStat, string>;
  statOrder: readonly EquipmentStat[];
  rarities: readonly WearableRarity[];
  isReadOnly: boolean;
}

interface StatusMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

const EFFECT_TYPES: Array<EditableEffect['type']> = [
  'stat',
  'tag',
  'aura',
  'ability',
];

function convertToEditableEffect(effect: EquipmentEffect): EditableEffect {
  switch (effect.type) {
    case 'stat':
      return {
        type: 'stat',
        modifiers: effect.modifiers.map((modifier) => ({
          stat: modifier.stat,
          value: modifier.value,
          operation: modifier.operation ?? 'add',
          min: modifier.min,
          max: modifier.max,
        })),
      };
    case 'tag':
      return {
        type: 'tag',
        tags: [...effect.tags],
      };
    case 'aura':
      return {
        type: 'aura',
        color: effect.color ?? '',
        level: effect.level,
      };
    case 'ability': {
      const entries = Object.entries(effect.params ?? {}).map(
        ([key, value]) => ({
          key,
          value: value === undefined || value === null ? '' : String(value),
        })
      );
      return {
        type: 'ability',
        abilitySlug: effect.abilitySlug,
        params: effect.params ? { ...effect.params } : undefined,
        __abilityParams: entries,
      };
    }
    default:
      return effect;
  }
}

function convertInitialEffects(
  initial: ItemTypeEffectsByRarity
): EditableItemTypeEffects {
  const result: EditableItemTypeEffects = {};

  for (const [slotKey, typeMap] of Object.entries(initial ?? {})) {
    const slot = slotKey as WearableSlot;
    if (!typeMap) {
      continue;
    }

    for (const [typeSlug, rarityMap] of Object.entries(typeMap)) {
      if (!rarityMap) {
        continue;
      }
      for (const [rarityKey, effects] of Object.entries(rarityMap)) {
        const rarity = rarityKey as WearableRarity;
        if (!effects || effects.length === 0) {
          continue;
        }
        const editable = effects.map(convertToEditableEffect);
        if (!result[slot]) {
          result[slot] = {};
        }
        if (!result[slot]![typeSlug]) {
          result[slot]![typeSlug] = {};
        }
        result[slot]![typeSlug]![rarity] = editable;
      }
    }
  }

  return result;
}

function cloneEditableEffects(effects: EditableEffect[]): EditableEffect[] {
  return effects.map((effect) => {
    switch (effect.type) {
      case 'stat':
        return {
          type: 'stat',
          modifiers: effect.modifiers.map((modifier) => ({
            stat: modifier.stat,
            value: modifier.value,
            operation: modifier.operation ?? 'add',
            min: modifier.min,
            max: modifier.max,
          })),
        };
      case 'tag':
        return {
          type: 'tag',
          tags: [...effect.tags],
        };
      case 'aura':
        return {
          type: 'aura',
          color: effect.color ?? '',
          level: effect.level,
        };
      case 'ability': {
        const ability = effect as EditableAbilityEffect;
        const paramsEntries =
          ability.__abilityParams ??
          Object.entries(ability.params ?? {}).map(([key, value]) => ({
            key,
            value: value === undefined || value === null ? '' : String(value),
          }));

        return {
          type: 'ability',
          abilitySlug: ability.abilitySlug,
          params: ability.params ? { ...ability.params } : undefined,
          __abilityParams: paramsEntries.map((entry) => ({
            key: entry.key,
            value: entry.value,
          })),
        };
      }
      default:
        return effect;
    }
  });
}

function parseNumericInput(value: string): number | undefined {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAbilityParamValue(raw: string): unknown {
  const value = raw.trim();
  if (!value) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  if (
    (value.startsWith('{') && value.endsWith('}')) ||
    (value.startsWith('[') && value.endsWith(']'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through to string
    }
  }
  return value;
}

function prepareEffectsForSave(effects: EditableEffect[]): EquipmentEffect[] {
  return effects.map((effect) => {
    switch (effect.type) {
      case 'stat':
        return {
          type: 'stat' as const,
          modifiers: effect.modifiers.map((modifier) => {
            const prepared: EquipmentStatModifier = {
              stat: modifier.stat,
              value:
                typeof modifier.value === 'number'
                  ? modifier.value
                  : Number(modifier.value) || 0,
              operation: modifier.operation ?? 'add',
            };
            if (modifier.min !== undefined) {
              prepared.min = modifier.min;
            }
            if (modifier.max !== undefined) {
              prepared.max = modifier.max;
            }
            return prepared;
          }),
        };
      case 'tag':
        return {
          type: 'tag' as const,
          tags: effect.tags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
        };
      case 'aura': {
        const aura: AuraEffect = { type: 'aura' };
        const color = effect.color?.trim();
        if (color) {
          aura.color = color;
        }
        if (effect.level !== undefined && effect.level !== null) {
          aura.level = effect.level;
        }
        return aura;
      }
      case 'ability': {
        const ability = effect as EditableAbilityEffect;
        const paramsEntries = ability.__abilityParams ?? [];
        const params: Record<string, unknown> = {};
        for (const entry of paramsEntries) {
          const key = entry.key.trim();
          if (!key) {
            continue;
          }
          const parsed = parseAbilityParamValue(entry.value);
          if (parsed !== undefined) {
            params[key] = parsed;
          }
        }
        const payload: AbilityEffect = {
          type: 'ability',
          abilitySlug: ability.abilitySlug.trim(),
        };
        if (Object.keys(params).length > 0) {
          payload.params = params;
        }
        return payload;
      }
      default:
        return effect;
    }
  });
}

function canonicalizeEffect(effect: EquipmentEffect): string {
  switch (effect.type) {
    case 'stat': {
      const modifiers = effect.modifiers.map((modifier) => ({
        stat: modifier.stat,
        operation: modifier.operation ?? 'add',
        value: modifier.value,
        min: modifier.min ?? null,
        max: modifier.max ?? null,
      }));
      modifiers.sort((a, b) => {
        if (a.stat !== b.stat) {
          return a.stat.localeCompare(b.stat);
        }
        if (a.operation !== b.operation) {
          return a.operation.localeCompare(b.operation);
        }
        if (a.value !== b.value) {
          return a.value - b.value;
        }
        const minA = a.min ?? Number.NEGATIVE_INFINITY;
        const minB = b.min ?? Number.NEGATIVE_INFINITY;
        if (minA !== minB) {
          return minA - minB;
        }
        const maxA = a.max ?? Number.POSITIVE_INFINITY;
        const maxB = b.max ?? Number.POSITIVE_INFINITY;
        if (maxA !== maxB) {
          return maxA - maxB;
        }
        return 0;
      });
      return JSON.stringify({ type: 'stat', modifiers });
    }
    case 'tag':
      return JSON.stringify({
        type: 'tag',
        tags: [...effect.tags].map((tag) => tag.trim()).sort(),
      });
    case 'aura':
      return JSON.stringify({
        type: 'aura',
        color: effect.color ?? null,
        level: effect.level ?? null,
      });
    case 'ability':
      return JSON.stringify({
        type: 'ability',
        abilitySlug: effect.abilitySlug.trim(),
        params: effect.params ?? {},
      });
    default:
      return JSON.stringify(effect);
  }
}

function dedupeEffects(effects: EquipmentEffect[]): EquipmentEffect[] {
  const seen = new Set<string>();
  const result: EquipmentEffect[] = [];
  for (const effect of effects) {
    const key = canonicalizeEffect(effect);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(effect);
  }
  return result;
}

function createDefaultEffect(
  type: EditableEffect['type'],
  fallbackStat: EquipmentStat,
  defaultAbilitySlug?: string
): EditableEffect {
  switch (type) {
    case 'stat':
      return {
        type: 'stat',
        modifiers: [
          {
            stat: fallbackStat,
            operation: 'add',
            value: 0,
          },
        ],
      };
    case 'tag':
      return {
        type: 'tag',
        tags: [''],
      };
    case 'aura':
      return {
        type: 'aura',
        color: '',
        level: 1,
      };
    case 'ability':
      return {
        type: 'ability',
        abilitySlug: defaultAbilitySlug ?? '',
        __abilityParams: [],
      } as EditableAbilityEffect;
    default:
      return {
        type: 'tag',
        tags: [''],
      };
  }
}

function effectsAreEqual(
  a: EquipmentEffect[],
  b: EquipmentEffect[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (canonicalizeEffect(a[i]) !== canonicalizeEffect(b[i])) {
      return false;
    }
  }
  return true;
}

export default function ItemTypeEffectsEditor({
  slotTypes,
  initialEffects,
  statLabels,
  statOrder,
  rarities,
  isReadOnly,
}: ItemTypeEffectsEditorProps) {
  const initialState = useMemo(
    () => convertInitialEffects(initialEffects),
    [initialEffects]
  );

  const [effectsState, setEffectsState] =
    useState<EditableItemTypeEffects>(initialState);
  const [draftByRarity, setDraftByRarity] = useState<EditableEffectsByRarity>(
    {}
  );
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const abilityOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const entries = Object.entries(ABILITIES) as Array<
      [string, (params: any) => { id?: string }]
    >;
    for (const [key, builder] of entries) {
      let slug = toKebabCase(key);
      if (typeof builder === 'function') {
        try {
          const instance = builder({} as any);
          if (instance?.id && typeof instance.id === 'string') {
            slug = instance.id;
          }
        } catch {
          slug = toKebabCase(key);
        }
      }
      options.push({
        value: slug,
        label: toTitleCaseFromSlug(slug),
      });
    }
    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  }, []);

  const abilityOptionValues = useMemo(
    () => new Set(abilityOptions.map((option) => option.value)),
    [abilityOptions]
  );

  const wearablesByType = useMemo(() => {
    const map = new Map<string, WearableDefinition[]>();
    for (const idStr of Object.keys(itemTypes)) {
      const wearable = getWearableById(Number(idStr));
      if (!wearable || !wearable.itemType) {
        continue;
      }
      const key = `${getPrimarySlot(wearable)}::${wearable.itemType}`;
      const existing = map.get(key);
      if (existing) {
        existing.push(wearable);
      } else {
        map.set(key, [wearable]);
      }
    }
    map.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });
    return map;
  }, []);

  const [slotQuery, setSlotQuery] = useQueryState('slot', {
    history: 'replace',
  });
  const [typeQuery, setTypeQuery] = useQueryState('type', {
    history: 'replace',
  });
  const [searchQuery, setSearchQuery] = useQueryState('q', {
    history: 'replace',
  });

  const slotsWithTypes = useMemo(() => {
    return (Object.entries(slotTypes) as Array<[WearableSlot, string[]]>).filter(
      ([, types]) => Array.isArray(types) && types.length > 0
    );
  }, [slotTypes]);

  const slotOptions = useMemo(
    () => slotsWithTypes.map(([slot]) => slot),
    [slotsWithTypes]
  );

  useEffect(() => {
    if (slotOptions.length === 0) {
      return;
    }
    if (!slotQuery || !slotOptions.includes(slotQuery as WearableSlot)) {
      setSlotQuery(slotOptions[0] ?? null);
    }
  }, [slotOptions, slotQuery, setSlotQuery]);

  const selectedSlot = useMemo<WearableSlot | null>(() => {
    if (!slotOptions.length) {
      return null;
    }
    const candidate = slotQuery as WearableSlot | null;
    return candidate && slotOptions.includes(candidate)
      ? candidate
      : slotOptions[0];
  }, [slotOptions, slotQuery]);

  const searchTerm = (searchQuery ?? '').toLowerCase();

  const availableTypeOptions = useMemo(() => {
    if (!selectedSlot) {
      return [];
    }
    const types = slotTypes[selectedSlot] ?? [];
    if (!searchTerm) {
      return types;
    }
    return types.filter((slug) => slug.toLowerCase().includes(searchTerm));
  }, [slotTypes, selectedSlot, searchTerm]);

  useEffect(() => {
    if (availableTypeOptions.length === 0) {
      if (typeQuery) {
        setTypeQuery(null);
      }
      return;
    }
    if (!typeQuery || !availableTypeOptions.includes(typeQuery)) {
      setTypeQuery(availableTypeOptions[0] ?? null);
    }
  }, [availableTypeOptions, typeQuery, setTypeQuery]);

  const selectedType = useMemo<string | null>(() => {
    if (availableTypeOptions.length === 0) {
      return null;
    }
    if (typeQuery && availableTypeOptions.includes(typeQuery)) {
      return typeQuery;
    }
    return availableTypeOptions[0] ?? null;
  }, [availableTypeOptions, typeQuery]);

  const selectionKey = useMemo(
    () => `${selectedSlot ?? 'none'}::${selectedType ?? 'none'}`,
    [selectedSlot, selectedType]
  );

  const currentTypeEffects = useMemo<EditableEffectsByRarity>(() => {
    if (!selectedSlot || !selectedType) {
      return {};
    }
    return effectsState[selectedSlot]?.[selectedType] ?? {};
  }, [effectsState, selectedSlot, selectedType]);

  const previousSelectionRef = useRef<string>(selectionKey);

  useEffect(() => {
    if (!selectedSlot || !selectedType) {
      setDraftByRarity({});
      previousSelectionRef.current = selectionKey;
      return;
    }

    const nextDraft: EditableEffectsByRarity = {};
    rarities.forEach((rarity) => {
      const stored = currentTypeEffects[rarity];
      nextDraft[rarity] = stored ? cloneEditableEffects(stored) : [];
    });
    setDraftByRarity(nextDraft);

    if (previousSelectionRef.current !== selectionKey) {
      setStatus(null);
      previousSelectionRef.current = selectionKey;
    }
  }, [currentTypeEffects, rarities, selectedSlot, selectedType, selectionKey]);

  const currentPreparedByRarity = useMemo(() => {
    const map: Partial<Record<WearableRarity, EquipmentEffect[]>> = {};
    rarities.forEach((rarity) => {
      const stored = currentTypeEffects[rarity];
      map[rarity] = dedupeEffects(
        prepareEffectsForSave(stored ? cloneEditableEffects(stored) : [])
      );
    });
    return map;
  }, [currentTypeEffects, rarities]);

  const draftPreparedByRarity = useMemo(() => {
    const map: Partial<Record<WearableRarity, EquipmentEffect[]>> = {};
    rarities.forEach((rarity) => {
      const draftEffects = draftByRarity[rarity] ?? [];
      map[rarity] = dedupeEffects(prepareEffectsForSave(draftEffects));
    });
    return map;
  }, [draftByRarity, rarities]);

  const rarityChangeMap = useMemo(() => {
    const map: Record<WearableRarity, boolean> = {} as Record<
      WearableRarity,
      boolean
    >;
    rarities.forEach((rarity) => {
      const currentEffects = currentPreparedByRarity[rarity] ?? [];
      const draftEffects = draftPreparedByRarity[rarity] ?? [];
      map[rarity] = !effectsAreEqual(currentEffects, draftEffects);
    });
    return map;
  }, [rarities, currentPreparedByRarity, draftPreparedByRarity]);

  const hasChanges = useMemo(
    () => rarities.some((rarity) => rarityChangeMap[rarity]),
    [rarities, rarityChangeMap]
  );

  const dirtyCount = useMemo(
    () =>
      rarities.reduce(
        (acc, rarity) => acc + (rarityChangeMap[rarity] ? 1 : 0),
        0
      ),
    [rarities, rarityChangeMap]
  );

  const updateDraft = useCallback(
    (
      rarity: WearableRarity,
      mutator: (effects: EditableEffect[]) => boolean | void
    ) => {
      setDraftByRarity((prev) => {
        const next = { ...prev };
        const existing = prev[rarity];
        const base = existing ? cloneEditableEffects(existing) : [];
        const result = mutator(base);
        if (result === false) {
          return prev;
        }
        next[rarity] = base;
        return next;
      });
    },
    []
  );

  const handleAddEffect = useCallback(
    (rarity: WearableRarity, type: EditableEffect['type']) => {
      if (!selectedSlot || !selectedType) {
        return;
      }
      const fallbackStat = statOrder[0];
      const defaultAbilitySlug = abilityOptions[0]?.value;
      updateDraft(rarity, (effects) => {
        effects.push(
          createDefaultEffect(type, fallbackStat, defaultAbilitySlug)
        );
      });
    },
    [abilityOptions, selectedSlot, selectedType, statOrder, updateDraft]
  );

  const handleRemoveEffect = useCallback(
    (rarity: WearableRarity, index: number) => {
      updateDraft(rarity, (effects) => {
        if (!effects[index]) {
          return false;
        }
        effects.splice(index, 1);
        return true;
      });
    },
    [updateDraft]
  );

  const handleModifierChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      modifierIndex: number,
      updates: Partial<EquipmentStatModifier>
    ) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex];
        if (!effect || effect.type !== 'stat') {
          return false;
        }
        const modifier = effect.modifiers[modifierIndex];
        if (!modifier) {
          return false;
        }
        effect.modifiers[modifierIndex] = {
          ...modifier,
          ...updates,
        };
        return true;
      });
    },
    [updateDraft]
  );

  const handleAddModifier = useCallback(
    (rarity: WearableRarity, effectIndex: number) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex];
        if (!effect || effect.type !== 'stat') {
          return false;
        }
        const fallbackStat = statOrder[0];
        effect.modifiers.push({
          stat: fallbackStat,
          operation: 'add',
          value: 0,
        });
        return true;
      });
    },
    [statOrder, updateDraft]
  );

  const handleRemoveModifier = useCallback(
    (rarity: WearableRarity, effectIndex: number, modifierIndex: number) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex];
        if (!effect || effect.type !== 'stat') {
          return false;
        }
        if (!effect.modifiers[modifierIndex]) {
          return false;
        }
        effect.modifiers.splice(modifierIndex, 1);
        return true;
      });
    },
    [updateDraft]
  );

  const handleTagChange = useCallback(
    (rarity: WearableRarity, effectIndex: number, rawValue: string) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex];
        if (!effect || effect.type !== 'tag') {
          return false;
        }
        const tags = rawValue
          .split('\n')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
        effect.tags = tags.length > 0 ? tags : [''];
        return true;
      });
    },
    [updateDraft]
  );

  const handleAuraChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      field: 'color' | 'level',
      value: string | number | undefined
    ) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex];
        if (!effect || effect.type !== 'aura') {
          return false;
        }
        if (field === 'color') {
          effect.color = typeof value === 'string' ? value : '';
        } else {
          effect.level =
            typeof value === 'number'
              ? value
              : parseNumericInput(String(value ?? '')) ?? undefined;
        }
        return true;
      });
    },
    [updateDraft]
  );

  const handleAbilitySlugChange = useCallback(
    (rarity: WearableRarity, effectIndex: number, value: string) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex] as
          | EditableAbilityEffect
          | undefined;
        if (!effect || effect.type !== 'ability') {
          return false;
        }
        effect.abilitySlug = value;
        return true;
      });
    },
    [updateDraft]
  );

  const handleAbilityParamChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      paramIndex: number,
      field: 'key' | 'value',
      value: string
    ) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex] as
          | EditableAbilityEffect
          | undefined;
        if (!effect || effect.type !== 'ability') {
          return false;
        }
        if (!effect.__abilityParams) {
          effect.__abilityParams = [];
        }
        if (!effect.__abilityParams[paramIndex]) {
          effect.__abilityParams[paramIndex] = { key: '', value: '' };
        }
        effect.__abilityParams[paramIndex] = {
          ...effect.__abilityParams[paramIndex],
          [field]: value,
        };
        return true;
      });
    },
    [updateDraft]
  );

  const handleAddAbilityParam = useCallback(
    (rarity: WearableRarity, effectIndex: number) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex] as
          | EditableAbilityEffect
          | undefined;
        if (!effect || effect.type !== 'ability') {
          return false;
        }
        if (!effect.__abilityParams) {
          effect.__abilityParams = [];
        }
        effect.__abilityParams.push({ key: '', value: '' });
        return true;
      });
    },
    [updateDraft]
  );

  const handleRemoveAbilityParam = useCallback(
    (rarity: WearableRarity, effectIndex: number, paramIndex: number) => {
      updateDraft(rarity, (effects) => {
        const effect = effects[effectIndex] as
          | EditableAbilityEffect
          | undefined;
        if (!effect || effect.type !== 'ability') {
          return false;
        }
        if (!effect.__abilityParams?.[paramIndex]) {
          return false;
        }
        effect.__abilityParams.splice(paramIndex, 1);
        return true;
      });
    },
    [updateDraft]
  );

  const handleReset = useCallback(() => {
    if (!selectedSlot || !selectedType) {
      return;
    }
    const nextDraft: EditableEffectsByRarity = {};
    rarities.forEach((rarity) => {
      const stored = currentTypeEffects[rarity];
      nextDraft[rarity] = stored ? cloneEditableEffects(stored) : [];
    });
    setDraftByRarity(nextDraft);
    setStatus({ type: 'info', message: 'Changes reset.' });
  }, [currentTypeEffects, rarities, selectedSlot, selectedType]);

  const handleSave = useCallback(async () => {
    if (!selectedSlot || !selectedType || isSaving || isReadOnly) {
      return;
    }

    const raritiesToUpdate = rarities.filter((rarity) => rarityChangeMap[rarity]);
    if (raritiesToUpdate.length === 0) {
      return;
    }

    setIsSaving(true);
    setStatus(null);
    try {
      for (const rarity of raritiesToUpdate) {
        const prepared = draftPreparedByRarity[rarity] ?? [];

        const response = await fetch('/api/wearables/item-type', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            slot: selectedSlot,
            typeSlug: selectedType,
            rarity,
            mode: 'replace',
            effects: prepared,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            (payload && typeof payload.error === 'string' && payload.error) ||
            `Save failed for rarity "${rarity}".`;
          throw new Error(message);
        }
      }

      const converted = convertInitialEffects({
        [selectedSlot]: {
          [selectedType]: Object.fromEntries(
            raritiesToUpdate.map((rarity) => [
              rarity,
              draftPreparedByRarity[rarity] ?? [],
            ])
          ) as Partial<Record<WearableRarity, EquipmentEffect[]>>,
        },
      });

      setEffectsState((prev) => {
        const next: EditableItemTypeEffects = { ...prev };
        const slotMap = { ...(next[selectedSlot] ?? {}) };
        const typeMap = { ...(slotMap[selectedType] ?? {}) };
        const convertedTypeMap =
          converted[selectedSlot]?.[selectedType] ?? {};

        raritiesToUpdate.forEach((rarity) => {
          const convertedEffects = convertedTypeMap[rarity] ?? [];
          if (convertedEffects.length === 0) {
            delete typeMap[rarity];
          } else {
            typeMap[rarity] = convertedEffects;
          }
        });

        if (Object.keys(typeMap).length === 0) {
          delete slotMap[selectedType];
        } else {
          slotMap[selectedType] = typeMap;
        }

        if (Object.keys(slotMap).length === 0) {
          delete next[selectedSlot];
        } else {
          next[selectedSlot] = slotMap;
        }

        return next;
      });

      setStatus({
        type: 'success',
        message: `Saved ${raritiesToUpdate.length} ${
          raritiesToUpdate.length === 1 ? 'rarity' : 'rarities'
        }.`,
      });
    } catch (error) {
      setStatus({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save item type effects.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    draftPreparedByRarity,
    isReadOnly,
    isSaving,
    rarities,
    rarityChangeMap,
    selectedSlot,
    selectedType,
  ]);

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setSearchQuery(value.length > 0 ? value : null);
    },
    [setSearchQuery]
  );

  const handleSlotChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      setSlotQuery(value);
    },
    [setSlotQuery]
  );

  const handleStatChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      modifierIndex: number,
      value: string
    ) => {
      handleModifierChange(rarity, effectIndex, modifierIndex, {
        stat: value as EquipmentStat,
      });
    },
    [handleModifierChange]
  );

  const handleOperationChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      modifierIndex: number,
      value: string
    ) => {
      handleModifierChange(rarity, effectIndex, modifierIndex, {
        operation: value as EquipmentModifierOperation,
      });
    },
    [handleModifierChange]
  );

  const handleValueChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      modifierIndex: number,
      value: string
    ) => {
      const parsed = Number(value);
      handleModifierChange(rarity, effectIndex, modifierIndex, {
        value: Number.isFinite(parsed) ? parsed : 0,
      });
    },
    [handleModifierChange]
  );

  const handleClampChange = useCallback(
    (
      rarity: WearableRarity,
      effectIndex: number,
      modifierIndex: number,
      field: 'min' | 'max',
      value: string
    ) => {
      handleModifierChange(rarity, effectIndex, modifierIndex, {
        [field]: parseNumericInput(value),
      });
    },
    [handleModifierChange]
  );

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isReadOnly) {
        void handleSave();
      }
    },
    [handleSave, isReadOnly]
  );

  const editingDisabled = isReadOnly;

  const previewWearables = useMemo(() => {
    if (!selectedSlot || !selectedType) {
      return [];
    }
    return (
      wearablesByType.get(`${selectedSlot}::${selectedType}`) ?? []
    );
  }, [selectedSlot, selectedType, wearablesByType]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-white">
          Wearable Item Type Effects
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Manage rarity-specific stat, tag, aura, and ability effects applied to
          wearable item types. Changes sync to <code>data/wearables.ts</code> and
          shared bundles.
        </p>
        {isReadOnly && (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Production mode detected — editing disabled.
          </p>
        )}
      </div>
      <div className="flex gap-6">
        <aside className="w-64 space-y-6">
          <div>
            <label
              htmlFor="slot"
              className="block text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              Slot
            </label>
            <select
              id="slot"
              value={selectedSlot ?? ''}
              onChange={handleSlotChange}
              className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              disabled={slotOptions.length === 0 || editingDisabled}
            >
              {slotOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="search"
              className="block text-xs font-medium uppercase tracking-wide text-slate-400"
            >
              Search Types
            </label>
            <input
              id="search"
              type="text"
              value={searchQuery ?? ''}
              onChange={handleSearchChange}
              placeholder="athletic, fancy..."
              className="mt-2 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Item Types
            </p>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {availableTypeOptions.length === 0 && (
                <div className="rounded border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400">
                  No item types match the current filters.
                </div>
              )}
              {availableTypeOptions.map((slug) => {
                const isActive = slug === selectedType;
                const slotMap =
                  effectsState[selectedSlot as WearableSlot] ?? {};
                const typeMap = slotMap[slug] ?? {};
                const totalCount = Object.values(typeMap ?? {}).reduce(
                  (acc, list) => acc + (list?.length ?? 0),
                  0
                );
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => setTypeQuery(slug)}
                    className={cn(
                      'w-full rounded border px-3 py-2 text-left text-sm transition hover:border-sky-500 hover:text-sky-200',
                      isActive
                        ? 'border-sky-500 bg-sky-500/10 text-sky-100'
                        : 'border-slate-700 bg-slate-900 text-slate-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span>{slug}</span>
                      <span className="text-xs text-slate-400">
                        {totalCount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
        <main className="flex-1 space-y-6">
          {status && (
            <div
              className={cn(
                'rounded border px-4 py-3 text-sm',
                status.type === 'success' &&
                  'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
                status.type === 'error' &&
                  'border-rose-500/40 bg-rose-500/10 text-rose-200',
                status.type === 'info' &&
                  'border-sky-500/40 bg-sky-500/10 text-sky-100'
              )}
            >
              {status.message}
            </div>
          )}
          {selectedSlot && selectedType ? (
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {selectedType}
                  </h2>
                  <p className="text-sm text-slate-400">
                    Slot <span className="text-slate-200">{selectedSlot}</span>
                  </p>
                </div>
              </div>

              <div className="rounded border border-slate-700 bg-slate-900 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    Wearables
                  </h3>
                  <span className="text-xs uppercase tracking-wide text-slate-400">
                    {previewWearables.length}{' '}
                    {previewWearables.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                {previewWearables.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No wearables currently assigned to this item type.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {previewWearables.map((wearable) => (
                      <div
                        key={wearable.id}
                        className="flex flex-col items-center rounded border border-slate-700 bg-slate-950 p-2 text-center text-xs text-slate-300"
                        title={wearable.name}
                      >
                        <img
                          src={`/wearables/${wearable.svgId}.svg`}
                          alt={wearable.name}
                          loading="lazy"
                          className="h-12 w-12 object-contain"
                        />
                        <span className="mt-2 w-full truncate leading-tight">
                          {wearable.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {rarities.map((rarity) => {
                  const effects = draftByRarity[rarity] ?? [];
                  const rarityHasChanges = rarityChangeMap[rarity];

                  return (
                    <section
                      key={rarity}
                      className="rounded border border-slate-700 bg-slate-900 p-4 shadow-sm"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {toTitleCaseFromSlug(rarity)}
                          </h3>
                          <p className="text-xs text-slate-400">
                            {rarityHasChanges ? 'Unsaved changes' : 'Saved'} ·{' '}
                            {effects.length}{' '}
                            {effects.length === 1 ? 'effect' : 'effects'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {EFFECT_TYPES.map((type) => (
                            <button
                              key={`${rarity}-${type}`}
                              type="button"
                              onClick={() => handleAddEffect(rarity, type)}
                              disabled={editingDisabled}
                              className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                            >
                              + {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        {effects.length === 0 ? (
                          <div className="rounded border border-slate-700 bg-slate-950 px-4 py-4 text-sm text-slate-400">
                            No effects defined for this rarity.
                          </div>
                        ) : (
                          effects.map((effect, effectIndex) => (
                            <div
                              key={`${rarity}-effect-${effectIndex}`}
                              className="rounded border border-slate-700 bg-slate-900 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between">
                                <h4 className="text-base font-semibold text-slate-100">
                                  Effect #{effectIndex + 1}{' '}
                                  <span className="text-sm text-slate-400">
                                    ({effect.type})
                                  </span>
                                </h4>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveEffect(rarity, effectIndex)
                                  }
                                  disabled={editingDisabled}
                                  className="rounded border border-rose-600/60 px-2 py-1 text-xs uppercase tracking-wide text-rose-200 transition hover:border-rose-500 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                                >
                                  Remove
                                </button>
                              </div>

                              {effect.type === 'stat' && (
                                <div className="space-y-3">
                                  {effect.modifiers.map(
                                    (modifier, modifierIndex) => (
                                      <div
                                        key={`${rarity}-modifier-${modifierIndex}`}
                                        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                                      >
                                        <div>
                                          <label className="text-xs uppercase text-slate-400">
                                            Stat
                                          </label>
                                          <select
                                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                            value={modifier.stat}
                                            onChange={(event) =>
                                              handleStatChange(
                                                rarity,
                                                effectIndex,
                                                modifierIndex,
                                                event.target.value
                                              )
                                            }
                                            disabled={editingDisabled}
                                          >
                                            {statOrder.map((stat) => (
                                              <option key={stat} value={stat}>
                                                {statLabels[stat] ?? stat}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-xs uppercase text-slate-400">
                                            Operation
                                          </label>
                                          <select
                                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                            value={modifier.operation ?? 'add'}
                                            onChange={(event) =>
                                              handleOperationChange(
                                                rarity,
                                                effectIndex,
                                                modifierIndex,
                                                event.target.value
                                              )
                                            }
                                            disabled={editingDisabled}
                                          >
                                            <option value="add">add</option>
                                            <option value="mul">mul</option>
                                            <option value="add_percent">
                                              add_percent
                                            </option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="text-xs uppercase text-slate-400">
                                            Value
                                          </label>
                                          <input
                                            type="number"
                                            step="any"
                                            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                            value={modifier.value}
                                            onChange={(event) =>
                                              handleValueChange(
                                                rarity,
                                                effectIndex,
                                                modifierIndex,
                                                event.target.value
                                              )
                                            }
                                            disabled={editingDisabled}
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs uppercase text-slate-400">
                                              Min
                                            </label>
                                            <input
                                              type="number"
                                              step="any"
                                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                              value={
                                                modifier.min !== undefined
                                                  ? modifier.min
                                                  : ''
                                              }
                                              onChange={(event) =>
                                                handleClampChange(
                                                  rarity,
                                                  effectIndex,
                                                  modifierIndex,
                                                  'min',
                                                  event.target.value
                                                )
                                              }
                                              disabled={editingDisabled}
                                            />
                                          </div>
                                          <div>
                                            <label className="text-xs uppercase text-slate-400">
                                              Max
                                            </label>
                                            <input
                                              type="number"
                                              step="any"
                                              className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                              value={
                                                modifier.max !== undefined
                                                  ? modifier.max
                                                  : ''
                                              }
                                              onChange={(event) =>
                                                handleClampChange(
                                                  rarity,
                                                  effectIndex,
                                                  modifierIndex,
                                                  'max',
                                                  event.target.value
                                                )
                                              }
                                              disabled={editingDisabled}
                                            />
                                          </div>
                                        </div>
                                        <div className="flex items-end">
                                          <button
                                            type="button"
                                            className="rounded border border-rose-600/60 px-2 py-1 text-xs uppercase text-rose-200 transition hover:border-rose-500 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                                            onClick={() =>
                                              handleRemoveModifier(
                                                rarity,
                                                effectIndex,
                                                modifierIndex
                                              )
                                            }
                                            disabled={editingDisabled}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>
                                    )
                                  )}
                                  <button
                                    type="button"
                                    className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                                    onClick={() =>
                                      handleAddModifier(rarity, effectIndex)
                                    }
                                    disabled={editingDisabled}
                                  >
                                    + Modifier
                                  </button>
                                </div>
                              )}

                              {effect.type === 'tag' && (
                                <div>
                                  <label className="text-xs uppercase text-slate-400">
                                    Tags (one per line)
                                  </label>
                                  <textarea
                                    rows={3}
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                    value={effect.tags.join('\n')}
                                    onChange={(event) =>
                                      handleTagChange(
                                        rarity,
                                        effectIndex,
                                        event.target.value
                                      )
                                    }
                                    disabled={editingDisabled}
                                  />
                                </div>
                              )}

                              {effect.type === 'aura' && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="text-xs uppercase text-slate-400">
                                      Color
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="#00FFFF"
                                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                      value={effect.color ?? ''}
                                      onChange={(event) =>
                                        handleAuraChange(
                                          rarity,
                                          effectIndex,
                                          'color',
                                          event.target.value
                                        )
                                      }
                                      disabled={editingDisabled}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs uppercase text-slate-400">
                                      Level
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={5}
                                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                      value={effect.level ?? ''}
                                      onChange={(event) =>
                                        handleAuraChange(
                                          rarity,
                                          effectIndex,
                                          'level',
                                          Number(event.target.value)
                                        )
                                      }
                                      disabled={editingDisabled}
                                    />
                                  </div>
                                </div>
                              )}

                              {effect.type === 'ability' && (
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs uppercase text-slate-400">
                                      Ability
                                    </label>
                                    <select
                                      className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                      value={effect.abilitySlug}
                                      onChange={(event) =>
                                        handleAbilitySlugChange(
                                          rarity,
                                          effectIndex,
                                          event.target.value
                                        )
                                      }
                                      disabled={editingDisabled}
                                    >
                                      <option value="">
                                        Select ability…
                                      </option>
                                      {effect.abilitySlug &&
                                        !abilityOptionValues.has(
                                          effect.abilitySlug
                                        ) && (
                                          <option value={effect.abilitySlug}>
                                            {toTitleCaseFromSlug(
                                              effect.abilitySlug
                                            )}{' '}
                                            (custom)
                                          </option>
                                        )}
                                      {abilityOptions.map((option) => (
                                        <option
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <div className="mb-2 flex items-center justify-between">
                                      <label className="text-xs uppercase text-slate-400">
                                        Params
                                      </label>
                                      <button
                                        type="button"
                                        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                                        onClick={() =>
                                          handleAddAbilityParam(
                                            rarity,
                                            effectIndex
                                          )
                                        }
                                        disabled={editingDisabled}
                                      >
                                        + Param
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      {(
                                        effect as EditableAbilityEffect
                                      ).__abilityParams?.map(
                                        (entry, paramIndex) => (
                                          <div
                                            key={`${rarity}-param-${paramIndex}`}
                                            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                          >
                                            <input
                                              type="text"
                                              placeholder="key"
                                              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                              value={entry.key}
                                              onChange={(event) =>
                                                handleAbilityParamChange(
                                                  rarity,
                                                  effectIndex,
                                                  paramIndex,
                                                  'key',
                                                  event.target.value
                                                )
                                              }
                                              disabled={editingDisabled}
                                            />
                                            <input
                                              type="text"
                                              placeholder="value"
                                              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                                              value={entry.value}
                                              onChange={(event) =>
                                                handleAbilityParamChange(
                                                  rarity,
                                                  effectIndex,
                                                  paramIndex,
                                                  'value',
                                                  event.target.value
                                                )
                                              }
                                              disabled={editingDisabled}
                                            />
                                            <button
                                              type="button"
                                              className="rounded border border-rose-600/60 px-2 py-1 text-xs uppercase text-rose-200 transition hover:border-rose-500 hover:text-rose-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                                              onClick={() =>
                                                handleRemoveAbilityParam(
                                                  rarity,
                                                  effectIndex,
                                                  paramIndex
                                                )
                                              }
                                              disabled={editingDisabled}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        )
                                      )}
                                      {(effect as EditableAbilityEffect)
                                        .__abilityParams?.length === 0 && (
                                        <p className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                                          No params configured. Click “+ Param”
                                          to add optional values.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  {dirtyCount > 0
                    ? `Unsaved changes in ${dirtyCount} ${
                        dirtyCount === 1 ? 'rarity' : 'rarities'
                      }.`
                    : 'All changes saved.'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={editingDisabled || !hasChanges}
                    className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={editingDisabled || isSaving || !hasChanges}
                    className="rounded border border-sky-500 bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded border border-slate-700 bg-slate-900 px-4 py-6 text-sm text-slate-400">
              Select a slot and item type to begin editing.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
