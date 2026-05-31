import type { Room } from 'colyseus';
import type { EnemySchema, GameRoomState, PlayerSchema } from '../../schemas';
import type { AbilityReference } from '../../data/characters';
import {
  aggregateAttackSpeed,
  aggregateCriticalStrike,
  aggregateDamageMultiplier,
  aggregateDamageReduction,
  aggregateEvade,
  aggregateLifeSteal,
  aggregateMoveSpeed,
  aggregateRegen,
} from '../ability-utils';
import { isEntityPoisoned } from './StatusSystem';

export interface AuraEffect {
  id: string;
  radiusPx: number;
  abilities?: AbilityReference[];
  visualTag?: string;
  additionalTags?: string[];
}

export type AuraCarrier = EnemySchema | PlayerSchema;

interface InternalAuraState {
  active: boolean;
  armor: number;
  regenPerSecond: number;
  nextRegenAt: number;
  appliedVisualTags: string[];
}

interface EvadeState {
  chance: number;
  cooldownMs?: number;
  lastTriggerAt: number;
}

const AURA_REGEN_INTERVAL_MS = 500;

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function ensureBaseStat(
  entity: AuraCarrier,
  prop: '_baseDamage' | '_baseSpeed' | '_baseAttackCooldownMs',
  currentValue: number | undefined,
  fallback: number
): number {
  if (typeof (entity as any)[prop] !== 'number') {
    (entity as any)[prop] = currentValue ?? fallback;
  }
  return (entity as any)[prop] as number;
}

function ensureBaseLifeSteal(entity: AuraCarrier): number {
  if (typeof (entity as any)._baseLifeStealMeleePct !== 'number') {
    const current =
      typeof (entity as any).lifeStealMeleePct === 'number'
        ? (entity as any).lifeStealMeleePct
        : 0;
    (entity as any)._baseLifeStealMeleePct = current;
  }
  return (entity as any)._baseLifeStealMeleePct as number;
}

function ensureAuraState(entity: AuraCarrier): InternalAuraState {
  let state = (entity as any)._auraState as InternalAuraState | undefined;
  if (!state) {
    state = {
      active: false,
      armor: 0,
      regenPerSecond: 0,
      nextRegenAt: 0,
      appliedVisualTags: [],
    };
    (entity as any)._auraState = state;
  }
  return state;
}

function hasVisualTags(entity: AuraCarrier): entity is EnemySchema {
  return 'visualTags' in (entity as any);
}

function addVisualTag(entity: AuraCarrier, tag: string) {
  if (!hasVisualTags(entity)) return;
  const visualTags = entity.visualTags;
  for (let i = 0; i < visualTags.length; i++) {
    if (visualTags[i] === tag) return;
  }
  visualTags.push(tag);
}

function removeVisualTag(entity: AuraCarrier, tag: string) {
  if (!hasVisualTags(entity)) return;
  const visualTags = entity.visualTags;
  for (let i = visualTags.length - 1; i >= 0; i--) {
    if (visualTags[i] === tag) {
      visualTags.splice(i, 1);
    }
  }
}

function updateVisualTags(entity: AuraCarrier, tags: string[]) {
  const state = ensureAuraState(entity);
  const prev = state.appliedVisualTags;
  const next = Array.from(new Set(tags));

  for (const tag of prev) {
    if (!next.includes(tag)) {
      removeVisualTag(entity, tag);
    }
  }

  for (const tag of next) {
    addVisualTag(entity, tag);
  }

  state.appliedVisualTags = next;
}

export function clearAuraEffects(entity: AuraCarrier) {
  const state = ensureAuraState(entity);
  if (!state.active && state.appliedVisualTags.length === 0) {
    return;
  }

  const baseDamage = ensureBaseStat(
    entity,
    '_baseDamage',
    (entity as any).damage,
    10
  );
  const baseSpeed = ensureBaseStat(
    entity,
    '_baseSpeed',
    (entity as any).speed,
    1
  );
  const baseCooldown = ensureBaseStat(
    entity,
    '_baseAttackCooldownMs',
    (entity as any).attackCooldownMs,
    800
  );

  (entity as any).damage = baseDamage;
  (entity as any).speed = baseSpeed;
  (entity as any).attackCooldownMs = baseCooldown;

  if ('lifeStealMeleePct' in (entity as any)) {
    const baseLifeSteal = ensureBaseLifeSteal(entity);
    (entity as any).lifeStealMeleePct = baseLifeSteal;
  }

  (entity as any)._lifeStealCapPerHit = 0;
  (entity as any)._auraCrit = undefined;
  (entity as any)._auraEvadeState = undefined;
  (entity as any)._activeAuraAbilities = undefined;

  for (const tag of state.appliedVisualTags) {
    removeVisualTag(entity, tag);
  }
  removeVisualTag(entity, 'aura:buffed');

  state.appliedVisualTags = [];
  state.active = false;
  state.armor = 0;
  state.regenPerSecond = 0;
  state.nextRegenAt = 0;
}

function getAuraAbilities(effect: AuraEffect): AbilityReference[] {
  if (!Array.isArray(effect.abilities)) return [];
  return effect.abilities.filter((ability): ability is AbilityReference =>
    Boolean(ability && typeof ability.id === 'string')
  );
}

function updateEvadeState(
  enemy: EnemySchema,
  melee: { chance: number; cooldownMs?: number },
  ranged: { chance: number; cooldownMs?: number }
) {
  const prev = (enemy as any)._auraEvadeState as
    | { melee: EvadeState; ranged: EvadeState }
    | undefined;

  const makeState = (
    current: { chance: number; cooldownMs?: number },
    previous?: EvadeState
  ): EvadeState => ({
    chance: Math.max(0, Math.min(1, current.chance || 0)),
    cooldownMs:
      typeof current.cooldownMs === 'number' && current.cooldownMs > 0
        ? current.cooldownMs
        : undefined,
    lastTriggerAt: previous?.lastTriggerAt || 0,
  });

  (enemy as any)._auraEvadeState = {
    melee: makeState(melee, prev?.melee),
    ranged: makeState(ranged, prev?.ranged),
  };
}

export function applyAuras(room: Room<GameRoomState>, now: number) {
  const auraSources: Array<{
    sourceId: string;
    carrier: AuraCarrier;
    effect: AuraEffect;
  }> = [];

  for (const [, enemy] of room.state.enemies) {
    if (!enemy || enemy.hp <= 0) continue;
    const sources = (enemy as any)._auraSources as AuraEffect[] | undefined;
    if (!Array.isArray(sources) || sources.length === 0) continue;
    for (const effect of sources) {
      if (!effect || typeof effect.radiusPx !== 'number') continue;
      auraSources.push({
        sourceId: enemy.id,
        carrier: enemy,
        effect,
      });
    }
  }

  if (auraSources.length === 0) {
    const stateAny = room.state as any;
    const lastClearAt = Number(stateAny._lastAuraClearAt) || 0;
    if (now - lastClearAt >= 1000) {
      for (const [, enemy] of room.state.enemies) {
        if (!enemy) continue;
        clearAuraEffects(enemy);
      }
      stateAny._lastAuraClearAt = now;
    }
    return;
  }

  for (const [, enemy] of room.state.enemies) {
    if (!enemy || enemy.hp <= 0) {
      continue;
    }

    const isDormant = Boolean((enemy as any).isDormant);
    const stayActiveUntil = Number((enemy as any).stayActiveUntil) || 0;
    if (isDormant && now > stayActiveUntil) {
      clearAuraEffects(enemy);
      continue;
    }

    const uniqueAuras = new Map<string, AuraEffect>();
    for (const source of auraSources) {
      const { carrier, effect } = source;
      const distSq = distanceSq(carrier.x, carrier.y, enemy.x, enemy.y);
      if (distSq > effect.radiusPx * effect.radiusPx) continue;
      if (!uniqueAuras.has(effect.id)) {
        uniqueAuras.set(effect.id, effect);
      }
    }

    if (uniqueAuras.size === 0) {
      clearAuraEffects(enemy);
      continue;
    }

    const auraAbilities: AbilityReference[] = [];
    const visualTags: string[] = [];
    let lifeStealCapPerHit: number | null = null;

    for (const effect of uniqueAuras.values()) {
      const abilities = getAuraAbilities(effect);
      if (abilities.length) {
        auraAbilities.push(...abilities);
        for (const ability of abilities) {
          if (ability.id === 'life-steal') {
            const cap = ability.params?.maxPerHit;
            if (typeof cap === 'number' && cap > 0) {
              lifeStealCapPerHit =
                lifeStealCapPerHit === null
                  ? cap
                  : Math.min(lifeStealCapPerHit, cap);
            }
          }
        }
      }
      if (typeof effect.visualTag === 'string' && effect.visualTag.length > 0) {
        visualTags.push(effect.visualTag);
      }
      if (Array.isArray(effect.additionalTags)) {
        for (const tag of effect.additionalTags) {
          if (typeof tag === 'string' && tag.length > 0) {
            visualTags.push(tag);
          }
        }
      }
    }

    if (auraAbilities.length === 0 && visualTags.length === 0) {
      clearAuraEffects(enemy);
      continue;
    }

    const state = ensureAuraState(enemy);
    const baseDamage = ensureBaseStat(enemy, '_baseDamage', enemy.damage, 10);
    const baseSpeed = ensureBaseStat(enemy, '_baseSpeed', enemy.speed, 1);
    const baseCooldown = ensureBaseStat(
      enemy,
      '_baseAttackCooldownMs',
      (enemy as any).attackCooldownMs,
      800
    );

    const moveSpeed = aggregateMoveSpeed(auraAbilities);
    const attackSpeed = aggregateAttackSpeed(auraAbilities);
    const damageMultMelee = aggregateDamageMultiplier(auraAbilities, 'melee');
    const damageMultRanged = aggregateDamageMultiplier(auraAbilities, 'ranged');
    const damageReduction = aggregateDamageReduction(auraAbilities);
    const regen = aggregateRegen(auraAbilities);
    const lifeStealMelee = aggregateLifeSteal(auraAbilities, 'melee');
    const critMelee = aggregateCriticalStrike(auraAbilities, 'melee');
    const critRanged = aggregateCriticalStrike(auraAbilities, 'ranged');
    const evadeMelee = aggregateEvade(auraAbilities, 'melee');
    const evadeRanged = aggregateEvade(auraAbilities, 'ranged');

    const combinedDamageMultiplier = Math.max(
      0,
      damageMultMelee.multiplier || 1,
      damageMultRanged.multiplier || 1
    );

    (enemy as any).damage = Math.max(
      1,
      Math.round(baseDamage * combinedDamageMultiplier)
    );
    (enemy as any).speed = baseSpeed * Math.max(0, moveSpeed.multiplier || 1);

    const attackMult = Math.max(0, attackSpeed.multiplier || 1);
    if (attackMult > 0) {
      const adjusted = baseCooldown / attackMult;
      (enemy as any).attackCooldownMs = Math.max(150, Math.round(adjusted));
    } else {
      (enemy as any).attackCooldownMs = baseCooldown;
    }

    if ('lifeStealMeleePct' in (enemy as any)) {
      const baseLifeSteal = ensureBaseLifeSteal(enemy);
      const totalLifeSteal = Math.max(
        0,
        baseLifeSteal + lifeStealMelee.percent
      );
      (enemy as any).lifeStealMeleePct = totalLifeSteal;
      (enemy as any)._lifeStealCapPerHit = lifeStealCapPerHit ?? 0;
    }

    (enemy as any)._auraCrit = {
      melee: critMelee,
      ranged: critRanged,
    };

    updateEvadeState(enemy, evadeMelee, evadeRanged);
    (enemy as any)._activeAuraAbilities = auraAbilities;

    state.active = auraAbilities.length > 0;
    state.armor = Math.max(0, damageReduction.armor);
    state.regenPerSecond = Math.max(0, regen.perSecond);

    if (state.regenPerSecond > 0) {
      const isPoisoned = isEntityPoisoned(enemy, now);
      if (isPoisoned) {
        state.nextRegenAt = 0;
      } else {
        const next = Number(state.nextRegenAt) || 0;
        if (now >= next) {
          const amount = Math.max(
            1,
            Math.round((state.regenPerSecond * AURA_REGEN_INTERVAL_MS) / 1000)
          );
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + amount);
          state.nextRegenAt = now + AURA_REGEN_INTERVAL_MS;
        }
      }
    } else {
      state.nextRegenAt = 0;
    }

    const tagSet = new Set<string>(visualTags);
    if (auraAbilities.length > 0) {
      tagSet.add('aura:buffed');
    }
    updateVisualTags(enemy, Array.from(tagSet));
  }
}

export function getAuraDamageReduction(entity: AuraCarrier): number {
  const state = ensureAuraState(entity);
  return state.active ? state.armor : 0;
}
