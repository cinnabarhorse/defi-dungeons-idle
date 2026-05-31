import type { AbilityInstance } from './abilities';
import { isLifeSteal, isCriticalStrike, isEvade } from './abilities';

export interface AggregatedAbilityEffects {
  lifeStealPercent: number;
  critChance: number;
  critMultiplier: number;
  evadeChance: number;
}

export interface AbilityRef {
  id: string;
  params?: Record<string, unknown>;
}

export function aggregateAbilityEffects(
  abilities: Array<AbilityRef | AbilityInstance<any>>,
  scope: 'melee' | 'ranged'
): AggregatedAbilityEffects {
  let lifeStealPercent = 0;
  let critChanceUnion = 0;
  let critBonusSum = 0;
  let evadeUnion = 0;

  const useScope = (appliesTo?: 'melee' | 'ranged' | 'all') =>
    !appliesTo || appliesTo === 'all' || appliesTo === scope;

  for (const a of abilities) {
    if (isLifeSteal(a as any)) {
      const p = ((a as any).params || {}) as {
        percent?: number;
        appliesTo?: 'melee' | 'ranged' | 'all';
      };
      if (typeof p.percent === 'number' && useScope(p.appliesTo)) {
        lifeStealPercent += Math.max(0, p.percent);
      }
      continue;
    }
    if (isCriticalStrike(a as any)) {
      const p = ((a as any).params || {}) as {
        chance?: number;
        multiplier?: number;
        appliesTo?: 'melee' | 'ranged' | 'all';
      };
      if (useScope(p.appliesTo)) {
        const c = Math.max(0, Math.min(1, p.chance ?? 0));
        critChanceUnion = 1 - (1 - critChanceUnion) * (1 - c);
        const m = Math.max(1, p.multiplier ?? 1);
        critBonusSum += m - 1;
      }
      continue;
    }
    if (isEvade(a as any)) {
      const p = ((a as any).params || {}) as { chance?: number };
      const c = Math.max(0, Math.min(1, p.chance ?? 0));
      evadeUnion = 1 - (1 - evadeUnion) * (1 - c);
      continue;
    }
  }

  return {
    lifeStealPercent,
    critChance: Math.max(0, Math.min(1, critChanceUnion)),
    critMultiplier: 1 + Math.max(0, critBonusSum),
    evadeChance: Math.max(0, Math.min(1, evadeUnion)),
  };
}
