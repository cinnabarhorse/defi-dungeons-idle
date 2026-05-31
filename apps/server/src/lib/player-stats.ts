import type { PlayerSchema } from '../schemas';
import {
  getCharacterStats,
  type CharacterDerivedStats,
  type EquippedWeaponSummary,
} from './character-registry';
import { aggregateAugmentedVision } from './ability-utils';
import type { ProgressionModifiers } from '@gotchiverse/progression';
import type { KillStreakModifiers } from './progression/killStreak';
import {
  mapStoredWearablesToAssignments,
  serializeStoredWearable,
  isEquipmentSlotName,
  type EquipmentSlotName,
  type StoredWearableEntry,
} from './equipment-service';
import {
  DEFAULT_QUALITY_TIER,
  isBrokenDurability,
  normalizeQualityTier,
} from '../data/wearable-quality';
import type { EquippedWearableWithQuality } from '../data/wearables';
import { resolvePreferredHandWeaponIndex } from './hand-weapon-utils';

export interface MitigatedDamageResult {
  stats: CharacterDerivedStats;
  finalDamage: number;
}

export interface SyncPlayerOptions {
  fullHeal?: boolean;
  progressionModifiers?: ProgressionModifiers;
  killStreakModifiers?: KillStreakModifiers;
  preserveHealthRatio?: boolean;
}

const DEFAULT_MAX_HEALTH = 100;
const DEFAULT_BASE_MANA = 50;
const DEFAULT_BASE_MANA_REGEN_PER_SECOND = 0.25;

type HandSlot = 'handLeft' | 'handRight';

interface PlayerHandWeapon {
  slot: HandSlot;
  weapon: EquippedWeaponSummary;
}

function collectHandWeapons(stats: CharacterDerivedStats): PlayerHandWeapon[] {
  const items = Array.isArray(stats.equipment?.items)
    ? stats.equipment.items
    : [];
  const weapons = Array.isArray(stats.weapons) ? stats.weapons : [];

  const handWeapons: PlayerHandWeapon[] = [];
  const usedSlots = new Set<HandSlot>();
  for (const weapon of weapons) {
    if (
      !weapon ||
      (weapon.weaponType !== 'melee' && weapon.weaponType !== 'ranged')
    ) {
      continue;
    }
    const equipmentItem = items.find(
      (item) =>
        item &&
        typeof item.slug === 'string' &&
        item.slug === weapon.slug &&
        typeof item.slot === 'string'
    ) as { slot?: string } | undefined;
    const slotRaw = equipmentItem?.slot as HandSlot | undefined;
    if (slotRaw === 'handLeft' || slotRaw === 'handRight') {
      usedSlots.add(slotRaw);
      handWeapons.push({ slot: slotRaw, weapon });
    }
  }

  handWeapons.sort((a, b) => {
    if (a.slot === b.slot) return 0;
    return a.slot === 'handLeft' ? -1 : 1;
  });

  return handWeapons;
}

// de-duplicated: prefer shared helper from hand-weapon-utils
function normalizeAttackType(
  weaponType: string | undefined
): 'melee' | 'ranged' {
  return weaponType === 'ranged' ? 'ranged' : 'melee';
}

export function calculateDamageAfterMitigation(
  player: PlayerSchema,
  incomingDamage: number
): MitigatedDamageResult {
  if (!player || !player.characterId) {
    throw new Error('Player character ID is required');
  }

  const stats = getCharacterStats(player.characterId);
  const armor = Math.max(0, stats.armor || 0);
  const percentMitigation = clampPercent(armor / 100, 0, 0.8);
  const reduced = Math.max(armor, percentMitigation * incomingDamage);
  const mitigated = Math.max(0, Math.round(incomingDamage - reduced));
  return { stats, finalDamage: mitigated };
}

export function syncPlayerCharacterStats(
  player: PlayerSchema,
  options: SyncPlayerOptions = {}
): CharacterDerivedStats {
  if (!player || !player.characterId) {
    throw new Error('Player character ID is required');
  }

  const storedOverrides = mapStoredWearablesToAssignments(
    player.equippedWearables,
    []
  );
  const activeStoredOverrides = storedOverrides.filter(
    (entry) => !isBrokenDurability(entry.durabilityScore)
  );
  const overrideWithQuality: EquippedWearableWithQuality[] | null =
    activeStoredOverrides.length > 0
      ? activeStoredOverrides.map((entry) => ({
          slug: entry.slug,
          quality: entry.quality,
          slot: entry.slot,
        }))
      : null;

  const baseStats = getCharacterStats(
    player.characterId,
    overrideWithQuality && overrideWithQuality.length > 0
      ? { equippedWearablesWithQuality: overrideWithQuality }
      : undefined
  );
  const baseDamageRange = baseStats.damageRange
    ? { ...baseStats.damageRange }
    : {
        min: Number.isFinite(baseStats.damage) ? baseStats.damage! : 5,
        max: Number.isFinite(baseStats.damage) ? baseStats.damage! : 5,
      };
  let stats: CharacterDerivedStats = {
    ...baseStats,
    damageRange: baseDamageRange,
  };

  const fallbackAssignments: StoredWearableEntry[] = Array.isArray(
    stats.equipment?.items
  )
    ? stats.equipment.items.map((item) => ({
        slot: isEquipmentSlotName(item.slot)
          ? (item.slot as EquipmentSlotName)
          : 'handRight',
        slug: item.slug,
        quality: normalizeQualityTier(item.quality ?? DEFAULT_QUALITY_TIER),
      }))
    : [];

  const storedAssignments = mapStoredWearablesToAssignments(
    player.equippedWearables,
    fallbackAssignments
  );

  if (storedAssignments.length > 0 && Array.isArray(stats.equipment?.items)) {
    const assignmentsBySlug = new Map<string, StoredWearableEntry[]>();
    storedAssignments.forEach((entry) => {
      const list = assignmentsBySlug.get(entry.slug);
      if (list) {
        list.push(entry);
      } else {
        assignmentsBySlug.set(entry.slug, [entry]);
      }
    });

    const usedCounts = new Map<string, number>();
    const reconciledItems = stats.equipment.items.map((item) => {
      const slug = item.slug;
      const entries = assignmentsBySlug.get(slug);
      if (!entries || entries.length === 0) {
        return item;
      }
      const used = usedCounts.get(slug) ?? 0;
      const assignment = entries[Math.min(used, entries.length - 1)];
      usedCounts.set(slug, used + 1);
      return {
        ...item,
        slot: assignment.slot,
        quality: assignment.quality ?? item.quality,
        durabilityScore: assignment.durabilityScore ?? null,
      };
    });

    for (const assignment of storedAssignments) {
      const exists = reconciledItems.some(
        (item) => item.slot === assignment.slot && item.slug === assignment.slug
      );
      if (!exists) {
        const baseItem = stats.equipment.items.find(
          (item) => item.slug === assignment.slug
        );
        if (baseItem) {
          reconciledItems.push({
            ...baseItem,
            slot: assignment.slot,
            quality: assignment.quality ?? baseItem.quality,
            durabilityScore: assignment.durabilityScore ?? null,
          });
        }
      }
    }

    stats.equipment.items = reconciledItems;
    stats.equipment.slugs = reconciledItems.map((item) => item.slug);
  }

  const handWeapons = collectHandWeapons(stats);
  const preferredIndex = resolvePreferredHandWeaponIndex(
    player.activeWeaponIndex,
    handWeapons
  );
  player.activeWeaponIndex = preferredIndex;
  const activeHandWeapon =
    preferredIndex >= 0 ? handWeapons[preferredIndex] : null;

  // Recompute derived stats with the selected active weapon and reconciled wearables
  // to ensure all wearable modifiers (including ranged/melee range, attack speed, etc.)
  // are correctly applied on top of the active weapon's base values.
  try {
    const equippedWithQuality: EquippedWearableWithQuality[] = Array.isArray(
      stats.equipment?.items
    )
      ? stats.equipment.items
          .filter(
            (item) => !isBrokenDurability((item as any).durabilityScore ?? null)
          )
          .map((item) => ({
            slug: item.slug,
            quality: normalizeQualityTier(
              (item as any).quality ?? DEFAULT_QUALITY_TIER
            ),
            slot: item.slot as EquipmentSlotName,
          }))
      : [];

    if (activeHandWeapon && (activeHandWeapon as any).weapon) {
      const recomputed = getCharacterStats(player.characterId, {
        equippedWearablesWithQuality: equippedWithQuality,
        activeWeaponSlug: (activeHandWeapon as any).weapon.slug,
      });

      // Preserve reconciled equipment slots; the character stats builder does not track runtime slot overrides
      recomputed.equipment = {
        ...recomputed.equipment,
        slugs: stats.equipment.slugs,
        items: stats.equipment.items,
      };

      stats = recomputed;
    }
  } catch {
    // Ignore errors in stat recomputation, use original stats
  }

  const progressionModifiers = options.progressionModifiers;
  const killStreakModifiers = options.killStreakModifiers;
  const progressionMaxManaBonus = progressionModifiers?.maxManaBonus ?? 0;
  const progressionManaRegenMultiplier =
    progressionModifiers?.manaRegenMultiplier ?? 1;

  const attackSpeedScalar =
    (progressionModifiers?.attackSpeedScalar ?? 1) *
    (killStreakModifiers?.attackSpeedScalar ?? 1);
  const damageMultiplier =
    (progressionModifiers?.damageMultiplier ?? 1) *
    (killStreakModifiers?.damageMultiplier ?? 1);
  const maxHealthMultiplier =
    (progressionModifiers?.maxHealthMultiplier ?? 1) *
    (killStreakModifiers?.maxHealthMultiplier ?? 1);
  const maxHealthFlatBonus =
    (progressionModifiers?.maxHealthFlatBonus ?? 0) +
    (killStreakModifiers?.maxHealthFlatBonus ?? 0);
  const movementSpeedMultiplier =
    killStreakModifiers?.movementSpeedMultiplier ?? 1;
  const armorBonus = killStreakModifiers?.armorBonus ?? 0;
  const lifeStealPercent = killStreakModifiers?.lifeStealPercent ?? 0;
  const criticalChanceBonus = killStreakModifiers?.criticalChanceBonus ?? 0;
  const evadeChanceBonus = killStreakModifiers?.evadeChanceBonus ?? 0;
  const hpRegenPerSecondBonus = killStreakModifiers?.hpRegenPerSecondBonus ?? 0;
  const killStreakManaRegenMultiplier =
    killStreakModifiers?.manaRegenMultiplier ?? 1;
  const attackRangeMultiplier = killStreakModifiers?.attackRangeMultiplier ?? 1;
  const magicFindBonus = killStreakModifiers?.magicFindBonus ?? 0;
  const potionCoinFindBonus = killStreakModifiers?.potionCoinFindBonus ?? 0;

  if (progressionModifiers || killStreakModifiers) {
    if (Number.isFinite(stats.attackSpeed)) {
      const scaled = Math.max(
        150,
        Math.round(stats.attackSpeed * attackSpeedScalar)
      );
      stats.attackSpeed = scaled;
    }

    if (Number.isFinite(stats.damage)) {
      stats.damage = Math.max(
        1,
        Math.round((stats.damage || 0) * damageMultiplier)
      );
    }

    if (stats.damageRange) {
      stats.damageRange = {
        min: Math.max(1, Math.round(stats.damageRange.min * damageMultiplier)),
        max: Math.max(1, Math.round(stats.damageRange.max * damageMultiplier)),
      };
    }

    const baseMaxHp = Number.isFinite(stats.maxHealth)
      ? stats.maxHealth
      : DEFAULT_MAX_HEALTH;
    const modifiedMaxHp = Math.max(
      1,
      Math.round(baseMaxHp * maxHealthMultiplier + maxHealthFlatBonus)
    );
    stats.maxHealth = modifiedMaxHp;

    if (stats.movementSpeed) {
      stats.movementSpeed = Math.max(
        0.1,
        stats.movementSpeed * Math.max(0, movementSpeedMultiplier)
      );
    }

    if (Number.isFinite(armorBonus) && armorBonus !== 0) {
      stats.armor = Math.max(0, Math.round(stats.armor + armorBonus));
    }

    if (typeof stats.meleeAttackRange === 'number') {
      stats.meleeAttackRange = Math.max(
        0,
        Math.round(stats.meleeAttackRange * Math.max(0, attackRangeMultiplier))
      );
    }

    if (typeof stats.rangedAttackRange === 'number') {
      stats.rangedAttackRange = Math.max(
        0,
        Math.round(stats.rangedAttackRange * Math.max(0, attackRangeMultiplier))
      );
    }
  }

  (player as any).killStreakLifeStealPercent = lifeStealPercent;
  (player as any).killStreakCriticalChanceBonus = criticalChanceBonus;
  (player as any).killStreakEvadeChanceBonus = evadeChanceBonus;
  (player as any).killStreakHpRegenPerSecondBonus = hpRegenPerSecondBonus;
  (player as any).killStreakManaRegenMultiplier = killStreakManaRegenMultiplier;
  (player as any).killStreakMagicFindBonus = magicFindBonus;
  (player as any).killStreakPotionCoinFindBonus = potionCoinFindBonus;

  const previousMaxHp = player.maxHp || stats.maxHealth;
  const previousHp = player.hp || previousMaxHp;
  const previousMaxMana = Math.max(0, player.maxMana || 0);
  const previousMana = Math.max(0, player.mana || previousMaxMana);

  const resolvedAttackType = normalizeAttackType(stats.weaponType);
  player.attackType = resolvedAttackType;
  player.maxHp = Math.max(1, Math.round(stats.maxHealth));
  if (options.fullHeal !== false) {
    player.hp = player.maxHp;
  } else if (options.preserveHealthRatio && previousMaxHp > 0) {
    const ratio = previousHp / previousMaxHp;
    player.hp = Math.max(1, Math.round(player.maxHp * ratio));
  } else {
    player.hp = Math.min(previousHp, player.maxHp);
  }

  const baseMaxManaStat = Math.max(
    0,
    Number((stats as any).maxMana ?? DEFAULT_BASE_MANA)
  );
  const finalMaxMana = Math.max(
    0,
    Math.round(baseMaxManaStat + progressionMaxManaBonus)
  );
  player.maxMana = finalMaxMana;
  if (options.fullHeal !== false) {
    player.mana = player.maxMana;
  } else if (options.preserveHealthRatio && previousMaxMana > 0) {
    const ratio = Math.max(0, previousMana / previousMaxMana);
    player.mana = Math.max(
      0,
      Math.min(player.maxMana, Math.round(player.maxMana * ratio))
    );
  } else {
    player.mana = Math.max(0, Math.min(previousMana, player.maxMana));
  }

  const baseManaRegenPerSecond = Math.max(
    0,
    Number(
      (stats as any).manaRegenPerSecond ?? DEFAULT_BASE_MANA_REGEN_PER_SECOND
    )
  );
  const effectiveManaRegenPerSecond =
    baseManaRegenPerSecond * Math.max(0, progressionManaRegenMultiplier);
  (player as any).baseManaRegenPerSecond = effectiveManaRegenPerSecond;

  const finalAssignments: StoredWearableEntry[] = storedAssignments.map(
    (entry) => ({
      slot: entry.slot,
      slug: entry.slug,
      quality: normalizeQualityTier(entry.quality ?? DEFAULT_QUALITY_TIER),
      durabilityScore: entry.durabilityScore ?? null,
    })
  );

  player.equippedWearables = JSON.stringify(
    finalAssignments.map(serializeStoredWearable)
  );
  // Compute and cache vision radius multiplier (runtime-only)
  try {
    const vision = aggregateAugmentedVision(stats.abilities);
    (player as any).visionRadiusMultiplier = Math.max(
      0,
      vision.multiplier || 1
    );
  } catch {
    // Ignore errors in vision calculation, use default values
  }

  player.derivedStats = JSON.stringify({
    maxHealth: player.maxHp,
    attackSpeed: stats.attackSpeed,
    meleeAttackRange: stats.meleeAttackRange,
    rangedAttackRange: stats.rangedAttackRange,
    projectileSpeed: stats.projectileSpeed,
    damage: stats.damage,
    damageRange: stats.damageRange,
    totalDamage: (stats as any).totalDamage ?? 1,
    armor: stats.armor,
    movementSpeed: stats.movementSpeed,
    visionRadiusMultiplier: (player as any).visionRadiusMultiplier || 1,
    maxMana: player.maxMana,
    manaRegenPerSecond:
      (player as any).baseManaRegenPerSecond ??
      DEFAULT_BASE_MANA_REGEN_PER_SECOND,
    weaponType: stats.weaponType,
    weaponCategory: stats.weaponCategory,
    activeWeaponSlug: stats.activeWeapon?.slug,
    activeWeaponIndex: player.activeWeaponIndex,
    weapons: stats.weapons ?? [],
    abilities: stats.abilities ?? [],
    equipment: {
      slugs: stats.equipment.slugs,
      items: stats.equipment.items,
      modifiers: stats.equipment.modifiers,
    },
    progression: progressionModifiers
      ? {
          stats: progressionModifiers,
        }
      : undefined,
    killStreak: killStreakModifiers
      ? {
          modifiers: killStreakModifiers,
        }
      : undefined,
  });

  return stats;
}

function clampPercent(value: number, min = 0, max = 0.8): number {
  if (!Number.isFinite(value)) return min;
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.min(upper, Math.max(lower, value));
}
