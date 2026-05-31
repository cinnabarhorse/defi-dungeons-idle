import type { GrenadeWeaponDefinition } from '../../data/weapons';

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function computeGrenadeDamage(
  distance: number,
  config: GrenadeWeaponDefinition,
  falloffExponent = 1
): number {
  const radius = Math.max(0, config.blastRadiusPx);
  const damageCenter = Number.isFinite(config.damageCenter)
    ? config.damageCenter
    : 0;
  const damageEdge = Number.isFinite(config.damageEdge) ? config.damageEdge : 0;

  if (radius <= 0) {
    return Math.max(0, Math.round(damageCenter));
  }

  const normalizedDistance = clamp01(Math.abs(distance) / radius);
  const baseFalloff = 1 - normalizedDistance;
  const exponent = Number.isFinite(falloffExponent) && falloffExponent > 0 ? falloffExponent : 1;
  const falloff = Math.pow(baseFalloff, exponent);
  const rawDamage = damageEdge + (damageCenter - damageEdge) * falloff;
  return Math.max(0, Math.round(rawDamage));
}
