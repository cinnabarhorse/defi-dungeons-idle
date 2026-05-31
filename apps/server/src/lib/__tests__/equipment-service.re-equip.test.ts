jest.mock('graphql-request', () => ({
  gql: () => undefined,
  request: async () => undefined,
}));

jest.mock('../aavegotchi', () => ({
  fetchAavegotchiById: async () => undefined,
}));

const mockMatchMaker = {
  query: jest.fn(async () => []),
  remoteRoomCall: jest.fn(async () => undefined),
};

jest.mock('colyseus', () => ({
  matchMaker: mockMatchMaker,
}));

const mockClient = {
  query: jest.fn(async () => ({ rows: [] })),
} as any;

const mockRunTransaction = jest.fn(async (task: any) => task(mockClient));
const mockGetEquippedWithInstances = jest.fn();
const mockSetEquipment = jest.fn(async () => ({}));
const mockRemoveEquipment = jest.fn(async () => undefined);
const mockGetWearableInventoryBySlug = jest.fn();
const mockGetPlayerById = jest.fn();

jest.mock('../db', () => ({
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
  equipmentRepo: {
    getEquippedWithInstances: (...args: any[]) =>
      mockGetEquippedWithInstances(...args),
    setEquipment: (...args: any[]) => mockSetEquipment(...args),
    removeEquipment: (...args: any[]) => mockRemoveEquipment(...args),
  },
  inventoryRepo: {
    getWearableInventoryBySlug: (...args: any[]) =>
      mockGetWearableInventoryBySlug(...args),
  },
  playersRepo: {
    getPlayerById: (...args: any[]) => mockGetPlayerById(...args),
  },
}));

jest.mock('../character-registry', () => ({
  AVAILABLE_CHARACTERS: [
    {
      id: 'coderdan',
      name: 'Coderdan',
      tier: 'tier1',
    },
  ],
  getCharacterById: jest.fn((id: string) =>
    id === 'coderdan' ? { id: 'coderdan', tier: 'tier1' } : null
  ),
  getCharacterStats: jest.fn(() => ({
    maxHealth: 100,
    attackSpeed: 1000,
    damageRange: { min: 1, max: 1 },
    equipment: { items: [], slugs: [], modifiers: {} },
    weapons: [],
    abilities: [],
  })),
}));

jest.mock('../../data/characters', () => ({
  getGotchiWearables: jest.fn(() => []),
  setGotchiWearables: jest.fn(),
  setGotchiWearableAssignments: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const equipment = require('../equipment-service') as typeof import('../equipment-service');

describe('equipment-service re-equip durability persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayerById.mockResolvedValue({
      id: 'player-1',
      selectedCharacterId: 'coderdan',
      unlockedCharacters: ['coderdan'],
    });
  });

  it('re-equips the same lowered-durability instance when only one copy exists', async () => {
    const wearableRecord = {
      id: 'inv-1',
      playerId: 'player-1',
      itemType: 'wearable',
      itemName: 'bitcoin-beanie',
      quantity: 1,
      itemData: {},
      instanceId: 'inst-1',
      wearableSlug: 'bitcoin-beanie',
      quality: 'excellent',
      qualityScore: null,
      durabilityScore: 397,
      createdAt: '2026-03-22T00:00:00.000Z',
      updatedAt: '2026-03-22T00:00:00.000Z',
    };

    mockGetWearableInventoryBySlug.mockResolvedValue([wearableRecord]);
    mockGetEquippedWithInstances
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          slot: 'head',
          wearableSlug: 'bitcoin-beanie',
          inventoryItemId: 'inv-1',
          quality: 'excellent',
          durabilityScore: 397,
        },
      ])
      .mockResolvedValueOnce([
        {
          slot: 'head',
          wearableSlug: 'bitcoin-beanie',
          inventoryItemId: 'inv-1',
          quality: 'excellent',
          durabilityScore: 397,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          slot: 'head',
          wearableSlug: 'bitcoin-beanie',
          inventoryItemId: 'inv-1',
          quality: 'excellent',
          durabilityScore: 397,
        },
      ]);

    const firstEquip = await equipment.equipWearable({
      playerId: 'player-1',
      slot: 'head',
      slug: 'bitcoin-beanie',
    });

    await equipment.unequipWearable({
      playerId: 'player-1',
      slot: 'head',
    });

    const secondEquip = await equipment.equipWearable({
      playerId: 'player-1',
      slot: 'head',
      slug: 'bitcoin-beanie',
    });

    expect(firstEquip.overrides[0]).toEqual(
      expect.objectContaining({
        inventoryItemId: 'inv-1',
        quality: 'excellent',
        durabilityScore: 397,
      })
    );
    expect(secondEquip.overrides[0]).toEqual(
      expect.objectContaining({
        inventoryItemId: 'inv-1',
        quality: 'excellent',
        durabilityScore: 397,
      })
    );
    expect(mockSetEquipment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        playerId: 'player-1',
        slot: 'head',
        wearableSlug: 'bitcoin-beanie',
        inventoryItemId: 'inv-1',
      })
    );
    expect(mockSetEquipment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        playerId: 'player-1',
        slot: 'head',
        wearableSlug: 'bitcoin-beanie',
        inventoryItemId: 'inv-1',
      })
    );
  });
});
