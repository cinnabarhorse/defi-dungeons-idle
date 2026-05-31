import request from 'supertest';
import express, { type Application } from 'express';
import { getTotalXpForLevel } from '@gotchiverse/progression';
import { registerPlayerProgressionRebirthRoutes } from '../player-progression-rebirth';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

jest.mock('../../lib/db/repos/inventory', () => ({
  upsertInventoryItem: jest.fn(),
  decrementInventoryItem: jest.fn(),
}));

jest.mock('../../lib/db/repos/inventory-events', () => ({
  logInventoryEvent: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { runTransaction } from '../../lib/db/client';
import { decrementInventoryItem, upsertInventoryItem } from '../../lib/db/repos/inventory';
import { logInventoryEvent } from '../../lib/db/repos/inventory-events';

function createMockTransactionClient(options: {
  playerRows: any[];
  inventoryRowsByCall?: any[][];
  updateRows?: any[];
}) {
  let inventoryCalls = 0;
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('from players') && sql.includes('for update')) {
      return { rows: options.playerRows };
    }

    if (sql.includes('from player_inventories')) {
      const rows =
        options.inventoryRowsByCall?.[inventoryCalls] ??
        options.inventoryRowsByCall?.[options.inventoryRowsByCall.length - 1] ??
        [];
      inventoryCalls += 1;
      return { rows };
    }

    if (sql.trim().toLowerCase().startsWith('update players')) {
      return { rows: options.updateRows ?? [] };
    }

    throw new Error(`Unexpected query in rebirth route test: ${sql}`);
  });

  return { query };
}

describe('POST /api/player/progression/rebirth', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPlayerProgressionRebirthRoutes(app);

    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue(null);

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when player not linked to session', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: null,
      address: '0xabc',
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Player not linked to session' });
  });

  it('returns 404 when player not found', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Player not found' });
  });

  it('returns 400 when rebirth cap is reached', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 34,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 2000,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Rebirth is capped at level 199.');
  });

  it('returns 400 when player is below current max level', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 1,
          total_xp: 0,
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 0,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Reach level 99 before rebirthing');
    expect(response.body.error).toContain('current level 1');
  });

  it('returns 400 when not enough Lick Tongues', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 999,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 999,
          },
        ],
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Not enough Lick Tongues' });
    expect(decrementInventoryItem).not.toHaveBeenCalled();
  });

  it('backfills inventory to recorded count but still blocks if below rebirth cost', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 900,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 800,
          },
        ],
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 900,
          },
        ],
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    (upsertInventoryItem as jest.Mock).mockResolvedValue({
      id: 'inv-new',
      itemType: 'material',
      itemName: 'Lick Tongue',
      quantity: 100,
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Not enough Lick Tongues' });
    expect(upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'material',
        itemName: 'Lick Tongue',
        quantity: 100,
      })
    );
    expect(decrementInventoryItem).not.toHaveBeenCalled();
  });

  it('backfills inventory to recorded count and completes rebirth when it becomes sufficient', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 1500,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 800,
          },
        ],
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 1500,
          },
        ],
      ],
      updateRows: [
        {
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 500,
          rebirth_count: 1,
        },
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    (upsertInventoryItem as jest.Mock).mockResolvedValue({
      id: 'inv-1',
      itemType: 'material',
      itemName: 'Lick Tongue',
      quantity: 700,
    });

    (decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityBefore: 1500,
      quantityAfter: 500,
      deleted: false,
      record: { id: 'inv-1', quantity: 500 },
    });

    (logInventoryEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(200);
    expect(response.body.rebirthCount).toBe(1);
    expect(response.body.currentMaxLevel).toBe(102);
    expect(response.body.lickTongueCount).toBe(500);

    expect(upsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'material',
        itemName: 'Lick Tongue',
        quantity: 700,
      })
    );

    expect(decrementInventoryItem).toHaveBeenCalledWith(
      'player-1',
      'material',
      'Lick Tongue',
      1000,
      expect.anything()
    );
  });

  it('returns 409 when an inventory decrement fails', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1'],
          lick_tongue_count: 1000,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 1000,
          },
        ],
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    (decrementInventoryItem as jest.Mock).mockResolvedValue(null);

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'Rebirth could not be completed, please retry',
    });
  });

  it('falls back to default unlocked tiers when DB returns empty unlocked_tiers', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['hard_1'],
          lick_tongue_count: 1200,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 1200,
          },
        ],
      ],
      updateRows: [
        {
          unlocked_tiers: null,
          lick_tongue_count: 200,
          rebirth_count: 1,
        },
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    (decrementInventoryItem as jest.Mock).mockResolvedValue({
      quantityBefore: 1200,
      quantityAfter: 200,
      deleted: false,
      record: { id: 'inv-1', quantity: 200 },
    });

    (logInventoryEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(200);
    expect(response.body.unlockedTiers).toEqual(['normal_1']);
  });

  it('rebirths successfully: deducts tongues, resets profile, and increments max level', async () => {
    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      playerId: 'player-1',
      address: '0xabc',
    });

    const client = createMockTransactionClient({
      playerRows: [
        {
          level: 99,
          total_xp: getTotalXpForLevel(99),
          unspent_points: 0,
          rebirth_count: 0,
          unlocked_tiers: ['normal_1', 'hard_1'],
          lick_tongue_count: 1200,
          stat_allocations: { energy: 0, aggression: 0, spookiness: 0, brainSize: 0 },
          allocation_history: [],
          last_synced_at: null,
        },
      ],
      inventoryRowsByCall: [
        [
          {
            id: 'inv-1',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'Lick Tongue',
            quantity: 600,
          },
          {
            id: 'inv-2',
            player_id: 'player-1',
            item_type: 'material',
            item_name: 'lick_tongue',
            quantity: 700,
          },
        ],
      ],
      updateRows: [
        {
          unlocked_tiers: ['normal_1', 'hard_1'],
          lick_tongue_count: 300,
          rebirth_count: 1,
        },
      ],
    });

    (runTransaction as jest.Mock).mockImplementation(async (handler: any) => {
      return handler(client);
    });

    (decrementInventoryItem as jest.Mock)
      .mockResolvedValueOnce({
        quantityBefore: 600,
        quantityAfter: 0,
        deleted: true,
        record: null,
      })
      .mockResolvedValueOnce({
        quantityBefore: 700,
        quantityAfter: 300,
        deleted: false,
        record: { id: 'inv-2', quantity: 300 },
      });

    (logInventoryEvent as jest.Mock).mockResolvedValue({
      id: 'event-1',
    });

    const response = await request(app).post('/api/player/progression/rebirth');

    expect(response.status).toBe(200);
    expect(response.body.rebirthCount).toBe(1);
    expect(response.body.currentMaxLevel).toBe(102);
    expect(response.body.absoluteMaxLevel).toBe(199);
    expect(response.body.rebirthCost).toBe(1000);
    expect(response.body.lickTongueCount).toBe(300);
    expect(response.body.unlockedTiers).toEqual(['normal_1', 'hard_1']);

    expect(response.body.profile).toMatchObject({
      level: 1,
      totalXp: 0,
      unspentPoints: 0,
      stats: {
        energy: 0,
        aggression: 0,
        spookiness: 0,
        brainSize: 0,
      },
      allocationHistory: [],
    });

    expect(decrementInventoryItem).toHaveBeenNthCalledWith(
      1,
      'player-1',
      'material',
      'Lick Tongue',
      600,
      expect.anything()
    );
    expect(decrementInventoryItem).toHaveBeenNthCalledWith(
      2,
      'player-1',
      'material',
      'lick_tongue',
      400,
      expect.anything()
    );

    expect(logInventoryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-1',
        itemType: 'material',
        itemName: 'Lick Tongue',
        delta: -1000,
        reason: 'rebirth_purchase',
      })
    );
  });
});
