import type { CharacterDerivedStats } from '../character-registry';
import {
  DEFAULT_QUALITY_TIER,
  durabilityCapForQuality,
  getQualityLabelForWearable,
  normalizeQualityTier,
  type QualityTier,
} from '../../data/wearable-quality';
import {
  getWearableBySlug,
  type WearableDefinition,
} from '../../data/wearables';

export interface HeroWearableSummary {
  wearable: WearableDefinition;
  quality: QualityTier;
  qualityScalar: number;
  qualityLabel: string | null;
  durabilityScore?: number | null;
}

export function applyWearablePreviewState(
  summaries: HeroWearableSummary[],
  equippedWearablesWithQuality?:
    | Array<{
        slot?: string;
        slug: string;
        quality: QualityTier;
        durabilityScore?: number | null;
      }>
    | null
): HeroWearableSummary[] {
  if (
    !Array.isArray(equippedWearablesWithQuality) ||
    equippedWearablesWithQuality.length === 0
  ) {
    return summaries;
  }

  const previewEntriesBySlug = new Map<
    string,
    Array<{
      slot?: string;
      slug: string;
      quality: QualityTier;
      durabilityScore?: number | null;
    }>
  >();

  equippedWearablesWithQuality.forEach((entry) => {
    const list = previewEntriesBySlug.get(entry.slug);
    if (list) {
      list.push(entry);
    } else {
      previewEntriesBySlug.set(entry.slug, [entry]);
    }
  });

  const usedCounts = new Map<string, number>();

  return summaries.map((summary) => {
    const matches = previewEntriesBySlug.get(summary.wearable.slug);
    if (!matches || matches.length === 0) {
      return summary;
    }
    const used = usedCounts.get(summary.wearable.slug) ?? 0;
    const match = matches[Math.min(used, matches.length - 1)];
    usedCounts.set(summary.wearable.slug, used + 1);
    return {
      ...summary,
      quality: match?.quality ?? summary.quality,
      qualityLabel:
        match?.quality && summary.qualityScalar !== 1
          ? getQualityLabelForWearable(match.quality, summary.wearable.slug)
          : summary.qualityLabel,
      durabilityScore:
        typeof match?.durabilityScore === 'number' &&
        Number.isFinite(match.durabilityScore)
          ? Math.max(0, Math.floor(match.durabilityScore))
          : null,
    };
  });
}

export function getWearableQualityPreviewClasses(input: {
  quality: QualityTier;
  durabilityScore?: number | null;
}): {
  borderColor?: string;
  backgroundColor: string;
  boxShadow?: string;
} {
  const { quality, durabilityScore } = input;
  if (typeof durabilityScore !== 'number' || !Number.isFinite(durabilityScore)) {
    return {
      backgroundColor: 'rgba(255,255,255,0.10)',
    };
  }

  const cap = durabilityCapForQuality(quality);
  const ratio = cap > 0 ? Math.max(0, Math.min(1, durabilityScore / cap)) : 0;

  if (ratio >= 2 / 3) {
    return {
      borderColor: 'rgba(74, 222, 128, 0.95)',
      backgroundColor: 'rgba(34, 197, 94, 0.90)',
      boxShadow: '0 0 16px rgba(34, 197, 94, 0.28)',
    };
  }

  if (ratio >= 1 / 3) {
    return {
      borderColor: 'rgba(251, 191, 36, 0.95)',
      backgroundColor: 'rgba(245, 158, 11, 0.90)',
      boxShadow: '0 0 16px rgba(245, 158, 11, 0.24)',
    };
  }

  switch (quality) {
    case 'broken':
    case 'budget':
    case 'average':
    case 'excellent':
    case 'flawless':
    default:
      return {
        borderColor: 'rgba(248, 113, 113, 0.95)',
        backgroundColor: 'rgba(239, 68, 68, 0.90)',
        boxShadow: '0 0 16px rgba(239, 68, 68, 0.24)',
      };
  }
}

export function buildHeroWearableSummaries(
  derived: CharacterDerivedStats
): HeroWearableSummary[] {
  const items = Array.isArray(derived.equipment?.items)
    ? derived.equipment.items
    : [];

  return items
    .map<HeroWearableSummary | null>((item) => {
      const wearable = getWearableBySlug(item.slug);
      if (!wearable || wearable.weapon) return null;

      const quality = normalizeQualityTier(item.quality ?? DEFAULT_QUALITY_TIER);
      const qualityScalar = Number.isFinite(item.qualityScalar)
        ? item.qualityScalar
        : 1;

      return {
        wearable,
        quality,
        qualityScalar,
        qualityLabel:
          qualityScalar !== 1
            ? getQualityLabelForWearable(quality, item.slug)
            : null,
        durabilityScore:
          typeof (item as any).durabilityScore === 'number' &&
          Number.isFinite((item as any).durabilityScore)
            ? Math.max(0, Math.floor((item as any).durabilityScore))
            : null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
}
