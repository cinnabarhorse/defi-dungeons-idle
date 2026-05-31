import { normalizeForGenerator, normalizeMany } from '../gotchi-normalize';
import type { RawAavegotchi } from '../aavegotchi';
import { itemTypes } from '../../data/wearables';

function makeRaw(overrides: Partial<RawAavegotchi> = {}): RawAavegotchi {
  return {
    id: '123',
    collateral: '0x9719d867a500ef117cc201206b8ab51e794d3f82', // aUSDC
    eyeShape: 0,
    eyeColor: 0,
    equippedWearables: ['0', '0', '0', '0', '0', '0', '0'],
    ...overrides,
  };
}

describe('lib/gotchi-normalize', () => {
  it('normalizes collateral + eye trait boundaries (including out-of-range eyeColor=100)', () => {
    const gotchi = normalizeForGenerator(
      makeRaw({
        collateral: '0x9719D867A500EF117CC201206B8AB51E794D3F82', // mixed-case
        eyeShape: 98, // mythic_high branch
        eyeColor: 100, // edge: falls through ranges -> "value out of range"
      })
    );

    expect(gotchi.id).toBe(123);
    expect(gotchi.collateral).toBe('aUSDC');

    const eyeShape = gotchi.attributes.find((a) => a.trait_type === 'Eye Shape');
    const eyeColor = gotchi.attributes.find((a) => a.trait_type === 'Eye Color');

    expect(eyeShape?.value).toBe('mythic_high');
    expect(eyeColor?.value).toBe('value out of range');
  });

  it('filters equipped wearables: ignores zero/NaN/unknown svgIds and includes known svgId names', () => {
    const known = Object.values(itemTypes).find((it) => it && typeof it.svgId === 'number' && it.svgId > 0);
    if (!known) throw new Error('Expected at least one wearable itemType with a svgId');

    const gotchi = normalizeForGenerator(
      makeRaw({
        equippedWearables: [
          String(known.svgId), // should be included
          '0', // ignored
          'not-a-number', // ignored
          '999999', // likely unknown svgId -> ignored
        ],
      })
    );

    const wearableAttrs = gotchi.attributes.filter((a) => a.trait_type.startsWith('Wearable'));
    expect(wearableAttrs.some((a) => a.value === known.name)).toBe(true);

    // Ensure we didn't accidentally include placeholder/unknown values
    expect(wearableAttrs.some((a) => a.value === 'Not Found')).toBe(false);
  });

  it('normalizeMany maps via normalizeForGenerator deterministically', () => {
    const raws = [makeRaw({ id: '1' }), makeRaw({ id: '2', eyeColor: -1 })];
    const normalized = normalizeMany(raws);

    expect(normalized.map((g) => g.id)).toEqual([1, 2]);

    const secondEyeColor = normalized[1].attributes.find((a) => a.trait_type === 'Eye Color');
    expect(secondEyeColor?.value).toBe('mythical_low');
  });
});
