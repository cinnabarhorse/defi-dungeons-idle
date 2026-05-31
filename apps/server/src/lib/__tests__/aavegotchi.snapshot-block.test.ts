jest.mock('graphql-request', () => ({
  gql: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((acc, part, index) => {
      const value = index < values.length ? String(values[index]) : '';
      return acc + part + value;
    }, ''),
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

jest.mock('../../data/wearables', () => ({
  itemTypes: {},
  slugifyWearableName: (name: string) => name,
}));

import { request } from 'graphql-request';
import {
  fetchAavegotchiByIdAtBlock,
  fetchAavegotchisOfOwnerAtBlock,
  verifyGotchiOwnershipAtBlock,
} from '../aavegotchi';

describe('aavegotchi block-aware ownership queries', () => {
  const owner = '0xabc0000000000000000000000000000000000000';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SUBGRAPH_CORE_BASE = 'https://subgraph.example.invalid';
  });

  it('owner query includes GraphQL block argument', async () => {
    (request as jest.Mock).mockResolvedValue({ aavegotchis: [] });

    await fetchAavegotchisOfOwnerAtBlock(owner, 123456);

    const [, query] = (request as jest.Mock).mock.calls[0];
    expect(query).toContain(`owner_: { id: "${owner}" }`);
    expect(query).toContain('block: { number: 123456 }');
  });

  it('by-id query includes GraphQL block argument', async () => {
    (request as jest.Mock).mockResolvedValue({ aavegotchis: [] });

    await fetchAavegotchiByIdAtBlock('6741', 999);

    const [, query] = (request as jest.Mock).mock.calls[0];
    expect(query).toContain('where: { id: "6741"');
    expect(query).toContain('block: { number: 999 }');
  });

  it('verifyGotchiOwnershipAtBlock resolves true/false ownership at a block', async () => {
    (request as jest.Mock)
      .mockResolvedValueOnce({
        aavegotchis: [{ id: '6741', equippedWearables: [] }],
      })
      .mockResolvedValueOnce({
        aavegotchis: [],
      })
      .mockResolvedValueOnce({
        aavegotchis: [
          {
            id: '9999',
            equippedWearables: [],
            owner: { id: '0xnotowner' },
          },
        ],
      });

    const owned = await verifyGotchiOwnershipAtBlock(owner, '6741', 1000);
    const notOwned = await verifyGotchiOwnershipAtBlock(owner, '9999', 1000);

    expect(owned.owned).toBe(true);
    expect(notOwned.owned).toBe(false);
  });

  it('returns empty result and skips subgraph request on invalid owner address', async () => {
    const result = await verifyGotchiOwnershipAtBlock('0xowner', '6741', 1000);

    expect(result).toEqual({ owned: false, slugs: [], assignments: [] });
    expect(request).not.toHaveBeenCalled();
  });
});
