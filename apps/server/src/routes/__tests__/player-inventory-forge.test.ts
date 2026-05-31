import request from 'supertest';
import express, { type Application } from 'express';
import { registerPlayerInventoryForgeRoutes } from '../player-inventory-forge';

const mockClient = {
  query: jest.fn(),
} as any;

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  playersRepo: {
    getPlayerById: jest.fn(),
  },
  inventoryRepo: {
    getWearableInventoryBySlug: jest.fn(),
    decrementInventoryItem: jest.fn(),
    removeInventoryItemById: jest.fn(),
    createInventoryInstance: jest.fn(),
    upsertInventoryItem: jest.fn(),
  },
  inventoryEventsRepo: {
    logInventoryEvent: jest.fn(),
  },
  economyRepo: {
    logTransaction: jest.fn(),
  },
  equipmentRepo: {
    getEquippedSummary: jest.fn(),
  },
}));

jest.mock('../../lib/equipment-service', () => ({
  ensurePlayerCanModifyEquipment: jest.fn(),
  EquipmentError: class EquipmentError extends Error {
    status: number;
    code: string;
    constructor(
      code = 'equipment_error',
      message = 'Equipment error',
      status = 400
    ) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

jest.mock('../../lib/gotchi-ownership-snapshot', () => ({
  verifyGotchiOwnershipForTodaySnapshot: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { runTransaction } from '../../lib/db/client';
import {
  playersRepo,
  inventoryRepo,
  inventoryEventsRepo,
  economyRepo,
  equipmentRepo,
} from '../../lib/db';
import {
  ensurePlayerCanModifyEquipment,
} from '../../lib/equipment-service';
import { verifyGotchiOwnershipForTodaySnapshot } from '../../lib/gotchi-ownership-snapshot';

describe('player inventory forge routes', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPlayerInventoryForgeRoutes(app);

    jest.clearAllMocks();
    jest.spyOn(Math, 'random').mockReturnValue(0);

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler) => {
      return handler(mockClient);
    });

    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return { rows: [] };
      }
      if (
        normalized.includes('update players') &&
        normalized.includes('lick_tongue_count')
      ) {
        return { rows: [{ lick_tongue_count: 0 }] };
      }
      return { rows: [] };
    });

    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      selectedCharacterId: 'gotchi:6741',
    });

    (ensurePlayerCanModifyEquipment as jest.Mock).mockResolvedValue(undefined);

    (verifyGotchiOwnershipForTodaySnapshot as jest.Mock).mockResolvedValue({
      owned: true,
      snapshotMissing: false,
      blockNumber: 123456,
      slugs: ['bitcoin-beanie'],
      assignments: [{ slot: 'head', slug: 'bitcoin-beanie' }],
    });

    (equipmentRepo.getEquippedSummary as jest.Mock).mockResolvedValue({
      idSet: new Set(),
      countBySlug: new Map(),
    });

    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([
      {
        id: 'excellent-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'excellent',
        durabilityScore: 450,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ]);

    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityAfter: 900,
    });

    (inventoryRepo.removeInventoryItemById as jest.Mock).mockResolvedValue({
      id: 'excellent-1',
      wearableSlug: 'bitcoin-beanie',
      quality: 'excellent',
    });

    (inventoryRepo.createInventoryInstance as jest.Mock).mockResolvedValue({
      id: 'flawless-1',
      wearableSlug: 'bitcoin-beanie',
      quality: 'flawless',
      durabilityScore: 1000,
    });
    (inventoryRepo.upsertInventoryItem as jest.Mock).mockResolvedValue({});

    (inventoryEventsRepo.logInventoryEvent as jest.Mock).mockResolvedValue({});
    (economyRepo.logTransaction as jest.Mock).mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('consumes an excellent copy and grants a flawless copy on success', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return {
          rows: [
            {
              id: 'tongue-1',
              playerId: 'player-1',
              item_type: 'material',
              item_name: 'Lick Tongue',
              quantity: 5,
            },
          ],
        };
      }
      if (
        normalized.includes('update players') &&
        normalized.includes('lick_tongue_count')
      ) {
        return { rows: [{ lick_tongue_count: 3 }] };
      }
      return { rows: [] };
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(
      async (_playerId, itemType, itemName) => {
        if (itemType === 'coin' && itemName === 'Gold') {
          return { quantityAfter: 900 };
        }
        if (itemName === 'Lick Tongue') {
          return { quantityAfter: 3 };
        }
        return null;
      }
    );

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        outcome: 'success',
        wearableSlug: 'bitcoin-beanie',
        consumedInventoryItemId: 'excellent-1',
        goldBalance: 900,
        usedLickTongueBypass: true,
        lickTonguesSpent: 2,
        lickTongueBalance: 3,
        sourceQuality: 'excellent',
        successChancePct: 70,
        grantedItem: expect.objectContaining({
          inventoryItemId: 'flawless-1',
          wearableSlug: 'bitcoin-beanie',
          quality: 'flawless',
          durabilityScore: 1000,
        }),
      })
    );
  });

  it('consumes a lower-quality copy and spends lick tongues with reduced success chance', async () => {
    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([
      {
        id: 'average-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'average',
        durabilityScore: 700,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return {
          rows: [
            {
              id: 'tongue-1',
              playerId: 'player-1',
              item_type: 'material',
              item_name: 'Lick Tongue',
              quantity: 5,
            },
          ],
        };
      }
      if (
        normalized.includes('update players') &&
        normalized.includes('lick_tongue_count')
      ) {
        return { rows: [{ lick_tongue_count: 3 }] };
      }
      return { rows: [] };
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(
      async (_playerId, itemType, itemName) => {
        if (itemType === 'coin' && itemName === 'Gold') {
          return { quantityAfter: 900 };
        }
        if (itemName === 'Lick Tongue') {
          return { quantityAfter: 3 };
        }
        return null;
      }
    );

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        outcome: 'success',
        wearableSlug: 'bitcoin-beanie',
        consumedInventoryItemId: 'average-1',
        usedLickTongueBypass: true,
        sourceQuality: 'average',
        successChancePct: 35,
        lickTonguesSpent: 2,
        lickTongueBalance: 3,
      })
    );
  });

  it('rejects forging when no owned source copy exists', async () => {
    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('FORGE_SOURCE_REQUIRED');
  });

  it('rejects forging when the only owned source copy is already flawless', async () => {
    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([
      {
        id: 'flawless-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'flawless',
        durabilityScore: 1000,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ]);

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ALREADY_FLAWLESS');
  });

  it('uses a lower-quality source when a flawless copy also exists', async () => {
    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([
      {
        id: 'flawless-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'flawless',
        durabilityScore: 1000,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
      {
        id: 'average-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'average',
        durabilityScore: 700,
        createdAt: '2026-03-23T00:00:01.000Z',
      },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return {
          rows: [
            {
              id: 'tongue-1',
              playerId: 'player-1',
              item_type: 'material',
              item_name: 'Lick Tongue',
              quantity: 5,
            },
          ],
        };
      }
      if (
        normalized.includes('update players') &&
        normalized.includes('lick_tongue_count')
      ) {
        return { rows: [{ lick_tongue_count: 3 }] };
      }
      return { rows: [] };
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(
      async (_playerId, itemType, itemName) => {
        if (itemType === 'coin' && itemName === 'Gold') {
          return { quantityAfter: 900 };
        }
        if (itemName === 'Lick Tongue') {
          return { quantityAfter: 3 };
        }
        return null;
      }
    );

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        consumedInventoryItemId: 'average-1',
        sourceQuality: 'average',
        successChancePct: 35,
      })
    );
  });

  it('rejects forging when a lower-quality source exists but not enough lick tongues are available', async () => {
    (inventoryRepo.getWearableInventoryBySlug as jest.Mock).mockResolvedValue([
      {
        id: 'budget-1',
        playerId: 'player-1',
        itemType: 'wearable',
        itemName: 'bitcoin-beanie',
        wearableSlug: 'bitcoin-beanie',
        quality: 'budget',
        durabilityScore: 500,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ]);
    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(
      async (_playerId, itemType, itemName) => {
        if (itemType === 'coin' && itemName === 'Gold') {
          return { quantityAfter: 900 };
        }
        if (itemName === 'Lick Tongue') {
          throw new Error('Insufficient quantity to decrement inventory item');
        }
        return null;
      }
    );

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INSUFFICIENT_LICK_TONGUES');
  });

  it('rejects forging when an excellent source exists but not enough lick tongues are available', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).toLowerCase();
      if (normalized.includes('from player_inventories')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockImplementation(
      async (_playerId, itemType, itemName) => {
        if (itemType === 'coin' && itemName === 'Gold') {
          return { quantityAfter: 900 };
        }
        if (itemName === 'Lick Tongue') {
          throw new Error('Insufficient quantity to decrement inventory item');
        }
        return null;
      }
    );

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INSUFFICIENT_LICK_TONGUES');
  });

  it('rejects forging when the selected character is not a gotchi', async () => {
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      id: 'player-1',
      selectedCharacterId: 'coderdan',
    });

    const response = await request(app)
      .post('/api/player/inventory/forge')
      .send({ wearableSlug: 'bitcoin-beanie' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('GOTCHI_REQUIRED');
  });
});
