import type { Logger } from 'pino';
import { getBaseLogger, getRuntimeIdentity } from './base-logger';
import type { GameLogInput, StructuredLogLine } from './log-schema';
import { normalizeLogLine } from './log-schema';
import { LogIngestQueue } from './ingest-queue';
import { GameShardManager } from './game-shard-manager';
import type { FinalizedShard } from './log-schema';
import { uploadShardToSupabase } from './uploader-supabase';
import { captureMetrics, DebugLogMetrics } from './metrics';
import type { RuntimeIdentity } from './log-schema';
import { serverLogIndexRepo } from '../db';
import type { LevelCountsRow } from '../db';

export interface DebugLogRuntimeConfig {
  enabled: boolean;
  maxQueueSize: number;
  shedDebugThreshold: number;
  shedInfoThreshold: number;
  maxShardBytes: number;
  maxShardDurationMs: number;
  maxShardLines: number;
  mirrorToConsole: boolean;
}

const DEFAULT_RUNTIME_CONFIG: DebugLogRuntimeConfig = {
  enabled: true,
  maxQueueSize: 100_000,
  shedDebugThreshold: 0.5,
  shedInfoThreshold: 0.85,
  maxShardBytes: 5 * 1024 * 1024,
  maxShardDurationMs: 30 * 60 * 1000,
  maxShardLines: 100_000,
  mirrorToConsole: (process.env.NODE_ENV || 'development') !== 'production',
};

class DebugLogService {
  private readonly identity: RuntimeIdentity;
  private readonly logger: Logger;
  private readonly queue: LogIngestQueue;
  private readonly shardManager: GameShardManager;
  private readonly uploadQueue: FinalizedShard[] = [];
  private queueLoop: Promise<void> | null = null;
  private uploadLoop: Promise<void> | null = null;
  private started = false;
  private shuttingDown = false;
  private lastDropWarningAt = 0;
  private config: DebugLogRuntimeConfig;

  constructor(initialConfig?: Partial<DebugLogRuntimeConfig>) {
    this.identity = getRuntimeIdentity();
    this.logger = getBaseLogger();
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...initialConfig };
    this.queue = new LogIngestQueue({
      maxSize: this.config.maxQueueSize,
      shedDebugThreshold: this.config.shedDebugThreshold,
      shedInfoThreshold: this.config.shedInfoThreshold,
    });
    this.shardManager = new GameShardManager({
      maxBytes: this.config.maxShardBytes,
      maxDurationMs: this.config.maxShardDurationMs,
      maxLines: this.config.maxShardLines,
      onShardFinalized: async (shard) => {
        this.uploadQueue.push(shard);
        this.ensureUploadLoop();
      },
    });
  }

  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.queueLoop = this.consumeQueue();
  }

  private async consumeQueue() {
    while (true) {
      const entry = await this.queue.next();
      if (!entry) {
        break;
      }
      try {
        await this.shardManager.append(entry);
      } catch (error) {
        this.logger.error(
          { err: error, gameId: entry.gameId },
          'debug_logs.append_failed'
        );
      }
    }
  }

  private ensureUploadLoop() {
    if (this.uploadLoop) {
      return;
    }
    this.uploadLoop = (async () => {
      while (this.uploadQueue.length > 0) {
        const shard = this.uploadQueue.shift()!;
        try {
          const uploadResult = await uploadShardToSupabase(shard);
          try {
            await serverLogIndexRepo.insertShardRecord({
              gameId: shard.gameId,
              tsStart: shard.tsStart,
              tsEnd: shard.tsEnd,
              levelCounts: shard.levelCounts as LevelCountsRow,
              sizeBytes: shard.approxBytes,
              storagePath: uploadResult.storagePath,
              host: shard.host,
              pmId: shard.pmId,
              checksum: uploadResult.checksum,
              serverId: shard.serverId,
            });
          } catch (dbError) {
            this.logger.error(
              {
                err: dbError,
                storagePath: uploadResult.storagePath,
                gameId: shard.gameId,
              },
              'debug_logs.index_insert_failed'
            );
          }
        } catch (error) {
          this.logger.error(
            {
              err: error,
              gameId: shard.gameId,
              seq: shard.seq,
              reason: shard.rotationReason,
            },
            'debug_logs.upload_failed'
          );
        }
      }
    })()
      .catch((error) => {
        this.logger.error(
          { err: error },
          'debug_logs.upload_loop_unhandled_error'
        );
      })
      .finally(() => {
        this.uploadLoop = null;
        if (this.uploadQueue.length > 0) {
          this.ensureUploadLoop();
        }
      });
  }

  async rotateGameShard(
    gameId: string,
    reason: FinalizedShard['rotationReason'] = 'manual'
  ): Promise<void> {
    await this.shardManager.rotateShard(gameId, reason);
  }

  emit(input: GameLogInput): boolean {
    const normalized = normalizeLogLine(input, this.identity);
    this.writeLocalLog(normalized);

    if (!this.config.enabled) {
      return false;
    }

    const accepted = this.queue.enqueue(normalized);
    if (!accepted && normalized.level !== 'debug') {
      this.warnOnDrop(normalized);
    }
    return accepted;
  }

  private writeLocalLog(line: StructuredLogLine) {
    if (!this.config.mirrorToConsole) {
      return;
    }
    const method = line.level === 'fatal' ? 'fatal' : line.level;
    const payload: Record<string, unknown> = {
      event: line.event,
      gameId: line.gameId,
      playerId: line.playerId,
      sessionId: line.sessionId,
      actionId: line.actionId,
      requestId: line.requestId,
    };
    if (line.details) {
      payload.details = line.details;
    }
    this.logger[method](payload, line.message);
  }

  private warnOnDrop(line: StructuredLogLine) {
    const now = Date.now();
    if (now < this.lastDropWarningAt) {
      return;
    }
    this.lastDropWarningAt = now + 5_000;
    if (this.config.mirrorToConsole) {
      this.logger.warn(
        {
          gameId: line.gameId,
          level: line.level,
          event: line.event,
        },
        'debug_logs.queue_drop'
      );
    }
  }

  async shutdown(
    reason: FinalizedShard['rotationReason'] = 'shutdown'
  ): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;
    this.queue.close();
    const drained = this.queue.drain();
    for (const entry of drained) {
      await this.shardManager.append(entry);
    }
    await this.shardManager.flushAll(reason);
    if (this.queueLoop) {
      await this.queueLoop;
    }
    if (this.uploadLoop) {
      await this.uploadLoop;
    }
  }

  getConfig(): DebugLogRuntimeConfig {
    return { ...this.config };
  }

  async updateConfig(
    partial: Partial<DebugLogRuntimeConfig>
  ): Promise<DebugLogRuntimeConfig> {
    if (typeof partial.enabled === 'boolean') {
      this.config.enabled = partial.enabled;
    }
    let needsShardUpdate = false;

    if (
      typeof partial.maxShardBytes === 'number' &&
      Number.isFinite(partial.maxShardBytes)
    ) {
      this.config.maxShardBytes = Math.max(
        256 * 1024,
        Math.floor(partial.maxShardBytes)
      );
      needsShardUpdate = true;
    }
    if (
      typeof partial.maxShardDurationMs === 'number' &&
      Number.isFinite(partial.maxShardDurationMs)
    ) {
      this.config.maxShardDurationMs = Math.max(
        1_000,
        Math.floor(partial.maxShardDurationMs)
      );
      needsShardUpdate = true;
    }
    if (
      typeof partial.maxShardLines === 'number' &&
      Number.isFinite(partial.maxShardLines)
    ) {
      this.config.maxShardLines = Math.max(
        100,
        Math.floor(partial.maxShardLines)
      );
      needsShardUpdate = true;
    }
    if (needsShardUpdate) {
      await this.shardManager.updateLimits({
        maxBytes: this.config.maxShardBytes,
        maxDurationMs: this.config.maxShardDurationMs,
        maxLines: this.config.maxShardLines,
      });
    }

    if (typeof partial.mirrorToConsole === 'boolean') {
      this.config.mirrorToConsole = partial.mirrorToConsole;
    }

    if (
      typeof partial.shedDebugThreshold === 'number' &&
      Number.isFinite(partial.shedDebugThreshold)
    ) {
      this.config.shedDebugThreshold = Math.min(
        1,
        Math.max(0.05, partial.shedDebugThreshold)
      );
    }
    if (
      typeof partial.shedInfoThreshold === 'number' &&
      Number.isFinite(partial.shedInfoThreshold)
    ) {
      this.config.shedInfoThreshold = Math.min(
        1,
        Math.max(0.1, partial.shedInfoThreshold)
      );
    }

    this.queue.updateThresholds({
      shedDebugThreshold: this.config.shedDebugThreshold,
      shedInfoThreshold: this.config.shedInfoThreshold,
    });

    return this.getConfig();
  }
}

let singleton: DebugLogService | null = null;

function ensureService(): DebugLogService {
  if (!singleton) {
    singleton = new DebugLogService();
    singleton.start();
  }
  return singleton;
}

export function initDebugLogs(config?: Partial<DebugLogRuntimeConfig>) {
  if (singleton) {
    return;
  }
  singleton = new DebugLogService(config);
  singleton.start();
}

export function emitGameLog(input: GameLogInput): boolean {
  return ensureService().emit(input);
}

export function getDebugLogMetrics(): DebugLogMetrics {
  return captureMetrics();
}

export function getDebugLogConfig(): DebugLogRuntimeConfig {
  return ensureService().getConfig();
}

export async function updateDebugLogConfig(
  partial: Partial<DebugLogRuntimeConfig>
): Promise<DebugLogRuntimeConfig> {
  return ensureService().updateConfig(partial);
}

export async function flushDebugLogs(
  reason: FinalizedShard['rotationReason'] = 'manual'
): Promise<void> {
  if (!singleton) {
    return;
  }
  await singleton.shutdown(reason);
}

export function emitServerLog(
  event: string,
  input: {
    message?: string;
    details?: Record<string, unknown>;
    level?: 'error' | 'fatal' | 'warn';
  } = {}
): boolean {
  const level = input.level ?? 'error';
  const message = input.message ?? event;
  return ensureService().emit({
    gameId: 'server',
    event,
    message,
    level,
    details: input.details,
  });
}

export async function flushGameLogs(
  gameId: string,
  reason: FinalizedShard['rotationReason'] = 'manual'
): Promise<void> {
  await ensureService().rotateGameShard(gameId, reason);
}
