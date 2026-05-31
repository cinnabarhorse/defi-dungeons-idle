import {
  EQUIPMENT_STAT_LABELS,
  ITEM_TYPE_EFFECTS,
  STAT,
  STAT_CONFIG,
  getWearableRarity,
  isWeaponWearable,
  type EquipmentStatModifier,
  type WearableDefinition,
  type WearableSlot,
} from '../../data/wearables';
import type { HeroWearableSummary } from './wearable-summaries';

const HP_REGEN_PER_TURN_MULTIPLIER = 25;

function getPrimarySlot(wearable: WearableDefinition): WearableSlot {
  const slots = Array.isArray(wearable.slots) ? wearable.slots : [];
  for (const slot of slots) {
    if (slot !== 'none') {
      return slot;
    }
  }
  return 'none';
}

function formatModifier(mod: {
  stat: keyof typeof STAT;
  value: number;
  operation?: 'add' | 'mul' | 'add_percent';
}): string {
  const op = mod.operation ?? 'add';
  let label = EQUIPMENT_STAT_LABELS[
    mod.stat as keyof typeof EQUIPMENT_STAT_LABELS
  ] as string;
  label = label.replace(/Health/g, 'HP').replace(/Damage/g, 'DMG');
  let normalizedLabel = label.replace(/^%\s*/, '');
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
  if (mod.stat === STAT.hpRegen && op === 'add') {
    const perTurn = Math.floor(mod.value * HP_REGEN_PER_TURN_MULTIPLIER);
    return `${sign(perTurn)} HP per turn`;
  }
  const value =
    Math.abs(mod.value) % 1 === 0
      ? Math.trunc(mod.value)
      : Number(mod.value.toFixed(2));
  return `${sign(value)} ${normalizedLabel}`;
}

function scaleModifierForQuality(
  modifier: EquipmentStatModifier,
  qualityScalar: number
): EquipmentStatModifier {
  const operation = modifier.operation ?? 'add';
  const baseValue = modifier.value;
  if (typeof baseValue !== 'number' || !Number.isFinite(baseValue)) {
    return { ...modifier };
  }

  if (operation === 'add') {
    return {
      ...modifier,
      value: baseValue * qualityScalar,
    };
  }

  if (operation === 'mul') {
    return {
      ...modifier,
      value: 1 + (baseValue - 1) * qualityScalar,
    };
  }

  if (operation === 'add_percent') {
    return {
      ...modifier,
      value: baseValue * qualityScalar,
    };
  }

  return { ...modifier };
}

export function summarizeWearable(
  summary: HeroWearableSummary | undefined
): string | null {
  const wearable = summary?.wearable;
  if (!wearable) return null;
  const qualityScalar =
    typeof summary?.qualityScalar === 'number' &&
    Number.isFinite(summary.qualityScalar)
      ? summary.qualityScalar
      : 1;
  const parts: string[] = [];

  if (isWeaponWearable(wearable) && wearable.weapon) {
    const w = wearable.weapon as any;
    if (w?.grenade) {
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
        parts.push(`DMG ${min}-${max}`);
      }
      if (
        typeof g?.healingSplash?.healAmount === 'number' &&
        g.healingSplash.healAmount > 0
      ) {
        const healAmount = Math.round(g.healingSplash.healAmount * qualityScalar);
        parts.push(`Heals ${healAmount} HP`);
      }
      if (typeof g?.cooldownMs === 'number') {
        parts.push(`Cooldown ${Math.ceil(g.cooldownMs / 1000)} turns`);
      }
    } else {
      if (w?.damageRange) {
        const min = Math.round(w.damageRange.min * qualityScalar);
        const max = Math.round(w.damageRange.max * qualityScalar);
        parts.push(`DMG ${min}-${max}`);
      } else if (typeof w?.damage === 'number') {
        parts.push(`DMG ${Math.round(w.damage * qualityScalar)}`);
      }
      if (typeof w?.attackSpeed === 'number') {
        parts.push(`Attack Speed ${w.attackSpeed} ms`);
      }
    }
  }

  const resolvedEffects = (() => {
    if (
      Array.isArray((wearable as any).effects) &&
      (wearable as any).effects.length > 0
    ) {
      return (wearable as any).effects;
    }
    const slot = getPrimarySlot(wearable) as keyof typeof ITEM_TYPE_EFFECTS;
    const itemType = (wearable as any).itemType as string | undefined;
    if (!itemType) return [] as any[];
    const rarity = getWearableRarity(wearable as any);
    const bySlot = (ITEM_TYPE_EFFECTS as any)[slot] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const byType = bySlot?.[itemType] as
      | Record<string, { type: 'stat'; modifiers: any[] }[]>
      | undefined;
    const effects = byType?.[rarity] || byType?.common || [];
    return Array.isArray(effects) ? effects : [];
  })();

  for (const effect of resolvedEffects) {
    if (!effect || effect.type !== 'stat') continue;
    const modifiers = Array.isArray(effect.modifiers) ? effect.modifiers : [];
    for (const mod of modifiers) {
      try {
        const scaled: EquipmentStatModifier = {
          ...scaleModifierForQuality(
            mod as EquipmentStatModifier,
            qualityScalar
          ),
        };
        parts.push(formatModifier(scaled as any));
      } catch {
        // ignore formatting issues
      }
      if (parts.length >= 3) break;
    }
    if (parts.length >= 3) break;
  }

  if ((wearable as any).abilities && (wearable as any).abilities.length) {
    for (const ability of (wearable as any).abilities) {
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
      if (parts.length >= 3) break;
    }
  }

  if (parts.length === 0) return null;
  return parts.slice(0, 3).join(' • ');
}
