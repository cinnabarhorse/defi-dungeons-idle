let mockTransactionQueue: Promise<unknown> = Promise.resolve();

const mockClient = {} as any;

jest.mock('../../lib/db', () => {
  const actual = jest.requireActual('../../lib/db');
  return {
    ...actual,
    runTransaction: jest.fn((task: any) => {
      const result = mockTransactionQueue.then(() => task(mockClient));
      mockTransactionQueue = result.catch(() => undefined);
      return result;
    }),
    gamePlayersRepo: {
      ...actual.gamePlayersRepo,
      getById: jest.fn(),
      applyStats: jest.fn(),
    },
    equipmentRepo: {
      ...actual.equipmentRepo,
      getEquippedWithInstances: jest.fn(),
    },
    inventoryRepo: {
      ...actual.inventoryRepo,
      applyWearableDurabilityLossById: jest.fn(),
    },
    progressionRepo: {
      ...actual.progressionRepo,
      updateProgression: jest.fn(),
    },
  };
});

import { GameRoom } from '../GameRoom';
import {
  equipmentRepo,
  gamePlayersRepo,
  inventoryRepo,
  progressionRepo,
} from '../../lib/db';

describe('GameRoom durability settlement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransactionQueue = Promise.resolve();
  });

  it('settles equipped wearable durability only once for overlapping requests', async () => {
    let durabilityMeta = {
      currentRunOrdinal: 1,
      settledRunOrdinal: 0,
    };
    let durabilityScore = 100;

    (gamePlayersRepo.getById as jest.Mock).mockImplementation(async () => ({
      id: 'gp-1',
      metadata: {
        durability: { ...durabilityMeta },
      },
    }));
    (gamePlayersRepo.applyStats as jest.Mock).mockImplementation(
      async ({ metadata }: { metadata?: Record<string, unknown> }) => {
        const nextDurability =
          metadata?.durability && typeof metadata.durability === 'object'
            ? (metadata.durability as Record<string, unknown>)
            : {};
        durabilityMeta = {
          currentRunOrdinal: Number(nextDurability.currentRunOrdinal) || 1,
          settledRunOrdinal: Number(nextDurability.settledRunOrdinal) || 0,
        };
        return {
          id: 'gp-1',
          metadata: {
            durability: { ...durabilityMeta },
          },
        };
      }
    );
    (equipmentRepo.getEquippedWithInstances as jest.Mock).mockImplementation(
      async () => [
        {
          slot: 'head',
          wearableSlug: 'bitcoin-beanie',
          inventoryItemId: 'inv-1',
          quality: 'average',
          durabilityScore,
        },
      ]
    );
    (inventoryRepo.applyWearableDurabilityLossById as jest.Mock).mockImplementation(
      async (_playerId: string, _inventoryItemId: string, loss: number) => {
        durabilityScore = Math.max(0, durabilityScore - loss);
        return {
          id: 'inv-1',
          durabilityScore,
        };
      }
    );
    (progressionRepo.updateProgression as jest.Mock).mockResolvedValue(undefined);

    const room = {
      phase: 'in_game',
      gamePlayerStats: new Map([['session-1', { gamePlayerId: 'gp-1' }]]),
      getPlayerIdForSession: jest.fn(() => 'player-1'),
      state: {
        players: new Map([
          [
            'session-1',
            {
              characterId: 'coderdan',
              idleRoom: { maxDepthReached: 20 },
            },
          ],
        ]),
      },
      playerEquipmentSnapshots: new Map(),
      equipmentBroadcastUpdate: jest.fn(),
      getDurabilityRunMetadata: (GameRoom.prototype as any).getDurabilityRunMetadata,
    };

    await Promise.all([
      GameRoom.prototype.settleEquippedWearableDurability.call(
        room as any,
        'session-1',
        'death'
      ),
      GameRoom.prototype.settleEquippedWearableDurability.call(
        room as any,
        'session-1',
        'restart'
      ),
    ]);

    expect(inventoryRepo.applyWearableDurabilityLossById).toHaveBeenCalledTimes(1);
    expect(gamePlayersRepo.applyStats).toHaveBeenCalledTimes(1);
    expect(progressionRepo.updateProgression).toHaveBeenCalledTimes(1);
  });
});
