import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Client } from 'colyseus';

const mockGetByGameAndPlayer = jest.fn();
const mockInsertClaim = jest.fn();
const mockUpsertInventoryItem = jest.fn();
const mockCreateInventoryInstances = jest.fn();
const mockIncrementBonusRuns = jest.fn();
const mockRunTransaction = jest.fn(async (fn: any) => fn({}));

jest.mock('src/lib/db', () => ({
  competitionVictoryChestClaimsRepo: {
    getByGameAndPlayer: (...args: any[]) => mockGetByGameAndPlayer(...args),
    insertClaim: (...args: any[]) => mockInsertClaim(...args),
  },
  inventoryRepo: {
    upsertInventoryItem: (...args: any[]) => mockUpsertInventoryItem(...args),
    createInventoryInstances: (...args: any[]) => mockCreateInventoryInstances(...args),
  },
  playerDailyRunBonusRepo: {
    incrementBonusRuns: (...args: any[]) => mockIncrementBonusRuns(...args),
  },
  runTransaction: (...args: any[]) => mockRunTransaction(...args),
}));

const mockGetCompetitionDate = jest.fn(() => '2026-01-30');
jest.mock('src/lib/daily-quest-competition', () => ({
  getCompetitionDate: () => mockGetCompetitionDate(),
}));

const mockGetDailyRunsDate = jest.fn(() => '2026-01-31');
jest.mock('src/lib/daily-runs', () => ({
  getDailyRunsDate: () => mockGetDailyRunsDate(),
}));

const mockRollVictoryChestReward = jest.fn();
jest.mock('src/lib/victory-chest/rewards', () => ({
  rollVictoryChestReward: () => mockRollVictoryChestReward(),
}));

import { handleOpenVictoryChest } from '../VictoryChestSystem';

function createRoom(overrides?: Partial<any>) {
  return {
    state: {
      players: new Map<string, any>(),
    },
    getPlayerIdForSession: jest.fn(() => 'player-123'),
    msg: {
      sendTo: jest.fn(),
    },
    ...overrides,
  };
}

function createClient(sessionId: string): Client {
  return { sessionId } as any as Client;
}

function createPlayer(overrides?: Partial<any>) {
  return {
    idleRoom: {
      runStatus: 'victory',
      victoryChestStatus: 'available',
      victoryChestGameId: 'game-123',
      victoryChestRewardJson: '',
    },
    dailyQuestActive: true,
    ...overrides,
  };
}

describe('VictoryChestSystem.handleOpenVictoryChest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetByGameAndPlayer.mockReset();
    mockInsertClaim.mockReset();
    mockUpsertInventoryItem.mockReset();
    mockCreateInventoryInstances.mockReset();
    mockIncrementBonusRuns.mockReset();
    mockRunTransaction.mockClear();
    mockRunTransaction.mockImplementation(async (fn: any) => fn({}));
    mockGetCompetitionDate.mockReset();
    mockGetDailyRunsDate.mockReset();
    mockRollVictoryChestReward.mockReset();

    mockGetCompetitionDate.mockReturnValue('2026-01-30');
    mockGetDailyRunsDate.mockReturnValue('2026-01-31');
  });

  it('no-ops when not in victory state', async () => {
    const room = createRoom();
    const client = createClient('s1');
    room.state.players.set('s1', createPlayer({ idleRoom: { runStatus: 'active' } }));

    await handleOpenVictoryChest(room as any, client);

    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_open_failed',
      expect.objectContaining({ reason: expect.any(String) })
    );
    expect(mockGetByGameAndPlayer).not.toHaveBeenCalled();
  });

  it('no-ops when not a competition run', async () => {
    const room = createRoom();
    const client = createClient('s1');
    room.state.players.set('s1', createPlayer({ dailyQuestActive: false }));

    await handleOpenVictoryChest(room as any, client);

    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_open_failed',
      expect.objectContaining({ reason: expect.any(String) })
    );
    expect(mockGetByGameAndPlayer).not.toHaveBeenCalled();
  });

  it('no-ops when gameId is missing', async () => {
    const room = createRoom();
    const client = createClient('s1');
    room.state.players.set(
      's1',
      createPlayer({ idleRoom: { victoryChestGameId: '' } })
    );

    await handleOpenVictoryChest(room as any, client);

    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_open_failed',
      expect.objectContaining({ reason: expect.any(String) })
    );
    expect(mockGetByGameAndPlayer).not.toHaveBeenCalled();
  });

  it('re-sends cached payload from state when already opened', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const payload = {
      source: 'competition_victory_chest',
      gameId: 'game-123',
      competitionDate: '2026-01-30',
      goldBonus: { amount: 50 },
      reward: { type: 'potion', itemName: 'Health Potion', quantity: 1, potionTier: 1 },
    };
    room.state.players.set(
      's1',
      createPlayer({
        idleRoom: {
          runStatus: 'victory',
          victoryChestStatus: 'opened',
          victoryChestGameId: 'game-123',
          victoryChestRewardJson: JSON.stringify(payload),
        },
      })
    );

    await handleOpenVictoryChest(room as any, client);

    expect(room.msg.sendTo).toHaveBeenCalledWith(client, 'victory_chest_opened', payload);
    expect(mockGetByGameAndPlayer).not.toHaveBeenCalled();
  });

  it('hydrates from DB if already claimed', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer();
    room.state.players.set('s1', player);

    const existingPayload = {
      source: 'competition_victory_chest',
      gameId: 'game-123',
      competitionDate: '2026-01-30',
      goldBonus: { amount: 25 },
      reward: { type: 'bonus_competition_run' },
    };
    mockGetByGameAndPlayer.mockResolvedValueOnce({
      rewardPayload: existingPayload,
    });

    await handleOpenVictoryChest(room as any, client);

    expect(player.idleRoom.victoryChestStatus).toBe('opened');
    expect(player.idleRoom.victoryChestRewardJson).toBe(JSON.stringify(existingPayload));
    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_opened',
      existingPayload
    );
    expect(mockRollVictoryChestReward).not.toHaveBeenCalled();
  });

  it('does not re-roll if state says opened but DB has no claim (fail safe)', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer({
      idleRoom: {
        runStatus: 'victory',
        victoryChestStatus: 'opened',
        victoryChestGameId: 'game-123',
        victoryChestRewardJson: '', // missing/corrupt
      },
    });
    room.state.players.set('s1', player);

    mockGetByGameAndPlayer.mockResolvedValueOnce(null);

    await handleOpenVictoryChest(room as any, client);

    expect(mockRollVictoryChestReward).not.toHaveBeenCalled();
    expect(mockInsertClaim).not.toHaveBeenCalled();
    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_open_failed',
      expect.objectContaining({ reason: expect.any(String) })
    );
  });

  it('no-ops when chest status is neither available nor opened', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer({
      idleRoom: {
        runStatus: 'victory',
        victoryChestStatus: 'none',
        victoryChestGameId: 'game-123',
        victoryChestRewardJson: '',
      },
    });
    room.state.players.set('s1', player);

    await handleOpenVictoryChest(room as any, client);

    expect(mockGetByGameAndPlayer).not.toHaveBeenCalled();
    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_open_failed',
      expect.objectContaining({ reason: expect.any(String) })
    );
  });

  it('rolls reward, persists claim, and updates state when first opened', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer();
    room.state.players.set('s1', player);

    mockGetByGameAndPlayer.mockResolvedValueOnce(null); // pre-check
    mockGetByGameAndPlayer.mockResolvedValueOnce(null); // tx re-check

    mockRollVictoryChestReward.mockReturnValue({
      goldBonus: { amount: 50 },
      reward: { type: 'bonus_progression_run' },
    });

    await handleOpenVictoryChest(room as any, client);

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(mockInsertClaim).toHaveBeenCalledTimes(1);
    expect(mockUpsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-123',
        itemType: 'coin',
        itemName: 'Gold',
        quantity: 50,
      })
    );
    expect(mockIncrementBonusRuns).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'player-123',
        date: '2026-01-31',
        mode: 'progression',
        delta: 1,
      })
    );

    expect(player.idleRoom.victoryChestStatus).toBe('opened');
    expect(() => JSON.parse(player.idleRoom.victoryChestRewardJson)).not.toThrow();
    expect(room.msg.sendTo).toHaveBeenCalledWith(
      client,
      'victory_chest_opened',
      expect.objectContaining({
        gameId: 'game-123',
        competitionDate: '2026-01-30',
      })
    );
  });

  it('applies potion reward via inventory upsert', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer();
    room.state.players.set('s1', player);

    mockGetByGameAndPlayer.mockResolvedValueOnce(null);
    mockGetByGameAndPlayer.mockResolvedValueOnce(null);

    mockRollVictoryChestReward.mockReturnValue({
      goldBonus: { amount: 10 },
      reward: { type: 'potion', itemName: 'Mana Potion', quantity: 2, potionTier: 2 },
    });

    await handleOpenVictoryChest(room as any, client);

    expect(mockUpsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'coin', itemName: 'Gold', quantity: 10 })
    );
    expect(mockUpsertInventoryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: 'potion',
        itemName: 'Mana Potion',
        quantity: 2,
      })
    );
  });

  it('applies wearable reward via inventory instances', async () => {
    const room = createRoom();
    const client = createClient('s1');
    const player = createPlayer();
    room.state.players.set('s1', player);

    mockGetByGameAndPlayer.mockResolvedValueOnce(null);
    mockGetByGameAndPlayer.mockResolvedValueOnce(null);

    mockRollVictoryChestReward.mockReturnValue({
      goldBonus: { amount: 0 },
      reward: {
        type: 'wearable',
        wearableSlug: 'test-wearable',
        durabilityScore: 123,
        rarity: 'common',
      },
    });

    await handleOpenVictoryChest(room as any, client);

    expect(mockCreateInventoryInstances).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 'player-123',
        items: [
          expect.objectContaining({
            wearableSlug: 'test-wearable',
            durabilityScore: 123,
          }),
        ],
      })
    );
  });
});
