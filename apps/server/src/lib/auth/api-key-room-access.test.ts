jest.mock('../db', () => ({
  apiKeysRepo: {
    incrementRoomJoinCount: jest.fn(),
  },
}));

jest.mock('./stake-entitlement', () => ({
  getStakeEntitlement: jest.fn(),
  buildStakeEntitlementErrorMessage: jest.fn(() => 'Insufficient staked balance'),
  isStakeExemptPlayer: jest.fn(() => false),
}));

import { apiKeysRepo } from '../db';
import { getStakeEntitlement, isStakeExemptPlayer } from './stake-entitlement';
import {
  enforceApiKeyJoinStakeEntitlement,
  recordApiKeyRoomJoinUsage,
} from './api-key-room-access';

function createClient(auth: Record<string, unknown>) {
  return {
    auth,
  } as any;
}

describe('api key room access helper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks API-key joins below stake threshold', async () => {
    (getStakeEntitlement as jest.Mock).mockResolvedValue({
      eligible: false,
    });
    const client = createClient({ authMethod: 'api_key', apiKeyId: 'key-1' });

    await expect(
      enforceApiKeyJoinStakeEntitlement(client, 'player-1')
    ).rejects.toThrow('Insufficient staked balance');
  });

  it('allows non-api-key joins without stake checks', async () => {
    const client = createClient({ authMethod: 'session' });
    await expect(
      enforceApiKeyJoinStakeEntitlement(client, 'player-1')
    ).resolves.toBeUndefined();
    expect(getStakeEntitlement).not.toHaveBeenCalled();
  });

  it('allows stake-exempt API-key joins without checking balances', async () => {
    (isStakeExemptPlayer as jest.Mock).mockResolvedValue(true);
    const client = createClient({ authMethod: 'api_key', apiKeyId: 'key-1' });

    await expect(
      enforceApiKeyJoinStakeEntitlement(client, 'player-1')
    ).resolves.toBeUndefined();
    expect(getStakeEntitlement).not.toHaveBeenCalled();
  });

  it('increments room join count once per client', async () => {
    (apiKeysRepo.incrementRoomJoinCount as jest.Mock).mockResolvedValue({
      id: 'key-1',
    });
    const client = createClient({ authMethod: 'api_key', apiKeyId: 'key-1' });

    await recordApiKeyRoomJoinUsage(client);
    await recordApiKeyRoomJoinUsage(client);

    expect(apiKeysRepo.incrementRoomJoinCount).toHaveBeenCalledTimes(1);
    expect(apiKeysRepo.incrementRoomJoinCount).toHaveBeenCalledWith('key-1');
  });
});
