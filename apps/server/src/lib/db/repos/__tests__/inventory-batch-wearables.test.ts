import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const queryMock = jest.fn();
const getPgPoolMock = jest.fn(() => ({ query: queryMock }));
const runTransactionMock = jest.fn(async (task) => task({ query: queryMock }));

jest.mock('../../client', () => ({
  getPgPool: getPgPoolMock,
  runTransaction: runTransactionMock,
}));

import { createInventoryInstances } from '../inventory';

describe('createInventoryInstances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('batch inserts wearables in a single query', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'row-1' }, { id: 'row-2' }] });

    await createInventoryInstances({
      playerId: 'player-1',
      items: [
        {
          wearableSlug: 'alpha-wearable',
          quality: 'Flawless',
          qualityScore: 12,
          durabilityScore: 1200,
          itemData: { source: 'loot' },
        },
        {
          wearableSlug: 'beta-wearable',
          quality: 'not-a-quality',
          durabilityScore: undefined,
          itemData: { source: 'reward' },
        },
      ],
    });

    expect(runTransactionMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);

    const [query, params] = queryMock.mock.calls[0];
    expect(String(query)).toContain('insert into player_inventories');
    expect(String(query)).toContain('values');
    expect(String(query)).toContain('returning *');

    expect(params).toHaveLength(12);
    expect(params[0]).toBe('player-1');
    expect(params[1]).toBe('alpha-wearable');
    expect(params[2]).toBe('flawless');
    expect(params[4]).toBe(1000);
    expect(params[5]).toEqual(
      expect.objectContaining({
        wearableSlug: 'alpha-wearable',
        quality: 'flawless',
        durabilityScore: 1000,
        source: 'loot',
      })
    );

    expect(params[6]).toBe('player-1');
    expect(params[7]).toBe('beta-wearable');
    expect(params[8]).toBe('average');
    expect(params[10]).toBe(700);
    expect(params[11]).toEqual(
      expect.objectContaining({
        wearableSlug: 'beta-wearable',
        quality: 'average',
        durabilityScore: 700,
        source: 'reward',
      })
    );
  });

  it('caps durability to the quality band maximum', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'row-1' }] });

    await createInventoryInstances({
      playerId: 'player-1',
      items: [
        {
          wearableSlug: 'excellent-wearable',
          quality: 'excellent',
          durabilityScore: 1000,
          itemData: { source: 'loot' },
        },
      ],
    });

    const [, params] = queryMock.mock.calls[0];
    expect(params[4]).toBe(900);
    expect(params[5]).toEqual(
      expect.objectContaining({
        wearableSlug: 'excellent-wearable',
        quality: 'excellent',
        durabilityScore: 900,
      })
    );
  });
});
