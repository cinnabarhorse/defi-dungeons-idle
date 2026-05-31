# Convex Migration Spike (Supabase -> Convex.dev)

## Goal
Evaluate the effort, risks, and upsides of switching the backend from Supabase
to Convex, given the current usage in this repo. This is a spike only, not a
commitment to migrate.

## Current Supabase Footprint (from codebase)

### Database (Postgres on Supabase)
- Server uses a Postgres pool and direct SQL for most data access via
  `apps/server/src/lib/db/*` and `apps/server/src/lib/db/repos/*`.
- `getPgPool()` and `runTransaction()` in
  `apps/server/src/lib/db/client.ts` provide direct SQL transactions.
- Large set of repository modules (players, progression, inventory, economy,
  loot, games, deposits, payouts, etc.) use SQL directly.
- Migrations are in `supabase/migrations/` and `db/migrations/`.

### Realtime subscriptions (client)
- Supabase realtime is used for live updates via `postgres_changes`:
  - Inventory stream: `apps/client/src/hooks/useInventory.ts`
  - Player + deposits stream: `apps/client/src/hooks/usePlayerStream.ts`
  - Top-up deposits stream: `apps/client/src/hooks/useTopupDeposits.ts`

### Supabase Storage
- Log upload uses Supabase storage in
  `apps/server/src/lib/logging/uploader-supabase.ts`.

### Supabase Edge Functions (Deno)
- Cron-triggered jobs in `supabase/functions/`:
  - Daily prize distribution and daily summary trigger:
    `supabase/functions/daily-prize-distribution/index.ts`
  - Weekly rewards top-up:
    `supabase/functions/weekly-reward-topup/index.ts`
  - Goldsky deposits webhook ingest:
    `supabase/functions/goldsky-deposits/index.ts`

### Supabase Auth
- Supabase auth is not a core dependency in the app logic. Auth appears to be
  custom (SIWE + server sessions). Supabase is used for DB, storage, and
  realtime.

## Convex Capabilities (relevant to migration)
Sources: Convex comparison page and docs for scheduling, schema, and realtime.

- Realtime: Convex is realtime by default via query subscriptions.
- Database model: document database with TypeScript schemas; no SQL joins.
- Transactions: mutations are transactional per function.
- Scheduling: supports scheduled functions and cron jobs.
- File storage: built-in file storage.
- Auth: supports OAuth and native auth (but you likely continue custom SIWE).

Links:
- https://www.convex.dev/compare/supabase
- https://docs.convex.dev/realtime
- https://docs.convex.dev/database/schemas
- https://docs.convex.dev/database/reading-data/indexes/
- https://docs.convex.dev/scheduling

## Migration Scope by Area

### 1) Data model and queries (largest effort)
Supabase uses Postgres + SQL. Convex uses a document model with explicit
indexes and no SQL joins.

Implications:
- Every SQL query in `apps/server/src/lib/db/repos/*` must be rewritten as
  Convex queries/mutations.
- Join-heavy flows must be redesigned with document IDs and multiple lookups.
- Schema definition moves to `convex/schema.ts`; indexes must be defined and
  used explicitly.
- Migrations become schema changes + data migration scripts (no SQL migrations).
- The `pg` transaction helper and multi-table SQL writes need equivalent
  Convex mutation flows.

Estimated work:
- Full rewrite of server data-access layer (likely 20+ repos).
- Data model redesign for document storage (embedding vs referencing).

### 2) Realtime subscriptions (client)
Supabase realtime subscriptions currently wrap `postgres_changes` listeners.
Convex provides realtime queries by default. The client will need:
- New Convex client setup (provider, hooks, auth integration).
- Replace `getSupabaseBrowserClient()` usage in hooks with Convex queries.
- Update subscription semantics (Convex re-runs queries rather than push of
  table changes).

Estimated work:
- Replace the three core hooks and any downstream assumptions about payloads.

### 3) Edge functions / cron jobs
Supabase Deno functions must be moved:
- Daily prize distribution trigger -> Convex scheduled function or external
  cron hitting the server endpoint.
- Weekly rewards top-up -> Convex cron job (or server cron).
- Goldsky deposits webhook -> Convex HTTP action or keep as a standalone
  service.

Estimated work:
- Rewrite three functions; validate secrets and notifications behavior.
- Decide where to host and how to authenticate (Convex HTTP actions vs
  server-owned endpoints).

### 4) Storage (Supabase storage -> Convex files)
`uploadShardToSupabase` uses Supabase storage buckets. Convex file storage
would require:
- New upload client and download URLs.
- Migration of existing log objects if retention is important.
- Updating any downstream consumers of storage paths.

Estimated work:
- Medium; API surface changes and possible data backfill.

### 5) Infrastructure and tooling
Supabase CLI tooling and migrations would be replaced with Convex deployment
and schema management.
- Update CI and scripts that assume Supabase Postgres (`pnpm db:*` or
  migration jobs, if any).
- Replace environment variables: SUPABASE_* -> CONVEX_*.
- Update local dev and staging provisioning steps.

Estimated work:
- Medium, but touches many scripts and docs.

## Risks

### Data model risk (high)
- No SQL joins: several admin and reporting queries may need redesign.
- Loss of Postgres capabilities: SQL analytics, ad-hoc queries, JSONB ops,
  server-side functions (RPC) will need equivalents or re-implementation.
- Larger rewrite risk for transactional workflows (loot distribution, economy,
  deposits), which currently rely on SQL transactions and constraints.

### Migration and backfill risk (high)
- Data migration from Postgres to Convex requires ETL and verification.
- Historical data volume could be large (runs, logs, deposits, events).
- Downtime risk if dual-writing or freeze period not planned.

### Operational risk (medium)
- New operational model (Convex deployments, limits, costs).
- Feature parity concerns for edge cases (e.g., long-running jobs, external
  webhooks, or high write frequency).

### Vendor lock-in (medium)
- Convex is a proprietary backend model; while open-source exists, data model
  is not SQL and would require another rewrite to move away later.

### Performance/limits risk (medium)
- Convex requires explicit indexes for queries; missing indexes cause scans.
- High-frequency events (enemy kills, loot events) must be batched to avoid
  excessive writes and hitting throughput limits.

## Upsides

### Realtime-first architecture
- Built-in subscriptions; no separate realtime server setup.
- Consistent realtime semantics with the same channel as reads/writes.

### TypeScript-first developer experience
- End-to-end typed queries and mutations.
- Reduced boilerplate for data fetch + realtime updates.

### Operational simplicity
- Convex manages the database and caching by default.
- Less database tuning compared to Postgres/SQL (per Convex positioning).

### Potential simplification of client hooks
- Replace manual `postgres_changes` + REST rehydrate cycles with Convex query
  subscriptions and caching.

## Rough Effort Estimate
Assuming the goal is a complete migration (no Supabase dependency at runtime),
and keeping all current functionality.

### Conservative range (2 engineers)
- Discovery & data model design: 2-3 weeks
- Rewrite data access + schema + indexes: 4-6 weeks
- Realtime client updates: 1-2 weeks
- Cron/jobs & webhooks migration: 1-2 weeks
- Storage migration + backfill: 1-2 weeks
- Data migration + validation + rollout: 2-4 weeks

**Total**: ~11-19 weeks, depending on data volume and refactor complexity.

### Aggressive range (3+ engineers, limited scope)
- MVP migration of core gameplay tables first, delay admin + analytics
- Keep Supabase for storage or goldsky ingestion during transition

**Total**: ~7-12 weeks for MVP, plus follow-up work for full parity.

## Suggested Migration Strategy (if you proceed)

1) **Read-only dual system (low risk)**
   - Stand up Convex with read replicas of critical data.
   - Build Convex queries for player profile and inventory first.

2) **Core gameplay write path**
   - Move writes for players/progression/inventory to Convex.
   - Leave analytics and logs in Postgres temporarily.

3) **Realtime subscriptions**
   - Swap client hooks to Convex query subscriptions for the moved tables.

4) **Jobs and webhooks**
   - Rebuild cron jobs and webhook ingestion in Convex actions.

5) **Storage**
   - Migrate log storage and update consumers (if still needed).

6) **Finalize**
   - Migrate remaining tables, remove Supabase dependencies, update docs,
     and clean up env/config.

## Open Questions
- Do we need SQL-grade analytics and ad-hoc querying for admin/ops?
- What is the current data volume in key tables (inventory, events, logs)?
- Is Convex the source of truth for everything, or a partial migration?
- Do we need to keep Supabase storage for logs long-term?
- Should cron jobs move into Convex or stay as server-owned jobs?

## Recommendation
This is a large migration with high data-model and transactional risk. The
main upside is a smoother realtime + TypeScript developer experience and less
database operational overhead. The cost is rewriting the entire data layer,
replacing SQL workflows, and building a data migration pipeline.

If the core pain is realtime + client sync complexity, a smaller step could be
to introduce Convex for new realtime-only features while keeping Supabase for
the authoritative transactional store, then re-evaluate a full switch later.
