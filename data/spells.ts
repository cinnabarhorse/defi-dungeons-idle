export type FreezeSpellEffect = {
  kind: 'freeze';
  bonusDamage?: number;
};

export type BounceSpellEffect = {
  kind: 'bounce';
  maxTargets: number;
  radius: number;
  falloffPerHop: number;
  allowRepeat: boolean;
  losRequired: boolean;
  travelMs: number;
  appliesOnHitEffects: boolean;
  bonusDamage?: number;
};

export type SpellEffect = FreezeSpellEffect | BounceSpellEffect;

export interface SpellDefinition {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  cooldownMs?: number;
  autocastEnabledByDefault?: boolean;
  enabled?: boolean;
  allowedWeaponTypes?: ReadonlyArray<string>;
  damage?: number;
  icon?: string;
  effects: SpellEffect;
}

export type SpellId = SpellDefinition['id'];

const BASE_ALLOWED_WEAPONS = Object.freeze(['staff'] as const);

export const SPELLS: ReadonlyArray<SpellDefinition> = Object.freeze([
  {
    id: 'freezing_attack',
    name: 'Freezing Attack',
    description:
      'Adds a chilling effect to staff attacks, applying the standard Slow on hit.',
    manaCost: 3,
    cooldownMs: 600,
    enabled: true,
    allowedWeaponTypes: BASE_ALLOWED_WEAPONS,
    damage: 20,
    autocastEnabledByDefault: true,
    icon: '/spells/freezing_attack_thumb.png',
    effects: {
      kind: 'freeze',
    },
  },
  {
    id: 'bounce_attack',
    name: 'Bounce Attack',
    description:
      'Staff attacks ricochet to nearby enemies, losing 20% damage per hop.',
    manaCost: 3,
    cooldownMs: 600,
    enabled: true,
    allowedWeaponTypes: BASE_ALLOWED_WEAPONS,
    damage: 0,
    autocastEnabledByDefault: true,
    effects: {
      kind: 'bounce',
      maxTargets: 4,
      radius: 200,
      falloffPerHop: 0.2,
      allowRepeat: false,
      losRequired: true,
      travelMs: 80,
      appliesOnHitEffects: true,
    },
    icon: '/spells/bounce_attack_thumb.png',
  },
] satisfies ReadonlyArray<SpellDefinition>);

export const SPELLS_BY_ID: Readonly<Record<string, SpellDefinition>> =
  Object.freeze(
    Object.fromEntries(SPELLS.map((spell) => [spell.id, spell] as const))
  );
