import type { GameRoom } from '../rooms/GameRoom';
import type { PlayerSchema } from '../schemas';
import { getPlayerCrit, getPlayerLifeSteal, rollCrit } from './ability-utils';

export interface CritComputationResult {
  damage: number;
  isCrit: boolean;
}

export function computePlayerDamageWithCrit(
  player: PlayerSchema,
  baseDamage: number,
  weaponType: 'melee' | 'ranged',
  weaponSlug: string,
  derivedStats: Record<string, any>
): CritComputationResult {
  let damage = baseDamage;
  let isCrit = false;
  try {
    const derived =
      derivedStats && typeof derivedStats === 'object'
        ? derivedStats
        : undefined;

    if (!derived) {
      throw new Error('Derived stats are required');
    }

    const slugCandidate =
      typeof weaponSlug === 'string' && weaponSlug.trim().length > 0
        ? weaponSlug.trim()
        : undefined;
    const slug =
      slugCandidate ??
      (typeof derived?.activeWeaponSlug === 'string'
        ? derived.activeWeaponSlug.trim()
        : undefined);
    const crit = getPlayerCrit(
      player.characterId,
      weaponType,
      slug,
      derived || undefined
    );
    if (crit.chance > 0) {
      const didCrit = rollCrit(crit.chance);
      if (didCrit && crit.multiplier > 1) {
        damage = Math.round(baseDamage * crit.multiplier);
        isCrit = true;
      }
    }
  } catch {
    // Ignore errors in ability processing, return default values
  }
  return { damage, isCrit };
}

export function applyPlayerLifeSteal(
  gameRoom: GameRoom,
  player: PlayerSchema,
  actualDealt: number,
  weaponType: 'melee' | 'ranged',
  weaponSlug: string,
  derivedStats: Record<string, any>
): number {
  if (actualDealt <= 0) return 0;
  if (weaponType !== 'melee') return 0; // per current spec rollout

  try {
    if (!derivedStats) {
      throw new Error('Derived stats are required');
    }

    const { percent: totalLifeSteal } = getPlayerLifeSteal(
      player.characterId,
      weaponType,
      weaponSlug,
      derivedStats
    );
    if (totalLifeSteal <= 0) return 0;

    const healAmount = Math.max(0, Math.round(actualDealt * totalLifeSteal));
    if (healAmount <= 0) return 0;

    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHealed = player.hp - oldHp;
    if (actualHealed > 0) {
      gameRoom.msg.broadcast('life_steal_heal', {
        playerId: player.id,
        healAmount: actualHealed,
        currentHp: player.hp,
        maxHp: player.maxHp,
        source: 'melee',
      });
    }
    return actualHealed;
  } catch {
    return 0;
  }
}
