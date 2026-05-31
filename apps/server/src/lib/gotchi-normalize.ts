import { itemTypes } from '../data/wearables';
import type { RawAavegotchi } from './aavegotchi';

export interface GeneratorAttribute {
  trait_type: string;
  value: string;
}

export interface GeneratorGotchi {
  id: number;
  collateral: string;
  attributes: GeneratorAttribute[];
}

const rarityConfig = {
  eyeColorTraitRanges: [0, 2, 10, 25, 75, 90, 98, 100],
  eyeColors: [
    'mythical_low',
    'rare_low',
    'uncommon_low',
    'common',
    'uncommon_high',
    'rare_high',
    'mythical_high',
  ],
};

function classifyRarityEyeShapes(value: number): string {
  if (value === 0) return 'mythic_low_1';
  if (value === 1) return 'mythic_low_2';
  if (value >= 90 && value <= 92) return 'rare_high_1';
  if (value >= 93 && value <= 94) return 'rare_high_2';
  if (value >= 95 && value <= 97) return 'rare_high_3';
  if (value >= 75 && value <= 79) return 'uncommon_high_1';
  if (value >= 80 && value <= 84) return 'uncommon_high_2';
  if (value >= 85 && value <= 89) return 'uncommon_high_3';
  if (value >= 25 && value <= 41) return 'common_1';
  if (value >= 42 && value <= 57) return 'common_2';
  if (value >= 58 && value <= 74) return 'common_3';
  if (value >= 10 && value <= 14) return 'uncommon_low_1';
  if (value >= 15 && value <= 19) return 'uncommon_low_2';
  if (value >= 20 && value <= 24) return 'uncommon_low_3';
  if (value >= 2 && value <= 4) return 'rare_low_1';
  if (value >= 5 && value <= 6) return 'rare_low_2';
  if (value >= 7 && value <= 9) return 'rare_low_3';
  if (value === 98 || value === 99) return 'mythic_high';
  return 'value out of range';
}

function classifyRarity(value: number, config = rarityConfig): string {
  if (value < 0) return 'mythical_low';
  if (value > 100) return 'mythical_high';
  for (let i = 0; i < config.eyeColorTraitRanges.length - 1; i++) {
    const start = config.eyeColorTraitRanges[i];
    const end = config.eyeColorTraitRanges[i + 1];
    if (value >= start && value < end) return config.eyeColors[i];
  }
  return 'value out of range';
}

const collats: { [address: string]: string } = {
  '0xe0b22e0037b130a9f56bbb537684e6fa18192341': 'aDAI',
  '0x20d3922b4a1a8560e1ac99fba4fade0c849e2142': 'aWETH',
  '0x823cd4264c1b951c9209ad0deaea9988fe8429bf': 'aAAVE',
  '0x98ea609569bd25119707451ef982b90e3eb719cd': 'aLINK',
  '0xdae5f1590db13e3b40423b5b5c5fbf175515910b': 'aUSDT',
  '0x9719d867a500ef117cc201206b8ab51e794d3f82': 'aUSDC',
  '0xf4b8888427b00d7caf21654408b7cba2ecf4ebd9': 'aTUSD',
  '0x8c8bdbe9cee455732525086264a4bf9cf821c498': 'aUNI',
  '0xe20f7d1f0ec39c4d5db01f53554f2ef54c71f613': 'aYFI',
  '0x27f8d03b3a2196956ed754badc28d73be8830a6e': 'amDAI',
  '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390': 'amWETH',
  '0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360': 'amAAVE',
  '0x60d55f02a771d515e077c9c2403a1ef324885cec': 'amUSDT',
  '0x1a13f4ca1d028320a707d99520abfefca3998b7f': 'amUSDC',
  '0x5c2ed810328349100a66b82b78a1791b101c9d61': 'amWBTC',
  '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4': 'amWMATIC',
};

function getTokenFromCollats(address: string): string {
  return collats[address?.toLowerCase()] || 'Not Found';
}

function getItemNameBySvgId(svgId: number): string | null {
  const found = Object.values(itemTypes).find((it) => it.svgId === svgId);
  return found ? found.name : null;
}

function getEyeTraits(
  eyeShapeValue: number,
  eyeColorValue: number
): GeneratorAttribute[] {
  return [
    { trait_type: 'Eye Shape', value: classifyRarityEyeShapes(eyeShapeValue) },
    { trait_type: 'Eye Color', value: classifyRarity(eyeColorValue) },
  ];
}

function convertWearablesToAttributes(
  equippedWearables: string[]
): GeneratorAttribute[] {
  const slots = [
    'Wearable (Body)',
    'Wearable (Face)',
    'Wearable (Eyes)',
    'Wearable (Head)',
    'Wearable (Hands)',
    'Wearable (Hands)',
    'Wearable (Pet)',
  ];

  const parsed = equippedWearables.map((s) => parseInt(s, 10));
  const attributes: GeneratorAttribute[] = [];
  for (let idx = 0; idx < parsed.length && idx < slots.length; idx++) {
    const wearableSvgId = parsed[idx];
    if (wearableSvgId > 0) {
      const name = getItemNameBySvgId(wearableSvgId);
      if (name) attributes.push({ trait_type: slots[idx], value: name });
    }
  }
  return attributes;
}

export function normalizeForGenerator(raw: RawAavegotchi): GeneratorGotchi {
  const id = parseInt(raw.id, 10);
  const collateral = getTokenFromCollats(raw.collateral);
  const attributes: GeneratorAttribute[] = [
    { trait_type: 'Base Body', value: collateral },
    ...getEyeTraits(raw.eyeShape, raw.eyeColor),
    ...convertWearablesToAttributes(raw.equippedWearables),
  ];
  return { id, collateral, attributes };
}

export function normalizeMany(raws: RawAavegotchi[]): GeneratorGotchi[] {
  return raws.map(normalizeForGenerator);
}
