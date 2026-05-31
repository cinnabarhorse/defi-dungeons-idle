import { createHash } from 'crypto';
import { gzip as gzipCallback } from 'zlib';
import { promisify } from 'util';
import { getSupabaseAdminClient } from '../db';
import type { FinalizedShard } from './log-schema';
import {
  markUploadPending,
  markUploadSettled,
  recordUploadFailure,
  recordUploadSuccess,
} from './metrics';

const gzip = promisify(gzipCallback);

export interface UploadShardOptions {
  bucket?: string;
  maxAttempts?: number;
}

export interface UploadShardResult {
  storagePath: string;
  sizeBytes: number;
  compressedBytes: number;
  checksum: string;
  durationMs: number;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeSegment(input: string): string {
  const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.length > 0 ? sanitized : 'server';
}

function pad(value: number, length = 2): string {
  return value.toString().padStart(length, '0');
}

export function buildStoragePath(
  shard: FinalizedShard,
  bucketRoot = 'by-game'
): string {
  const ts = new Date(shard.tsStart);
  const year = ts.getUTCFullYear();
  const month = pad(ts.getUTCMonth() + 1);
  const day = pad(ts.getUTCDate());
  const hour = pad(ts.getUTCHours());
  const minute = pad(ts.getUTCMinutes());
  const timestampCompact = `${year}${month}${day}T${hour}${minute}`;
  const hostSegment = sanitizeSegment(shard.host || 'host');
  const seqSegment = shard.seq.toString().padStart(4, '0');
  const pmSegment = shard.pmId.toString();

  return `${bucketRoot}/${shard.gameId}/${year}/${month}/${day}/${hour}/${shard.gameId}-${timestampCompact}-${hostSegment}-${pmSegment}-${seqSegment}.jsonl.gz`;
}

async function gzipNdjson(ndjson: string): Promise<Buffer> {
  const buffer = Buffer.from(ndjson, 'utf8');
  return gzip(buffer);
}

export async function uploadShardToSupabase(
  shard: FinalizedShard,
  options: UploadShardOptions = {}
): Promise<UploadShardResult> {
  const bucket = options.bucket || 'dd-logs';
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const supabase = getSupabaseAdminClient();
  const storagePath = buildStoragePath(shard);
  const checksum = createHash('sha256').update(shard.ndjson, 'utf8').digest('hex');
  const payloadBuffer = await gzipNdjson(shard.ndjson);
  const sizeBytes = shard.ndjson ? Buffer.byteLength(shard.ndjson, 'utf8') : 0;
  const compressedBytes = payloadBuffer.byteLength;
  const uploadStarted = Date.now();

  const attemptUpload = async (): Promise<void> => {
    const response = await supabase.storage.from(bucket).upload(storagePath, payloadBuffer, {
      contentType: 'application/x-ndjson',
      cacheControl: '60',
      upsert: false,
    });

    if (response.error) {
      throw response.error;
    }
  };

  markUploadPending();
  try {
    let attempt = 0;
    while (true) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await attemptUpload();
        break;
      } catch (error) {
        attempt += 1;
        if (attempt >= maxAttempts) {
          throw error;
        }
        const backoff =
          Math.min(60_000, 500 * 2 ** (attempt - 1)) +
          Math.floor(Math.random() * 250);
        // eslint-disable-next-line no-await-in-loop
        await delay(backoff);
      }
    }
  } catch (error) {
    markUploadSettled(false);
    recordUploadFailure(
      error instanceof Error ? error.message : String(error ?? 'unknown')
    );
    throw error;
  }

  const durationMs = Date.now() - uploadStarted;
  markUploadSettled(true);
  recordUploadSuccess({
    storagePath,
    sizeBytes,
    durationMs,
    checksum,
    compressedBytes,
    gameId: shard.gameId,
    tsStart: shard.tsStart,
    tsEnd: shard.tsEnd,
    lineCount: shard.lineCount,
  });

  return {
    storagePath,
    sizeBytes,
    compressedBytes,
    checksum,
    durationMs,
  };
}
