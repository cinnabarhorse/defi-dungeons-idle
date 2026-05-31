import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const queryMock = jest.fn();
const getPgPoolMock = jest.fn(() => ({ query: queryMock }));

jest.mock('../../client', () => ({
  getPgPool: getPgPoolMock,
}));

import { getEquippedSummary } from '../equipment';

describe('equipment repo equipped summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores derived rows without inventory instance IDs', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          wearable_slug: 'base-hat',
          inventory_item_id: null,
          source: 'derived',
        },
        {
          wearable_slug: 'override-hat',
          inventory_item_id: null,
          source: 'override',
        },
        {
          wearable_slug: 'instance-hat',
          inventory_item_id: 'inv-1',
          source: 'inventory',
        },
        {
          wearable_slug: 'sharedgame-hat',
          inventory_item_id: null,
          source: 'inventory',
        },
      ],
    });

    const summary = await getEquippedSummary('player-1');

    expect(summary.idSet.has('inv-1')).toBe(true);
    expect(summary.countBySlug.get('base-hat')).toBeUndefined();
    expect(summary.countBySlug.get('override-hat')).toBe(1);
    expect(summary.countBySlug.get('instance-hat')).toBe(1);
    expect(summary.countBySlug.get('sharedgame-hat')).toBeUndefined();
  });
});
