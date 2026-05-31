import type { Client, Room } from 'colyseus';
import type { ServerToClientMessages } from '../types/messages';

type BroadcastFunction = (
  type: string,
  payload?: unknown,
  options?: { except?: Client }
) => void;

export type Broadcaster<TEvents extends object> = {
  broadcast<K extends keyof TEvents>(type: K, payload: TEvents[K]): void;
  broadcastExcept<K extends keyof TEvents>(
    type: K,
    payload: TEvents[K],
    except: Client
  ): void;
  sendTo<K extends keyof TEvents>(
    client: Client,
    type: K,
    payload: TEvents[K]
  ): void;
};

export type BroadcastCapable = Pick<Room, 'broadcast'> & {
  broadcast: BroadcastFunction;
};

export function createBroadcaster<TEvents extends object>(
  room: BroadcastCapable
): Broadcaster<TEvents> {
  function broadcast<K extends keyof TEvents>(type: K, payload: TEvents[K]) {
    room.broadcast(String(type), payload);
  }

  function broadcastExcept<K extends keyof TEvents>(
    type: K,
    payload: TEvents[K],
    except: Client
  ) {
    room.broadcast(String(type), payload, { except });
  }

  function sendTo<K extends keyof TEvents>(
    client: Client,
    type: K,
    payload: TEvents[K]
  ) {
    client.send(String(type), payload);
  }

  return { broadcast, broadcastExcept, sendTo };
}

export type ServerBroadcaster = Broadcaster<ServerToClientMessages>;

export function ensureServerBroadcaster(
  room: BroadcastCapable & { msg?: ServerBroadcaster }
): ServerBroadcaster {
  if (!room.msg) {
    room.msg = createBroadcaster<ServerToClientMessages>(room);
  }
  return room.msg;
}
