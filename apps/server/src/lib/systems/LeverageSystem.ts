import type { Client } from 'colyseus';
import { LEVERAGE_CONFIG } from '../constants';
import type { LeverageStatePayload } from '../../types/messages';
import type { GameRoom } from '../../rooms/GameRoom';

function leverageEnabled(): boolean {
  return LEVERAGE_CONFIG.enabled;
}

function getFloorLeverage(room: GameRoom): number {
  const value = Number(room.state.floorLeverage);
  if (!Number.isFinite(value) || value <= 0) {
    return getLeverageTotal(room);
  }
  return Math.max(1, Math.min(LEVERAGE_CONFIG.max, value));
}

function getRoomLeverage(room: GameRoom): number {
  const value = Number(room.state.roomLeverage);
  if (!Number.isFinite(value) || value <= 0) {
    return getLeverageTotal(room);
  }
  return Math.max(1, Math.min(LEVERAGE_CONFIG.max, value));
}

function getStaniActive(room: GameRoom): boolean {
  for (const [, player] of room.state.players) {
    if (player.characterId === 'stani') {
      return true;
    }
  }
  return false;
}

export function normalizeLeverageValue(value: number): number {
  if (!leverageEnabled()) return 1;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  const clamped = Math.max(1, Math.min(LEVERAGE_CONFIG.max, numeric));
  return Math.round(clamped * 10) / 10;
}

export function getLeverageTotal(room: GameRoom): number {
  if (!leverageEnabled()) return 1;
  const total = Number(room.state.leverageTotal);
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.min(LEVERAGE_CONFIG.max, total));
}

function buildLeverageStatePayload(room: GameRoom): LeverageStatePayload {
  const enabled = leverageEnabled();
  const total = enabled ? getLeverageTotal(room) : 1;
  const floor = enabled ? getFloorLeverage(room) : 1;
  const roomValue = enabled ? getRoomLeverage(room) : 1;

  return {
    floor,
    room: roomValue,
    total,
    floorLocked: enabled ? Boolean(room.state.floorLeverageLocked) : false,
    roomLocked: enabled ? Boolean(room.state.roomLeverageLocked) : false,
    staniActive: enabled ? getStaniActive(room) : false,
    floorSetAt: enabled ? Number(room.state.floorLeverageSetAt) || 0 : 0,
    roomSetAt: enabled ? Number(room.state.roomLeverageSetAt) || 0 : 0,
  };
}

export function broadcastLeverageState(
  room: GameRoom,
  target?: Client | null
): void {
  const payload = buildLeverageStatePayload(room);
  if (target) {
    (room.msg as any).sendTo(target, 'leverage:state', payload);
  } else {
    (room.msg as any).broadcast('leverage:state', payload);
  }
}

export function sendLeverageError(
  room: GameRoom,
  client: Client,
  reason: string
): void {
  (room.msg as any).sendTo(client, 'leverage:error', { reason });
}

export function sendLeverageStateToClient(
  room: GameRoom,
  client: Client
): void {
  broadcastLeverageState(room, client);
}

export function isHostClient(room: GameRoom, client: Client): boolean {
  return room.state.hostSessionId === client.sessionId;
}

export function scheduleRoomLeverageLockTimeout(room: GameRoom): void {
  if (!leverageEnabled()) return;
  if (LEVERAGE_CONFIG.roomTimeoutMs <= 0) return;

  const roomAny = room as any;
  if (roomAny._leverageRoomLockTimer) {
    clearTimeout(roomAny._leverageRoomLockTimer);
  }

  roomAny._leverageRoomLockTimer = setTimeout(() => {
    (room.state as any).roomLeverageLocked = true;
    (room.state as any).roomLeverageSetAt =
      (room.state as any).roomLeverageSetAt || Date.now();
    broadcastLeverageState(room);
  }, LEVERAGE_CONFIG.roomTimeoutMs);
}

export function clearRoomLeverageLockTimer(room: GameRoom): void {
  const roomAny = room as any;
  if (roomAny._leverageRoomLockTimer) {
    clearTimeout(roomAny._leverageRoomLockTimer);
    roomAny._leverageRoomLockTimer = null;
  }
}

export function handleRoomLeverageEngagement(
  room: GameRoom,
  reason: 'combat' | 'timeout' = 'combat'
): void {
  if (!leverageEnabled()) return;
  clearRoomLeverageLockTimer(room);
  (room.state as any).roomLeverageLocked = true;
  (room.state as any).roomLeverageSetAt =
    (room.state as any).roomLeverageSetAt || Date.now();
  if (reason === 'combat') {
    (room.state as any).floorLeverageLocked =
      (room.state as any).floorLeverageLocked || false;
  }
  broadcastLeverageState(room);
}
