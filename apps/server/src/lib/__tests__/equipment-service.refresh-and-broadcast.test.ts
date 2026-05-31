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
const mockGetPlayerById = jest.fn();

jest.mock('../db', () => ({
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
  equipmentRepo: {
    getEquippedWithInstances: (...args: any[]) =>
      mockGetEquippedWithInstances(...args),
  },
  inventoryRepo: {},
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
  getCharacterStats: jest.fn((_id: string, options?: any) => {
    const equipped = Array.isArray(options?.equippedWearablesWithQuality)
      ? options.equippedWearablesWithQuality
      : [];
    return {
      maxHealth: 100,
      attackSpeed: 1000,
      damageRange: { min: 1, max: 1 },
      equipment: {
        items: equipped.map((entry: any) => ({
          slug: entry.slug,
          slot: entry.slot,
          quality: entry.quality,
        })),
        slugs: equipped.map((entry: any) => entry.slug),
        modifiers: {},
      },
      weapons: [],
      abilities: [],
    };
  }),
}));

jest.mock('../../data/characters', () => ({
  getGotchiWearables: jest.fn(() => []),
  setGotchiWearables: jest.fn(),
  setGotchiWearableAssignments: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const equipment = require('../equipment-service') as typeof import('../equipment-service');

describe('equipment-service refreshAndBroadcastEquipmentState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockClear();

    mockGetPlayerById.mockResolvedValue({
      id: 'player-1',
      selectedCharacterId: 'coderdan',
      unlockedCharacters: ['coderdan'],
    });
    mockGetEquippedWithInstances.mockResolvedValue([
      {
        slot: 'head',
        wearableSlug: 'bitcoin-beanie',
        inventoryItemId: 'inv-1',
        quality: 'excellent',
        durabilityScore: 612,
      },
    ]);
  });

  it('persists the refreshed equipment snapshot before broadcasting it', async () => {
    const state = await equipment.refreshAndBroadcastEquipmentState('player-1');

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('update players'),
      [
        'player-1',
        JSON.stringify(state.derivedStats),
        JSON.stringify(state.equippedWearables),
      ]
    );
  });
});
