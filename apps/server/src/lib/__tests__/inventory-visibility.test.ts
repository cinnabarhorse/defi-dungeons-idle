import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const queryMock = jest.fn();
const getPgPoolMock = jest.fn(() => ({ query: queryMock }));

jest.mock('../db/client', () => ({
  getPgPool: getPgPoolMock,
}));

import { getEquippedSummary } from '../db/repos/equipment';
import { filterInventoryRecordsForResponse } from '../inventory-visibility';
import { getCharacterStats } from '../../data/characters';
import { getWearableBySlug, slugifyWearableName } from '../../data/wearables';
import type { PlayerInventoryRecord } from '../db/types';

describe('inventory visibility from equipment summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not hide inventory items when only derived equipment rows exist', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          wearable_slug: 'spirit-sword',
          inventory_item_id: null,
          source: 'derived',
        },
      ],
    });

    const records: PlayerInventoryRecord[] = [
      {
        id: 'inv-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'spirit-sword',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-1',
        wearableSlug: 'spirit-sword',
        quality: 'average',
        qualityScore: null,
        durabilityScore: 1000,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'inv-2',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'spirit-sword',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-2',
        wearableSlug: 'spirit-sword',
        quality: 'average',
        qualityScore: null,
        durabilityScore: 900,
        createdAt: null,
        updatedAt: null,
      },
    ];

    const summary = await getEquippedSummary('player-1');
    const visible = filterInventoryRecordsForResponse(records, summary);

    expect(visible).toHaveLength(2);
    expect(new Set(visible.map((row) => row.id))).toEqual(
      new Set(['inv-1', 'inv-2'])
    );
  });

  it('keeps a single inventory wearable visible after unequip with derived snapshot rows', async () => {
    const characterId = 'coderdan';
    const baseStats = getCharacterStats(characterId);
    const baseSlugs = new Set(baseStats.equipment?.slugs ?? []);

    const slug = slugifyWearableName('Spirit Sword');
    expect(getWearableBySlug(slug)).toBeTruthy();
    expect(baseSlugs.has(slug)).toBe(false);

    const records: PlayerInventoryRecord[] = [
      {
        id: 'inv-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: slug,
        quantity: 1,
        itemData: {},
        instanceId: 'inst-1',
        wearableSlug: slug,
        quality: 'average',
        qualityScore: null,
        durabilityScore: 1000,
        createdAt: null,
        updatedAt: null,
      },
    ];

    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            wearable_slug: slug,
            inventory_item_id: 'inv-1',
            source: 'override',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            wearable_slug: slug,
            inventory_item_id: null,
            source: 'derived',
          },
        ],
      });

    const equippedSummary = await getEquippedSummary('player-1');
    const equippedVisible = filterInventoryRecordsForResponse(
      records,
      equippedSummary
    );
    expect(equippedVisible).toHaveLength(0);

    const unequippedSummary = await getEquippedSummary('player-1');
    const unequippedVisible = filterInventoryRecordsForResponse(
      records,
      unequippedSummary
    );
    expect(unequippedVisible).toHaveLength(1);
    expect(unequippedVisible[0]?.id).toBe('inv-1');
  });

  it('hides lower-quality legacy override rows before hiding a flawless copy', () => {
    const records: PlayerInventoryRecord[] = [
      {
        id: 'flawless-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'gentleman-coat',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-flawless',
        wearableSlug: 'gentleman-coat',
        quality: 'flawless',
        qualityScore: null,
        durabilityScore: 1000,
        createdAt: '2026-03-24T00:00:00.000Z',
        updatedAt: null,
      },
      {
        id: 'average-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'gentleman-coat',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-average-1',
        wearableSlug: 'gentleman-coat',
        quality: 'average',
        qualityScore: null,
        durabilityScore: 700,
        createdAt: '2026-03-23T00:00:00.000Z',
        updatedAt: null,
      },
      {
        id: 'average-2',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'gentleman-coat',
        quantity: 1,
        itemData: {},
        instanceId: 'inst-average-2',
        wearableSlug: 'gentleman-coat',
        quality: 'average',
        qualityScore: null,
        durabilityScore: 650,
        createdAt: '2026-03-22T00:00:00.000Z',
        updatedAt: null,
      },
    ];

    const visible = filterInventoryRecordsForResponse(records, {
      idSet: new Set(),
      countBySlug: new Map([['gentleman-coat', 1]]),
    });

    expect(visible.map((row) => row.id)).toEqual(['flawless-1', 'average-1']);
  });
});
