import type { GrenadeWeaponDefinition } from '../../data/weapons';
import { computeGrenadeDamage, clamp01 } from './utils';

const SAMPLE_GRENADE: GrenadeWeaponDefinition = {
  blastRadiusPx: 100,
  damageCenter: 100,
  damageEdge: 20,
  throwSpeedPxPerSec: 800,
  cooldownMs: 1200,
  explodeOnImpact: true,
  fuseMs: 0,
  ammoPerUse: 1,
};

test('clamp01 keeps values within [0,1]', () => {
  expect(clamp01(-0.5)).toBe(0);
  expect(clamp01(0.25)).toBe(0.25);
  expect(clamp01(1.5)).toBe(1);
});

test('computeGrenadeDamage returns full damage at center', () => {
  const damage = computeGrenadeDamage(0, SAMPLE_GRENADE);
  expect(damage).toBe(SAMPLE_GRENADE.damageCenter);
});

test('computeGrenadeDamage returns edge damage at radius', () => {
  const damage = computeGrenadeDamage(
    SAMPLE_GRENADE.blastRadiusPx,
    SAMPLE_GRENADE
  );
  expect(damage).toBe(SAMPLE_GRENADE.damageEdge);
});

test('computeGrenadeDamage interpolates linearly inside radius', () => {
  const midDistance = SAMPLE_GRENADE.blastRadiusPx / 2;
  const damage = computeGrenadeDamage(midDistance, SAMPLE_GRENADE);
  expect(damage).toBe(
    Math.round(
      (SAMPLE_GRENADE.damageCenter + SAMPLE_GRENADE.damageEdge) / 2
    )
  );
});

test('computeGrenadeDamage clamps damage to zero outside radius', () => {
  const damage = computeGrenadeDamage(
    SAMPLE_GRENADE.blastRadiusPx * 2,
    SAMPLE_GRENADE
  );
  expect(damage).toBe(SAMPLE_GRENADE.damageEdge);
});
