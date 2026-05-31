import type { StructuredLogLine, LogLevel } from './log-schema';
import {
  recordDrop,
  recordEnqueue,
  recordProcessed,
  setQueueMax,
  updateQueueDepth,
} from './metrics';

export interface LogIngestQueueOptions {
  maxSize: number;
  shedDebugThreshold: number;
  shedInfoThreshold: number;
}

export class LogIngestQueue {
  private readonly buffer: Array<StructuredLogLine | null>;
  private readonly waiters: Array<(value: StructuredLogLine | null) => void> =
    [];
  private closed = false;
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(private options: LogIngestQueueOptions) {
    const capacity = Math.max(1, Math.floor(options.maxSize));
    this.buffer = new Array<StructuredLogLine | null>(capacity).fill(null);
    setQueueMax(capacity);
    updateQueueDepth(0);
  }

  enqueue(entry: StructuredLogLine): boolean {
    if (this.closed) {
      return false;
    }

    const capacity = this.buffer.length;
    const { shedDebugThreshold, shedInfoThreshold } = this.options;

    if (
      entry.level === 'debug' &&
      this.count >= Math.floor(capacity * shedDebugThreshold)
    ) {
      recordDrop(entry.level);
      return false;
    }

    if (
      entry.level === 'info' &&
      this.count >= Math.floor(capacity * shedInfoThreshold)
    ) {
      recordDrop(entry.level);
      return false;
    }

    if (this.count >= capacity) {
      const freed = this.evictLowerPriority(entry.level);
      if (!freed) {
        recordDrop(entry.level);
        return false;
      }
    }

    this.buffer[this.tail] = entry;
    this.tail = (this.tail + 1) % capacity;
    this.count += 1;
    recordEnqueue();
    this.resolveNext(entry);
    updateQueueDepth(this.count);
    return true;
  }

  private evictLowerPriority(promotedLevel: LogLevel): boolean {
    const capacity = this.buffer.length;
    // Try to drop 'debug' first, then 'info'
    const tryEvict = (level: LogLevel): boolean => {
      if (this.count === 0) return false;
      let idx = this.head;
      for (let i = 0; i < this.count; i++) {
        const item = this.buffer[idx];
        if (item && item.level === level) {
          this.buffer[idx] = null;
          this.count -= 1;
          recordDrop(level);
          updateQueueDepth(this.count);
          // Compact head forward if we evicted at head
          while (this.count > 0 && this.buffer[this.head] == null) {
            this.head = (this.head + 1) % capacity;
          }
          return true;
        }
        idx = (idx + 1) % capacity;
      }
      return false;
    };

    if (tryEvict('debug')) {
      return true;
    }
    if (tryEvict('info')) {
      return true;
    }
    if (promotedLevel === 'error' && tryEvict('warn')) {
      return true;
    }
    return false;
  }

  private resolveNext(value: StructuredLogLine) {
    if (!this.waiters.length) {
      return;
    }
    const waiter = this.waiters.shift();
    waiter?.(value);
  }

  async next(): Promise<StructuredLogLine | null> {
    if (this.count > 0) {
      const capacity = this.buffer.length;
      // Advance head to next non-null
      while (this.count > 0 && this.buffer[this.head] == null) {
        this.head = (this.head + 1) % capacity;
      }
      if (this.count === 0) {
        updateQueueDepth(0);
        return null;
      }
      const entry = this.buffer[this.head]!;
      this.buffer[this.head] = null;
      this.head = (this.head + 1) % capacity;
      this.count -= 1;
      updateQueueDepth(this.count);
      recordProcessed();
      return entry;
    }
    if (this.closed) {
      return null;
    }
    return new Promise<StructuredLogLine | null>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.(null);
    }
  }

  drain(): StructuredLogLine[] {
    const result: StructuredLogLine[] = [];
    const capacity = this.buffer.length;
    let idx = this.head;
    for (let i = 0; i < this.count; i++) {
      const item = this.buffer[idx];
      if (item) {
        result.push(item);
      }
      this.buffer[idx] = null;
      idx = (idx + 1) % capacity;
    }
    this.head = 0;
    this.tail = 0;
    this.count = 0;
    updateQueueDepth(0);
    return result;
  }

  size(): number {
    return this.count;
  }

  updateThresholds(
    partial: Partial<
      Pick<LogIngestQueueOptions, 'shedDebugThreshold' | 'shedInfoThreshold'>
    >
  ) {
    if (
      typeof partial.shedDebugThreshold === 'number' &&
      Number.isFinite(partial.shedDebugThreshold)
    ) {
      this.options.shedDebugThreshold = Math.min(
        1,
        Math.max(0.05, partial.shedDebugThreshold)
      );
    }
    if (
      typeof partial.shedInfoThreshold === 'number' &&
      Number.isFinite(partial.shedInfoThreshold)
    ) {
      this.options.shedInfoThreshold = Math.min(
        1,
        Math.max(0.1, partial.shedInfoThreshold)
      );
    }
  }
}
