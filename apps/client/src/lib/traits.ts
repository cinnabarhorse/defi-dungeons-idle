import type { RunLevelTraitDefinition } from '../data/archetypes';

export interface FormattedKillStreakTrait {
  shortLabel: string;
  valueText: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatMultiplier(multiplier: number): string {
  const rounded = Number(multiplier.toFixed(2));
  return `x${rounded.toString()}`;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Format the kill streak trait effect for a given number of units.
 * Returns a short UI label and a concise value string for display.
 */
export function formatKillStreakTrait(
  trait: RunLevelTraitDefinition | undefined,
  units: number
): FormattedKillStreakTrait | null {
  if (!trait || trait.type === 'none') return null;

  const safeUnits = Math.max(0, Number.isFinite(units) ? units : 0);
  const valuePerUnit = Math.max(
    0,
    trait.valuePerUnit ?? trait.valuePerLevel ?? 0
  );
  const cap =
    typeof trait.cap === 'number' ? trait.cap : Number.POSITIVE_INFINITY;
  const additive = Math.min(cap, valuePerUnit * safeUnits);

  switch (trait.type) {
    case 'damage_multiplier': {
      const mult = Math.max(0, 1 + additive);
      return { shortLabel: 'DMG', valueText: formatMultiplier(mult) };
    }
    case 'movement_speed': {
      const mult = Math.max(0, 1 + additive);
      return { shortLabel: 'MOVE', valueText: formatMultiplier(mult) };
    }
    case 'mana_regen': {
      const mult = Math.max(0, 1 + additive);
      return { shortLabel: 'AP', valueText: formatMultiplier(mult) };
    }
    case 'attack_speed': {
      // Convert additive per-unit percent into a multiplicative speed increase.
      const per = clamp(valuePerUnit, 0, 0.95);
      const minScalar =
        typeof trait.cap === 'number'
          ? Math.max(0, 1 - clamp(trait.cap, 0, 0.95))
          : 0.2;
      const scalar = clamp(Math.pow(1 - per, safeUnits), minScalar, 1);
      const speedMult = 1 / Math.max(0.0001, scalar);
      return { shortLabel: 'ATK SPD', valueText: formatMultiplier(speedMult) };
    }
    case 'attack_range': {
      const mult = Math.max(0, 1 + additive);
      return { shortLabel: 'RANGE', valueText: formatMultiplier(mult) };
    }
    case 'percent_damage_reduction': {
      return { shortLabel: 'ARMOR', valueText: `+${formatPercent(additive)}` };
    }
    case 'life_steal': {
      return { shortLabel: 'LS', valueText: `+${formatPercent(additive)}` };
    }
    case 'critical': {
      return { shortLabel: 'CRIT', valueText: `+${formatPercent(additive)}` };
    }
    case 'evade': {
      return { shortLabel: 'EVADE', valueText: `+${formatPercent(additive)}` };
    }
    case 'magic_find': {
      return { shortLabel: 'MF', valueText: `+${formatPercent(additive)}` };
    }
    case 'potion_coin_find': {
      return { shortLabel: 'LOOT', valueText: `+${formatPercent(additive)}` };
    }
    case 'hp_regen': {
      const perTurn = Math.floor(additive * 25);
      return { shortLabel: 'HP REGEN', valueText: `+${perTurn}/turn` };
    }
    default:
      return null;
  }
}
