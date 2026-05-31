import request from 'supertest';
import express, { type Application } from 'express';
import {
  registerInventorySellRoutes,
  resetInventorySellRateLimit,
} from '../inventory-sell';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  inventoryRepo: {
    getInventoryMapByIds: jest.fn(),
    removeInventoryItemById: jest.fn(),
    decrementInventoryItemWithRecord: jest.fn(),
    upsertInventoryItem: jest.fn(),
  },
  equipmentRepo: {
    getEquippedSummary: jest.fn(),
  },
  economyRepo: {
    logTransaction: jest.fn(),
  },
  globalEconomyCountersRepo: {
    getCounterForUpdate: jest.fn(),
    incrementCounter: jest.fn(),
    getCounter: jest.fn(),
  },
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { runTransaction } from '../../lib/db/client';
import {
  inventoryRepo,
  equipmentRepo,
  economyRepo,
  globalEconomyCountersRepo,
} from '../../lib/db';
import { getWearableBySlug, getWearableRarity } from '../../data/wearables';
import { EQUIPMENT_SELL_PRICE_BY_RARITY } from '../../lib/inventory-sell';

describe('inventory sell routes', () => {
  let app: Application;
  const mockPlayerId = 'player-1';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerInventorySellRoutes(app);

    jest.clearAllMocks();
    resetInventorySellRateLimit();

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: mockPlayerId,
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler) => {
      const mockClient = {} as any;
      return handler(mockClient);
    });

    (equipmentRepo.getEquippedSummary as jest.Mock).mockResolvedValue({
      idSet: new Set(),
      countBySlug: new Map(),
    });

    (globalEconomyCountersRepo.getCounterForUpdate as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 0,
      createdAt: null,
      updatedAt: null,
    });

    (globalEconomyCountersRepo.incrementCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 2,
      createdAt: null,
      updatedAt: null,
    });

    (inventoryRepo.upsertInventoryItem as jest.Mock).mockResolvedValue({
      id: 'gold-1',
      itemType: 'coin',
      itemName: 'Gold',
      quantity: 10,
    });

    (economyRepo.logTransaction as jest.Mock).mockResolvedValue({});
  });

  it('rejects unauthenticated requests', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ itemType: 'weapon', itemName: 'axe', quantity: 1 });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });

  it('rejects non-equipment items', async () => {
    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ itemType: 'potion', itemName: 'Health Potion', quantity: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ITEM_NOT_SELLABLE');
  });

  it('rejects equipped wearables', async () => {
    const itemId = 'wearable-1';
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          itemId,
          {
            id: itemId,
            playerId: mockPlayerId,
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            itemData: {},
          },
        ],
      ])
    );
    (equipmentRepo.getEquippedSummary as jest.Mock).mockResolvedValue({
      idSet: new Set([itemId]),
      countBySlug: new Map(),
    });

    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ inventoryItemId: itemId });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ITEM_EQUIPPED');
  });

  it('sells wearable instances with quality pricing', async () => {
    const itemId = 'wearable-2';
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          itemId,
          {
            id: itemId,
            playerId: mockPlayerId,
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            itemData: {},
          },
        ],
      ])
    );
    (inventoryRepo.removeInventoryItemById as jest.Mock).mockResolvedValue({
      id: itemId,
    });
    (globalEconomyCountersRepo.incrementCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 2,
      createdAt: null,
      updatedAt: null,
    });

    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ inventoryItemId: itemId });

    expect(response.status).toBe(200);
    expect(response.body.payout).toBe(2);
    expect(inventoryRepo.removeInventoryItemById).toHaveBeenCalled();
    expect(inventoryRepo.upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemName: 'Gold', quantity: 2 })
    );
    expect(economyRepo.logTransaction).toHaveBeenCalled();
  });

  it('sells fungible weapons using rarity pricing', async () => {
    const weaponSlug = 'mk2-grenade';
    const wearable = getWearableBySlug(weaponSlug);
    if (!wearable) {
      throw new Error('Missing wearable fixture for weapon test');
    }
    const rarity = getWearableRarity(wearable);
    const expectedUnitPrice = EQUIPMENT_SELL_PRICE_BY_RARITY[rarity];

    (inventoryRepo.decrementInventoryItemWithRecord as jest.Mock).mockResolvedValue({
      quantityBefore: 3,
      quantityAfter: 1,
      deleted: false,
      record: {
        id: 'weapon-1',
        playerId: mockPlayerId,
        itemType: 'weapon',
        itemName: weaponSlug,
        itemData: {},
      },
    });
    (globalEconomyCountersRepo.incrementCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: expectedUnitPrice * 2,
      createdAt: null,
      updatedAt: null,
    });

    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ itemType: 'weapon', itemName: weaponSlug, quantity: 2 });

    expect(response.status).toBe(200);
    expect(response.body.payout).toBe(expectedUnitPrice * 2);
    expect(economyRepo.logTransaction).toHaveBeenCalled();
  });

  it('rejects when global cap would be exceeded', async () => {
    const itemId = 'wearable-3';
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          itemId,
          {
            id: itemId,
            playerId: mockPlayerId,
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            itemData: {},
          },
        ],
      ])
    );
    (inventoryRepo.removeInventoryItemById as jest.Mock).mockResolvedValue({
      id: itemId,
    });
    (globalEconomyCountersRepo.getCounterForUpdate as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 9999,
      createdAt: null,
      updatedAt: null,
    });

    const response = await request(app)
      .post('/api/player/inventory/sell')
      .send({ inventoryItemId: itemId });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('GLOBAL_SELL_CAP_REACHED');
    expect(inventoryRepo.upsertInventoryItem).not.toHaveBeenCalled();
  });

  it('returns cap info from the economy endpoint', async () => {
    (globalEconomyCountersRepo.getCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 40,
      createdAt: null,
      updatedAt: null,
    });

    const response = await request(app).get('/api/economy/equipment-sell-cap');

    expect(response.status).toBe(200);
    expect(response.body.dailyCap).toBe(10000);
    expect(response.body.remainingToday).toBe(9960);
  });

  it('supports a basic sell flow', async () => {
    const itemId = 'wearable-4';
    (globalEconomyCountersRepo.getCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 0,
      createdAt: null,
      updatedAt: null,
    });
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          itemId,
          {
            id: itemId,
            playerId: mockPlayerId,
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            itemData: {},
          },
        ],
      ])
    );
    (inventoryRepo.removeInventoryItemById as jest.Mock).mockResolvedValue({
      id: itemId,
    });
    (globalEconomyCountersRepo.incrementCounter as jest.Mock).mockResolvedValue({
      counterName: 'equipment_sell_gold',
      bucketDate: '2026-01-27',
      amount: 2,
      createdAt: null,
      updatedAt: null,
    });

    const capResponse = await request(app).get(
      '/api/economy/equipment-sell-cap'
    );
    expect(capResponse.status).toBe(200);

    const sellResponse = await request(app)
      .post('/api/player/inventory/sell')
      .send({ inventoryItemId: itemId });

    expect(sellResponse.status).toBe(200);
    expect(sellResponse.body.newBalance).toBeDefined();
    expect(sellResponse.body.remainingToday).toBe(9998);
  });

});
