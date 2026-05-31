jest.mock('graphql-request', () => ({
  gql: (strings: any) => strings,
  request: jest.fn(),
}));

jest.mock('../db', () => ({
  charactersRepo: {
    upsertCharacters: jest.fn(),
    listByOwner: jest.fn(),
    getByGotchiId: jest.fn(),
  },
}));

jest.mock('../../data/characters', () => ({
  setGotchiWearableAssignments: jest.fn(),
  setGotchiWearables: jest.fn(),
}));

jest.mock('../../data/wearables', () => {
  const slugifyWearableName = (name: string) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  return {
    itemTypes: {
      1: { name: 'Cool Hat', slotPositions: 'head' },
      2: { name: 'Left Sword', slotPositions: 'handLeft' },
      3: { name: 'Both Hands', slotPositions: 'hands' },
      4: { name: 'Body Armor', slotPositions: 'body' },
    },
    slugifyWearableName,
  };
});

describe('aavegotchi wearable svgId conversion', () => {
  // Require after mocks so we never attempt to load ESM graphql-request in Jest.
  const {
    toWearableAssignmentsFromSvgIds,
    toWearableSlugsFromSvgIds,
    normalizeAddress,
    getWearableSlugsForGotchi,
    fetchAavegotchisOfOwner,
  } = require('../aavegotchi') as typeof import('../aavegotchi');

  test('toWearableSlugsFromSvgIds filters invalid entries and enforces allowed slots', () => {
    // Indices map to slots:
    // 0 body, 1 face, 2 eyes, 3 head, 4 handLeft, 5 handRight, 6 pet, 7 background
    const svgIds = [
      '0', // body (ignored)
      '4', // face: Body Armor only allowed in body -> should be skipped
      'nope', // eyes: NaN -> skipped
      '1', // head: Cool Hat -> included
      '3', // handLeft: Both Hands (hands expands) -> included
      '3', // handRight: Both Hands (hands expands) -> included
      '2', // pet: Left Sword only allowed in handLeft -> skipped
      '9999', // background: unknown itemType -> skipped
    ];

    expect(toWearableSlugsFromSvgIds(svgIds)).toEqual([
      'cool-hat',
      'both-hands',
      'both-hands',
    ]);
  });

  test('toWearableAssignmentsFromSvgIds returns (slot, slug) pairs only for valid slot matches', () => {
    const svgIds = [
      '4', // body: Body Armor -> included
      '0',
      '0',
      '1', // head: Cool Hat -> included
      '2', // handLeft: Left Sword -> included
      '2', // handRight: Left Sword not allowed in handRight -> skipped
      '3', // pet: Both Hands not allowed in pet -> skipped
      '3', // background: Both Hands not allowed in background -> skipped
    ];

    expect(toWearableAssignmentsFromSvgIds(svgIds)).toEqual([
      { slot: 'body', slug: 'body-armor' },
      { slot: 'head', slug: 'cool-hat' },
      { slot: 'handLeft', slug: 'left-sword' },
    ]);
  });

  test('normalizeAddress trims and lowercases', () => {
    expect(normalizeAddress(' 0xAbC123 ')).toBe('0xabc123');
  });

  test('getWearableSlugsForGotchi returns fresh DB cache and skips subgraph requests', async () => {
    const { charactersRepo } = require('../db') as typeof import('../db');
    const { request } = require('graphql-request') as { request: jest.Mock };

    request.mockResolvedValue({ aavegotchis: [] });
    (charactersRepo.getByGotchiId as jest.Mock).mockResolvedValue({
      gotchiId: '123',
      ownerAddress: '0xabc',
      wearableSlugs: ['cached-slug'],
      lastSyncedAt: new Date(Date.now() - 30_000).toISOString(),
    });

    const slugs = await getWearableSlugsForGotchi('0xAbC', '123', {
      maxAgeMs: 5 * 60 * 1000,
    });

    expect(slugs).toEqual(['cached-slug']);
    expect(request).not.toHaveBeenCalled();
  });

  test('getWearableSlugsForGotchi falls back to network when cache is stale', async () => {
    const { charactersRepo } = require('../db') as typeof import('../db');
    const { request } = require('graphql-request') as { request: jest.Mock };

    // Prevent noisy logs from the by-id fallback.
    process.env.SUBGRAPH_CORE_BASE = 'https://example.invalid/subgraph';

    request.mockResolvedValue({ aavegotchis: [] });
    (charactersRepo.getByGotchiId as jest.Mock).mockResolvedValue({
      gotchiId: '123',
      ownerAddress: '0xabc',
      wearableSlugs: ['stale-slug'],
      lastSyncedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });

    const slugs = await getWearableSlugsForGotchi('0xAbC', '123', {
      maxAgeMs: 5 * 60 * 1000,
    });

    expect(request).toHaveBeenCalled();
    // With our mocked empty subgraph response, we should return the stored DB value.
    expect(slugs).toEqual(['stale-slug']);
  });

  test('fetchAavegotchisOfOwner falls back to default endpoint when env is unset', async () => {
    const { request } = require('graphql-request') as { request: jest.Mock };
    const defaultEndpoint =
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';
    const previousCoreBase = process.env.SUBGRAPH_CORE_BASE;
    const previousCore = process.env.SUBGRAPH_CORE;
    delete process.env.SUBGRAPH_CORE_BASE;
    delete process.env.SUBGRAPH_CORE;

    request.mockResolvedValue({
      aavegotchis: [
        {
          id: '1',
          collateral: '0x1',
          eyeShape: 1,
          eyeColor: 1,
          equippedWearables: [],
        },
      ],
    });

    try {
      const gotchis = await fetchAavegotchisOfOwner('0xAbC');
      expect(gotchis).toHaveLength(1);
      expect(request).toHaveBeenCalledWith(
        defaultEndpoint,
        expect.anything()
      );
    } finally {
      if (typeof previousCoreBase === 'string') {
        process.env.SUBGRAPH_CORE_BASE = previousCoreBase;
      } else {
        delete process.env.SUBGRAPH_CORE_BASE;
      }
      if (typeof previousCore === 'string') {
        process.env.SUBGRAPH_CORE = previousCore;
      } else {
        delete process.env.SUBGRAPH_CORE;
      }
    }
  });

  test('fetchAavegotchisOfOwner falls back to default endpoint when env is blank', async () => {
    const { request } = require('graphql-request') as { request: jest.Mock };
    const defaultEndpoint =
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';
    const previousCoreBase = process.env.SUBGRAPH_CORE_BASE;
    const previousCore = process.env.SUBGRAPH_CORE;
    process.env.SUBGRAPH_CORE_BASE = '   ';
    process.env.SUBGRAPH_CORE = '';

    request.mockResolvedValue({
      aavegotchis: [],
    });

    try {
      await fetchAavegotchisOfOwner('0xAbC');
      expect(request).toHaveBeenCalledWith(
        defaultEndpoint,
        expect.anything()
      );
    } finally {
      if (typeof previousCoreBase === 'string') {
        process.env.SUBGRAPH_CORE_BASE = previousCoreBase;
      } else {
        delete process.env.SUBGRAPH_CORE_BASE;
      }
      if (typeof previousCore === 'string') {
        process.env.SUBGRAPH_CORE = previousCore;
      } else {
        delete process.env.SUBGRAPH_CORE;
      }
    }
  });

  test('fetchAavegotchisOfOwner retries default endpoint when configured endpoint fails', async () => {
    const { request } = require('graphql-request') as { request: jest.Mock };
    const configuredEndpoint = 'https://example.invalid/failing-endpoint';
    const defaultEndpoint =
      'https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn';
    const previousCoreBase = process.env.SUBGRAPH_CORE_BASE;
    const previousCore = process.env.SUBGRAPH_CORE;
    process.env.SUBGRAPH_CORE_BASE = configuredEndpoint;
    delete process.env.SUBGRAPH_CORE;
    request.mockReset();

    request
      .mockRejectedValueOnce(new Error('configured endpoint failed'))
      .mockResolvedValueOnce({ aavegotchis: [] });

    try {
      await fetchAavegotchisOfOwner('0xAbC');
      expect(request).toHaveBeenNthCalledWith(
        1,
        configuredEndpoint,
        expect.anything()
      );
      expect(request).toHaveBeenNthCalledWith(
        2,
        defaultEndpoint,
        expect.anything()
      );
    } finally {
      if (typeof previousCoreBase === 'string') {
        process.env.SUBGRAPH_CORE_BASE = previousCoreBase;
      } else {
        delete process.env.SUBGRAPH_CORE_BASE;
      }
      if (typeof previousCore === 'string') {
        process.env.SUBGRAPH_CORE = previousCore;
      } else {
        delete process.env.SUBGRAPH_CORE;
      }
    }
  });
});
