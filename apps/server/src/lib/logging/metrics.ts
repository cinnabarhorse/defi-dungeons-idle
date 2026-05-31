import type { FinalizedShard, LevelCounts, LogLevel } from './log-schema';

type UploadResultMeta = {
  storagePath: string;
  sizeBytes: number;
  compressedBytes: number;
  durationMs: number;
  checksum: string;
  gameId: string;
  tsStart: string;
  tsEnd: string;
  lineCount: number;
};

export interface DebugLogMetrics {
  queueDepth: number;
  queueMax: number;
  droppedTotal: number;
  droppedByLevel: Record<LogLevel, number>;
  enqueuedLines: number;
  processedLines: number;
  activeShards: number;
  shardRotations: number;
  lastRotation?: {
    gameId: string;
    reason: FinalizedShard['rotationReason'];
    lineCount: number;
    approxBytes: number;
  };
  pendingUploads: number;
  completedUploads: number;
  failedUploads: number;
  lastUpload?: UploadResultMeta;
  lastUploadError?: string;
}

const metrics: DebugLogMetrics = {
  queueDepth: 0,
  queueMax: 0,
  droppedTotal: 0,
  droppedByLevel: {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0,
  },
  enqueuedLines: 0,
  processedLines: 0,
  activeShards: 0,
  shardRotations: 0,
  pendingUploads: 0,
  completedUploads: 0,
  failedUploads: 0,
};

export function setQueueMax(value: number) {
  metrics.queueMax = value;
}

export function updateQueueDepth(depth: number) {
  metrics.queueDepth = depth;
}

export function recordEnqueue() {
  metrics.enqueuedLines += 1;
}

export function recordProcessed() {
  metrics.processedLines += 1;
}

export function recordDrop(level: LogLevel) {
  metrics.droppedTotal += 1;
  metrics.droppedByLevel[level] += 1;
}

export function setActiveShardCount(count: number) {
  metrics.activeShards = count;
}

export function recordShardRotation(shard: FinalizedShard) {
  metrics.shardRotations += 1;
  metrics.lastRotation = {
    gameId: shard.gameId,
    reason: shard.rotationReason,
    lineCount: shard.lineCount,
    approxBytes: shard.approxBytes,
  };
}

export function markUploadPending() {
  metrics.pendingUploads += 1;
}

export function markUploadSettled(success: boolean) {
  metrics.pendingUploads = Math.max(0, metrics.pendingUploads - 1);
  if (success) {
    metrics.completedUploads += 1;
  } else {
    metrics.failedUploads += 1;
  }
}

export function recordUploadSuccess(meta: UploadResultMeta) {
  metrics.lastUpload = meta;
  metrics.lastUploadError = undefined;
}

export function recordUploadFailure(message: string) {
  metrics.lastUploadError = message;
}

export function captureMetrics(): DebugLogMetrics {
  // `metrics` is a plain object with a couple of nested plain-object fields.
  // Avoid JSON stringify/parse here: it's slower, allocates more, and can hide
  // type issues. A manual shallow+nested copy is enough to guarantee callers
  // can't mutate internal state.
  return {
    ...metrics,
    droppedByLevel: { ...metrics.droppedByLevel },
    lastRotation: metrics.lastRotation ? { ...metrics.lastRotation } : undefined,
    lastUpload: metrics.lastUpload ? { ...metrics.lastUpload } : undefined,
  };
}
