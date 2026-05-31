export type RunLevelTraitKind =
  | 'none'
  | 'damage_multiplier'
  | 'attack_speed'
  | 'movement_speed'
  | 'percent_damage_reduction'
  | 'hp_regen'
  | 'life_steal'
  | 'critical'
  | 'evade'
  | 'magic_find'
  | 'mana_regen'
  | 'attack_range'
  | 'potion_coin_find';

export interface RunLevelTraitDefinition {
  type: RunLevelTraitKind;
  /**
   * Normalized value applied per streak unit (legacy `valuePerLevel` supported for back-compat).
   * - Percent-based traits expect fractional values (e.g., 0.01 = +1% per unit).
   * - Flat traits (e.g., hp regen) represent additive values in native units.
   */
  valuePerUnit?: number;
  valuePerLevel?: number;
  /** Optional hard cap (in normalized units) for additive traits. */
  cap?: number;
  /** Optional note for UI/authoring context. */
  note?: string;
}

export type TraitPreference = 'high' | 'low';

export interface ArchetypeTraitProfile {
  energy: TraitPreference;
  aggression: TraitPreference;
  spookiness: TraitPreference;
  brainSize: TraitPreference;
}

export interface RunArchetypeDefinition {
  id: string;
  name: string;
  description?: string;
  levelTrait: RunLevelTraitDefinition;
  /** High/low preferences for the four core traits (NRG, AGG, SPK, BRN). */
  traitProfile: ArchetypeTraitProfile;
  /** Optional sprite sheet name used by the client to preview the archetype. */
  spriteName?: string;
  /** Character IDs (lowercase) that should inherit this archetype by default. */
  characterIds: string[];
}

const ARCHETYPES: RunArchetypeDefinition[] = [
  {
    id: 'rogue',
    name: 'Rogue',
    description: 'High-agility specialists who rely on evasive maneuvers.',
    levelTrait: {
      type: 'evade',
      valuePerLevel: 0.01,
      cap: 0.45,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'high',
      spookiness: 'high',
      brainSize: 'high',
    },
    spriteName: 'TBD',
    characterIds: ['stani'],
  },
  {
    id: 'assassin',
    name: 'Assassin',
    description: 'Critical strike experts who thrive on precision hits.',
    levelTrait: {
      type: 'critical',
      valuePerLevel: 0.01,
      cap: 0.5,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'high',
      spookiness: 'high',
      brainSize: 'low',
    },
    spriteName: 'Aagent',
    characterIds: ['aagent'],
  },
  {
    id: 'mage',
    name: 'Mage',
    description: 'Spellcasters with rapidly regenerating mana pools.',
    levelTrait: {
      type: 'mana_regen',
      valuePerLevel: 0.01,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'high',
      spookiness: 'low',
      brainSize: 'high',
    },
    spriteName: 'Wizard',
    characterIds: ['wizard'],
  },
  {
    id: 'berserker',
    name: 'Berserker',
    description: 'Relentless attackers who swing faster every level.',
    levelTrait: {
      type: 'attack_speed',
      valuePerLevel: 0.01,
      cap: 0.6,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'high',
      spookiness: 'low',
      brainSize: 'low',
    },
    spriteName: 'Baarbarian',
    characterIds: ['baarbarian'],
  },
  {
    id: 'enchanter',
    name: 'Enchanter',
    description: 'Support mages with utility-centric kits (trait pending).',
    levelTrait: {
      type: 'none',
      note: 'TBD trait – placeholder until design is finalized.',
    },
    traitProfile: {
      energy: 'high',
      aggression: 'low',
      spookiness: 'high',
      brainSize: 'high',
    },
    spriteName: 'Mudgen',
    characterIds: ['mudgen'],
  },
  {
    id: 'scout',
    name: 'Scout',
    description: 'Hyper-mobile outriders that gain movement speed.',
    levelTrait: {
      type: 'movement_speed',
      valuePerLevel: 0.01,
      cap: 2,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'low',
      spookiness: 'high',
      brainSize: 'low',
    },
    spriteName: 'Gotchidator',
    characterIds: ['gotchidator'],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    description: 'Defenders who harden with each run level.',
    levelTrait: {
      type: 'percent_damage_reduction',
      valuePerLevel: 0.01,
      cap: 0.5,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'low',
      spookiness: 'low',
      brainSize: 'high',
    },
    spriteName: 'CitaadelKnight',
    characterIds: ['citaadelknight'],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    description: 'Long-range specialists who extend their attack reach.',
    levelTrait: {
      type: 'attack_range',
      valuePerLevel: 0.01,
      cap: 1,
    },
    traitProfile: {
      energy: 'high',
      aggression: 'low',
      spookiness: 'low',
      brainSize: 'low',
    },
    spriteName: 'Gldnxross',
    characterIds: ['gldnxross'],
  },
  {
    id: 'warlock',
    name: 'Warlock',
    description: 'Dark arts practitioners (trait pending).',
    levelTrait: {
      type: 'none',
      note: 'TBD trait – placeholder until design is finalized.',
    },
    traitProfile: {
      energy: 'low',
      aggression: 'high',
      spookiness: 'high',
      brainSize: 'high',
    },
    characterIds: ['laozigotchi'],
  },
  {
    id: 'shadowknight',
    name: 'Shadowknight',
    description: 'Life-stealing bruisers that siphon enemy health.',
    levelTrait: {
      type: 'life_steal',
      valuePerLevel: 0.01,
      cap: 0.4,
    },
    traitProfile: {
      energy: 'low',
      aggression: 'high',
      spookiness: 'high',
      brainSize: 'low',
    },
    spriteName: 'PortalMage',
    characterIds: ['portalmage'],
  },
  {
    id: 'bard',
    name: 'Bard',
    description: 'Fortune-favored adventurers with rising magic find.',
    levelTrait: {
      type: 'magic_find',
      valuePerLevel: 0.01,
      cap: 0.5,
    },
    traitProfile: {
      energy: 'low',
      aggression: 'high',
      spookiness: 'low',
      brainSize: 'high',
    },
    spriteName: 'Fairy',
    characterIds: ['fairy'],
  },
  {
    id: 'warrior',
    name: 'Warrior',
    description: 'Straightforward fighters that scale raw damage output.',
    levelTrait: {
      type: 'damage_multiplier',
      valuePerLevel: 0.01,
      cap: 2,
    },
    traitProfile: {
      energy: 'low',
      aggression: 'high',
      spookiness: 'low',
      brainSize: 'low',
    },
    spriteName: 'Bushidogotchi',
    characterIds: ['bushidogotchi'],
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    description: 'Masters of undeath (trait pending).',
    levelTrait: {
      type: 'none',
      note: 'TBD trait – placeholder until design is finalized.',
    },
    traitProfile: {
      energy: 'low',
      aggression: 'low',
      spookiness: 'high',
      brainSize: 'high',
    },
    spriteName: 'Geisha',
    characterIds: ['geisha'],
  },
  {
    id: 'shaman',
    name: 'Shaman',
    description: 'Spiritual guides with to-be-determined progression.',
    levelTrait: {
      type: 'none',
      note: 'TBD trait – placeholder until design is finalized.',
    },
    traitProfile: {
      energy: 'low',
      aggression: 'low',
      spookiness: 'high',
      brainSize: 'low',
    },
    spriteName: 'XIBOT',
    characterIds: ['xibot'],
  },
  {
    id: 'farmer',
    name: 'Farmer',
    description: 'Hardy gatherers who find more gold and potions.',
    levelTrait: {
      type: 'potion_coin_find',
      valuePerLevel: 0.01,
    },
    traitProfile: {
      energy: 'low',
      aggression: 'low',
      spookiness: 'low',
      brainSize: 'high',
    },
    characterIds: ['farmer'],
  },
  {
    id: 'guardian',
    name: 'Guardian',
    description: 'Stalwart protectors with accelerating HP regen.',
    levelTrait: {
      type: 'hp_regen',
      valuePerLevel: 0.35,
      cap: 12,
    },
    traitProfile: {
      energy: 'low',
      aggression: 'low',
      spookiness: 'low',
      brainSize: 'low',
    },
    spriteName: 'Coderdan',
    characterIds: ['coderdan'],
  },
];

export const RUN_ARCHETYPES: RunArchetypeDefinition[] = ARCHETYPES;

export const RUN_ARCHETYPES_BY_ID: Readonly<
  Record<string, RunArchetypeDefinition>
> = Object.freeze(
  ARCHETYPES.reduce<Record<string, RunArchetypeDefinition>>(
    (acc, archetype) => {
      acc[archetype.id] = archetype;
      return acc;
    },
    {}
  )
);

export const RUN_ARCHETYPE_BY_CHARACTER_ID: Readonly<Record<string, string>> =
  Object.freeze(
    ARCHETYPES.reduce<Record<string, string>>((acc, archetype) => {
      archetype.characterIds.forEach((characterId) => {
        const key = characterId.toLowerCase();
        if (!acc[key]) {
          acc[key] = archetype.id;
        }
      });
      return acc;
    }, {})
  );

export function getRunArchetypeIdForCharacter(
  characterId: string | null | undefined
): string {
  if (!characterId) return 'unknown';
  return RUN_ARCHETYPE_BY_CHARACTER_ID[characterId.toLowerCase()] || 'unknown';
}

/**
 * Return a concise, user-facing label describing the per-level effect.
 * This is used by UI surfaces like the builds page.
 */
export function getRunLevelTraitLabelByType(type: RunLevelTraitKind): string {
  switch (type) {
    case 'evade':
      return '+1 Evade per streak unit';
    case 'critical':
      return '+1 Crit Strike per streak unit';
    case 'mana_regen':
      return '+1% AP regen per streak unit';
    case 'attack_speed':
      return '+1% attack speed per streak unit';
    case 'movement_speed':
      return '+1% movement speed per streak unit';
    case 'percent_damage_reduction':
      return '+1 armor per streak unit';
    case 'attack_range':
      return '+1% attack range per streak unit';
    case 'life_steal':
      return '+1% life steal per streak unit';
    case 'magic_find':
      return '+1% magic find per streak unit';
    case 'potion_coin_find':
      return '+1% gold/potion find per streak unit';
    case 'damage_multiplier':
      return '+1% base damage per streak unit';
    case 'hp_regen':
      return '+1% hp regen per streak unit';
    case 'none':
    default:
      return 'tbd';
  }
}
