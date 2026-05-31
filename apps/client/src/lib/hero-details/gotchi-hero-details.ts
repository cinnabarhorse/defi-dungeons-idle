import { getAppServerBaseUrl } from '../../lib/server-url';
import { GOTCHI_SLOT_BY_INDEX } from '../gotchi-utils';
import { getCharacterStats } from '../../lib/character-registry';
import {
  formatAttacksPerSecond,
  type HeroDetails,
  type HeroWeaponSummary,
  type AbilityEntry,
} from '../../components/HeroDetailsView';
import { buildHeroWearableSummaries } from './wearable-summaries';

function getGotchiLabel(characterId: string): string {
  const idPart = characterId.split(':')[1] ?? '';
  return idPart ? `Gotchi #${idPart}` : 'Gotchi';
}

export async function buildHeroDetailsForGotchi(
  characterId: string
): Promise<HeroDetails | null> {
  if (!characterId || !characterId.startsWith('gotchi:')) return null;
  const gotchiId = characterId.split(':')[1] || '';
  if (!/^\d+$/.test(gotchiId)) return null;

  let slotMap: Record<string, string> | undefined;
  try {
    const baseUrl = getAppServerBaseUrl();
    const res = await fetch(`${baseUrl}/api/admin/gotchis/${gotchiId}`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const json = (await res.json()) as {
        gotchi?: { wearableSlugs?: string[] | null };
      };
      const slugs = json?.gotchi?.wearableSlugs || [];
      if (Array.isArray(slugs) && slugs.length > 0) {
        const result: Record<string, string> = {};
        for (let i = 0; i < slugs.length; i++) {
          const slot = GOTCHI_SLOT_BY_INDEX[i] as string | undefined;
          const slug = slugs[i];
          if (slot && slug) result[slot] = slug;
        }
        slotMap = result;
      }
    }
  } catch {
    // fall back below
  }

  const derived =
    slotMap && Object.keys(slotMap).length > 0
      ? getCharacterStats(characterId, { equippedWearables: slotMap })
      : getCharacterStats(characterId);

  const wearables = buildHeroWearableSummaries(derived);

  const abilities: AbilityEntry[] = derived.abilities.map(({ id, params }) => {
    const p =
      params && typeof params === 'object'
        ? (params as Record<string, unknown>)
        : null;
    return { id, params: p };
  });

  const weapons: HeroWeaponSummary[] = derived.weapons.map((w) => ({
    id: w.id,
    svgId: w.id,
    name: w.name,
    weaponType: w.weaponType,
    attackSpeed: w.attackSpeed ?? null,
    damageRange: w.damageRange
      ? { min: w.damageRange.min, max: w.damageRange.max }
      : typeof w.damage === 'number'
        ? { min: w.damage, max: w.damage }
        : null,
  }));

  const attackSpeedMs = derived.attackSpeed ?? 1000;
  const maxHealth = derived.maxHealth ?? 100;

  return {
    name: getGotchiLabel(characterId),
    description: undefined,
    tier: 'unique',
    archetypeName: null,
    runTraitSummary: null,
    characterClass: undefined,
    previewId: characterId,
    isDynamic: true,
    stats: {
      maxHealth,
      damageRange: {
        min: derived.damageRange.min,
        max: derived.damageRange.max,
      },
      attackSpeedMs,
      attackRange:
        (derived.weaponType === 'ranged'
          ? derived.rangedAttackRange
          : derived.meleeAttackRange) ?? null,
      weaponType: derived.weaponType,
      projectileSpeed: derived.projectileSpeed ?? null,
      movementSpeed: derived.movementSpeed ?? null,
      hpRegenRate: null,
    },
    formatted: {
      hp: `${maxHealth}`,
      damage:
        derived.damageRange.min === derived.damageRange.max
          ? `${derived.damageRange.min}`
          : `${derived.damageRange.min}-${derived.damageRange.max}`,
      attackSpeed: formatAttacksPerSecond(attackSpeedMs),
    },
    wearables,
    abilities,
    weapons,
  };
}
