import request from 'supertest';
import express, { type Application } from 'express';
import { registerPlayerEquipmentRoutes } from '../player-equipment';

jest.mock('../../lib/auth/principal', () => ({
  resolveAuthPrincipal: jest.fn(),
}));

jest.mock('../../lib/db', () => ({
  playersRepo: {
    getPlayerById: jest.fn(),
  },
}));

jest.mock('../../lib/equipment-service', () => ({
  getPlayerEquipmentState: jest.fn(),
  getEquippedInventoryItemIds: jest.fn(),
  equipWearable: jest.fn(),
  unequipWearable: jest.fn(),
  batchEquipWearables: jest.fn(),
  batchUnequipWearables: jest.fn(),
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

jest.mock('../../lib/gotchi-ownership-snapshot', () => ({
  verifyGotchiOwnershipForTodaySnapshot: jest.fn(),
}));

jest.mock('../../data/characters', () => ({
  setGotchiWearables: jest.fn(),
  setGotchiWearableAssignments: jest.fn(),
}));

import { resolveAuthPrincipal } from '../../lib/auth/principal';
import { playersRepo } from '../../lib/db';
import {
  getEquippedInventoryItemIds,
  getPlayerEquipmentState,
} from '../../lib/equipment-service';
import { verifyGotchiOwnershipForTodaySnapshot } from '../../lib/gotchi-ownership-snapshot';
import {
  setGotchiWearables,
  setGotchiWearableAssignments,
} from '../../data/characters';

describe('player equipment routes', () => {
  let app: Application;
  const baseState = {
    characterId: 'gotchi:6741',
    equipment: [],
    overrides: [],
    equippedWearables: [],
    equippedWearablesWithQuality: [],
    derivedStats: {},
    version: 1,
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerPlayerEquipmentRoutes(app);

    jest.clearAllMocks();

    (resolveAuthPrincipal as jest.Mock).mockResolvedValue({
      authMethod: 'api_key',
      playerId: 'player-1',
      address: '0xabc',
    });
    (getPlayerEquipmentState as jest.Mock).mockResolvedValue(baseState);
    (getEquippedInventoryItemIds as jest.Mock).mockResolvedValue(
      new Set(['inv-1'])
    );
  });

  it('hydrates gotchi wearables before returning equipment', async () => {
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      selectedCharacterId: 'gotchi:6741',
    });
    (verifyGotchiOwnershipForTodaySnapshot as jest.Mock).mockResolvedValue({
      owned: true,
      snapshotMissing: false,
      blockNumber: 123456,
      slugs: ['basic-gentleman-hat'],
      assignments: [{ slot: 'head', slug: 'basic-gentleman-hat' }],
    });

    const response = await request(app).get('/api/player/equipment');

    expect(response.status).toBe(200);
    expect(response.body.equippedInventoryItemIds).toEqual(['inv-1']);
    expect(verifyGotchiOwnershipForTodaySnapshot).toHaveBeenCalledWith(
      '0xabc',
      '6741'
    );
    expect(setGotchiWearables).toHaveBeenCalledWith('6741', [
      'basic-gentleman-hat',
    ]);
    expect(setGotchiWearableAssignments).toHaveBeenCalledWith('6741', [
      { slot: 'head', slug: 'basic-gentleman-hat' },
    ]);
  });

  it('skips hydration for non-gotchi selections', async () => {
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      selectedCharacterId: 'coderdan',
    });

    const response = await request(app).get('/api/player/equipment');

    expect(response.status).toBe(200);
    expect(verifyGotchiOwnershipForTodaySnapshot).not.toHaveBeenCalled();
    expect(setGotchiWearables).not.toHaveBeenCalled();
    expect(setGotchiWearableAssignments).not.toHaveBeenCalled();
  });

  it('skips hydration when snapshot block is missing', async () => {
    (playersRepo.getPlayerById as jest.Mock).mockResolvedValue({
      selectedCharacterId: 'gotchi:6741',
    });
    (verifyGotchiOwnershipForTodaySnapshot as jest.Mock).mockResolvedValue({
      owned: false,
      snapshotMissing: true,
      blockNumber: null,
      slugs: [],
      assignments: [],
    });

    const response = await request(app).get('/api/player/equipment');

    expect(response.status).toBe(200);
    expect(verifyGotchiOwnershipForTodaySnapshot).toHaveBeenCalledWith(
      '0xabc',
      '6741'
    );
    expect(setGotchiWearables).not.toHaveBeenCalled();
    expect(setGotchiWearableAssignments).not.toHaveBeenCalled();
  });
});
