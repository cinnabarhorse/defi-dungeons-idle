/**
 * ⚠️  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY! ⚠️
 *
 * Server Abilities Data - Generated from /data/abilities.ts
 * This file defines shared abilities and constructors; auto-synced to apps.
 *
 * To make changes, edit /data/abilities.ts and run: npm run generate:shared
 */

/**
 * Abilities Registry - Single Source of Truth
 * Define reusable ability instances that can be referenced by characters, enemies, items, or wearables.
 */

export interface AbilityInstance<TParams = Record<string, unknown>> {
  id: string;
  kind: 'passive' | 'active';
  params: TParams;
}

export interface LifeStealParams {
  /**
   * Portion of final damage dealt converted to healing (0.05 = 5%).
   * Applies after mitigation and is capped by attacker max HP.
   */
  percent: number;
  /**
   * Scope of attacks the ability applies to.
   * Default: 'melee' per initial rollout spec.
   */
  appliesTo?: 'melee' | 'ranged' | 'all';
}

export interface CriticalStrikeParams {
  /**
   * Probability of a critical hit per hit instance (0.10 = 10%).
   * Rolls per projectile for ranged; per hit for melee.
   */
  chance: number;
  /**
   * Damage multiplier when a crit occurs (e.g., 2 = 2x damage).
   * Multiple sources stack additively on the bonus portion: 1 + sum(multiplier - 1).
   */
  multiplier: number;
  /**
   * Scope of attacks the ability applies to (default: 'all').
   */
  appliesTo?: 'melee' | 'ranged' | 'all';
}

export interface CleaveParams {
  /**
   * Maximum number of targets hit per swing. Omit for unlimited.
   */
  maxTargets?: number;
  /**
   * Multiplier applied to base melee damage for cleave hits (e.g., 1 = 100%).
   */
  damageMultiplier?: number;
  /**
   * Scope of attacks the ability applies to (default: 'melee').
   */
  appliesTo?: 'melee' | 'all';
  /**
   * Cone angle in degrees (centered on facing direction). Default set server-side.
   */
  coneAngleDeg?: number;
  /**
   * Whether to include environment breakables (trees, stones) in the cleave area.
   */
  includeBreakables?: boolean;
}

export interface EvadeParams {
  /** Probability to dodge an incoming melee or ranged hit (0.10 = 10%). */
  chance: number;
}

export interface ThornsParams {
  /**
   * Portion of incoming damage reflected back to the attacker (0.1 = 10%).
   */
  percent: number;
  /**
   * Scope of incoming attacks that trigger reflect (default: 'all').
   */
  appliesFrom?: 'melee' | 'ranged' | 'all';
}

export interface MoveSpeedParams {
  /** Multiplier applied to movement speed (e.g., 1.1 = +10%). */
  multiplier: number;
}

export interface AttackSpeedParams {
  /** Multiplier applied to attack speed (e.g., 1.15 = +15%). */
  multiplier: number;
}

export interface DamageMultiplierParams {
  /** Multiplier applied to outgoing damage (e.g., 1.2 = +20%). */
  multiplier: number;
  /** Optional scope for the damage adjustment (default: 'all'). */
  appliesTo?: 'melee' | 'ranged' | 'all';
}

export interface DamageReductionParams {
  /**
   * Unified armor contribution in A units. If omitted, legacy fields are
   * inspected and converted (percent × 100).
   */
  armor?: number;
  /** @deprecated legacy percent-based input (0.1 = 10%). */
  percent?: number;
  /** @deprecated legacy flat reduction input. */
  reduction?: number;
}

export interface DamageReductionResolvedParams {
  armor: number;
}

function resolveDamageReductionArmor(
  params: DamageReductionParams | undefined
): number {
  if (!params) return 0;
  if (typeof params.armor === 'number' && Number.isFinite(params.armor)) {
    return Math.max(0, params.armor);
  }
  if (typeof params.percent === 'number' && Number.isFinite(params.percent)) {
    return Math.max(0, Math.round(params.percent * 100));
  }
  if (
    typeof params.reduction === 'number' &&
    Number.isFinite(params.reduction)
  ) {
    return Math.max(0, params.reduction);
  }
  return 0;
}

export interface RegenParams {
  /** Flat health restored per second. */
  perSecond: number;
}

export interface TongueFarmParams {
  /** Absolute drop chance bonus applied when defeating eligible enemies. */
  bonusChance: number;
  /** Enemy tags this bonus applies to (default: ['lickquidator']). */
  appliesToEnemyTags?: string[];
  /** Optional cap for the contribution from this source. */
  maxBonus?: number;
}

export interface PotionFarmParams {
  /**
   * Determines which parts of the loot pipeline are influenced.
   * Default: 'both' to reweight existing drops and add a fallback potion roll.
   */
  mode?: 'reweight' | 'extra-roll' | 'both';
  /**
   * Multiplier applied to potion weight when a drop is already happening.
   * Example: 2.5 makes potions 2.5x as likely relative to other categories.
   */
  potionWeightMultiplier?: number;
  /**
   * Additional independent chance to materialize a potion when no drop occurs.
   */
  extraPotionRollChance?: number;
  /**
   * Absolute cap applied to the extra roll chance after stacking sources.
   */
  maxExtraChanceCap?: number;
  /**
   * Bias for HP vs Mana potions when spawning (0.5 = 50/50 split).
   */
  hpToManaBias?: number;
}

export interface GoldFarmParams {
  /**
   * Determines which parts of the loot pipeline are influenced.
   * Default: 'both' to reweight existing drops and add a fallback coin roll.
   */
  mode?: 'reweight' | 'extra-roll' | 'both';
  /**
   * Multiplier applied to coin weight when a drop is already happening.
   * Example: 2 makes coins 2x as likely relative to other categories.
   */
  coinWeightMultiplier?: number;
  /**
   * Additional independent chance to materialize a coin when no drop occurs.
   */
  extraCoinRollChance?: number;
  /**
   * Absolute cap applied to the extra roll chance after stacking sources.
   */
  maxExtraChanceCap?: number;
  /**
   * Multiplier applied to coin quantity when a coin drops.
   */
  amountMultiplier?: number;
}

export interface HealingSplashParams {
  /** Radius in world units; matches grenade blast radius semantics. */
  radius: number;
  /** Flat healing applied to each valid target. */
  healAmount: number;
  /** Cooldown in milliseconds (per item instance). */
  cooldownMs: number;
  /** Whether the thrower receives healing (default true). */
  affectsSelf?: boolean;
  /** Restrict healing to allied players and companions (default true). */
  alliesOnly?: boolean;
  /** Allow overheal beyond max HP (default false). */
  allowOverheal?: boolean;
  /** Distance falloff curve identifier (default 'none'). */
  falloff?: 'none' | 'linear';
  /** Optional cap on distinct targets. */
  maxTargets?: number;
  /** Detonation behavior flag for clarity (default 'onImpact'). */
  detonation?: 'onImpact' | 'onFuse';
}

export type SlowStackingMode = 'refresh' | 'extend' | 'strongest';

export interface SlowParams {
  /**
   * Fraction of movement speed removed (0.25 = 25% slow).
   * Clamped to [0, 0.95] during runtime.
   */
  amount: number;
  /**
   * Duration of the slow in milliseconds before expiration.
   */
  durationMs: number;
  /**
   * Probability the slow is applied on hit (0.5 = 50%).
   * Defaults to 1 (guaranteed) when omitted.
   */
  chance?: number;
  /**
   * Scope of attacks that can apply the slow.
   * Defaults to 'all' when omitted.
   */
  appliesTo?: 'melee' | 'ranged' | 'all';
  /**
   * Reapplication behavior when multiple slows from the same source occur.
   * Defaults to 'strongest'.
   */
  stacking?: SlowStackingMode;
  /**
   * Maximum number of active stacks when stacking = 'extend'.
   */
  maxStacks?: number;
  /**
   * Optional floor for the resulting speed scalar.
   */
  minSpeedScalar?: number;
}

export interface StunParams {
  /**
   * Probability the stun is applied on hit (0.2 = 20%).
   */
  chance: number;
  /**
   * Duration of the stun in milliseconds before expiration.
   */
  durationMs: number;
  /**
   * Scope of attacks that can apply the stun.
   */
  appliesTo?: 'melee' | 'ranged' | 'grenades' | 'all';
  /**
   * Optional identifier for telemetry/grouping when multiple stun sources exist.
   */
  sourceId?: string;
}

export interface BossChargeStunParams {
  /** Duration of the stun applied when the boss charge hits (milliseconds). */
  durationMs: number;
  /** Optional probability gate for the stun (default: 1 = always). */
  chance?: number;
  /** Additional flat damage added to the charge hit when it lands. */
  damage?: number;
}

export interface PoisonParams {
  /** Probability the poison will be applied on hit (0.25 = 25%). */
  chance: number;
  /** Base duration for the poison effect in milliseconds. */
  durationMs: number;
  /** Damage per second applied over the poison duration. */
  damagePerSecond: number;
  /** Interval between ticks; defaults to 1000 ms. */
  tickIntervalMs?: number;
  /** Scope of attacks the poison applies to; defaults to melee. */
  appliesTo?: 'melee' | 'ranged' | 'all';
  /** Optional identifier for telemetry or UI references. */
  sourceId?: string;
}

/**
 * Augmented Vision – increases fog-of-war vision radius and optionally other vision-related stats
 */
export interface AugmentedVisionParams {
  /** Multiplier applied to fog-of-war vision radius (e.g., 1.1 = +10%). */
  multiplier: number;
}

export const ABILITIES = {
  lifeSteal(params: LifeStealParams): AbilityInstance<LifeStealParams> {
    return {
      id: 'life-steal',
      kind: 'passive',
      params: { appliesTo: 'melee', ...params },
    };
  },
  criticalStrike(
    params: CriticalStrikeParams
  ): AbilityInstance<CriticalStrikeParams> {
    return {
      id: 'critical-strike',
      kind: 'passive',
      params: { appliesTo: 'all', ...params },
    };
  },
  cleave(params: CleaveParams): AbilityInstance<CleaveParams> {
    return {
      id: 'cleave',
      kind: 'passive',
      params: {
        appliesTo: 'melee',
        damageMultiplier: 1,
        maxTargets: 3,
        ...params,
      },
    };
  },
  evade(params: EvadeParams): AbilityInstance<EvadeParams> {
    return {
      id: 'evade',
      kind: 'passive',
      params,
    };
  },
  thorns(params: ThornsParams): AbilityInstance<ThornsParams> {
    return {
      id: 'thorns',
      kind: 'passive',
      params: { appliesFrom: 'all', ...params },
    };
  },
  moveSpeed(params: MoveSpeedParams): AbilityInstance<MoveSpeedParams> {
    return {
      id: 'move-speed',
      kind: 'passive',
      params,
    };
  },
  attackSpeed(params: AttackSpeedParams): AbilityInstance<AttackSpeedParams> {
    return {
      id: 'attack-speed',
      kind: 'passive',
      params,
    };
  },
  damageMultiplier(
    params: DamageMultiplierParams
  ): AbilityInstance<DamageMultiplierParams> {
    return {
      id: 'damage-multiplier',
      kind: 'passive',
      params: { appliesTo: 'all', ...params },
    };
  },
  damageReduction(
    params: DamageReductionParams
  ): AbilityInstance<DamageReductionResolvedParams> {
    const armor = resolveDamageReductionArmor(params);
    return {
      id: 'damage-reduction',
      kind: 'passive',
      params: { armor },
    };
  },
  regen(params: RegenParams): AbilityInstance<RegenParams> {
    return {
      id: 'regen',
      kind: 'passive',
      params,
    };
  },
  tongueFarm(params: TongueFarmParams): AbilityInstance<TongueFarmParams> {
    return {
      id: 'tongue-farm',
      kind: 'passive',
      params: {
        appliesToEnemyTags: ['lickquidator'],
        ...params,
      },
    };
  },
  potionFarm(params: PotionFarmParams = {}): AbilityInstance<PotionFarmParams> {
    return {
      id: 'potion-farm',
      kind: 'passive',
      params: {
        mode: 'both',
        potionWeightMultiplier: 2.5,
        extraPotionRollChance: 0.03,
        maxExtraChanceCap: 0.15,
        hpToManaBias: 0.5,
        ...params,
      },
    };
  },
  goldFarm(params: GoldFarmParams = {}): AbilityInstance<GoldFarmParams> {
    return {
      id: 'gold-farm',
      kind: 'passive',
      params: {
        mode: 'both',
        coinWeightMultiplier: 2,
        extraCoinRollChance: 0.02,
        maxExtraChanceCap: 0.12,
        amountMultiplier: 1.1,
        ...params,
      },
    };
  },
  healingSplash(
    params: HealingSplashParams
  ): AbilityInstance<HealingSplashParams> {
    return {
      id: 'healing-splash',
      kind: 'active',
      params: {
        affectsSelf: true,
        alliesOnly: true,
        allowOverheal: false,
        falloff: 'none',
        detonation: 'onImpact',
        ...params,
      },
    };
  },
  augmentedVision(
    params: AugmentedVisionParams
  ): AbilityInstance<AugmentedVisionParams> {
    return {
      id: 'augmented-vision',
      kind: 'passive',
      params,
    };
  },
  slow(params: SlowParams): AbilityInstance<SlowParams> {
    const {
      amount = 0.25,
      durationMs = 2000,
      chance = 1,
      appliesTo = 'all',
      stacking = 'strongest',
      maxStacks,
      minSpeedScalar,
    } = params || ({} as SlowParams);
    return {
      id: 'slow',
      kind: 'passive',
      params: {
        amount,
        durationMs,
        chance,
        appliesTo,
        stacking,
        maxStacks,
        minSpeedScalar,
      },
    };
  },
  stun(params: StunParams): AbilityInstance<StunParams> {
    const {
      chance = 0.2,
      durationMs = 1250,
      appliesTo = 'melee',
      sourceId,
    } = params || ({} as StunParams);
    return {
      id: 'stun',
      kind: 'passive',
      params: {
        chance,
        durationMs,
        appliesTo,
        sourceId,
      },
    };
  },
  bossChargeStun(
    params: BossChargeStunParams
  ): AbilityInstance<BossChargeStunParams> {
    const {
      durationMs = 4000,
      chance = 1,
      damage = 0,
    } = params || ({} as BossChargeStunParams);
    return {
      id: 'boss_charge_stun',
      kind: 'passive',
      params: {
        durationMs,
        chance,
        damage,
      },
    };
  },
  poison(params: PoisonParams): AbilityInstance<PoisonParams> {
    const {
      chance = 0.25,
      durationMs = 3000,
      damagePerSecond = 5,
      tickIntervalMs = 1000,
      appliesTo = 'melee',
      sourceId,
    } = params || ({} as PoisonParams);
    return {
      id: 'poison',
      kind: 'passive',
      params: {
        chance,
        durationMs,
        damagePerSecond,
        tickIntervalMs,
        appliesTo,
        sourceId,
      },
    };
  },
} as const;

export type AnyAbilityInstance =
  | AbilityInstance<LifeStealParams>
  | AbilityInstance<CriticalStrikeParams>
  | AbilityInstance<CleaveParams>
  | AbilityInstance<EvadeParams>
  | AbilityInstance<ThornsParams>
  | AbilityInstance<RegenParams>
  | AbilityInstance<TongueFarmParams>
  | AbilityInstance<PotionFarmParams>
  | AbilityInstance<GoldFarmParams>
  | AbilityInstance<HealingSplashParams>
  | AbilityInstance<AugmentedVisionParams>
  | AbilityInstance<SlowParams>
  | AbilityInstance<StunParams>
  | AbilityInstance<BossChargeStunParams>
  | AbilityInstance<PoisonParams>; // Extend this union as new abilities are added

export function isLifeSteal(
  ability: AbilityInstance<any>
): ability is AbilityInstance<LifeStealParams> {
  return ability.id === 'life-steal';
}

export function isCriticalStrike(
  ability: AbilityInstance<any>
): ability is AbilityInstance<CriticalStrikeParams> {
  return ability.id === 'critical-strike';
}

export function isCleave(
  ability: AbilityInstance<any>
): ability is AbilityInstance<CleaveParams> {
  return ability.id === 'cleave';
}

export function isEvade(
  ability: AbilityInstance<any>
): ability is AbilityInstance<EvadeParams> {
  return ability.id === 'evade';
}

export function isThorns(
  ability: AbilityInstance<any>
): ability is AbilityInstance<ThornsParams> {
  return ability.id === 'thorns';
}

export function isTongueFarm(
  ability: AbilityInstance<any>
): ability is AbilityInstance<TongueFarmParams> {
  return ability.id === 'tongue-farm';
}

export function isPotionFarm(
  ability: AbilityInstance<any>
): ability is AbilityInstance<PotionFarmParams> {
  return ability.id === 'potion-farm';
}

export function isGoldFarm(
  ability: AbilityInstance<any>
): ability is AbilityInstance<GoldFarmParams> {
  return ability.id === 'gold-farm';
}

export function isHealingSplash(
  ability: AbilityInstance<any>
): ability is AbilityInstance<HealingSplashParams> {
  return ability.id === 'healing-splash';
}

export function isAugmentedVision(
  ability: AbilityInstance<any>
): ability is AbilityInstance<AugmentedVisionParams> {
  return ability.id === 'augmented-vision';
}

export function isSlow(
  ability: AbilityInstance<any>
): ability is AbilityInstance<SlowParams> {
  return ability.id === 'slow';
}

export function isStun(
  ability: AbilityInstance<any>
): ability is AbilityInstance<StunParams> {
  return ability.id === 'stun';
}

export function isBossChargeStun(
  ability: AbilityInstance<any>
): ability is AbilityInstance<BossChargeStunParams> {
  return ability.id === 'boss_charge_stun';
}

export function isPoison(
  ability: AbilityInstance<any>
): ability is AbilityInstance<PoisonParams> {
  return ability.id === 'poison';
}
