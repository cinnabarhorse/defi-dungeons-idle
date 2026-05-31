import type {
  SpellDefinition as SharedSpellDefinition,
  SpellEffect,
  FreezeSpellEffect,
  BounceSpellEffect,
  SpellId,
} from '../data/spells';

export interface PlayerSpellState {
  autocastEnabledBySpellId: Record<string, boolean>;
  cooldownUntilBySpellId: Record<string, number>;
}

export type SpellDefinition = SharedSpellDefinition;
export type SpellEffectDefinition = SpellEffect;
export type FreezeEffect = FreezeSpellEffect;
export type BounceEffect = BounceSpellEffect;
export type SpellIdentifier = SpellId;
