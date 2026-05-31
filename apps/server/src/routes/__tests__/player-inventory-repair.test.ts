import request from 'supertest';
import express, { type Application } from 'express';
import { registerPlayerInventoryRepairRoutes } from '../player-inventory-repair';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  inventoryRepo: {
    getInventoryMapByIds: jest.fn(),
    decrementInventoryItem: jest.fn(),
    setWearableDurabilityById: jest.fn(),
  },
  inventoryEventsRepo: {
    logInventoryEvent: jest.fn(),
  },
  economyRepo: {
    logTransaction: jest.fn(),
  },
}));

jest.mock('../../lib/equipment-service', () => ({
  ensurePlayerCanModifyEquipment: jest.fn(),
  refreshAndBroadcastEquipmentState: jest.fn(),
  EquipmentError: class EquipmentError extends Error {
    status: number;
    code: string;
    constructor(code = 'equipment_error', message = 'Equipment error', status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { runTransaction } from '../../lib/db/client';
import { inventoryRepo, inventoryEventsRepo, economyRepo } from '../../lib/db';
import {
  ensurePlayerCanModifyEquipment,
  refreshAndBroadcastEquipmentState,
} from '../../lib/equipment-service';

describe('player inventory repair routes', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPlayerInventoryRepairRoutes(app);

    jest.clearAllMocks();

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler) => {
      const client = {} as any;
      return handler(client);
    });

    (ensurePlayerCanModifyEquipment as jest.Mock).mockResolvedValue(undefined);
    (refreshAndBroadcastEquipmentState as jest.Mock).mockResolvedValue(undefined);
    (inventoryEventsRepo.logInventoryEvent as jest.Mock).mockResolvedValue(undefined);
    (economyRepo.logTransaction as jest.Mock).mockResolvedValue(undefined);
  });

  it('repairs a wearable to its quality cap', async () => {
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'wearable-1',
          {
            id: 'wearable-1',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            durabilityScore: 650,
          },
        ],
      ])
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityAfter: 58,
    });
    (inventoryRepo.setWearableDurabilityById as jest.Mock).mockResolvedValue({
      id: 'wearable-1',
      wearableSlug: 'camo-hat',
      durabilityScore: 900,
    });

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemId: 'wearable-1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repairedItems: [
        {
          inventoryItemId: 'wearable-1',
          durabilityScore: 900,
          goldSpent: 38,
        },
      ],
      inventoryItemId: 'wearable-1',
      durabilityScore: 900,
      goldSpent: 38,
      goldBalance: 58,
    });
    expect(inventoryRepo.setWearableDurabilityById).toHaveBeenCalledWith(
      'player-1',
      'wearable-1',
      900,
      expect.anything()
    );
    expect(inventoryEventsRepo.logInventoryEvent).toHaveBeenCalledWith(
      {
        playerId: 'player-1',
        itemType: 'coin',
        itemName: 'Gold',
        delta: -38,
        reason: 'wearable_repair',
        metadata: {
          totalCost: 38,
          items: [
            {
              inventoryItemId: 'wearable-1',
              wearableSlug: 'camo-hat',
              quality: 'excellent',
              durabilityBefore: 650,
              durabilityAfter: 900,
              goldSpent: 38,
            },
          ],
        },
      },
      expect.anything()
    );
    expect(refreshAndBroadcastEquipmentState).toHaveBeenCalledWith('player-1');
  });

  it('rejects already repaired wearables', async () => {
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'wearable-2',
          {
            id: 'wearable-2',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'starter-cap',
            wearableSlug: 'starter-cap',
            quality: 'average',
            durabilityScore: 700,
          },
        ],
      ])
    );

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemId: 'wearable-2' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('ALREADY_REPAIRED');
  });

  it('rejects insufficient gold', async () => {
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'wearable-3',
          {
            id: 'wearable-3',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'broken-cap',
            wearableSlug: 'broken-cap',
            quality: 'broken',
            durabilityScore: 0,
          },
        ],
      ])
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemId: 'wearable-3' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INSUFFICIENT_GOLD');
  });

  it('maps thrown insufficient-gold batch failures to a 400 error', async () => {
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'wearable-1',
          {
            id: 'wearable-1',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            durabilityScore: 650,
          },
        ],
        [
          'wearable-2',
          {
            id: 'wearable-2',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'bitcoin-beanie',
            wearableSlug: 'bitcoin-beanie',
            quality: 'average',
            durabilityScore: 600,
          },
        ],
      ])
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockRejectedValue(
      new Error('Insufficient quantity to decrement inventory item')
    );

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemIds: ['wearable-1', 'wearable-2'] });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INSUFFICIENT_GOLD');
  });

  it('blocks repairs during active runs', async () => {
    (ensurePlayerCanModifyEquipment as jest.Mock).mockRejectedValue(
      new (jest.requireMock('../../lib/equipment-service').EquipmentError)(
        'state_disallowed',
        'Equipment changes are disabled during an active run',
        409
      )
    );

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemId: 'wearable-4' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('state_disallowed');
  });

  it('repairs multiple wearables in one request', async () => {
    (inventoryRepo.getInventoryMapByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          'wearable-1',
          {
            id: 'wearable-1',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'camo-hat',
            wearableSlug: 'camo-hat',
            quality: 'excellent',
            durabilityScore: 650,
          },
        ],
        [
          'wearable-2',
          {
            id: 'wearable-2',
            playerId: 'player-1',
            itemType: 'wearable',
            itemName: 'bitcoin-beanie',
            wearableSlug: 'bitcoin-beanie',
            quality: 'average',
            durabilityScore: 600,
          },
        ],
      ])
    );
    (inventoryRepo.decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityAfter: 19,
    });
    (inventoryRepo.setWearableDurabilityById as jest.Mock)
      .mockResolvedValueOnce({
        id: 'wearable-1',
        wearableSlug: 'camo-hat',
        durabilityScore: 900,
      })
      .mockResolvedValueOnce({
        id: 'wearable-2',
        wearableSlug: 'bitcoin-beanie',
        durabilityScore: 700,
      });

    const response = await request(app)
      .post('/api/player/inventory/repair')
      .send({ inventoryItemIds: ['wearable-1', 'wearable-2'] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      repairedItems: [
        {
          inventoryItemId: 'wearable-1',
          durabilityScore: 900,
          goldSpent: 38,
        },
        {
          inventoryItemId: 'wearable-2',
          durabilityScore: 700,
          goldSpent: 10,
        },
      ],
      goldSpent: 48,
      goldBalance: 19,
      inventoryItemId: null,
      durabilityScore: null,
    });
  });
});
