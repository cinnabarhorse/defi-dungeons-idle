import {
  WEAPON_CATEGORY_DEFAULTS,
  WEAPON_DEFINITIONS,
  WEAPON_RARITY_MULTIPLIERS,
  GRENADE_MANA_COST_BY_RARITY,
  cloneAbilityInstance,
  type GrenadeWeaponDefinition,
  type WeaponAuthoringDefinition,
  type WeaponProfile,
} from './weapons';
import { ABILITIES, type AnyAbilityInstance } from './abilities';
import {
  DEFAULT_QUALITY_TIER,
  QUALITY_DEFAULT_LABELS,
  WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES,
  WEARABLE_QUALITY_OVERRIDES,
  getQualityScalar,
  normalizeQualityTier,
  type QualityTier,
} from './wearable-quality';

// Canonical wearable item-type slugs used across the dataset
export type WearableItemType =
  | 'basic-hat'
  | 'fancy-hat'
  | 'fancy-shirt'
  | 'fancy-suit'
  | 't-shirt'
  | 'pants'
  | 'dress'
  | 'robe'
  | 'vest'
  | 'athletic'
  | 'light-armor'
  | 'heavy-armor'
  | 'helmet'
  | 'mask'
  | 'face-mask'
  | 'beard'
  | 'other-facial-hair'
  | 'hair'
  | 'eyes'
  | 'glasses'
  | 'shades'
  | 'foxy-tail'
  | 'sign'
  | 'flag'
  | 'token'
  | 'aave-boat'
  | 'electronics'
  | 'cacti'
  | 'body-parts'
  | 'rofl'
  | 'exotic'
  | 'light'
  | 'lasso'
  | 'shield'
  | 'band'
  | 'staff'
  | 'axe'
  | 'hammer'
  | 'dagger'
  | 'spear'
  | 'claw'
  | 'gun'
  | 'bow'
  | 'sword'
  | 'grenade'
  | 'radar'
  | 'sus-butterfly'
  | 'accessories'
  | 'nimbus'
  | 'geo'
  | 'plant'
  | 'stohn'
  | 'fungi'
  | 'baby-licky';

export interface ItemTypes {
  svgId: number;
  name: string;
  setId: number[];
  allowedCollaterals: number[];
  minLevel: number;
  traitModifiers: number[];
  slotPositions: string;
  category: number;
  itemType?: WearableItemType;
  rarityLevel?: WearableRarity;
}

export const itemTypes: Record<number, ItemTypes> = {
  0: {
    svgId: 0,
    name: 'The Void',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: '',
    category: 0,
  },

  1: {
    svgId: 1,
    name: 'Camo Hat',
    setId: [1],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  2: {
    svgId: 2,
    name: 'Camo Pants',
    setId: [1],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  3: {
    svgId: 3,
    name: 'MK2 Grenade',
    setId: [1],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  4: {
    svgId: 4,
    name: 'Snow Camo Hat',
    setId: [2],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  5: {
    svgId: 5,
    name: 'Snow Camo Pants',
    setId: [2, 69],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  6: {
    svgId: 6,
    name: 'M67 Grenade',
    setId: [2],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  7: {
    svgId: 7,
    name: 'Marine Cap',
    setId: [3],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  8: {
    svgId: 8,
    name: 'Marine Jacket',
    setId: [3],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  9: {
    svgId: 9,
    name: 'Walkie Talkie',
    setId: [3],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 1, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'electronics',
  },
  10: {
    svgId: 10,
    name: 'Link White Hat',
    setId: [4],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  11: {
    svgId: 11,
    name: 'Link Mess Dress',
    setId: [4],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 2, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  12: {
    svgId: 12,
    name: 'Link Bubbly',
    setId: [4, 61],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, -2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  13: {
    svgId: 13,
    name: 'Sergey Beard',
    setId: [5, 6, 7, 68, 69],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 1, 0, 3, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'beard',
  },
  14: {
    svgId: 14,
    name: 'Sergey Eyes',
    setId: [5, 6, 7],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 4, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  15: {
    svgId: 15,
    name: 'Red Plaid',
    setId: [5],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-shirt',
  },
  16: {
    svgId: 16,
    name: 'Blue Plaid',
    setId: [6, 7],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-4, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-shirt',
  },
  17: {
    svgId: 17,
    name: 'Link Cube',
    setId: [7],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 6, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  18: {
    svgId: 18,
    name: 'Aave Hero Mask',
    setId: [8],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'face-mask',
  },
  19: {
    svgId: 19,
    name: 'Aave Hero Shirt',
    setId: [8, 61],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  20: {
    svgId: 20,
    name: 'Aave Plush',
    setId: [8],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  21: {
    svgId: 21,
    name: 'Captain Aave Mask',
    setId: [9],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'mask',
  },
  22: {
    svgId: 22,
    name: 'Captain Aave Suit',
    setId: [9],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  23: {
    svgId: 23,
    name: 'Captain Aave Shield',
    setId: [9],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  24: {
    svgId: 24,
    name: 'Thaave Helmet',
    setId: [10],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  25: {
    svgId: 25,
    name: 'Thaave Suit',
    setId: [10, 65],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  26: {
    svgId: 26,
    name: 'Thaave Hammer',
    setId: [10],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, 0, 0, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'hammer',
  },
  27: {
    svgId: 27,
    name: 'Marc Hair',
    setId: [11],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  28: {
    svgId: 28,
    name: 'Marc Outfit',
    setId: [11],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  29: {
    svgId: 29,
    name: 'REKT Sign',
    setId: [11, 62],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -4, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'sign',
  },
  30: {
    svgId: 30,
    name: 'Jordan Hair',
    setId: [12],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 3, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  31: {
    svgId: 31,
    name: 'Jordan Suit',
    setId: [12],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 1, 1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  32: {
    svgId: 32,
    name: 'Aave Flag',
    setId: [12, 13],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 3, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'flag',
  },
  33: {
    svgId: 33,
    name: 'Stani Hair',
    setId: [13, 14],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 3, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  34: {
    svgId: 34,
    name: 'Stani Vest',
    setId: [13, 14],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, -3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'vest',
  },
  35: {
    svgId: 35,
    name: 'Aave Boat',
    setId: [13, 14, 67],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -6, 0, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'aave-boat',
  },
  36: {
    svgId: 36,
    name: 'ETH Logo Glasses',
    setId: [15, 61],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  37: {
    svgId: 37,
    name: 'ETH Tshirt',
    setId: [15],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  38: {
    svgId: 38,
    name: '32 ETH Coin',
    setId: [15],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'token',
  },
  39: {
    svgId: 39,
    name: 'Foxy Mask',
    setId: [16],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'mask',
  },
  40: {
    svgId: 40,
    name: 'Foxy Tail',
    setId: [16, 61, 70],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, -1, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'foxy-tail',
  },
  41: {
    svgId: 41,
    name: 'Trezor Wallet',
    setId: [16],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'electronics',
  },
  42: {
    svgId: 42,
    name: 'Eagle Mask',
    setId: [17],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'mask',
  },
  43: {
    svgId: 43,
    name: 'Eagle Armor',
    setId: [17],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  44: {
    svgId: 44,
    name: 'DAO Egg',
    setId: [17],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 2, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'grenade',
  },
  45: {
    svgId: 45,
    name: 'Ape Mask',
    setId: [18, 62],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, -3, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'mask',
  },
  46: {
    svgId: 46,
    name: 'Halfrekt Shirt',
    setId: [18, 62],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 1, 0, -2, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  47: {
    svgId: 47,
    name: 'Waifu Pillow',
    setId: [18, 63],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -4, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  48: {
    svgId: 48,
    name: 'Xibot Mohawk',
    setId: [19],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [5, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  49: {
    svgId: 49,
    name: 'Coderdan Shades',
    setId: [19],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 5, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  50: {
    svgId: 50,
    name: 'GldnXross Robe',
    setId: [19],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 5, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'robe',
  },
  51: {
    svgId: 51,
    name: 'Mudgen Diamond',
    setId: [19, 21],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 5, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  52: {
    svgId: 52,
    name: 'Galaxy Brain',
    setId: [20, 21],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 6, 0, 0],
    slotPositions: 'head',
    category: 0,
  },
  53: {
    svgId: 53,
    name: 'All-Seeing Eyes',
    setId: [20, 21],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-6, 0, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  54: {
    svgId: 54,
    name: 'Llamacorn Shirt',
    setId: [20, 21],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, -3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  55: {
    svgId: 55,
    name: 'Aagent Headset',
    setId: [22, 23, 24],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 1, 1, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'electronics',
  },
  56: {
    svgId: 56,
    name: 'Aagent Shirt',
    setId: [22, 23, 24],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 1, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  57: {
    svgId: 57,
    name: 'Aagent Shades',
    setId: [22, 23, 24],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 2, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  58: {
    svgId: 58,
    name: 'Aagent Pistol',
    setId: [22, 24],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'gun',
  },
  59: {
    svgId: 59,
    name: 'Aagent Fedora Hat',
    setId: [22, 63],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  60: {
    svgId: 60,
    name: 'Common Wizard Hat',
    setId: [25, 29],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  61: {
    svgId: 61,
    name: 'Legendary Wizard Hat',
    setId: [26, 30],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  62: {
    svgId: 62,
    name: 'Mythical Wizard Hat',
    setId: [27, 31],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 3, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  63: {
    svgId: 63,
    name: 'Godlike Wizard Hat',
    setId: [28, 32],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 4, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  64: {
    svgId: 64,
    name: 'Common Wizard Staff',
    setId: [25, 26, 27, 28],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  65: {
    svgId: 65,
    name: 'Legendary Wizard Staff',
    setId: [29, 30, 31, 32],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, 2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  66: {
    svgId: 66,
    name: 'Wizard Visor',
    setId: [25, 26, 27, 28, 29, 30, 31, 32],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  67: {
    svgId: 67,
    name: 'Straw Hat',
    setId: [33, 34, 68],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  68: {
    svgId: 68,
    name: 'Farmer Jeans',
    setId: [33, 34, 68],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  69: {
    svgId: 69,
    name: 'Pitchfork',
    setId: [33, 68],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'spear',
  },
  70: {
    svgId: 70,
    name: 'Handsaw',
    setId: [34],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 0, -2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'light',
  },
  71: {
    svgId: 71,
    name: 'Red Santa Hat',
    setId: [69],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, -2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  72: {
    svgId: 72,
    name: 'Jaay Hairpiece',
    setId: [35, 36],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -5, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  73: {
    svgId: 73,
    name: 'Jaay Glasses',
    setId: [35, 36],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, -2, 0, -1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  74: {
    svgId: 74,
    name: 'Jaay Suit',
    setId: [35, 36, 63],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, -3, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  75: {
    svgId: 75,
    name: 'OKex Sign',
    setId: [36],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-5, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'sign',
  },
  76: {
    svgId: 76,
    name: 'Big GHST Token',
    setId: [64],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'token',
  },
  77: {
    svgId: 77,
    name: 'Bitcoin Beanie',
    setId: [37, 61, 65],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  78: {
    svgId: 78,
    name: 'Black Jeans',
    setId: [37],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  79: {
    svgId: 79,
    name: 'Skateboard',
    setId: [37],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, -2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  80: {
    svgId: 80,
    name: 'Sushi Bandana',
    setId: [38, 39, 40],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'band',
  },
  81: {
    svgId: 81,
    name: 'Sushi Coat',
    setId: [38, 39, 40],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 1, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'vest',
  },
  82: {
    svgId: 82,
    name: 'Sushi Piece',
    setId: [39, 40],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -4, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  83: {
    svgId: 83,
    name: 'Sushi Knife',
    setId: [38],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'dagger',
  },
  84: {
    svgId: 84,
    name: 'Gentleman Hat',
    setId: [41],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -3, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  85: {
    svgId: 85,
    name: 'Gentleman Coat',
    setId: [41],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  86: {
    svgId: 86,
    name: 'Monocle',
    setId: [41],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 3, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  87: {
    svgId: 87,
    name: 'Miner Helmet',
    setId: [42],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  88: {
    svgId: 88,
    name: 'Miner Jeans',
    setId: [42],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  89: {
    svgId: 89,
    name: 'Pickaxe',
    setId: [42, 65],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 2, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'hammer',
  },
  90: {
    svgId: 90,
    name: 'Pajama Hat',
    setId: [43, 44, 45, 66],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  91: {
    svgId: 91,
    name: 'Pajama Shirt',
    setId: [43, 44, 45, 66],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, -1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
  },
  92: {
    svgId: 92,
    name: 'Bedtime Milk',
    setId: [43, 45],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, -1, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  93: {
    svgId: 93,
    name: 'Fluffy Pillow',
    setId: [45],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -4, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  94: {
    svgId: 94,
    name: 'Sweatband',
    setId: [46, 47, 48, 49],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'band',
  },
  95: {
    svgId: 95,
    name: 'Track Shorts',
    setId: [47, 48],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  96: {
    svgId: 96,
    name: 'Water bottle',
    setId: [46, 48],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  97: {
    svgId: 97,
    name: 'Pillbox Hat',
    setId: [50, 51, 52],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -1, -2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  98: {
    svgId: 98,
    name: 'Day Dress',
    setId: [50, 51, 52],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -1, -2, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'dress',
  },
  99: {
    svgId: 99,
    name: 'Parasol',
    setId: [51, 52],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -1, -3, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'light',
  },
  100: {
    svgId: 100,
    name: 'Clutch',
    setId: [50, 52],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -2, -2, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  101: {
    svgId: 101,
    name: 'Witchy Hat',
    setId: [53],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 3, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  102: {
    svgId: 102,
    name: 'Witchy Cloak',
    setId: [53],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 3, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  103: {
    svgId: 103,
    name: 'Witchy Wand',
    setId: [53],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 2, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  104: {
    svgId: 104,
    name: 'Portal Mage Helmet',
    setId: [54, 55],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 1, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  105: {
    svgId: 105,
    name: 'Portal Mage Armor',
    setId: [54, 55],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 2, 2, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'heavy-armor',
  },
  106: {
    svgId: 106,
    name: 'Portal Mage Axe',
    setId: [54, 69],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 4, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'axe',
  },
  107: {
    svgId: 107,
    name: 'Portal Mage Black Axe',
    setId: [55],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 6, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'axe',
  },
  108: {
    svgId: 108,
    name: 'Rasta Hat',
    setId: [56],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  109: {
    svgId: 109,
    name: 'Rasta Shirt',
    setId: [56, 70],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -1, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  110: {
    svgId: 110,
    name: 'Jamaican Flag',
    setId: [56],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -2, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'flag',
  },
  111: {
    svgId: 111,
    name: 'Hazmat Hood',
    setId: [57, 58],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -1, 2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  112: {
    svgId: 112,
    name: 'Hazmat Suit',
    setId: [57, 58],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, -1, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'heavy-armor',
  },
  113: {
    svgId: 113,
    name: 'Uranium Rod',
    setId: [58],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [6, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  114: {
    svgId: 114,
    name: 'Red Hawaiian Shirt',
    setId: [60, 67],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  115: {
    svgId: 115,
    name: 'Blue Hawaiian Shirt',
    setId: [59, 64],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  116: {
    svgId: 116,
    name: 'Coconut',
    setId: [59, 60],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -3, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  117: {
    svgId: 117,
    name: 'Cool shades',
    setId: [59, 60, 67],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  118: {
    svgId: 118,
    name: 'Water Jug',
    setId: [47, 49],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, 2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  119: {
    svgId: 119,
    name: 'Baby Bottle',
    setId: [66],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, -3, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  120: {
    svgId: 120,
    name: 'Martini',
    setId: [67],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, -3, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  121: {
    svgId: 121,
    name: 'Wine',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -3, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  122: {
    svgId: 122,
    name: 'Milkshake',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -5, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  123: {
    svgId: 123,
    name: 'Apple Juice',
    setId: [57],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  124: {
    svgId: 124,
    name: 'Beer Helmet',
    setId: [70],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -5, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  125: {
    svgId: 125,
    name: 'Track Suit',
    setId: [48, 49],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'athletic',
  },
  126: {
    svgId: 126,
    name: 'Kinship Potion',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: '',
    category: 2,
  },
  127: {
    svgId: 127,
    name: 'Greater Kinship Potion',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: '',
    category: 2,
  },
  128: {
    svgId: 128,
    name: 'XP Potion',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: '',
    category: 2,
  },
  129: {
    svgId: 129,
    name: 'Greater XP Potion',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: '',
    category: 2,
  },
  130: {
    svgId: 130,
    name: 'Fireball',
    setId: [73, 74],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  131: {
    svgId: 131,
    name: 'Dragon Horns',
    setId: [73, 86],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
  },
  132: {
    svgId: 132,
    name: 'Dragon Wings',
    setId: [73, 74, 86],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
  },
  133: {
    svgId: 133,
    name: 'Pointy Horns',
    setId: [74],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
  },
  134: {
    svgId: 134,
    name: 'L2 Sign',
    setId: [72],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'sign',
  },
  135: {
    svgId: 135,
    name: 'Polygon Shirt',
    setId: [72],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 2, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  136: {
    svgId: 136,
    name: 'Polygon Cap',
    setId: [72],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  137: {
    svgId: 137,
    name: 'Vote Sign',
    setId: [71],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 0, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'sign',
  },
  138: {
    svgId: 138,
    name: 'Snapshot Shirt',
    setId: [71],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  139: {
    svgId: 139,
    name: 'Snapshot Cap',
    setId: [71],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  140: {
    svgId: 140,
    name: 'Elf Ears',
    setId: [75, 76, 77, 78],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'body-parts',
  },
  141: {
    svgId: 141,
    name: 'Gemstone Ring',
    setId: [75, 76, 77, 78],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'token',
  },
  142: {
    svgId: 142,
    name: 'Princess Tiara',
    setId: [75, 76],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, 1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  143: {
    svgId: 143,
    name: 'Gold Necklace',
    setId: [76, 77, 78],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
  },
  144: {
    svgId: 144,
    name: 'Princess Hair',
    setId: [77],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -3, 2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  145: {
    svgId: 145,
    name: 'Godli Locks',
    setId: [78],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -4, 2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  146: {
    svgId: 146,
    name: 'Imperial Moustache',
    setId: [79, 80, 81, 82, 85],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'other-facial-hair',
  },
  147: {
    svgId: 147,
    name: 'Tiny Crown',
    setId: [79, 80],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  148: {
    svgId: 148,
    name: 'Royal Scepter',
    setId: [79, 80, 81, 82],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, -1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  149: {
    svgId: 149,
    name: 'Royal Crown',
    setId: [81, 82],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, -2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  150: {
    svgId: 150,
    name: 'Royal Robes',
    setId: [80, 81, 812],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, -2, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  151: {
    svgId: 151,
    name: 'Common Rofl',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  152: {
    svgId: 152,
    name: 'Uncommon Rofl',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, -1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  153: {
    svgId: 153,
    name: 'Rare Rofl',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, -2, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  154: {
    svgId: 154,
    name: 'Legendary Rofl',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, -2, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  155: {
    svgId: 155,
    name: 'Mythical Rofl',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, -3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  156: {
    svgId: 156,
    name: 'Godlike Rofl',
    setId: [82],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, -3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'rofl',
  },
  157: {
    svgId: 157,
    name: 'Lil Pump Goatee',
    setId: [83, 84],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 1, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'other-facial-hair',
  },
  158: {
    svgId: 158,
    name: 'Lil Pump Drank',
    setId: [83, 84],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 2, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  159: {
    svgId: 159,
    name: 'Lil Pump Shades',
    setId: [83, 84],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 1, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  160: {
    svgId: 160,
    name: 'Lil Pump Threads',
    setId: [83, 84],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [5, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  161: {
    svgId: 161,
    name: 'Lil Pump Dreads',
    setId: [83],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [4, 2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },

  162: {
    svgId: 162,
    name: 'Miami Shirt',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },

  199: {
    svgId: 199,
    name: 'Steampunk Goggles',
    setId: [89],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 3, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  200: {
    svgId: 200,
    name: 'Steampunk Trousers',
    setId: [89],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  201: {
    svgId: 201,
    name: 'Mechanical Claw',
    setId: [89],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 2, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'exotic',
  },
  202: {
    svgId: 202,
    name: 'VR Headset',
    setId: [88, 92],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 3, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  203: {
    svgId: 203,
    name: 'Gamer Jacket',
    setId: [88, 90],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-shirt',
  },
  204: {
    svgId: 204,
    name: 'Game Controller',
    setId: [88, 90],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'electronics',
  },
  205: {
    svgId: 205,
    name: 'Gotchi Mug',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  206: {
    svgId: 206,
    name: 'Biker Helmet',
    setId: [93],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  207: {
    svgId: 207,
    name: 'Biker Jacket',
    setId: [93],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  208: {
    svgId: 208,
    name: 'Aviators',
    setId: [93],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  209: {
    svgId: 209,
    name: 'Horsehoe Mustache',
    setId: [93],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 2, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'other-facial-hair',
  },
  210: {
    svgId: 210,
    name: 'Haunt1 BG',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'background',
    category: 0,
  },
  211: {
    svgId: 211,
    name: 'Guy Fawkes Mask',
    setId: [94, 114],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'mask',
  },
  212: {
    svgId: 212,
    name: '1337 Laptop',
    setId: [94, 95, 112, 114],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, 3, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  213: {
    svgId: 213,
    name: 'H4xx0r Shirt',
    setId: [94, 95],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-4, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  214: {
    svgId: 214,
    name: 'Matrix Eyes',
    setId: [95],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, -3, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  215: {
    svgId: 215,
    name: 'Cyborg Eye',
    setId: [96],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  216: {
    svgId: 216,
    name: 'Rainbow Vomit',
    setId: [96],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -5, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
  },
  217: {
    svgId: 217,
    name: 'Energy Gun',
    setId: [96],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 3, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'gun',
  },
  218: {
    svgId: 218,
    name: 'Mohawk',
    setId: [97],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  219: {
    svgId: 219,
    name: 'Mutton Chops',
    setId: [97],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, -1, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'other-facial-hair',
  },
  220: {
    svgId: 220,
    name: 'Punk Shirt',
    setId: [97],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  221: {
    svgId: 221,
    name: 'Pirate Hat',
    setId: [98],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  222: {
    svgId: 222,
    name: 'Pirate Coat',
    setId: [98],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'fancy-suit',
  },
  223: {
    svgId: 223,
    name: 'Hook Hand',
    setId: [98],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, -1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'light',
  },
  224: {
    svgId: 224,
    name: 'Pirate Patch',
    setId: [98],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, -1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  225: {
    svgId: 225,
    name: 'Basketball',
    setId: [99],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  226: {
    svgId: 226,
    name: 'Red Headband',
    setId: [99],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, -1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
  },
  227: {
    svgId: 227,
    name: '23 Jersey',
    setId: [99],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  228: {
    svgId: 228,
    name: '10 Gallon Hat',
    setId: [100, 113],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  229: {
    svgId: 229,
    name: 'Lasso',
    setId: [100],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'lasso',
  },
  230: {
    svgId: 230,
    name: 'Wraangler Jeans',
    setId: [100],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  231: {
    svgId: 231,
    name: 'Comfy Poncho',
    setId: [101, 102, 103, 104, 113],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'robe',
  },
  232: {
    svgId: 232,
    name: 'Poncho Hoodie',
    setId: [101, 102, 103, 104],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  233: {
    svgId: 233,
    name: 'Uncommon Cacti',
    setId: [101, 105],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'cacti',
  },
  234: {
    svgId: 234,
    name: 'Shaaman Poncho',
    setId: [105, 106, 107, 108, 111],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-5, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'robe',
  },
  235: {
    svgId: 235,
    name: 'Shaaman Hoodie',
    setId: [105, 106, 107, 108, 111],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-4, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  236: {
    svgId: 236,
    name: 'Rare Cacti',
    setId: [102, 106],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 2, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'cacti',
  },
  237: {
    svgId: 237,
    name: 'Mythical Cacti',
    setId: [103, 107],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, 3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'cacti',
  },
  238: {
    svgId: 238,
    name: 'Godlike Cacti',
    setId: [104, 108, 111],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -3, 3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'cacti',
  },
  239: {
    svgId: 239,
    name: 'Wagie Cap',
    setId: [109],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  240: {
    svgId: 240,
    name: 'Headphones',
    setId: [109],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'electronics',
  },
  241: {
    svgId: 241,
    name: 'WGMI Shirt',
    setId: [109],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  242: {
    svgId: 242,
    name: 'Maan Bun',
    setId: [110, 112],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, -2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  243: {
    svgId: 243,
    name: 'Tinted Shades',
    setId: [110, 112],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  244: {
    svgId: 244,
    name: 'V-Neck Shirt',
    setId: [110, 112],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  245: {
    svgId: 245,
    name: 'Gecko Hat',
    setId: [117],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -3, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'basic-hat',
  },
  246: {
    svgId: 246,
    name: 'APY Shades',
    setId: [122],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  247: {
    svgId: 247,
    name: 'Up Arrow',
    setId: [122],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'light',
  },
  248: {
    svgId: 248,
    name: 'Up Only Shirt',
    setId: [122],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  249: {
    svgId: 249,
    name: 'Gecko Eyes',
    setId: [116, 117],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, -1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  250: {
    svgId: 250,
    name: 'CoinGecko Tee',
    setId: [116, 117],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  251: {
    svgId: 251,
    name: 'Candy Jaar',
    setId: [116, 117],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, -2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'grenade',
  },
  252: {
    svgId: 252,
    name: 'Aastronaut Helmet',
    setId: [115],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  253: {
    svgId: 253,
    name: 'Aastronaut Suit',
    setId: [115],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  254: {
    svgId: 254,
    name: 'uGOTCHI Token',
    setId: [115],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'token',
  },
  255: {
    svgId: 255,
    name: 'Space Helmet',
    setId: [118],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, -2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  256: {
    svgId: 256,
    name: 'Lil Bubble Space Suit',
    setId: [118],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'heavy-armor',
  },
  257: {
    svgId: 257,
    name: 'Bitcoin Guitar',
    setId: [118],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [4, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'hammer',
  },
  258: {
    svgId: 258,
    name: 'Taoist Robe',
    setId: [120, 121],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, 3, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'robe',
  },
  259: {
    svgId: 259,
    name: 'Bushy Eyebrows',
    setId: [120, 121],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, 3, 0, 0],
    slotPositions: 'eyes',
    category: 0,
  },
  260: {
    svgId: 260,
    name: 'Beard of Wisdom',
    setId: [120, 121],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, 0, 4, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'beard',
  },
  261: {
    svgId: 261,
    name: 'Aantenna Bot',
    setId: [119],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'radar',
  },
  262: {
    svgId: 262,
    name: 'Radar Eyes',
    setId: [119],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 3, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  263: {
    svgId: 263,
    name: 'Signal Headset',
    setId: [119],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 3, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'electronics',
  },
  264: {
    svgId: 264,
    name: 'Aastronaut Crew Member',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 0,
  },
  292: {
    svgId: 292,
    name: 'Brunette Ponytail',
    setId: [123, 142],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  293: {
    svgId: 293,
    name: 'Leather Tunic',
    setId: [123, 125, 132, 142, 143],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  294: {
    svgId: 294,
    name: 'Bow and Arrow',
    setId: [123, 132, 142],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'bow',
  },
  295: {
    svgId: 295,
    name: 'Forked Beard',
    setId: [124],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'beard',
  },
  296: {
    svgId: 296,
    name: 'Doublesided Axe',
    setId: [124, 141],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 1, 0, -1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'axe',
  },
  297: {
    svgId: 297,
    name: 'Animal Skins',
    setId: [124, 141],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  298: {
    svgId: 298,
    name: 'Horned Helmet',
    setId: [124, 141],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  299: {
    svgId: 299,
    name: 'Longbow',
    setId: [125, 143],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 1, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'bow',
  },
  300: {
    svgId: 300,
    name: 'Feathered Cap',
    setId: [125, 132, 143],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, -1, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  301: {
    svgId: 301,
    name: 'Alluring Eyes',
    setId: [126, 133],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  302: {
    svgId: 302,
    name: 'Geisha Headpiece',
    setId: [126, 133, 134],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, -1, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  303: {
    svgId: 303,
    name: 'Kimono',
    setId: [126, 133, 134],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'dress',
  },
  304: {
    svgId: 304,
    name: 'Paper Fan',
    setId: [126, 133, 134],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -3, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'light',
  },
  305: {
    svgId: 305,
    name: 'Sus Butterfly',
    setId: [128],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 4, 0, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'sus-butterfly',
  },
  306: {
    svgId: 306,
    name: 'Flower Studs',
    setId: [127, 128, 135, 136, 137],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, -2, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'accessories',
  },
  307: {
    svgId: 307,
    name: 'Fairy Wings',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, -2, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  308: {
    svgId: 308,
    name: 'Red Hair',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-2, 0, -2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  309: {
    svgId: 309,
    name: 'Citaadel Helm',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, -2, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  310: {
    svgId: 310,
    name: 'Plate Armor',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'heavy-armor',
  },
  311: {
    svgId: 311,
    name: 'Spirit Sword',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, -3, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'sword',
  },
  312: {
    svgId: 312,
    name: 'Plate Shield',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -5, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  313: {
    svgId: 313,
    name: 'Kabuto Helmet',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 3, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  314: {
    svgId: 314,
    name: 'Yoroi Armor',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 3, 3, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'heavy-armor',
  },
  315: {
    svgId: 315,
    name: 'Haanzo Katana',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 4, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'sword',
  },
  316: {
    name: 'CHAAMPION of Rarity Farming SZN3 (Rarity)',
    svgId: 316,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  317: {
    name: 'CHAAMPION of Rarity Farming SZN3 (Kinship)',
    svgId: 317,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  318: {
    name: 'CHAAMPION of Rarity Farming SZN3 (XP)',
    svgId: 318,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  319: {
    name: 'Rarity Farming SZN3 RARITY 2nd Place',
    svgId: 319,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  320: {
    name: 'Rarity Farming SZN3 KINSHIP 2nd Place',
    svgId: 320,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  321: {
    name: 'Rarity Farming SZN3 XP 2nd Place',
    svgId: 321,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  322: {
    name: 'Rarity Farming SZN3 RARITY 3rd Place',
    svgId: 322,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  323: {
    name: 'Rarity Farming SZN3 KINSHIP 3rd Place',
    svgId: 323,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  324: {
    name: 'Rarity Farming SZN3 XP 3rd Place',
    svgId: 324,
    minLevel: 0,
    // rarityLevel: "godlike",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  325: {
    name: 'Rarity Farming SZN3 Raanked',
    svgId: 325,
    minLevel: 0,
    // rarityLevel: "common",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  326: {
    name: 'Rarity Farming SZN3 RARITY Top 10',
    svgId: 326,
    minLevel: 0,
    // rarityLevel: "mythical",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  327: {
    name: 'Rarity Farming SZN3 KINSHIP Top 10',
    svgId: 327,
    minLevel: 0,
    // rarityLevel: "mythical",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  328: {
    name: 'Rarity Farming SZN3 XP Top 10',
    svgId: 328,
    minLevel: 0,
    // rarityLevel: "mythical",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  329: {
    name: 'Rarity Farming SZN3 RARITY Top 100',
    svgId: 329,
    minLevel: 0,
    // rarityLevel: "legendary",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  330: {
    name: 'Rarity Farming SZN3 KINSHIP Top 100',
    svgId: 330,
    minLevel: 0,
    // rarityLevel: "legendary",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  331: {
    name: 'Rarity Farming SZN3 XP Top 100',
    svgId: 331,
    minLevel: 0,
    // rarityLevel: "legendary",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  332: {
    name: 'GOTCHI SMAASH 2022 Haalloween Party',
    svgId: 332,
    minLevel: 0,
    // rarityLevel: "common",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  333: {
    name: 'TOOORKEY CHAASE 2022 Thanksgiving Party',
    svgId: 333,
    minLevel: 0,
    // rarityLevel: "common",
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },

  334: {
    name: 'CHAAMPION of Rarity Farming SZN4 (Rarity)',
    svgId: 334,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  335: {
    name: 'CHAAMPION of Rarity Farming SZN4 (Kinship)',
    svgId: 335,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  336: {
    name: 'CHAAMPION of Rarity Farming SZN4 (XP)',
    svgId: 336,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  337: {
    name: 'Rarity Farming SZN4 RARITY 2nd Place',
    svgId: 337,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  338: {
    name: 'Rarity Farming SZN4 KINSHIP 2nd Place',
    svgId: 338,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  339: {
    name: 'Rarity Farming SZN4 XP 2nd Place',
    svgId: 339,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  340: {
    name: 'Rarity Farming SZN4 RARITY 3rd Place',
    svgId: 340,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  341: {
    name: 'Rarity Farming SZN4 KINSHIP 3rd Place',
    svgId: 341,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  342: {
    name: 'Rarity Farming SZN4 XP 3rd Place',
    svgId: 342,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  343: {
    name: 'Rarity Farming SZN4 Raanked',
    svgId: 343,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  344: {
    name: 'Rarity Farming SZN4 RARITY Top 10',
    svgId: 344,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  345: {
    name: 'Rarity Farming SZN4 KINSHIP Top 10',
    svgId: 345,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  346: {
    name: 'Rarity Farming SZN4 XP Top 10',
    svgId: 346,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  347: {
    name: 'Rarity Farming SZN4 RARITY Top 100',
    svgId: 347,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  348: {
    name: 'Rarity Farming SZN4 KINSHIP Top 100',
    svgId: 348,
    minLevel: 0,

    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  349: {
    name: 'Rarity Farming SZN4 XP Top 100',
    svgId: 349,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  350: {
    svgId: 350,
    name: 'Pixelcraft Tee',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "common",
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  351: {
    svgId: 351,
    name: '3D Glasses',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "common",
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  352: {
    svgId: 352,
    name: 'Pixelcraft Square',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "common",
    traitModifiers: [0, 0, -1, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  353: {
    svgId: 353,
    name: 'Nimbus',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "common",
    traitModifiers: [0, -1, 0, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'nimbus',
  },
  354: {
    svgId: 354,
    name: 'Alchemica Apron',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "uncommon",
    traitModifiers: [1, 0, 0, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  355: {
    svgId: 355,
    name: 'Safety Glasses',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "rare",
    traitModifiers: [1, 2, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  356: {
    svgId: 356,
    name: 'Bandage',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "uncommon",
    traitModifiers: [0, 0, 1, -1, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'accessories',
  },
  357: {
    svgId: 357,
    name: 'Nail Gun',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "rare",
    traitModifiers: [1, 0, 2, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'gun',
  },
  358: {
    svgId: 358,
    name: 'Flaming Apron',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "legendary",
    traitModifiers: [-2, -2, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'light-armor',
  },
  359: {
    svgId: 359,
    name: 'Forge Goggles',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "legendary",
    traitModifiers: [-1, -3, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  360: {
    svgId: 360,
    name: 'Geode Smasher',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "legendary",
    traitModifiers: [0, 0, 2, 2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'hammer',
  },
  361: {
    svgId: 361,
    name: 'Geo',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "legendary",
    traitModifiers: [0, -2, 2, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'geo',
  },
  362: {
    svgId: 362,
    name: 'FAKE Shirt',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "mythical",
    traitModifiers: [0, 0, -4, -1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  363: {
    svgId: 363,
    name: 'FAKE Beret',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "mythical",
    traitModifiers: [-3, 0, 0, -2, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'fancy-hat',
  },
  364: {
    svgId: 364,
    name: 'Paint Brush',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "mythical",
    traitModifiers: [-3, 0, -2, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  365: {
    svgId: 365,
    name: 'Paint Palette',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "mythical",
    traitModifiers: [0, 0, -1, -4, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'shield',
  },
  366: {
    svgId: 366,
    name: 'Heavenly Robes',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "godlike",
    traitModifiers: [4, 0, 0, -2, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'robe',
  },
  367: {
    svgId: 367,
    name: 'Eyes of Devotion',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "godlike",
    traitModifiers: [0, 0, -3, -3, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  368: {
    svgId: 368,
    name: 'Beard of Divinity',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "godlike",
    traitModifiers: [0, 0, -3, -3, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'beard',
  },
  369: {
    svgId: 369,
    name: 'Staff of Creation',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    // rarityLevel: "godlike",
    traitModifiers: [0, 0, -3, -3, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  370: {
    svgId: 370,
    name: 'Wavy Hair',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  371: {
    svgId: 371,
    name: 'Plastic Earrings',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, 0, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'accessories',
  },
  372: {
    svgId: 372,
    name: 'Party Dress',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'dress',
  },
  373: {
    svgId: 373,
    name: 'Overalls',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 'pants',
  },
  374: {
    svgId: 374,
    name: 'Lens Frens Plant',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, -1, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'plant',
  },
  375: {
    svgId: 375,
    name: 'GM Seeds',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -1, 0, 0, 0],
    slotPositions: 'handRight',
    category: 0,
    itemType: 'grenade',
  },
  376: {
    svgId: 376,
    name: 'Lick Brain',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, -1, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  377: {
    svgId: 377,
    name: 'Lick Eyes',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -2, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  378: {
    svgId: 378,
    name: 'Lick Tongue',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, -3, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'body-parts',
  },
  379: {
    svgId: 379,
    name: 'Lick Tentacle',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, 0, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'exotic',
  },
  380: {
    svgId: 380,
    name: 'Sebastien Hair',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, -2, 0, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
  381: {
    svgId: 381,
    name: 'Voxel Eyes',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -3, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'eyes',
  },
  382: {
    svgId: 382,
    name: 'GOATee',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [1, -3, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'beard',
  },
  383: {
    svgId: 383,
    name: 'Sandbox Hoodie',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, -1, 0, 0, 0, 0],
    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  384: {
    svgId: 384,
    name: 'Faangs',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 5, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'body-parts',
  },
  385: {
    svgId: 385,
    name: 'Block Scanners',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [6, 0, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  386: {
    svgId: 386,
    name: 'Staff of Charming',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-4, 0, 0, -2, 0, 0],
    slotPositions: 'hands',
    category: 0,
    itemType: 'staff',
  },
  387: {
    svgId: 387,
    name: 'Roflnoggin',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -6, 0, 0],
    slotPositions: 'head',
    category: 0,
    itemType: 'helmet',
  },
  388: {
    name: 'CHAAMPION of Rarity Farming SZN5 (Rarity)',
    svgId: 388,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  389: {
    name: 'CHAAMPION of Rarity Farming SZN5 (Kinship)',
    svgId: 389,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  390: {
    name: 'CHAAMPION of Rarity Farming SZN5 (XP)',
    svgId: 390,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  391: {
    name: 'Rarity Farming SZN5 RARITY 2nd Place',
    svgId: 391,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  392: {
    name: 'Rarity Farming SZN5 KINSHIP 2nd Place',
    svgId: 392,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  393: {
    name: 'Rarity Farming SZN5 XP 2nd Place',
    svgId: 393,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  394: {
    name: 'Rarity Farming SZN5 RARITY 3rd Place',
    svgId: 394,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  395: {
    name: 'Rarity Farming SZN5 KINSHIP 3rd Place',
    svgId: 395,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  396: {
    name: 'Rarity Farming SZN5 XP 3rd Place',
    svgId: 396,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  397: {
    name: 'Rarity Farming SZN5 Raanked',
    svgId: 397,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  398: {
    name: 'Rarity Farming SZN5 RARITY Top 10',
    svgId: 398,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  399: {
    name: 'Rarity Farming SZN5 KINSHIP Top 10',
    svgId: 399,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  400: {
    name: 'Rarity Farming SZN5 XP Top 10',
    svgId: 400,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  401: {
    name: 'Rarity Farming SZN5 RARITY Top 100',
    svgId: 401,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  402: {
    name: 'Rarity Farming SZN5 KINSHIP Top 100',
    svgId: 402,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  403: {
    name: 'Rarity Farming SZN5 XP Top 100',
    svgId: 403,
    minLevel: 0,
    setId: [],
    allowedCollaterals: [],
    traitModifiers: [0, 0, 0, 0, 0, 0],
    slotPositions: 'none',
    category: 1,
  },
  404: {
    svgId: 404,
    name: 'Granny Glasses',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 0, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  405: {
    svgId: 405,
    name: 'Freckles',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -1, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'body-parts',
  },
  406: {
    svgId: 406,
    name: 'Common Stohn',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, 1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'stohn',
  },
  407: {
    svgId: 407,
    name: 'Based Shades',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 2, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'shades',
  },
  408: {
    svgId: 408,
    name: 'Rasta Glasses',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, 0, 0, 0, 0],
    slotPositions: 'eyes',
    category: 0,
    itemType: 'glasses',
  },
  409: {
    svgId: 409,
    name: 'Braces',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-1, 1, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'accessories',
  },
  410: {
    svgId: 410,
    name: 'Uncommon Stohn',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 1, 1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'stohn',
  },
  411: {
    svgId: 411,
    name: 'Aloha Flowers',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [-3, 0, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'accessories',
  },
  412: {
    svgId: 412,
    name: 'Baable Gum',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [3, 0, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'grenade',
  },
  413: {
    svgId: 413,
    name: 'Rare Stohn',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 2, 1, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'stohn',
  },
  414: {
    svgId: 414,
    name: 'Cheap Mask',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 2, 0, 0, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'face-mask',
  },
  415: {
    svgId: 415,
    name: 'Wild Fungi',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, -2, -2, 0, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'fungi',
  },
  416: {
    svgId: 416,
    name: 'Kawaii Mouth',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [0, 0, 0, -5, 0, 0],
    slotPositions: 'face',
    category: 0,
    itemType: 'body-parts',
  },
  417: {
    svgId: 417,
    name: 'Baby Licky',
    setId: [],
    allowedCollaterals: [],
    minLevel: 1,
    traitModifiers: [2, 0, 0, -3, 0, 0],
    slotPositions: 'pet',
    category: 0,
    itemType: 'baby-licky',
  },
  418: {
    svgId: 418,
    name: 'Based Shirt',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,

    traitModifiers: [0, -1, 0, 0, 0, 0],

    slotPositions: 'body',
    category: 0,
    itemType: 't-shirt',
  },
  419: {
    svgId: 419,
    name: 'Base App',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,

    traitModifiers: [0, 0, 0, 3, 0, 0],

    slotPositions: 'hands',
    category: 0,
    itemType: 'electronics',
  },
  420: {
    svgId: 420,
    name: 'Jesse Pollak Hair',
    setId: [],

    allowedCollaterals: [],
    minLevel: 1,

    traitModifiers: [2, -2, 0, 0, 0, 0],

    slotPositions: 'head',
    category: 0,
    itemType: 'hair',
  },
};

export const EQUIPMENT_STATS = [
  'maxHealth',
  'damage',
  'damageMin',
  'damageMax',
  'totalDamage',
  'attackSpeed',
  'meleeAttackRange',
  'rangedAttackRange',
  'projectileSpeed',
  'movementSpeed',
  'armor',
  'hpRegen',
] as const;

export type EquipmentStat = (typeof EQUIPMENT_STATS)[number];

export const EQUIPMENT_STAT_LABELS = {
  maxHealth: 'Max Health',
  damage: 'Damage',
  damageMin: 'Min Damage',
  damageMax: 'Max Damage',
  totalDamage: 'Total Damage',
  attackSpeed: 'Attack Speed',
  meleeAttackRange: 'Melee Range',
  rangedAttackRange: 'Ranged Range',
  projectileSpeed: 'Projectile Speed',
  movementSpeed: 'Move Speed',
  armor: 'Armor',
  hpRegen: 'HP Regen',
} as const satisfies Record<EquipmentStat, string>;

export interface StatConfig {
  op: 'add' | 'mul' | 'add_percent';
  isPercent?: boolean;
  clamp?: readonly [number, number];
}

export const STAT_CONFIG = {
  maxHealth: { op: 'add' },
  damage: { op: 'add' },
  damageMin: { op: 'add' },
  damageMax: { op: 'add' },
  totalDamage: { op: 'mul' },
  attackSpeed: { op: 'add' },
  meleeAttackRange: { op: 'add' },
  rangedAttackRange: { op: 'add' },
  projectileSpeed: { op: 'add' },
  movementSpeed: { op: 'mul' },
  armor: { op: 'add' },
  hpRegen: { op: 'add' },
} satisfies Record<EquipmentStat, StatConfig>;

export function isEquipmentStat(value: string): value is EquipmentStat {
  return (EQUIPMENT_STATS as readonly string[]).includes(value);
}

export const STAT = EQUIPMENT_STATS.reduce(
  (acc, stat) => {
    acc[stat] = stat;
    return acc;
  },
  {} as Record<EquipmentStat, EquipmentStat>
);

export type EquipmentModifierOperation = 'add' | 'mul' | 'add_percent';

export interface EquipmentStatModifier {
  stat: EquipmentStat;
  value: number;
  operation?: EquipmentModifierOperation;
  min?: number;
  max?: number;
}

export interface StatEquipmentEffect {
  type: 'stat';
  modifiers: EquipmentStatModifier[];
}

export interface TagEffect {
  type: 'tag';
  tags: string[];
}

export interface AuraEffect {
  type: 'aura';
  color?: string;
  level?: number;
}

export interface AbilityEffect {
  type: 'ability';
  abilitySlug: string;
  params?: Record<string, unknown>;
}

export type EquipmentEffect =
  | StatEquipmentEffect
  | TagEffect
  | AuraEffect
  | AbilityEffect;

export type WearableSlot =
  | 'head'
  | 'body'
  | 'face'
  | 'eyes'
  | 'handLeft'
  | 'handRight'
  | 'pet'
  | 'background'
  | 'none';

const VALID_WEARABLE_SLOTS: Set<WearableSlot> = new Set([
  'head',
  'body',
  'face',
  'eyes',
  'handLeft',
  'handRight',
  'pet',
  'background',
  'none',
]);

const HAND_SLOT_ITEM_TYPES = [
  'grenade',
  'shield',
  'flag',
  'sign',
  'staff',
  'bow',
  'gun',
  'lasso',
  'sword',
  'axe',
  'hammer',
  'spear',
  'dagger',
  'light',
  'exotic',
  'electronics',
  'token',
];

export const ITEM_TYPES_BY_SLOT: Record<WearableSlot, string[]> = {
  head: ['basic-hat', 'fancy-hat', 'mask', 'hair', 'helmet', 'band'],
  body: [
    't-shirt',
    'pants',
    'dress',
    'fancy-suit',
    'light-armor',
    'heavy-armor',
    'robe',
    'fancy-shirt',
    'athletic',
    'vest',
  ],
  face: [
    'beard',
    'face-mask',
    'other-facial-hair',
    'accessories',
    'body-parts',
    'electronics',
  ],
  eyes: ['eyes', 'glasses', 'shades'],
  handLeft: HAND_SLOT_ITEM_TYPES,
  handRight: HAND_SLOT_ITEM_TYPES,
  pet: [
    'rofl', //+movement, +damage
    'sus-butterfly', //+evasion
    'baby-licky', //+lick tongue,
    'aave-boat', //+movement,
    'cacti', //thorns aura (damage reflection)
    'nimbus', //+movement, +evasion
    'radar', //+gold find
    'foxy-tail', //+magic find
    'geo', //+armor, +damage
    'plant', //+hp regen
    'stohn', //+armor, +attack range
    'fungi', //+hp regen, +hp max
  ],
  background: [],
  none: [],
};

export type ItemTypeEffectsByRarity = Partial<
  Record<
    WearableSlot,
    Record<string, Partial<Record<WearableRarity, EquipmentEffect[]>>>
  >
>;

function statsByRarity(
  specs: {
    stat: EquipmentStat;
    operation?: EquipmentModifierOperation;
    values: [number, number, number, number, number, number];
  }[]
): Partial<Record<WearableRarity, EquipmentEffect[]>> {
  const tiers: WearableRarity[] = [
    'common',
    'uncommon',
    'rare',
    'legendary',
    'mythical',
    'godlike',
  ];
  const out: Partial<Record<WearableRarity, EquipmentEffect[]>> = {};
  for (let i = 0; i < tiers.length; i++) {
    out[tiers[i]] = [
      {
        type: 'stat',
        modifiers: specs.map((s) => ({
          stat: s.stat,
          value: s.values[i],
          operation: s.operation,
        })),
      },
    ];
  }
  return out;
}

function buildHandSlotEffects(): Record<
  string,
  Partial<Record<WearableRarity, EquipmentEffect[]>>
> {
  return {
    grenade: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 50, 70, 90, 120, 160],
      },
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.09, 1.12, 1.16],
      },
    ]),
    shield: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [15, 30, 50, 75, 110, 150],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.99, 0.98, 0.97, 0.95, 0.93, 0.9],
      },
    ]),
    flag: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.99, 0.98, 0.97, 0.95, 0.93, 0.9],
      },
    ]),
    sign: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [10, 15, 20, 30, 40, 50],
      },
    ]),
    staff: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 45, 60, 80, 110, 150],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 45, 60, 80, 110, 150],
      },
    ]),
    bow: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [35, 50, 70, 90, 120, 160],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [25, 40, 55, 70, 95, 130],
      },
    ]),
    gun: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 45, 60, 80, 110, 150],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [35, 50, 65, 85, 110, 145],
      },
    ]),
    lasso: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 40, 55, 70, 90],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 40, 55, 70, 90],
      },
    ]),
    sword: statsByRarity([
      {
        stat: 'meleeAttackRange',
        operation: 'add',
        values: [15, 25, 35, 45, 60, 80],
      },
      {
        stat: 'attackSpeed',
        operation: 'add',
        values: [15, 25, 35, 45, 60, 80],
      },
    ]),
    axe: statsByRarity([
      {
        stat: 'meleeAttackRange',
        operation: 'add',
        values: [15, 25, 35, 45, 60, 80],
      },
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.05, 1.07, 1.1, 1.13, 1.17, 1.22],
      },
    ]),
    hammer: statsByRarity([
      {
        stat: 'meleeAttackRange',
        operation: 'add',
        values: [10, 20, 30, 40, 55, 75],
      },
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.06, 1.08, 1.12, 1.16, 1.21, 1.27],
      },
    ]),
    spear: statsByRarity([
      {
        stat: 'meleeAttackRange',
        operation: 'add',
        values: [20, 30, 40, 55, 70, 90],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.03, 1.04, 1.06, 1.08, 1.1],
      },
    ]),
    dagger: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'add',
        values: [-50, -60, -70, -85, -105, -125],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.03, 1.04, 1.05, 1.07, 1.09, 1.12],
      },
    ]),
    light: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.03, 1.04, 1.06, 1.08, 1.1],
      },
    ]),
    exotic: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 45, 65, 90, 120],
      },
    ]),
    electronics: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 45, 60, 80, 110, 150],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 40, 55, 70, 90],
      },
    ]),
    token: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
      },
    ]),
  };
}

export const ITEM_TYPE_EFFECTS: ItemTypeEffectsByRarity = {
  head: {
    band: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [10, 20, 35, 55, 80, 110],
      },
    ]),
    'basic-hat': statsByRarity([
      {
        stat: 'hpRegen',
        operation: 'add',
        values: [0.1, 0.15, 0.2, 0.25, 0.3, 0.4],
      },
    ]),
    'fancy-hat': statsByRarity([
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.04, 1.06, 1.1, 1.16, 1.24, 1.34],
      },
    ]),
    mask: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [10, 20, 30, 50, 80, 120],
      },
    ]),
    hair: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.1, 1.14, 1.2],
      },
    ]),
    helmet: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [20, 40, 70, 110, 160, 220],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.99, 0.98, 0.97, 0.95, 0.93, 0.9],
      },
    ]),
  },
  body: {
    't-shirt': statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [10, 20, 35, 55, 80, 110],
      },
    ]),
    pants: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.08, 1.1, 1.12],
      },
    ]),
    dress: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [15, 30, 50, 75, 110, 150],
      },
    ]),
    vest: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.98, 0.96, 0.94, 0.93, 0.91, 0.89],
      },
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [10, 20, 35, 55, 80, 110],
      },
    ]),
    'fancy-suit': statsByRarity([
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.08, 1.11, 1.15],
      },
    ]),
    'light-armor': statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [10, 20, 35, 55, 80, 110],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.99, 0.98, 0.97, 0.96, 0.95, 0.94],
      },
    ]),
    'heavy-armor': statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [20, 40, 70, 110, 160, 220],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.98, 0.96, 0.94, 0.93, 0.91, 0.87],
      },
    ]),
    robe: statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [20, 40, 70, 110, 160, 220],
      },
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [5, 10, 15, 25, 40, 60],
      },
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [0.99, 0.98, 0.97, 0.96, 0.95, 0.94],
      },
    ]),
    'fancy-shirt': statsByRarity([
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.09, 1.12, 1.16],
      },
    ]),
    athletic: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.04, 1.07, 1.1, 1.14, 1.18, 1.24],
      },
    ]),
  },
  face: {
    beard: statsByRarity([
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.03, 1.05, 1.07, 1.1, 1.14],
      },
    ]),
    'face-mask': statsByRarity([
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [5, 10, 15, 25, 40, 60],
      },
    ]),
    'other-facial-hair': statsByRarity([
      { stat: 'damage', operation: 'add', values: [1, 2, 3, 4, 5, 7] },
    ]),
    accessories: statsByRarity([
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.04, 1.06, 1.09, 1.12, 1.16],
      },
    ]),
    'body-parts': statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.01, 1.02, 1.03, 1.05, 1.07, 1.1],
      },
    ]),
    electronics: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [30, 45, 60, 80, 110, 150],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [15, 25, 35, 50, 70, 100],
      },
    ]),
  },
  eyes: {
    eyes: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 45, 65, 90, 120],
      },
    ]),
    glasses: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [20, 30, 45, 65, 90, 120],
      },
    ]),
    shades: statsByRarity([
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [15, 25, 35, 50, 70, 100],
      },
      {
        stat: 'maxHealth',
        operation: 'add',
        values: [5, 10, 15, 25, 40, 60],
      },
    ]),
  },
  handLeft: buildHandSlotEffects(),
  handRight: buildHandSlotEffects(),
  pet: {
    rofl: statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.03, 1.05, 1.07, 1.1, 1.15],
      },
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.02, 1.03, 1.05, 1.08, 1.12, 1.17],
      },
    ]),
    'aave-boat': statsByRarity([
      {
        stat: 'attackSpeed',
        operation: 'mul',
        values: [1.02, 1.03, 1.05, 1.07, 1.1, 1.15],
      },
    ]),
    nimbus: {
      common: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.02 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.03 } },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.03 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.05 } },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.05 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.07 } },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.07 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.1 } },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.1 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.13 } },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.15 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.16 } },
      ],
    },
    'sus-butterfly': {
      common: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.01 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.05 } },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.02 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.07 } },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.03 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.1 } },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.05 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.13 } },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.07 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.17 } },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [{ stat: 'attackSpeed', operation: 'mul', value: 1.1 }],
        },
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.22 } },
      ],
    },
    'baby-licky': {
      common: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.01 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.02 },
        },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.02 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.03 },
        },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.04 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.04 },
        },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.06 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.05 },
        },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.08 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.06 },
        },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [{ stat: 'totalDamage', operation: 'mul', value: 1.12 }],
        },
        {
          type: 'ability',
          abilitySlug: 'tongue-farm',
          params: { bonusChance: 0.08 },
        },
      ],
    },
    radar: {
      common: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 1.3,
            extraCoinRollChance: 0.01,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.05,
          },
        },
      ],
      uncommon: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 1.5,
            extraCoinRollChance: 0.015,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.07,
          },
        },
      ],
      rare: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 1.7,
            extraCoinRollChance: 0.02,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.09,
          },
        },
      ],
      legendary: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 1.9,
            extraCoinRollChance: 0.025,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.11,
          },
        },
      ],
      mythical: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 2.2,
            extraCoinRollChance: 0.03,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.13,
          },
        },
      ],
      godlike: [
        {
          type: 'ability',
          abilitySlug: 'gold-farm',
          params: {
            mode: 'both',
            coinWeightMultiplier: 2.5,
            extraCoinRollChance: 0.04,
            maxExtraChanceCap: 0.12,
            amountMultiplier: 1.15,
          },
        },
      ],
    },
    'foxy-tail': {
      common: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.03 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.03 },
        },
      ],
      uncommon: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.05 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.05 },
        },
      ],
      rare: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.07 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.07 },
        },
      ],
      legendary: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.1 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.1 },
        },
      ],
      mythical: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.13 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.13 },
        },
      ],
      godlike: [
        { type: 'ability', abilitySlug: 'evade', params: { chance: 0.16 } },
        {
          type: 'ability',
          abilitySlug: 'magic-find',
          params: { percent: 0.16 },
        },
      ],
    },
    geo: statsByRarity([
      { stat: 'maxHealth', operation: 'add', values: [5, 10, 15, 25, 40, 60] },
      {
        stat: 'totalDamage',
        operation: 'mul',
        values: [1.01, 1.02, 1.04, 1.06, 1.08, 1.12],
      },
    ]),
    stohn: statsByRarity([
      { stat: 'maxHealth', operation: 'add', values: [5, 10, 15, 25, 40, 60] },
      {
        stat: 'meleeAttackRange',
        operation: 'add',
        values: [10, 14, 18, 22, 26, 32],
      },
      {
        stat: 'rangedAttackRange',
        operation: 'add',
        values: [10, 14, 18, 22, 26, 32],
      },
    ]),
    plant: {
      common: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.1 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.01,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.15 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.015,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.2 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.02,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.25 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.025,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.3 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.03,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [{ stat: 'hpRegen', operation: 'add', value: 0.4 }],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.04,
            maxExtraChanceCap: 0.08,
            hpToManaBias: 0.6,
          },
        },
      ],
    },
    fungi: {
      common: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 10 },
            { stat: 'hpRegen', operation: 'add', value: 0.1 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.015,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 20 },
            { stat: 'hpRegen', operation: 'add', value: 0.15 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.02,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 35 },
            { stat: 'hpRegen', operation: 'add', value: 0.2 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.025,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 55 },
            { stat: 'hpRegen', operation: 'add', value: 0.25 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.03,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 80 },
            { stat: 'hpRegen', operation: 'add', value: 0.3 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.04,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [
            { stat: 'maxHealth', operation: 'add', value: 110 },
            { stat: 'hpRegen', operation: 'add', value: 0.4 },
          ],
        },
        {
          type: 'ability',
          abilitySlug: 'potion-farm',
          params: {
            mode: 'extra-roll',
            extraPotionRollChance: 0.05,
            maxExtraChanceCap: 0.1,
            hpToManaBias: 0.55,
          },
        },
      ],
    },
    cacti: {
      common: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 5 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.05 } },
      ],
      uncommon: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 10 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.07 } },
      ],
      rare: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 15 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.1 } },
      ],
      legendary: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 25 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.13 } },
      ],
      mythical: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 40 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.16 } },
      ],
      godlike: [
        {
          type: 'stat',
          modifiers: [{ stat: 'maxHealth', operation: 'add', value: 60 }],
        },
        { type: 'ability', abilitySlug: 'thorns', params: { percent: 0.2 } },
      ],
    },
  },
  background: {},
  none: {},
};

export function toItemTypeLabel(slug: string): string {
  if (!slug) {
    return '';
  }

  return slug
    .split('-')
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');
}

interface WearableAugmentDefinition {
  effects?: EquipmentEffect[];
  abilities?: AnyAbilityInstance[];
}

const WEARABLE_AUGMENT_DEFINITIONS: Record<string, WearableAugmentDefinition> =
  {
    kimono: {
      abilities: [ABILITIES.evade({ chance: 0.15 })],
    },
    'lick-brain': {
      abilities: [ABILITIES.tongueFarm({ bonusChance: 0.06 })],
    },
    'lick-eyes': {
      abilities: [ABILITIES.tongueFarm({ bonusChance: 0.04 })],
    },

    'lick-tongue': {
      abilities: [ABILITIES.tongueFarm({ bonusChance: 0.05 })],
    },

    'bitcoin-beanie': {
      abilities: [
        ABILITIES.goldFarm({
          mode: 'both',
          coinWeightMultiplier: 1.4,
          extraCoinRollChance: 0.015,
          maxExtraChanceCap: 0.12,
          amountMultiplier: 1.08,
        }),
      ],
    },

    'bitcoin-guitar': {
      abilities: [
        ABILITIES.goldFarm({
          mode: 'both',
          coinWeightMultiplier: 1.6,
          extraCoinRollChance: 0.02,
          maxExtraChanceCap: 0.12,
          amountMultiplier: 1.1,
        }),
      ],
    },

    'gecko-eyes': {
      abilities: [
        ABILITIES.goldFarm({
          mode: 'both',
          coinWeightMultiplier: 1.5,
          extraCoinRollChance: 0.018,
          maxExtraChanceCap: 0.12,
          amountMultiplier: 1.08,
        }),
      ],
    },

    'coingecko-tee': {
      abilities: [
        ABILITIES.goldFarm({
          mode: 'both',
          coinWeightMultiplier: 1.4,
          extraCoinRollChance: 0.015,
          maxExtraChanceCap: 0.12,
          amountMultiplier: 1.06,
        }),
      ],
    },

    'aagent-shirt': {
      abilities: [ABILITIES.evade({ chance: 0.1 })],
    },

    'wizard-visor': {
      abilities: [
        // Augmented Vision: +10% fog-of-war vision radius
        ABILITIES.augmentedVision({ multiplier: 1.1 }),
      ],
    },
  };

export type WearableCategory = 'wearable' | 'weapon' | 'other';

export type WearableRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'legendary'
  | 'mythical'
  | 'godlike';

export const WEARABLE_RARITIES = [
  'common',
  'uncommon',
  'rare',
  'legendary',
  'mythical',
  'godlike',
] as const satisfies readonly WearableRarity[];

export function slugifyWearableName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseWearableSlots(slotPositions: string): WearableSlot[] {
  const rawTokens =
    slotPositions && slotPositions.trim().length > 0
      ? slotPositions.split(',').map((s) => s.trim())
      : ['none'];

  const slots = new Set<WearableSlot>();
  for (const token of rawTokens) {
    if (token === 'hands') {
      slots.add('handLeft');
      slots.add('handRight');
      continue;
    }
    const slot = token as WearableSlot;
    if (VALID_WEARABLE_SLOTS.has(slot)) {
      slots.add(slot);
    }
  }

  if (slots.size === 0) {
    slots.add('none');
  }

  return Array.from(slots);
}

export interface WearableDefinition extends ItemTypes {
  id: number;
  slug: string;
  slots: WearableSlot[];
  effects: EquipmentEffect[];
  abilities: AnyAbilityInstance[];
  categoryLabel: WearableCategory;
  weapon?: WeaponProfile;
}

function cloneGrenadeDefinition(
  grenade?: GrenadeWeaponDefinition
): GrenadeWeaponDefinition | undefined {
  if (!grenade) {
    return undefined;
  }
  return {
    ...grenade,
    healingSplash: grenade.healingSplash
      ? { ...grenade.healingSplash }
      : undefined,
  };
}

function buildWeaponProfileForWearable(
  slug: string,
  id: number,
  name: string,
  weaponDefinition: WeaponAuthoringDefinition,
  rarity: WearableRarity
): WeaponProfile {
  const categoryDefaults =
    WEAPON_CATEGORY_DEFAULTS[weaponDefinition.weaponCategory];

  const baseDamage =
    weaponDefinition.damage ?? categoryDefaults.damage ?? undefined;
  const baseDamageRange =
    weaponDefinition.damageRange ??
    (weaponDefinition.damage === undefined
      ? categoryDefaults.damageRange
      : undefined);
  const attackSpeed =
    weaponDefinition.attackSpeed ?? categoryDefaults.attackSpeed;
  const meleeAttackRange =
    weaponDefinition.meleeAttackRange ?? categoryDefaults.meleeAttackRange;
  const rangedAttackRange =
    weaponDefinition.rangedAttackRange ?? categoryDefaults.rangedAttackRange;
  const projectileSpeed =
    weaponDefinition.projectileSpeed ?? categoryDefaults.projectileSpeed;
  const attackAnimProfile =
    weaponDefinition.attackAnimProfile ?? categoryDefaults.attackAnimProfile;

  const grenade = cloneGrenadeDefinition(weaponDefinition.grenade);
  const grenadeDefaults = categoryDefaults.grenade;
  if (grenade && grenadeDefaults) {
    if (grenadeDefaults.blastRadiusPx !== undefined) {
      grenade.blastRadiusPx =
        grenade.blastRadiusPx ?? grenadeDefaults.blastRadiusPx;
    }
    if (grenadeDefaults.damageCenter !== undefined) {
      grenade.damageCenter =
        grenade.damageCenter ?? grenadeDefaults.damageCenter;
    }
    if (grenadeDefaults.damageEdge !== undefined) {
      grenade.damageEdge = grenade.damageEdge ?? grenadeDefaults.damageEdge;
    }
    if (grenadeDefaults.cooldownMs !== undefined) {
      grenade.cooldownMs = grenade.cooldownMs ?? grenadeDefaults.cooldownMs;
    }
    if (grenadeDefaults.healingSplash) {
      if (!grenade.healingSplash) {
        grenade.healingSplash = { ...grenadeDefaults.healingSplash };
      } else {
        grenade.healingSplash.radius =
          grenade.healingSplash.radius ?? grenadeDefaults.healingSplash.radius;
        grenade.healingSplash.healAmount =
          grenade.healingSplash.healAmount ??
          grenadeDefaults.healingSplash.healAmount;
        grenade.healingSplash.cooldownMs =
          grenade.healingSplash.cooldownMs ??
          grenadeDefaults.healingSplash.cooldownMs;
        grenade.healingSplash.affectsSelf =
          grenade.healingSplash.affectsSelf ??
          grenadeDefaults.healingSplash.affectsSelf;
        grenade.healingSplash.alliesOnly =
          grenade.healingSplash.alliesOnly ??
          grenadeDefaults.healingSplash.alliesOnly;
      }
    }
  }

  const rarityMultiplier =
    WEAPON_RARITY_MULTIPLIERS[rarity] ?? WEAPON_RARITY_MULTIPLIERS.common;

  const scaledDamage =
    baseDamage !== undefined
      ? Math.round(baseDamage * rarityMultiplier)
      : undefined;

  const scaledDamageRange = baseDamageRange
    ? {
        min: Math.round(baseDamageRange.min * rarityMultiplier),
        max: Math.round(baseDamageRange.max * rarityMultiplier),
      }
    : undefined;

  if (grenade) {
    if (grenade.damageCenter !== undefined) {
      grenade.damageCenter = Math.round(
        grenade.damageCenter * rarityMultiplier
      );
    }
    if (grenade.damageEdge !== undefined) {
      grenade.damageEdge = Math.round(grenade.damageEdge * rarityMultiplier);
    }
    // Apply default mana cost by rarity if not explicitly set or set to 0
    if (grenade.manaCost == null || grenade.manaCost <= 0) {
      grenade.manaCost = GRENADE_MANA_COST_BY_RARITY[rarity];
    }
  }

  return {
    slug,
    id,
    name,
    aavegotchiId: weaponDefinition.aavegotchiId,
    weaponType: weaponDefinition.weaponType,
    weaponCategory: weaponDefinition.weaponCategory,
    itemType: weaponDefinition.itemType,
    damage: scaledDamage,
    damageRange: scaledDamageRange ? { ...scaledDamageRange } : undefined,
    totalDamage: weaponDefinition.totalDamage,
    attackSpeed,
    meleeAttackRange,
    rangedAttackRange,
    projectileSpeed,
    attackAnimProfile,
    grenade,
    abilities: [
      ...(categoryDefaults.abilities || []).map((ability) =>
        cloneAbilityInstance(ability)
      ),
      ...(weaponDefinition.abilities || []).map((ability) =>
        cloneAbilityInstance(ability)
      ),
    ],
  };
}

const WEARABLES_BY_ID: Record<number, WearableDefinition> = {};
const WEARABLES_BY_SLUG: Record<string, WearableDefinition> = {};
const WEARABLE_SLUG_ALIASES: Record<string, string> = {
  'coingecko-eyes': 'gecko-eyes',
  'coin-gecko-eyes': 'gecko-eyes',
};

let QUALITY_PREFIX_TOKENS_CACHE: Set<string> | null = null;

function getQualityPrefixTokens(): Set<string> {
  if (QUALITY_PREFIX_TOKENS_CACHE) {
    return QUALITY_PREFIX_TOKENS_CACHE;
  }
  QUALITY_PREFIX_TOKENS_CACHE = new Set<string>(
    [
      ...Object.keys(QUALITY_DEFAULT_LABELS),
      ...Object.values(QUALITY_DEFAULT_LABELS),
      ...Object.values(WEARABLE_QUALITY_OVERRIDES).flatMap((record) =>
        Object.values(record ?? {})
      ),
      ...Object.values(WEARABLE_ITEM_TYPE_QUALITY_OVERRIDES).flatMap((record) =>
        Object.values(record ?? {})
      ),
    ]
      .map((value) =>
        typeof value === 'string' ? slugifyWearableName(value) : ''
      )
      .filter((token): token is string => token.length > 0)
  );
  return QUALITY_PREFIX_TOKENS_CACHE;
}

Object.entries(itemTypes).forEach(([idStr, wearable]) => {
  const id = Number(idStr);
  const slug = slugifyWearableName(wearable.name);
  const weaponDefinition = WEAPON_DEFINITIONS[slug];
  const overrideSlots = weaponDefinition?.slots;
  const slots =
    overrideSlots && overrideSlots.length > 0
      ? overrideSlots
      : parseWearableSlots(wearable.slotPositions);
  const augment = WEARABLE_AUGMENT_DEFINITIONS[slug];
  const effects = augment?.effects || [];
  const abilities = (augment?.abilities || []).map((ability) =>
    cloneAbilityInstance(ability)
  );
  const definition: WearableDefinition = {
    ...wearable,
    id,
    slug,
    slots,
    effects,
    abilities,
    categoryLabel: 'wearable',
    weapon: undefined,
  };

  const rarity = getWearableRarity(definition);

  if (weaponDefinition) {
    definition.weapon = buildWeaponProfileForWearable(
      slug,
      id,
      wearable.name,
      weaponDefinition,
      rarity
    );
    definition.categoryLabel = 'weapon';
  }

  WEARABLES_BY_ID[id] = definition;
  WEARABLES_BY_SLUG[slug] = definition;
});

export function getWearableById(id: number): WearableDefinition | undefined {
  return WEARABLES_BY_ID[id];
}

export function getWearableRarity(
  wearable: WearableDefinition
): WearableRarity {
  if (wearable.rarityLevel) {
    return wearable.rarityLevel;
  }
  const sum = (wearable.traitModifiers as number[]).reduce(
    (acc: number, val: number) => acc + Math.abs(val || 0),
    0
  );
  if (sum >= 6) return 'godlike';
  if (sum >= 5) return 'mythical';
  if (sum >= 4) return 'legendary';
  if (sum >= 3) return 'rare';
  if (sum >= 2) return 'uncommon';
  return 'common';
}

export function normalizeWearableSlug(slug: string): string {
  if (typeof slug !== 'string') {
    return '';
  }
  const normalizedInput = slugifyWearableName(slug);
  if (!normalizedInput) {
    return '';
  }
  let normalized = WEARABLE_SLUG_ALIASES[normalizedInput] ?? normalizedInput;
  if (WEARABLES_BY_SLUG[normalized]) {
    return normalized;
  }

  const segments = normalized.split('-');
  if (segments.length > 1) {
    const [firstToken, ...restTokens] = segments;
    if (getQualityPrefixTokens().has(firstToken)) {
      const candidate = restTokens.join('-');
      if (candidate) {
        const candidateNormalized =
          WEARABLE_SLUG_ALIASES[candidate] ?? candidate;
        if (WEARABLES_BY_SLUG[candidateNormalized]) {
          return candidateNormalized;
        }
      }
    }
  }

  return normalized;
}

export function getWearableBySlug(
  slug: string
): WearableDefinition | undefined {
  const normalized = normalizeWearableSlug(slug);
  if (!normalized) {
    return undefined;
  }
  return WEARABLES_BY_SLUG[normalized];
}

export function isWeaponWearable(
  wearable: WearableDefinition | undefined
): wearable is WearableDefinition & { weapon: WeaponProfile } {
  return Boolean(wearable && wearable.weapon);
}

export interface AggregatedModifier {
  add: number;
  multiply: number;
  min?: number;
  max?: number;
}

function createEmptyAggregation(): Record<EquipmentStat, AggregatedModifier> {
  return EQUIPMENT_STATS.reduce(
    (acc, stat) => {
      acc[stat] = { add: 0, multiply: 1 };
      return acc;
    },
    {} as Record<EquipmentStat, AggregatedModifier>
  );
}

export interface WearableInstance {
  slug: string;
  wearable: WearableDefinition;
  weapon?: WeaponProfile;
  abilities: AnyAbilityInstance[];
  quality: QualityTier;
  qualityScalar: number;
}

export interface EquipmentAggregationResult {
  wearables: WearableInstance[];
  modifiers: Record<EquipmentStat, AggregatedModifier>;
  missing: string[];
}

export interface EquippedWearableWithQuality {
  slug: string;
  quality?: QualityTier;
  slot?: WearableSlot;
}

function applyModifierWithScalar(
  target: AggregatedModifier,
  modifier: EquipmentStatModifier,
  scalar: number
) {
  const operation = modifier.operation || 'add';
  const baseValue = modifier.value;
  if (typeof baseValue !== 'number' || !Number.isFinite(baseValue)) {
    return;
  }

  if (operation === 'add') {
    target.add += baseValue * scalar;
    return;
  }

  if (operation === 'mul') {
    const multiplier = 1 + (baseValue - 1) * scalar;
    target.multiply *= multiplier;
    return;
  }

  if (operation === 'add_percent') {
    const scaledPercent = baseValue * scalar;
    target.multiply *= 1 + scaledPercent;
  }
}

function buildAbilityFromEffect(effect: AbilityEffect): AnyAbilityInstance | null {
  const params =
    effect.params && typeof effect.params === 'object' ? effect.params : {};

  switch (effect.abilitySlug) {
    case 'life-steal':
      return ABILITIES.lifeSteal(params as any);
    case 'critical-strike':
      return ABILITIES.criticalStrike(params as any);
    case 'cleave':
      return ABILITIES.cleave(params as any);
    case 'evade':
      return ABILITIES.evade(params as any);
    case 'thorns':
      return ABILITIES.thorns(params as any);
    case 'regen':
      return ABILITIES.regen(params as any);
    case 'tongue-farm':
      return ABILITIES.tongueFarm(params as any);
    case 'potion-farm':
      return ABILITIES.potionFarm(params as any);
    case 'gold-farm':
      return ABILITIES.goldFarm(params as any);
    case 'healing-splash':
      return ABILITIES.healingSplash(params as any);
    case 'augmented-vision':
      return ABILITIES.augmentedVision(params as any);
    case 'slow':
      return ABILITIES.slow(params as any);
    case 'stun':
      return ABILITIES.stun(params as any);
    case 'poison':
      return ABILITIES.poison(params as any);
    case 'magic-find':
      // TODO: Add a first-class `magic-find` ability to data/abilities.ts and
      // wire it through loot/roll aggregation. Until then, this wearable effect
      // remains authored data only and is intentionally not materialized.
      return null;
    case 'boss-charge-stun':
    case 'boss_charge_stun':
      return ABILITIES.bossChargeStun(params as any);
    default:
      return null;
  }
}

function resolveAbilityEffects(
  effects: EquipmentEffect[]
): AnyAbilityInstance[] {
  if (!Array.isArray(effects) || effects.length === 0) {
    return [];
  }
  const abilities: AnyAbilityInstance[] = [];
  for (const effect of effects) {
    if (!effect || effect.type !== 'ability') continue;
    const ability = buildAbilityFromEffect(effect);
    if (ability) {
      abilities.push(ability);
    }
  }
  return abilities;
}

export function aggregateEquipmentStatsWithQuality(
  equipped: Array<EquippedWearableWithQuality>
): EquipmentAggregationResult {
  const modifiers = createEmptyAggregation();
  const wearables: WearableInstance[] = [];
  const missing: string[] = [];

  for (const entry of equipped) {
    const slug = entry.slug;
    const wearable = getWearableBySlug(slug);
    if (!wearable) {
      missing.push(slug);
      continue;
    }

    const quality = normalizeQualityTier(entry.quality);
    const qualityScalar = getQualityScalar(quality);

    const resolvedEffects = resolveWearableEffectsByItemType(wearable);
    const resolvedAbilityEffects = resolveAbilityEffects(resolvedEffects);
    const baseAbilities = Array.isArray(wearable.abilities)
      ? wearable.abilities.map((ability) => cloneAbilityInstance(ability))
      : [];
    const abilities = [...baseAbilities, ...resolvedAbilityEffects];

    wearables.push({
      slug: wearable.slug,
      wearable,
      weapon: wearable.weapon,
      abilities,
      quality,
      qualityScalar,
    });

    for (const effect of resolvedEffects) {
      if (!effect || effect.type !== 'stat') continue;

      for (const modifier of effect.modifiers) {
        const statKey = modifier.stat as EquipmentStat;
        const target = modifiers[statKey];

        if (!target) continue;

        applyModifierWithScalar(target, modifier, qualityScalar);

        if (typeof modifier.min === 'number') {
          target.min =
            typeof target.min === 'number'
              ? Math.max(target.min, modifier.min)
              : modifier.min;
        }

        if (typeof modifier.max === 'number') {
          target.max =
            typeof target.max === 'number'
              ? Math.min(target.max, modifier.max)
              : modifier.max;
        }
      }
    }
  }

  return { wearables, modifiers, missing };
}

export function aggregateEquipmentStats(
  slugs: string[]
): EquipmentAggregationResult {
  const defaultEquipped = slugs.map((slug) => ({
    slug,
    quality: DEFAULT_QUALITY_TIER,
  }));
  return aggregateEquipmentStatsWithQuality(defaultEquipped);
}

export function getAllWearableSlugs(): string[] {
  return Object.keys(WEARABLES_BY_SLUG);
}

export function resolveWearableEffectsByItemType(
  wearable: WearableDefinition
): EquipmentEffect[] {
  if (Array.isArray(wearable.effects) && wearable.effects.length > 0) {
    return wearable.effects;
  }
  const slot = (wearable.slots.find((entry) => entry !== 'none') ??
    'none') as keyof typeof ITEM_TYPE_EFFECTS;
  const itemType = (wearable as { itemType?: string } | null | undefined)
    ?.itemType;
  if (!itemType) return [];
  const rarity = getWearableRarity(wearable);
  const bySlot = (ITEM_TYPE_EFFECTS as Record<string, unknown>)[slot] as
    | Record<string, Record<string, unknown>>
    | undefined;
  const byType = bySlot?.[itemType] as
    | Record<string, { type: 'stat'; modifiers: unknown[] }[]>
    | undefined;
  const effects = byType?.[rarity] || byType?.common || [];
  return Array.isArray(effects) ? (effects as EquipmentEffect[]) : [];
}
