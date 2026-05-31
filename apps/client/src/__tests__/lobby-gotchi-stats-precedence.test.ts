jest.mock('../lib/character-registry', () => ({
  getCharacterStats: jest.fn(() => ({ marker: 'derived' })),
}));

jest.mock('../data/characters', () => ({
  getGotchiWearableAssignments: jest.fn(),
}));

jest.mock('../lib/gotchi-utils', () => ({
  buildGotchiSlotMapFromSvgIds: jest.fn(),
}));

import { getCharacterStats } from '../lib/character-registry';
import { getGotchiWearableAssignments } from '../data/characters';
import { buildGotchiSlotMapFromSvgIds } from '../lib/gotchi-utils';
import { resolveLobbyGotchiDerivedStats } from '../lib/hero-details/lobby-gotchi-stats';

describe('resolveLobbyGotchiDerivedStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers selected equipment state over on-chain gotchi sprite wearables', () => {
    resolveLobbyGotchiDerivedStats({
      selectedCharacterId: 'gotchi:123',
      svgIdToItemTypeId: new Map([[1, 999]]),
      gotchiEquipById: {
        123: {
          id: 123,
          equippedWearables: [1],
          url: '',
          hash: '',
        },
      },
      equippedWearablesWithQuality: [
        {
          slot: 'head',
          slug: 'bitcoin-beanie',
          quality: 'average',
        },
      ],
    });

    expect(getCharacterStats).toHaveBeenCalledWith('gotchi:123', {
      equippedWearablesWithQuality: [
        {
          slot: 'head',
          slug: 'bitcoin-beanie',
          quality: 'average',
        },
      ],
    });
    expect(buildGotchiSlotMapFromSvgIds).not.toHaveBeenCalled();
  });

  it('prefers cached merged gotchi assignments over on-chain sprite wearables', () => {
    (getGotchiWearableAssignments as jest.Mock).mockReturnValue([
      { slot: 'head', slug: 'bitcoin-beanie' },
    ]);

    resolveLobbyGotchiDerivedStats({
      selectedCharacterId: 'gotchi:123',
      svgIdToItemTypeId: new Map([[1, 999]]),
      gotchiEquipById: {
        123: {
          id: 123,
          equippedWearables: [1],
          url: '',
          hash: '',
        },
      },
    });

    expect(getCharacterStats).toHaveBeenCalledWith('gotchi:123', {
      equippedWearables: { head: 'bitcoin-beanie' },
    });
    expect(buildGotchiSlotMapFromSvgIds).not.toHaveBeenCalled();
  });

  it('falls back to on-chain sprite wearables when no current equipment snapshot exists', () => {
    (getGotchiWearableAssignments as jest.Mock).mockReturnValue(undefined);
    (buildGotchiSlotMapFromSvgIds as jest.Mock).mockReturnValue({
      head: 'gentleman-hat',
    });

    resolveLobbyGotchiDerivedStats({
      selectedCharacterId: 'gotchi:123',
      svgIdToItemTypeId: new Map([[1, 999]]),
      gotchiEquipById: {
        123: {
          id: 123,
          equippedWearables: [1],
          url: '',
          hash: '',
        },
      },
    });

    expect(buildGotchiSlotMapFromSvgIds).toHaveBeenCalledWith(
      [1],
      expect.any(Map)
    );
    expect(getCharacterStats).toHaveBeenCalledWith('gotchi:123', {
      equippedWearables: { head: 'gentleman-hat' },
    });
  });
});
