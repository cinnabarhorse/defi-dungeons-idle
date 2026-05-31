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
const mockGetWearableInventoryBySlug = jest.fn();
const mockGetPlayerById = jest.fn();

jest.mock('../db', () => ({
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
  equipmentRepo: {
    getEquippedWithInstances: (...args: any[]) =>
      mockGetEquippedWithInstances(...args),
    setEquipment: (...args: any[]) => mockSetEquipment(...args),
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

const equipment =
  require('../equipment-service') as typeof import('../equipment-service');

describe('equipment-service flawless wearable restriction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayerById.mockResolvedValue({
      id: 'player-1',
      selectedCharacterId: 'coderdan',
      unlockedCharacters: ['coderdan'],
    });
    mockGetEquippedWithInstances.mockResolvedValue([]);
    mockGetWearableInventoryBySlug.mockResolvedValue([
      {
        id: 'inv-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-1',
        wearableSlug: 'bitcoin-beanie',
        quality: 'flawless',
        qualityScore: null,
        durabilityScore: 1000,
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
    ]);
  });

  it('rejects equipping a flawless wearable on non-gotchi heroes', async () => {
    await expect(
      equipment.equipWearable({
        playerId: 'player-1',
        slot: 'head',
        slug: 'bitcoin-beanie',
      })
    ).rejects.toMatchObject({
      code: 'gotchi_only',
      message: 'Flawless wearables can only be equipped by Aavegotchis.',
    });
  });
});
