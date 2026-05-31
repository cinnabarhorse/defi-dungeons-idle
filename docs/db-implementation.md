# Database Implementation Plan

## Goals & Assumptions

- Persist all live-game state that currently lives in memory or local storage into Postgres (Supabase) so that runs, inventory, and payments survive process restarts and power the web app.
- Supabase will host Postgres; we will interact with it from the Node colyseus server via `@supabase/supabase-js` using a service-role key. No direct client writes.
- Client apps treat Supabase as read-only: they subscribe to live changefeeds scoped to their identity and never issue inserts/updates themselves.
- `docs/db-tables.md` is the canonical schema. We will generate SQL migrations and keep them in-repo so Fly/Hetzner/Vercel deploys can run them automatically.
- Wallet address is the external identity. We will introduce a stable `player_id` UUID in the database and map it to Colyseus session IDs at runtime.
- We continue to forbid client-authoritative updates for combat, inventory, and progression; the server persists and validates everything.

## Tooling & Setup

### Database provider & connection

- Add `@supabase/supabase-js` and `pg` to `apps/server/package.json` (runtime) for database access and to allow SQL streaming for migrations.
- Create `apps/server/src/lib/db/client.ts` that lazy-loads a Supabase client configured with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and exposes helpers for RPC-less SQL (use `.from()` for standard DML, or Postgres functions if needed later).
- Provide a separate browser helper that only initialises the anon-key Supabase client for live subscriptions (`postgres_changes`) and explicitly disables write methods.
- Use a lightweight query helper for transactional work (`runTransaction<T>(fn)` using the `pg` client) for multi-table writes like loot distributions.

### Environment management

- Add `.env.example` entries for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (client read-only if ever needed), and `DATABASE_POOL_MAX`.
- Extend `apps/server/src/index.ts` env bootstrap so the new variables surface (same pattern as current `dotenv` loading).
- Update deployment scripts (`hetzner-update-and-restart.sh`, Fly config) to export the new env variables.

### Migrations & seeding

- Introduce `supabase/migrations/` (or `db/migrations/`) directory with timestamped SQL files that mirror the statements in `docs/db-tables.md`. Use Supabase CLI (`supabase migration new`) locally, commit SQL.
- Add `pnpm db:migrate` script that shells into a new `scripts/run-migrations.ts` (tsx) invoking `supabase db push` or running SQL through `pg`.
- Create seed scripts in `scripts/seed/*.ts` for data that must exist (loot catalog rows, baseline wearables) and hook into `pnpm db:seed`.

### Data access layer skeleton

- Create `apps/server/src/lib/db/types.ts` describing row shapes (`PlayerRow`, `GameRow`, etc.) to keep query code typed.
- Break repository modules by domain under `apps/server/src/lib/db/repos/` (e.g., `players.ts`, `progression.ts`, `inventory.ts`, `games.ts`, `loot.ts`, `payments.ts`). Each exports CRUD helpers returning typed objects and performing schema validation (use `zod` to guard JSON payloads like `stat_allocations`).
- Provide `apps/server/src/lib/db/errors.ts` for mapping Postgres errors into domain errors (unique violations → `PlayerAlreadyExists`, etc.) for nicer logging.

### Observability & reliability

- Extend `apps/server/src/lib/http-logging.ts` to include DB query timings (wrap repository calls).
- Add health-check SQL in `/health` route to ensure DB reachability (lightweight `select 1`).
- Integrate with existing `logError` so failed migrations or queries emit structured metadata (table, operation, payload fragment).

## Execution phases

1. **Infrastructure bring-up**: add dependencies, env wiring, DB client, base migrations.
2. **Core identity & auth**: implement `players` + `auth_sessions`; wire login endpoints and Colyseus auth to use DB-backed records.
3. **Progression & inventory**: persist progression in `players` (merged), `player_inventories`, `player_equipment`, and send hydrated profiles to the client.
4. **Game lifecycle telemetry**: implement `games`, `game_players`, `enemy_kills`, `enemy_drops`, `chest_opens` with instrumentation from `GameRoom` and systems.
5. **Loot & economy**: connect `loot_catalog`, `loot_distributions`, `economy_transactions` and expose Next.js/API endpoints to power the Loot tab.
6. **Payments**: build `top_ups` + `payouts` ingestion endpoints and admin hooks.
7. **Testing & rollout**: add integration tests (using Supabase test db), smoke-test migrations, update docs, and gate server writes behind a feature flag (`DB_PERSISTENCE_ENABLED`) for gradual rollout.

## Table workstreams

### players

**Purpose**: canonical account record; anchors all FKs.

**Migrations**

- Ensure SQL matches `docs/db-tables.md` plus a trigger to auto-update `updated_at` (`before update set updated_at = now()`).

**Key files to touch**

- `apps/server/src/lib/db/repos/players.ts`: `getByWallet`, `create`, `touchLastSeen`, `banPlayer`.
- `apps/server/src/index.ts`: in `/api/auth/verify`, on successful SIWE, `upsert` player by wallet, set `region` from request metadata, return `player_id`.
- `apps/server/src/rooms/GameRoom.ts`: during `onJoin`, resolve `player_id` by wallet and cache in session state (`sessionPlayerMap`).
- `apps/client/src/hooks/useWalletConnection.ts`: expect REST payload to include `playerId` for downstream hooks.

**Queries**

- `insert into players (wallet_address, username, region) values (...) on conflict (wallet_address) do update set last_seen = now(), updated_at = now() returning *`.
- `update players set is_banned = true, updated_at = now() where id = $1` (for admin UI).

**Implementation notes**

- Add middleware that checks `is_banned` after session verification and rejects gameplay joins.
- When Colyseus auth runs, map `client.sessionId -> player_id` in a new `Map` on `GameRoom`; reuse for kill logging.
- Expose a lightweight `/api/player` endpoint that returns `player_id`, `username`, and `region` for the client side profile header.

### progression (in players)

**Purpose**: persist XP, levels, stat allocations, and derived stats directly on `players`.

**Key files**

- `apps/server/src/lib/db/repos/progression.ts`: `getByPlayerId`, `upsertProfile`, `incrementXp`, `applyLevelLoss`, `updateAllocations`.
- `apps/server/src/rooms/GameRoom.ts`: replace in-memory `playerProgression` map with DB-backed cache; load profile on join, write-back on tick/batch.
- `apps/client/src/hooks/useProgression.ts`: on hydrate, call `/api/player/progression` to fetch server-authoritative profile; keep local storage only as offline cache.
- `apps/server/src/lib/player-stats.ts`: after applying modifiers, persist `players.derived_stats` + `players.equipped_wearables` JSON.

**Queries**

- `update players set level = $2, total_xp = $3, unspent_points = $4, unlocked_tiers = $5, lick_tongue_count = $6, stat_allocations = $7::jsonb, derived_stats = $8::jsonb, equipped_wearables = $9::jsonb, allocation_history = $10::jsonb, last_synced_at = $11, updated_at = now() where id = $1 returning *` for full sync/upsert.
- Partial updates: dynamic `update players set ... where id = $1 returning *` (build columns present in patch).

**Implementation notes**

- Keep an in-memory dirty-set inside `GameRoom` and flush batched updates every N seconds or on room dispose to avoid spamming DB. Use `Promise.allSettled` with repo function.
- When client sends `progression_sync`, validate diff server-side, reject attempts to leap beyond level cap, and write sanitized data.
- Return progression data in the initial `room_joined` payload sourced from DB, not defaults.

### preferences (in players)

**Purpose**: eliminate client-authoritative `localStorage` for hero selection, difficulty tier, avatar sprites, and audio sliders by persisting them directly on `players`.

**Key files**

- `apps/server/src/lib/db/repos/player-preferences.ts`: `getPreferences`, `upsertPreferences`, `updatePreferences` (now reading/writing `players`).
- `apps/server/src/index.ts`: `/api/player/preferences` continues to exist; reads/writes `players`.
- `apps/client/src/hooks/usePlayerPreferences.ts`: subscribe to `players` and hydrate preferences.
- `apps/client` components (`page.tsx`, `CharacterSelector.tsx`, `GameHUD.tsx`, `initPhaser.ts`, `GameScene.ts`) must consume this hook instead of reading/writing browser storage.

**Queries**

- `update players set selected_character_id = $2, selected_difficulty_tier = $3, gotchi_sprite_url = $4, avatar_id = $5, audio_settings = $6::jsonb, updated_at = now() where id = $1 returning *`.

**Implementation notes**

- Validate `selected_character_id` against `ALL_CHARACTERS` (server data) and allow `gotchi:` prefixed ids only if the player actually owns the gotchi (server already checks during join).
- Reject `selected_difficulty_tier` updates when the requested tier is not present in `players.unlocked_tiers`.
- Normalize `gotchi_sprite_url` so it stays empty or matches `/sprites/` or server-hosted URLs; never persist arbitrary third-party links.
- Clamp audio sliders to `[0, 100]` on the server and coerce `muted` to boolean to prevent injection.
- After writes, trigger Supabase live updates (players row change) so the client hook rehydrates without polling or `localStorage` fallbacks.

### player_inventories

**Purpose**: persistent bag of items per player with uniqueness on `(player_id, item_type, item_name)`.

**Key files**

- `apps/server/src/lib/db/repos/inventory.ts`: `getByPlayerId`, `addOrIncrementItem`, `setQuantity`, `removeItem`, `bulkReplace` for full syncs.
- `apps/server/src/lib/systems/VacuumSystem.ts`: after `item_pickup`, call `inventoryRepo.addOrIncrementItem` and `inventoryEventsRepo.logPickup` (see below).
- `apps/server/src/rooms/GameRoom.ts`: remove `playerInventories` `Map`, replace with calls to repo and cached snapshot.
- `apps/client/src/components/ProfilePanel.tsx` and `apps/client/src/components/loot/LootList.tsx`: read inventory from API to show currency totals / bag; reconcile with live deltas but never push mutations.

**Queries**

- `insert into player_inventories (...) values (...) on conflict (player_id, item_type, item_name) do update set quantity = player_inventories.quantity + excluded.quantity, item_data = excluded.item_data, updated_at = now() returning *`.
- `update player_inventories set quantity = greatest(quantity - $1, 0), updated_at = now() where player_id = $2 and item_type = $3 and item_name = $4 returning quantity`.

**Implementation notes**

- Introduce server-side inventory validation: cap stack sizes, prevent negatives, enforce JSON schema for `item_data` (type-specific payload).
- Provide `/api/inventory` (GET) that returns grouped items for UI; optionally include aggregated totals for coins/materials.
- ✅ **Inventory live flow (updated)**: the server is the only writer. When a player connects or reconnects, Colyseus hydrates their full inventory from Postgres and caches it in-memory. On every pickup/consumption, the server inserts/updates the relevant `player_inventories` rows inside a transaction, which triggers Supabase broadcasts. Clients subscribe to those `player_inventories` changes (scoped to their `player_id`) to receive authoritative updates. Add a low-frequency (e.g., 60 s) polling fallback on the client to re-fetch `/api/player/inventory` in case a live message is missed.

### player_inventory_events

**Purpose**: audit trail of item changes.

**Key files**

- `apps/server/src/lib/db/repos/inventory-events.ts`: `logEvent(event)`.
- Hook from `inventoryRepo` writes so every add/remove automatically logs delta + reason.
- Extend systems (`EnemyDeathSystem`, `ResourceSystem`, `handleOpenChest`) to call `logEvent` with context (game_id, reason, metadata).

**Queries**

- `insert into player_inventory_events (player_id, item_type, item_name, delta, reason, game_id, metadata) values (...)`.
- Reporting queries for admin: `select reason, sum(delta) from player_inventory_events where player_id = $1 and created_at >= now() - interval '7 days' group by reason`.

**Implementation notes**

- Define enum/union for `reason` (e.g., `enemy_drop`, `chest_reward`, `craft`, `admin_grant`) and centralize in `inventory-events.ts`.
- Use metadata to capture enemy id / chest id for analytics.

### games ✅

**Purpose**: run-level metadata per room instance.

**Key files**

- `apps/server/src/lib/db/repos/games.ts`: `create`, `markCompleted`, `upsertMetrics`, `setTreasureRoomState`.
- `apps/server/src/rooms/GameRoom.ts`: on `onCreate`, call `gamesRepo.create` with `room_id`, `seed`, `region`, `difficulty_tier`, `status = 'active'`; keep returned `game_id` in room state.
- On `onDispose`, mark game ended, set `ended_at`, `status` (`completed`, `abandoned`, `crashed` based on players left and timers).
- During gameplay (enemy kills, portal guardian thresholds) update aggregated numeric columns via `gamesRepo.incrementCounters`.

**Queries**

- `insert into games (...) values (...) returning id`.
- `update games set status = $1, ended_at = now(), total_enemy_kills = $2, in_treasure_room = $3, next_timed_spawn_at = $4, pg_threshold_kills = $5, pg_kills_until_chance = $6, pg_spawn_chance_percent = $7 where id = $8`.

**Implementation notes**

- Wrap metric updates in batched `update games set total_enemy_kills = total_enemy_kills + $1 ...` to avoid race conditions.
- Feed `games` data into analytics dashboards by exposing `/api/admin/games?status=active` for ops.

### game_players ✅

**Purpose**: per-player per-run stats.

**Key files**

- `apps/server/src/lib/db/repos/game-players.ts`: `join(gameId, playerId, characterId)`, `recordLeave`, `bumpStats` (kills/deaths/damage), `recordXpGain`, `recordCoins`.
- `apps/server/src/rooms/GameRoom.ts`: on `onJoin`, create game_player row; store returned id in session map. On `onLeave`/`onDispose`, flush aggregated stats.
- Instrument kill/death/damage events: update in-memory counters and flush periodically.

**Queries**

- `insert into game_players (...) values (...) on conflict (game_id, player_id) do update set left_at = null returning id` (when rejoining same room).
- `update game_players set left_at = now(), kills = kills + $1, deaths = deaths + $2, damage_dealt = damage_dealt + $3, damage_taken = damage_taken + $4, coins_collected = coins_collected + $5, usdc_earned_base_units = usdc_earned_base_units + $6, xp_gained = $7, level_before = $8, level_after = $9 where id = $10`.

**Implementation notes**

- Extend combat pipeline to attribute kills: when `handleEnemyDeath` is called with `killerId`, map to `player_id` and increment counters.
- Capture deaths in `handlePlayerDeath` (existing method) and propagate to repo.
- For damage, intercept in `ProjectileSystem` and `EnemySystem` where hp is reduced; accumulate totals per session.
- Provide scoreboard data to clients by fetching aggregated stats from this table when run completes.

### enemy_kills ✅

**Purpose**: detailed kill log for analytics, loot correlation.

**Key files**

- `apps/server/src/lib/db/repos/enemy-kills.ts`: `logKill(gameId, playerId | null, enemyType, location)`.
- `apps/server/src/rooms/GameRoom.ts`: inside `handleEnemyDeath`, after awarding XP, call `enemyKillsRepo.logKill` with `enemy.enemyType`, `killerId`, `enemy.x/y`, and `game_id` from room state.

**Queries**

- `insert into enemy_kills (game_id, player_id, enemy_type, at, location) values ($1, $2, $3, now(), jsonb_build_object('x', $4, 'y', $5)) returning id`.
- Aggregations for dashboards: `select enemy_type, count(*) from enemy_kills where game_id = $1 group by enemy_type`.

**Implementation notes**

- Use returned kill id to link `enemy_drops` records when loot is generated.

### enemy_drops

**Purpose**: record RNG outcomes and link to loot distributions.

**Key files**

- `apps/server/src/lib/db/repos/enemy-drops.ts`: `logDrop(gameId, killId, enemyType, dropTable, rolledWeight, lootDistributionId)`.
- `apps/server/src/lib/systems/EnemyDeathSystem.ts`: after `spawnEnemyDrop` decides loot, call repo with relevant metadata (drop table name, weight, random seed if available).

**Queries**

- `insert into enemy_drops (game_id, enemy_kill_id, loot_distribution_id, enemy_type, drop_table, rolled_weight, created_at) values (...) returning id`.

**Implementation notes**

- When drop spawns a collectible entity, store the DB `enemy_drops.id` in entity state so when player picks it up we can mark associated `loot_distribution` as claimed or convert to inventory event.

### chest_opens

**Purpose**: track treasure chest rewards.

**Key files**

- `apps/server/src/lib/db/repos/chests.ts`: `logOpen(gameId, playerId, chestEntityId, difficultyTier, rewardSummary)`.
- `apps/server/src/rooms/GameRoom.ts`: inside `handleOpenChest`, after reward selection, persist record with JSON summary (list of loot ids, amounts).

**Queries**

- `insert into chest_opens (game_id, player_id, chest_entity_id, difficulty_tier, reward_summary, at) values (...) returning id`.

**Implementation notes**

- Generate `reward_summary` by combining loot distribution ids; reuse for auditing payouts.

### loot_catalog ✅

**Purpose**: master list of loot available (on-chain or virtual).

**Key files**

- `scripts/seed/loot-catalog.ts`: read from `data/loot.json` (to create) and upsert rows.
- `apps/server/src/lib/db/repos/loot.ts`: `listActive()`, `decrementRemaining`, `markClaimed`, `reload`.
- `apps/client/src/app/loot/page.tsx`: fetch from new `/api/loot/catalog` endpoint (server component) to render counts.

**Queries**

- `insert into loot_catalog (...) values (...) on conflict (id) do update set remaining = excluded.remaining, last_claimed = excluded.last_claimed, reloaded_at = excluded.reloaded_at, is_active = excluded.is_active, metadata = excluded.metadata returning *`.
- `update loot_catalog set remaining = remaining - $1, last_claimed = now() where id = $2 and remaining >= $1 returning remaining`.

**Implementation notes**

- Use numeric for amounts to support tokens with decimals; store decimals in column.
- Add constraint check to prevent `remaining` from dropping below zero.
- Treasure chest payouts now pull from the `USDC Airdrop` row only; `handleOpenChest` wraps the catalog decrement + `loot_distributions` insert in a transaction so real balances move atomically.

### loot_distributions ✅

**Purpose**: record each loot roll/outcome per player or entity.

**Key files**

- `apps/server/src/lib/db/repos/loot-distributions.ts`: `createPending(gameId, playerId, lootId, source, amount, probability, expectedValue, entityId)`, `markClaimed(id, txHash)`, `listUnclaimedByPlayer(playerId)`.
- Hook into `handleOpenChest`, enemy drop resolution, quest rewards to record distribution row.
- For consumables granted directly (coins/materials), link to inventory events and `economy_transactions`.

**Queries**

- `insert into loot_distributions (...) values (...) returning id`.
- `update loot_distributions set claimed = true, claim_tx_hash = $1, claim_at = now() where id = $2 and claimed = false returning *`.

**Implementation notes**

- When instant-claim virtual loot (e.g., coins) is granted, mark `claimed = true` immediately and tie to `economy_transactions`.
- Use `source` enums like `chest`, `enemy_drop`, `quest`.

### top_ups ✅

**Purpose**: ledger of fiat/crypto deposits used for staking.

**Key files**

- `apps/server/src/lib/db/repos/payments.ts`: `createTopUp`, `markPaid`, `markFailed`, `listByStatus`.
- New HTTP endpoints under `/api/payments/top-ups` for initiating a top-up (internal or via webhook) and admin updates.
- Add webhook handler route (if using payment provider) to update `status`, `tx_hash`, `block_number`.

**Queries**

- `insert into top_ups (player_id, amount_base_units, currency, status, provider, provider_ref, chain_id) values (...) returning *`.
- `update top_ups set status = $1, paid_at = now(), tx_hash = $2, block_number = $3, updated_at = now() where id = $4 returning *`.

**Implementation notes**

- On successful top-up, insert an `economy_transactions` record for the deposit.
- Expose admin view (Next.js server component) listing pending top-ups for manual reconciliation.

### payouts ✅

**Purpose**: outbound payment log (USDC, etc.).

**Key files**

- Extend `payments.ts` repo with `queuePayout`, `markSent`, `markFailed`.
- Add admin API `/api/payments/payouts` to queue/approve payouts.
- When payout sent on-chain, webhook updates status and `tx_hash`.

**Queries**

- `insert into payouts (player_id, amount_base_units, currency, status) values (...) returning *`.
- `update payouts set status = $1, tx_hash = $2, sent_at = now(), failure_reason = $3 where id = $4 returning *`.

**Implementation notes**

- Tie payouts to `economy_transactions` (negative amount) inside same transaction for reconciliation.
- Add DB constraint to ensure only one `queued` payout per player per loot distribution (if relevant) by referencing metadata.

### economy_transactions ✅

**Purpose**: unified ledger of currency movements.

**Key files**

- `apps/server/src/lib/db/repos/economy.ts`: `logTransaction(playerId, currency, amount, source, gameId?, lootDistributionId?, metadata?)`, `listRecent(playerId)`.
- Hook from top-ups, payouts, chest rewards awarding coins, store purchases.
- Server routes wired in `apps/server/src/index.ts`: `/api/player/economy` (summary + recent history), `/api/payments/top-ups`, `/api/payments/top-ups/webhook`, `/api/payments/payouts`, `/api/payments/payouts/webhook`.
- Client `/api/economy/history` endpoint powering an account statement UI.

**Queries**

- `insert into economy_transactions (player_id, currency, amount, source, game_id, loot_distribution_id, metadata) values (...) returning *`.
- Summaries: `select sum(amount) from economy_transactions where player_id = $1 and currency = 'USDC'`.

**Implementation notes**

- Always write economy entries inside the same transaction that mutates payouts or on-chain settlements to guarantee consistency.
- Webhook handlers authenticate with `PAYMENTS_WEBHOOK_SECRET` and translate payment provider payloads into ledger entries using shared helpers (`deriveLedgerAmount`).

### auth_sessions

**Purpose**: track SIWE sessions and nonce issuance.

**Key files**

- `apps/server/src/lib/db/repos/auth-sessions.ts`: `createSession(playerId, wallet, nonce, expiresAt, userAgent, ip)`, `invalidateSession(id)`, `getValidSession(tokenId)`.
- `apps/server/src/index.ts`: on `/api/auth/verify`, after verifying SIWE, create session row and store session ID in JWT payload. On `/api/auth/logout`, mark session invalid.
- `apps/server/src/lib/auth/token.ts`: embed DB `session_id` in JWT so we can invalidate server-side (update payload + verification logic).
- `apps/server/src/index.ts` `/api/auth/nonce`: store issued nonce in table (optional) or maintain existing in-memory cache with fallback to DB for audits.

**Queries**

- `insert into auth_sessions (player_id, wallet_address, nonce, expires_at, user_agent, ip) values (...) returning id`.
- `update auth_sessions set valid = false where id = $1` (logout).
- `select * from auth_sessions where id = $1 and valid = true and expires_at > now()` (validation).

**Implementation notes**

- Attach middleware that checks DB session validity on every request; if invalid, clear cookie.
- Schedule cron (or on login) to purge expired sessions.

### aavegotchi_characters ✅

**Purpose**: cache on-chain gotchi metadata for faster renders and to anchor player-equipment mapping.

**Key files**

- `apps/server/src/lib/db/repos/characters.ts`: `upsertGotchis(owner, gotchis)`, `listByOwner(owner)`.
- `apps/server/src/lib/aavegotchi.ts`: after fetching from subgraph, upsert rows (gotchi_id, owner_address, wearable_slugs, last_synced_at).
- `apps/client/src/hooks/useGotchiEquipment.ts`: use API to read cached data instead of hitting subgraph directly.

**Queries**

- `insert into aavegotchi_characters (gotchi_id, owner_address, wearable_slugs) values (...) on conflict (gotchi_id) do update set owner_address = excluded.owner_address, wearable_slugs = excluded.wearable_slugs, last_synced_at = now()`.
- `select * from aavegotchi_characters where owner_address = $1`.

**Implementation notes**

- Provide admin script to backfill all known gotchis for leaderboard wallets.

### player_equipment ✅

**Purpose**: track live loadouts per player separate from inventory.

**Key files**

- `apps/server/src/lib/db/repos/equipment.ts`: `setSlot(playerId, slot, wearableSlug, source)`, `listByPlayer(playerId)`, `clearAll(playerId)`.
- `apps/server/src/lib/player-stats.ts`: when applying derived stats, read equipment from DB (or load from gotchi default) and persist to `players.derived_stats`.
- `apps/server/src/rooms/GameRoom.ts`: on join, hydrate `equippedWearables` from DB; on sync events (future equip changes), update DB.
- `apps/client/src/components/CharacterSelector.tsx`: fetch equipment to show loadout (if UI needed).

**Queries**

- `insert into player_equipment (player_id, slot, wearable_slug, source) values (...) on conflict (player_id, slot) do update set wearable_slug = excluded.wearable_slug, source = excluded.source, updated_at = now()`.
- `delete from player_equipment where player_id = $1 and slot = $2` (when unequipped).

**Implementation notes**

- Define slot enum in code to avoid typos (`type EquipmentSlot = 'body' | 'eyes' | 'face' | 'hand_left' | 'hand_right' | ...`).
- Ensure equipment state updates also propagate to derived stats and inventory (when equipping from inventory, decrement quantity).

## Supporting tasks

- **API surface**: add REST endpoints under `/api/player/*` for profiles, inventory, economy, loot. Document the routes in `docs/web-api.md` (new file) for client devs.
- **Client updates**: migrate `useProgression`, `ProfilePanel`, `LootList`, and lobby components to rely on new endpoints and Supabase live listeners; ensure they handle loading states, apply server-authoritative overwrites, and never attempt direct writes.
- **Admin tooling**: add Next.js route `/app/admin/economy` using server components to display `economy_transactions`, top-ups, payouts for operations staff.
- **Testing**: create Vitest integration tests inside `apps/server/src/lib/db/__tests__/` that spin up Supabase test schema (use `supabase/test.url` env) to verify repositories.
- **Feature flagging**: read `process.env.DB_PERSISTENCE_ENABLED` in `GameRoom` and repository wrappers to allow fallback to in-memory behavior while rolling out.
- **Documentation**: update `docs/db-tables.md` cross-referencing repo modules; add diagrams (PlantUML or text) linking gameplay events to DB tables.

## Risks & open questions

- **Throughput**: high-frequency events (enemy kills) could cause write amplification. Mitigate with batching and queueing (flush every 1–5 seconds) and monitor Supabase rate limits.
- **Consistency**: ensure multi-table updates (loot distribution + inventory + economy) run inside a transaction; if Supabase REST cannot handle it directly, use `pg` client for those operations.
- **Latency**: avoid blocking the simulation loop on DB writes; use async fire-and-forget with error logging and reconnection logic.
- **Backfill**: decide if we need to import historical data from logs; if yes, write scripts before flipping feature flag.
- **Security**: guard admin/payment endpoints with role checks; never expose service key to client.
- **Schema evolution**: keep `docs/db-tables.md` as living doc; align migrations with doc updates to prevent drift.
