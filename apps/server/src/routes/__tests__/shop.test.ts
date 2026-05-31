import request from 'supertest';
import express, { type Application } from 'express';
import { registerShopRoutes } from '../shop';

// Mock dependencies BEFORE importing routes
jest.mock('../../lib/db/repos/inventory', () => ({
  getInventory: jest.fn(),
  upsertInventoryItem: jest.fn(),
  decrementInventoryItem: jest.fn(),
}));

jest.mock('../../lib/db/repos/inventory-events', () => ({
  logInventoryEvent: jest.fn(),
}));

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

// Import mocks after jest.mock
import {
  getInventory,
  upsertInventoryItem,
  decrementInventoryItem,
} from '../../lib/db/repos/inventory';
import { logInventoryEvent } from '../../lib/db/repos/inventory-events';
import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { runTransaction } from '../../lib/db/client';

describe('POST /api/shop/purchase', () => {
  let app: Application;
  const mockPlayerId = 'test-player-id';
  const mockWalletAddress = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerShopRoutes(app);

    // Reset all mocks
    jest.clearAllMocks();

    // Default: authenticated API key principal
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: mockPlayerId,
      walletAddress: mockWalletAddress,
    });
  });

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      (resolveAuthPrincipal as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when purchases array is missing', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid purchases array');
    });

    it('should return 400 when purchases array is empty', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid purchases array');
    });

    it('should return 400 when purchases is not an array', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid purchases array');
    });

    it('should return 400 when too many items (>10)', async () => {
      const purchases = Array.from({ length: 11 }, (_, i) => ({
        itemId: 'health_potion',
        quantity: 1,
      }));

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Too many items');
      expect(response.body.max).toBe(10);
    });

    it('should return 400 when itemId is missing', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ quantity: 1 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid purchase format');
    });

    it('should return 400 when quantity is missing', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion' }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid purchase format');
    });

    it('should return 400 when quantity is less than 1', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 0 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid quantity');
    });

    it('should return 400 when quantity is greater than 999', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1000 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid quantity');
    });

    it('should return 404 when itemId does not exist', async () => {
      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'nonexistent_item', quantity: 1 }] });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Item not found');
    });
  });

  describe('Business Logic', () => {
    let transactionClient: any;

    beforeEach(() => {
      (runTransaction as jest.Mock).mockImplementation(async (handler) => {
        transactionClient = { id: 'mock-client' } as any;
        return handler(transactionClient);
      });
    });

    it('should successfully purchase a single health potion', async () => {
      // Setup: player has enough gold
      (getInventory as jest.Mock).mockResolvedValue([
        {
          itemType: 'coin',
          itemName: 'Gold',
          quantity: 100,
        },
      ]);

      (decrementInventoryItem as jest.Mock).mockResolvedValue({
        quantityBefore: 100,
        quantityAfter: 95,
        deleted: false,
        record: { quantity: 95 },
      });

      (upsertInventoryItem as jest.Mock).mockResolvedValue({
        id: 'potion-1',
        itemName: 'Health Potion',
        itemType: 'potion',
        quantity: 1,
      });

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].name).toBe('Health Potion');
      expect(response.body.items[0].quantity).toBe(1);
      expect(response.body.spent).toBe(5);
      expect(response.body.currency).toBe('Gold');
      expect(response.body.newBalance).toBe(95);

      // Verify database calls
      expect(decrementInventoryItem).toHaveBeenCalledWith(
        mockPlayerId,
        'coin',
        'Gold',
        5,
        expect.anything()
      );
      expect(upsertInventoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: mockPlayerId,
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 1,
        })
      );

      expect(logInventoryEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: mockPlayerId,
          itemType: 'coin',
          itemName: 'Gold',
          delta: -5,
          reason: 'shop_purchase',
        }),
        transactionClient
      );
    });

    it('should successfully purchase multiple potions', async () => {
      (getInventory as jest.Mock).mockResolvedValue([
        {
          itemType: 'coin',
          itemName: 'Gold',
          quantity: 100,
        },
      ]);

      (decrementInventoryItem as jest.Mock).mockResolvedValue({
        quantityBefore: 100,
        quantityAfter: 85,
        deleted: false,
        record: { quantity: 85 },
      });

      (upsertInventoryItem as jest.Mock)
        .mockResolvedValueOnce({
          id: 'potion-1',
          itemName: 'Health Potion',
          itemType: 'potion',
          quantity: 2,
        })
        .mockResolvedValueOnce({
          id: 'potion-2',
          itemName: 'Mana Potion',
          itemType: 'potion',
          quantity: 1,
        });

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({
          purchases: [
            { itemId: 'health_potion', quantity: 2 },
            { itemId: 'mana_potion', quantity: 1 },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.spent).toBe(15); // 2 * 5 + 1 * 5
      expect(response.body.newBalance).toBe(85);

      expect(decrementInventoryItem).toHaveBeenCalledWith(
        mockPlayerId,
        'coin',
        'Gold',
        15,
        expect.anything()
      );
      expect(upsertInventoryItem).toHaveBeenCalledTimes(2);
    });

    it('should return 400 when insufficient funds', async () => {
      (getInventory as jest.Mock).mockResolvedValue([
        {
          itemType: 'coin',
          itemName: 'Gold',
          quantity: 3, // Not enough for 1 potion (costs 5)
        },
      ]);

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient funds');
      expect(response.body.required).toBe(5);
      expect(response.body.available).toBe(3);
      expect(response.body.currency).toBe('Gold');
    });

    it('should return 400 when player has no gold', async () => {
      (getInventory as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient funds');
      expect(response.body.available).toBe(0);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      (getInventory as jest.Mock).mockResolvedValue([
        {
          itemType: 'coin',
          itemName: 'Gold',
          quantity: 100,
        },
      ]);
    });

    it('should return 500 when database transaction fails', async () => {
      (runTransaction as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database connection failed');
    });

    it('should return 500 when decrement fails', async () => {
      (runTransaction as jest.Mock).mockImplementation(async (handler) => {
        const mockClient = {} as any;
        (decrementInventoryItem as jest.Mock).mockResolvedValue(null); // Failed
        return handler(mockClient);
      });

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to deduct currency');
    });

    it('should handle unexpected errors gracefully', async () => {
      (getInventory as jest.Mock).mockRejectedValue(
        new Error('Unexpected database error')
      );

      const response = await request(app)
        .post('/api/shop/purchase')
        .send({ purchases: [{ itemId: 'health_potion', quantity: 1 }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
    });
  });
});
