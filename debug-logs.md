### Debug logs to Supabase Storage — implementation plan (per-match `gameId`)

This document describes how to capture, batch, and upload structured server logs for each match (`gameId`) to Supabase Storage, with negligible runtime overhead and reliable retrieval for ops and debugging.

---

## Objectives

- Capture all relevant server logs for each match (`gameId`) as structured JSON.
- Partition logs per game and time window; store as compressed NDJSON objects in Supabase Storage.
- Ensure non-blocking, low-overhead logging that never stalls gameplay.
- Provide simple admin tooling to list, download, and tail logs by `gameId`.
- Apply retention, integrity, and redaction policies.

## Non-goals

- Building a full log analysis UI (basic list/download/tail only).
- Replacing production observability/metrics (complement, not replace).

---

## Design overview

- Structured logging via `pino` (JSON, no pretty-print in prod).
- Child loggers include `{ gameId }`; optional `{ playerId, sessionId, actionId }`.
- In-process async pipeline with backpressure:
  - emit log event → enqueue (lock-free ring buffer) → per-game shard aggregator → NDJSON chunk → gzip → upload to Supabase Storage.
- Shard rotation by time and size (whichever first).
- Optional index row in Postgres for discoverability; raw logs remain in Storage.
- Backpressure: shed `debug` first, then `info` if thresholds are exceeded; never block the game loop.

---

## Data model

### Log line shape (structured JSON)

- Required fields:
  - `ts` (ISO, e.g., `2025-11-09T17:10:21.123Z`)
  - `level` (`debug|info|warn|error|fatal`)
  - `gameId` (string)
  - `event` (short stable key, e.g., `enemy.spawn`, `action.start`)
  - `message` (human-oriented message, short)
- Common optional fields:
  - `serverId`, `host`, `pmId`, `env`, `region`
  - `playerId`, `sessionId`
  - `actionId`/`requestId` (correlate multi-line flows)
  - `details` (JSON object; keep small; redact secrets)

### Storage object format

- File format: NDJSON (one JSON object per line), UTF-8, gzip compressed.
- Object key template:
  - `by-game/{gameId}/{YYYY}/{MM}/{DD}/{HH}/{gameId}-{YYYYMMDDTHHmm}-{host}-{pmId}-{seq}.jsonl.gz`
  - Examples:
    - `by-game/123e4567/2025/11/09/17/123e4567-20251109T1710-prod-hostA-0-0001.jsonl.gz`
- Object size targets:
  - Rotate on either `maxBytes` (e.g., 5–20 MB) or `maxDurationMs` (e.g., 5–30 s), whichever first.

### Optional index row (Postgres)

- Table: `server_log_index`
  - `game_id text not null`
  - `ts_start timestamptz not null`
  - `ts_end timestamptz not null`
  - `level_counts jsonb not null` (e.g., `{"debug": 1532, "info": 820, "warn": 3, "error": 1}`)
  - `size_bytes int not null`
  - `storage_path text not null`
  - `host text not null`
  - `pm_id int not null`
  - `checksum text not null` (SHA-256 of decompressed NDJSON)
  - Primary key `(game_id, ts_start, storage_path)`
  - Indexes: `(game_id, ts_start desc)`, `(ts_start desc)`

---

## Operational characteristics

- Logging overhead: sub-millisecond serialization cost; IO offloaded via worker thread/stream.
- No pretty printing; no sync fs writes; no per-line network requests.
- Backpressure:
  - Queue depth thresholds trigger sampling (drop `debug` lines) and temporary level elevations.
  - Upload retries use exponential backoff with jitter; bounded concurrency (1–2).
- Graceful shutdown:
  - On `SIGTERM` and process exit hooks: stop intake, flush in-flight buffers, finalize uploads (time-boxed).
  - Best-effort to avoid log loss; if exceeded, persist a tiny local recovery file for later manual upload (optional).

---

## Security & privacy

- Redaction: central serializer strips secrets, auth headers, bearer tokens, private keys.
- Access: uploads use Supabase service role on the server only; admin API returns signed URLs or streams via server.
- Multi-tenant: object keys and index rows scoped by `gameId`; no client write access.

---

## Retention & lifecycle

- Storage retention: 30–90 days configurable.
- Index retention: 90–180 days configurable.
- Daily cleanup job removes aged objects and index rows.
- Integrity: compute SHA-256 over decompressed NDJSON; store in index.

---

## Admin & tooling

- API endpoints (server):
  - `GET /admin/logs/:gameId/shards?from=&to=` → list shards from index or by Storage prefix.
  - `GET /admin/logs/:gameId/download?from=&to=` → stream merged NDJSON (server fetches, concatenates in chronological order).
  - `GET /admin/logs/:gameId/tail` → sampled live tail (WebSocket) from in-memory bus (optional).
  - `POST /admin/logs/settings` → adjust sampling rate, max queue lines, and rotation thresholds at runtime (no env).
- CLI (scripts):
  - `pnpm logs:tail --game <id> --since 15m` (calls admin API, streams with filters).
- UI (optional):
  - Admin page to browse shards and download; simple filters by `level`, `event`, `playerId`.

---

## Configuration (no new env vars)

- Reuse existing Supabase env (already present in the server):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Bucket name is a fixed constant: `dd-logs` (no env).
- All other settings use code defaults and can be changed via an admin endpoint at runtime (no env toggles).

---

## Implementation plan

### Phase 0 — Foundations

1. Define TypeScript interfaces for log line and shard metadata.
2. Establish redaction/serialization policy; implement serializers and event-to-log mapping guidelines.
3. Define compile-time defaults and in-memory tunables (no env loader).

### Phase 1 — Structured logger & per-game intake

1. Add base JSON logger (pino) with `serverId`, `env`, `region`, `host`, `pmId` (derive from runtime: `os.hostname()`, `process.env.pm_id ?? 0`, `process.env.NODE_ENV`).
2. Provide `loggerForGame(gameId)` that returns a child logger with `{ gameId }`.
3. Centralize helpers to enrich logs with `actionId`, `playerId` when available.
4. Replace critical scattered logging with the structured logger in high-value paths (combat, actions, AI, networking).

### Phase 2 — In-process aggregator and sharding

1. Implement a non-blocking log queue with bounded capacity.
2. Create per-game shard managers:
   - Track active shard per `gameId` with `ts_start`, `line_count`, `level_counts`, `bytes_estimate`.
   - Append incoming log lines to NDJSON string/buffer.
   - Rotate on `maxBytes` or `maxDurationMs`.
3. On rotation:
   - Finalize shard: compute `ts_end`, `level_counts`, size.
   - Hand off to gzip + upload worker.
   - Reset in-memory shard state.
4. Expose metrics: queue depth, rotate count, flush duration, upload latency, dropped logs.

### Phase 3 — Gzip + upload to Supabase Storage

1. Worker-thread or thread-stream to gzip finalized NDJSON buffer.
2. Upload object to `dd-logs` bucket with the key template above.
3. Retry policy: exponential backoff (cap at ~60s), max attempts (e.g., 5), mark shard as failed if exceeded.
4. Optional: local fallback directory for failed shards (ops can manually re-upload).

### Phase 4 — Index row (optional but recommended)

1. Create `server_log_index` table and migrations.
2. After successful upload, insert index row: `game_id`, `ts_start`, `ts_end`, `level_counts`, `size_bytes`, `storage_path`, `host`, `pm_id`, `checksum`.
3. Build a small repo for index CRUD and range queries.

### Phase 5 — Admin API & CLI

1. Implement `GET /admin/logs/:gameId/shards` (reads index; fallback to Storage prefix listing when index disabled).
2. Implement `GET /admin/logs/:gameId/download` (server-side merge stream).
3. Optional live tail: subscribe to in-memory bus (sampled) per `gameId`.
4. CLI: `scripts/logs-tail.ts` to call the endpoints above and filter client-side.

### Phase 6 — Retention & ops

1. Scheduled job (daily) to delete objects older than retention window and prune index.
2. Alerts: if upload error rate > threshold or dropped logs > threshold, emit `warn` and surface in ops channel.
3. Document runbooks for manual re-upload from fallback directory.

---

## File layout (to be added later; TypeScript, functional style)

- `apps/server/src/lib/logging/log-schema.ts` (interfaces; redact/serialize helpers)
- `apps/server/src/lib/logging/base-logger.ts` (pino base and `loggerForGame`)
- `apps/server/src/lib/logging/ingest-queue.ts` (bounded async queue)
- `apps/server/src/lib/logging/game-shard-manager.ts` (per-game shard state, rotation)
- `apps/server/src/lib/logging/uploader-supabase.ts` (gzip + upload worker)
- `apps/server/src/lib/logging/metrics.ts` (queue depth, latencies, drops)
- `apps/server/src/lib/logging/index-repo.ts` (optional Postgres index CRUD)
- `apps/server/src/routes/admin/logs.ts` (list/download/tail endpoints)
- `scripts/logs-tail.ts` (CLI; optional)
- `db/migrations/xxxx_create_server_log_index.sql` (optional)

Notes:

- All types/utilities are in-app; do not depend on workspace packages that can break deployment.
- Keep implementation functional and modular; avoid classes; prefer pure functions and small modules.

---

## Performance guardrails

- Default level = `info`; enable `debug` only per `gameId` or via sampling.
- Shed `debug` logs first when:
  - queueDepth exceeds 50% of the max (default max 100,000 lines)
  - upload backlog > 2 shards
  - event loop lag > 50 ms (rolling p95)
- Hard cap: if queueDepth exceeds max, drop new `debug`/`info`; log one-time `warn` with counters.

---

## Testing & verification

- Unit tests:
  - serialization + redaction correctness
  - sharding rotation (time/size)
  - gzip + checksum determinism
  - uploader retries and failure paths
- Integration tests:
  - end-to-end emit → shard → upload → index row
  - admin download stream returns ordered lines and full content
- Load test:
  - simulate high-traffic games; verify negligible impact on tick rate.

---

## Rollout plan

1. Ship the logger and intake, but keep uploader disabled via an in-memory toggle—write to memory and discard.
2. Enable uploader with a tiny `maxBytes`/`maxDurationMs` in staging; validate in Supabase.
3. Enable in prod for a single `gameId`; verify admin download and integrity.
4. Gradually enable for all games; monitor queue depth, upload latency, dropped logs.
5. Tune thresholds; set retention job; finalize alerts.

---

## Open questions

- Desired default retention period? (e.g., 60 days)
- Do we want the optional Postgres index now or later?
- Which events need guaranteed presence vs. sampled? (list per system)
