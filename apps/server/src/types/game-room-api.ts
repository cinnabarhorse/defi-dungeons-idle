import type { PlayerSchema } from '../schemas';
import type { InventoryItemPayload } from '../lib/db';

export interface GameRoomApi {
  tryAutoHeal?: (player: PlayerSchema) => boolean;
  clients?: Iterable<any>;
  recordPostKillMetrics?: () => void;
  syncGameMetrics?: () => void;
  applyInventoryDelta?: (
    sessionId: string,
    item: InventoryItemPayload,
    delta: number,
    options?: { entityId?: string | null; distributionId?: string | null }
  ) => Promise<void>;
  // Optional notification when inventory is full (server may emit a message)
  // This is not required by callers but documents the behavior.
  registerEnemyDrop?: (options: {
    entityId: string;
    enemyId: string;
    enemyType: string;
    dropTable?: string | null;
    rolledWeight?: number | null;
    item?: InventoryItemPayload;
  }) => Promise<void>;
  emitMatchEvent?: (
    eventName: string,
    payload?: Record<string, unknown>
  ) => void;
}
