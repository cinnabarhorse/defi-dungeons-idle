import {
  type StructuredLogLine,
  type FinalizedShard,
  createEmptyLevelCounts,
} from './log-schema';
import { recordShardRotation, setActiveShardCount } from './metrics';
import { getBaseLogger } from './base-logger';

const logger = getBaseLogger();

export interface GameShardManagerOptions {
  maxBytes: number;
  maxDurationMs: number;
  maxLines?: number;
  onShardFinalized: (shard: FinalizedShard) => Promise<void> | void;
}

interface ActiveShard {
  gameId: string;
  seq: number;
  lines: string[];
  levelCounts: ReturnType<typeof createEmptyLevelCounts>;
  tsStart: string;
  tsEnd: string;
  approxBytes: number;
  lineCount: number;
  host: string;
  serverId: string;
  pmId: number;
  timer?: NodeJS.Timeout;
}

export class GameShardManager {
  private readonly shards = new Map<string, ActiveShard>();
  private readonly seqByGame = new Map<string, number>();
  private maxLines: number;

  constructor(private config: GameShardManagerOptions) {
    this.maxLines = Math.max(1, config.maxLines ?? 20000);
  }

  async append(entry: StructuredLogLine): Promise<void> {
    if (!entry.gameId) {
      return;
    }
    const shard = this.ensureShard(entry);
    const serialized = `${JSON.stringify(entry)}\n`;
    const bytes = Buffer.byteLength(serialized, 'utf8');
    shard.lines.push(serialized);
    shard.lineCount += 1;
    shard.approxBytes += bytes;
    shard.tsEnd = entry.ts;
    shard.levelCounts[entry.level] += 1;

    const shouldRotate = this.checkRotation(shard);
    if (shouldRotate) {
      await this.rotateShard(entry.gameId, shouldRotate);
    }
  }

  private ensureShard(entry: StructuredLogLine): ActiveShard {
    const existing = this.shards.get(entry.gameId);
    if (existing) {
      return existing;
    }

    const seq = (this.seqByGame.get(entry.gameId) ?? 0) + 1;
    this.seqByGame.set(entry.gameId, seq);

    const shard: ActiveShard = {
      gameId: entry.gameId,
      seq,
      lines: [],
      levelCounts: createEmptyLevelCounts(),
      tsStart: entry.ts,
      tsEnd: entry.ts,
      approxBytes: 0,
      lineCount: 0,
      host: entry.host,
      serverId: entry.serverId,
      pmId: entry.pmId,
    };
    this.shards.set(entry.gameId, shard);
    this.installTimer(entry.gameId);
    setActiveShardCount(this.shards.size);
    return shard;
  }

  private installTimer(gameId: string) {
    const shard = this.shards.get(gameId);
    if (!shard) {
      return;
    }
    if (this.config.maxDurationMs <= 0) {
      return;
    }
    shard.timer = setTimeout(() => {
      void this.rotateShard(gameId, 'time').catch((error) => {
        logger.error({ err: error, gameId }, 'debug_logs.rotate_timer_failed');
      });
    }, this.config.maxDurationMs);
    shard.timer.unref?.();
  }

  private clearTimer(shard: ActiveShard) {
    if (shard.timer) {
      clearTimeout(shard.timer);
      shard.timer = undefined;
    }
  }

  private checkRotation(
    shard: ActiveShard
  ): FinalizedShard['rotationReason'] | null {
    if (shard.approxBytes >= this.config.maxBytes) {
      return 'size';
    }
    if (shard.lineCount >= this.maxLines) {
      return 'lines';
    }
    return null;
  }

  async rotateShard(
    gameId: string,
    reason: FinalizedShard['rotationReason']
  ): Promise<void> {
    const shard = this.shards.get(gameId);
    if (!shard || shard.lineCount === 0) {
      if (shard) {
        this.clearTimer(shard);
        this.shards.delete(gameId);
        setActiveShardCount(this.shards.size);
      }
      return;
    }

    this.clearTimer(shard);
    this.shards.delete(gameId);
    setActiveShardCount(this.shards.size);

    const ndjson = shard.lines.join('');
    const finalized: FinalizedShard = {
      gameId,
      seq: shard.seq,
      tsStart: shard.tsStart,
      tsEnd: shard.tsEnd,
      ndjson,
      approxBytes: shard.approxBytes,
      lineCount: shard.lineCount,
      levelCounts: shard.levelCounts,
      host: shard.host,
      serverId: shard.serverId,
      pmId: shard.pmId,
      rotationReason: reason,
    };

    recordShardRotation(finalized);
    await this.config.onShardFinalized(finalized);
  }

  async flushAll(
    reason: FinalizedShard['rotationReason'] = 'manual'
  ): Promise<void> {
    const games = Array.from(this.shards.keys());
    await Promise.all(games.map((gameId) => this.rotateShard(gameId, reason)));
  }

  getActiveShardCount(): number {
    return this.shards.size;
  }

  async updateLimits(limits: Partial<GameShardManagerOptions>): Promise<void> {
    if (
      typeof limits.maxBytes === 'number' &&
      Number.isFinite(limits.maxBytes)
    ) {
      this.config.maxBytes = Math.max(256 * 1024, Math.floor(limits.maxBytes));
    }
    if (
      typeof limits.maxDurationMs === 'number' &&
      Number.isFinite(limits.maxDurationMs)
    ) {
      this.config.maxDurationMs = Math.max(
        1_000,
        Math.floor(limits.maxDurationMs)
      );

      for (const shard of this.shards.values()) {
        this.clearTimer(shard);
        this.installTimer(shard.gameId);
      }
    }
    if (
      typeof limits.maxLines === 'number' &&
      Number.isFinite(limits.maxLines)
    ) {
      const normalized = Math.max(1, Math.floor(limits.maxLines));
      this.config.maxLines = normalized;
      this.maxLines = normalized;
    }
  }
}
