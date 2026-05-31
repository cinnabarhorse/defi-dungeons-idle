import { getWearableBySlug } from '../data/wearables';

describe('wearable weapon classification', () => {
  it('classifies staff of creation and staff of charming as weapons', () => {
    const creation = getWearableBySlug('staff-of-creation');
    const charming = getWearableBySlug('staff-of-charming');

    if (!creation || !charming) {
      throw new Error('Missing staff wearables fixture');
    }

    expect(creation.categoryLabel).toBe('weapon');
    expect(charming.categoryLabel).toBe('weapon');
  });
});
