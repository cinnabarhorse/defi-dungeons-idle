import { durabilityLossForRun } from '../data/wearable-quality';
import {
  applyWearablePreviewState,
  getWearableQualityPreviewClasses,
} from '../lib/hero-details/wearable-summaries';
import { getWearableBySlug } from '../data/wearables';

describe('getWearableQualityPreviewClasses', () => {
  it('uses green tones for healthy wearables', () => {
    expect(
      getWearableQualityPreviewClasses({
        quality: 'excellent',
        durabilityScore: 700,
      })
    ).toEqual(
      expect.objectContaining({
        borderColor: 'rgba(74, 222, 128, 0.95)',
        backgroundColor: 'rgba(34, 197, 94, 0.90)',
      })
    );
  });

  it('uses yellow tones for worn wearables', () => {
    expect(
      getWearableQualityPreviewClasses({
        quality: 'average',
        durabilityScore: 300,
      })
    ).toEqual(
      expect.objectContaining({
        borderColor: 'rgba(251, 191, 36, 0.95)',
        backgroundColor: 'rgba(245, 158, 11, 0.90)',
      })
    );
  });

  it('uses red tones for low durability wearables', () => {
    expect(
      getWearableQualityPreviewClasses({
        quality: 'excellent',
        durabilityScore: 100,
      })
    ).toEqual(
      expect.objectContaining({
        borderColor: 'rgba(248, 113, 113, 0.95)',
        backgroundColor: 'rgba(239, 68, 68, 0.90)',
      })
    );
  });

  it('uses a neutral preview when durability is not tracked', () => {
    expect(
      getWearableQualityPreviewClasses({
        quality: 'average',
        durabilityScore: null,
      })
    ).toEqual(
      expect.objectContaining({
        backgroundColor: 'rgba(255,255,255,0.10)',
      })
    );
  });

  it('reduces durability by one per run-depth step', () => {
    expect(durabilityLossForRun(1)).toBe(1);
    expect(durabilityLossForRun(20)).toBe(2);
    expect(durabilityLossForRun(200)).toBe(20);
  });

  it('hydrates lobby wearable summaries with durability from equipment state', () => {
    const wearable = getWearableBySlug('bitcoin-beanie');
    if (!wearable) {
      throw new Error('Missing bitcoin-beanie fixture');
    }

    const [summary] = applyWearablePreviewState(
      [
        {
          wearable,
          quality: 'excellent',
          qualityScalar: 1.5,
          qualityLabel: 'Excellent',
          durabilityScore: null,
        },
      ],
      [
        {
          slot: 'head',
          slug: 'bitcoin-beanie',
          quality: 'excellent',
          durabilityScore: 700,
        },
      ]
    );

    expect(summary?.durabilityScore).toBe(700);
  });
});
