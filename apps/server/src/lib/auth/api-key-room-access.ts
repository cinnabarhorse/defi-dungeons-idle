import type { Client } from 'colyseus';
import { apiKeysRepo } from '../db';
import {
  buildStakeEntitlementErrorMessage,
  getStakeEntitlement,
  isStakeExemptPlayer,
} from './stake-entitlement';

const API_KEY_STAKE_CHECKED_FLAG = '__apiKeyStakeChecked';
const API_KEY_ROOM_JOIN_COUNTED_FLAG = '__apiKeyRoomJoinCounted';

interface ClientAuthData {
  authMethod?: string;
  apiKeyId?: string | null;
}

function getClientAuthData(client: Client): ClientAuthData {
  const authData = ((client as any).auth ?? {}) as ClientAuthData;
  return authData;
}

export function isApiKeyAuthenticatedClient(client: Client): boolean {
  const authData = getClientAuthData(client);
  return authData.authMethod === 'api_key';
}

export function getApiKeyIdFromClient(client: Client): string | null {
  const authData = getClientAuthData(client);
  return typeof authData.apiKeyId === 'string' && authData.apiKeyId.length > 0
    ? authData.apiKeyId
    : null;
}

export async function enforceApiKeyJoinStakeEntitlement(
  client: Client,
  playerId: string
): Promise<void> {
  if (!isApiKeyAuthenticatedClient(client)) {
    return;
  }
  if ((client as any)[API_KEY_STAKE_CHECKED_FLAG]) {
    return;
  }
  if (await isStakeExemptPlayer(playerId)) {
    (client as any)[API_KEY_STAKE_CHECKED_FLAG] = true;
    return;
  }
  const entitlement = await getStakeEntitlement(playerId);
  if (!entitlement.eligible) {
    throw new Error(buildStakeEntitlementErrorMessage(entitlement));
  }
  (client as any)[API_KEY_STAKE_CHECKED_FLAG] = true;
}

export async function recordApiKeyRoomJoinUsage(client: Client): Promise<void> {
  if (!isApiKeyAuthenticatedClient(client)) {
    return;
  }
  if ((client as any)[API_KEY_ROOM_JOIN_COUNTED_FLAG]) {
    return;
  }
  const apiKeyId = getApiKeyIdFromClient(client);
  if (!apiKeyId) {
    return;
  }
  await apiKeysRepo.incrementRoomJoinCount(apiKeyId);
  (client as any)[API_KEY_ROOM_JOIN_COUNTED_FLAG] = true;
}
