import { getCharacterStats } from './character-registry';

export function getRandomIntInclusive(min: number, max: number): number {
  const low = Math.floor(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function computeBaseDamageForCharacter(
  characterId: string | undefined,
  fallbackDamage: number,
  derivedStats?: Record<string, any> | null
): number {
  try {
    if (derivedStats) {
      const range = derivedStats.damageRange;
      if (
        range &&
        typeof range.min === 'number' &&
        typeof range.max === 'number'
      ) {
        return getRandomIntInclusive(range.min, range.max);
      }
      if (typeof derivedStats.damage === 'number') {
        return Math.round(derivedStats.damage);
      }
    }
    if (!characterId) return fallbackDamage;
    const stats = getCharacterStats(characterId);
    const range: any = (stats as any).damageRange;
    if (
      range &&
      typeof range.min === 'number' &&
      typeof range.max === 'number'
    ) {
      return getRandomIntInclusive(range.min, range.max);
    }
    const dmg: any = (stats as any).damage;
    if (typeof dmg === 'number') return Math.round(dmg);
    return fallbackDamage;
  } catch {
    return fallbackDamage;
  }
}
