import { summarizeWearable } from '../lib/hero-details/wearable-summary-text';
import { STAT } from '../data/wearables';

describe('summarizeWearable quality scaling', () => {
  it('applies qualityScalar to wearable stat summaries', () => {
    const wearable = {
      id: 1,
      name: 'Test Regen Hat',
      slug: 'test-regen-hat',
      svgId: 1,
      slots: ['head'],
      effects: [
        {
          type: 'stat',
          modifiers: [
            {
              stat: STAT.hpRegen,
              value: 0.12,
              operation: 'add',
            },
          ],
        },
      ],
    } as any;

    expect(
      summarizeWearable({
        wearable,
        quality: 'average',
        qualityScalar: 1,
        qualityLabel: null,
      })
    ).toContain('+3 HP per turn');

    expect(
      summarizeWearable({
        wearable,
        quality: 'flawless',
        qualityScalar: 2,
        qualityLabel: 'Flawless',
      })
    ).toContain('+6 HP per turn');
  });
});
