### Player Score Feature – Implementation Plan

## Overview
- Server-awarded, XP-mirrored score that exists only for the active dungeon run and resets whenever a new run begins (phase switches to `in_game`).
- Score unlocks only for combat kills that produce XP; environmental deaths or zero-XP enemies award nothing.
- Shared XP model applies: every player who receives XP from a kill receives the same score increment in lockstep with XP calculations.
- Death during the run marks the player ineligible for high-score submission; crossing into the treasure room and exiting the run is required to persist a new high score.
- Server remains authoritative; client is read-only and only renders the values it receives.

## Data Model & Migrations
- Add `highest_score integer NOT NULL DEFAULT 0` to `players`.
  - Update `apps/server/src/lib/db/types.ts` and `playersRepo.mapPlayerRow` to surface the field as `highestScore`.
- Create `run_scores` table (UUID primary key) with columns:
  - `player_id (uuid, fk players.id)`
  - `game_id (uuid, fk games.id)`
  - `score (integer not null, >=0)`
  - `difficulty_tier (text)`
  - `completed_at (timestamptz default now())`
  - `duration_ms (integer)`
  - `kills (integer)`
  - `xp_earned (integer)`
  - `valid_for_high_score (boolean)`
  - `metadata (jsonb)` for future analytics (e.g., seed, party size)
  - Index on `(player_id, score DESC)` for leaderboards, plus `(game_id)` to trace runs.
- Introduce `apps/server/src/lib/db/repos/run-scores.ts` with `recordRunScore` helper, export via `lib/db/index.ts`, and add `RunScoreRow/Record` types.
- No backfill required; existing players default to zero.

## Server Runtime Changes

### Schema & State (`apps/server/src/schemas/index.ts`, `apps/server/src/rooms/GameRoom.ts`)
- Extend `PlayerSchema` with `@type('number') score: number = 0;` (32-bit clamp, integers only).
- Add runtime trackers in `GameRoom`:
  - `playerScoreByPlayerId: Map<string, { score: number; eligible: boolean; enteredTreasureAt: number | null }>`
  - `pendingScoreDeltas: Map<string, number>` keyed by sessionId for flush batching.
  - `playersDiedThisRun: Set<string>` keyed by playerId (separate from existing session-based set) to preserve death state through reconnects.
- Track `scoreFlushInterval` or reuse `broadcastSnapshot()` cadence to commit queued deltas to schema (15 Hz). Single aggregated update per flush satisfies the "multi-kill same tick" requirement.

### Run Lifecycle Hooks
- On `setPhase('in_game')` (or `stagingBeginDungeonRun` callback): reset all scoreboard structures, zero scores in schema, clear death/ineligibility sets.
- On player join:
  - Initialize `playerScoreByPlayerId` entry (reuse existing value if reconnecting mid-run).
  - Set `player.score` to stored value, ensuring reconnect continuity.
- On player death (`handlePlayerDeath`): mark both session and `playersDiedThisRun` with the owning playerId; set `eligible=false` in `playerScoreByPlayerId`.
- When `transitionAllPlayersToTreasureRoom` fires, invoke new `GameRoom.markTreasureRoomEntry()` hook to stamp `enteredTreasureAt` for each active, non-bot player.

### Score Awarding Flow
- Inside `awardXpForEnemyDefeat` (after `adjustedXp` computed per player):
  - Skip if XP share is zero or enemy XP baseline is zero.
  - Skip if kill has no credited player *and* the source is flagged as environmental (follow existing killer metadata; fall back to `killerId` presence if no explicit flag).
  - Add the XP amount to the player's runtime total via `queueScoreDelta(sessionId, adjustedXp)`.
  - Clamp totals to `SCORE_MAX = 2_147_483_647`.
- `queueScoreDelta` updates runtime total and accumulates deltas in `pendingScoreDeltas`; it does **not** mutate schema immediately.
- `flushPendingScores()` (called from `broadcastSnapshot` or a dedicated 200 ms timer) iterates `pendingScoreDeltas`, writes the new totals into `PlayerSchema.score`, clears the delta map, and sends a lightweight `score:update` message if the feature flag is disabled (to avoid full state writes during experimentation).

### Persistence & High Score Submission
- Introduce config flag (`SCORE_CONFIG.enabled`, default true, sourced from env `SCORE_ENABLED`) so the system can be toggled server-side; all awarding/persisting no-ops when disabled.
- On player leave (`onLeave`):
  - Read playerId and runtime score (pull from `playerScoreByPlayerId`).
  - Determine run outcome: eligible if `playerScore > 0`, `eligible === true`, player reached treasure (`enteredTreasureAt != null`), room currently `inTreasureRoom === true`, and playerId not in `playersDiedThisRun`.
  - Persist run history via `runScoresRepo.recordRunScore({ ... })` with `valid_for_high_score` flag reflecting eligibility.
  - If eligible and `score > highest_score`, call `playersRepo.updateHighestScore` (new helper) in the same transaction.
  - Attach summary metadata to `gamePlayersRepo.applyStats`, e.g. `metadata.score = { final: score, eligible, submittedAt }`.
- On room dispose: iterate any remaining players and run the same persistence logic (use eligible flag even if they disconnect due to server shutdown).
- On run failure (player death before treasure, room destroyed mid-run): log a `run_scores` row with `valid_for_high_score=false` only if analytics desires; otherwise skip insert (decision: skip insert for invalid runs per requirement – include note in code comment).

### Networking & Message Flow
- No client-originating score messages allowed.
- Colyseus schema updates deliver authoritative score; optionally emit dedicated `score:update` message piggybacked from `flushPendingScores` with payload `{ playerId, score }` if we need to reduce schema churn when feature flag disabled.
- Ensure reconnect path (`allowReconnection` window, if used) hydrates `player.score` from `playerScoreByPlayerId` before client receives state diff.

## Client Updates

### Phaser Scene (`apps/client/src/game/GameScene.ts`)
- Listen for local player's `score` changes via `player.onChange`; debounce to 100 ms to avoid redundant React updates.
- Emit `this.events.emit('score:update', { score, eligible })` using eligibility computed from server state (add new `scoreEligible` boolean to schema or infer with `player.scoreEligible` field if we expose it).
- Reset local snapshot when `room.state.phase !== 'in_game'`.
- On reconnect, request immediate emission of current `player.score` so the HUD shows the persisted total.

### React Bridge (`apps/client/src/app/initPhaser.ts` & `page.tsx`)
- Subscribe to `score:update` and store in React state (`currentScore`, `scoreEligible`, `scoreVisible`).
- Clear state when phase switches away from `in_game` or when Phaser is torn down.

### HUD Components
- Add optional props `score?: number` and `scoreEligible?: boolean` to `GameHUD` and `MobileGameHUD`.
- Render in top nav (desktop) and compact header (mobile):
  - Label `Score` followed by value formatted with `Intl.NumberFormat('en-US')` to insert thousand separators.
  - Use existing pixel font (e.g., `fontFamily: 'PressStart2P'`) and align with other HUD metrics.
  - Hide when `score` undefined or room not in run.
  - If future UX desires, dim value when `scoreEligible` is false (optional note for V2).
- Ensure no floating `+N` popups are created; rely solely on HUD value.

## Telemetry & Analytics
- Augment `enemy_kill` logging (`recordEnemyKill`) to include `score_awarded` per killer and cumulative `score_total` when available.
- When persisting a successful run, log a `run_completed` telemetry event with `score`, `difficulty_tier`, `duration_ms`, `kills`, and `party_size` (ties into existing analytics pipeline if present).
- Store per-run metadata JSON in `run_scores.metadata` for future leaderboard variants (e.g., `seed`, `treasureRoomPortalType`).

## Testing Strategy
- **Unit tests (server)**: new suite covering `queueScoreDelta` batching, death eligibility toggling, and treasure-room persistence rules (mock Map-based tracker).
- **Integration test**: simulate small room, spawn enemy, award XP, ensure score increments and submits to `run_scores` only after treasure flag is set.
- **Client smoke test**: verify HUD renders formatted score and hides outside runs (React component test or Playwright stub).
- Regression: ensure existing XP progression tests still pass.

## Rollout Plan
- Ship DB migration first; deploy server with feature flag defaulting to disabled if staged rollout desired.
- Once server verified, enable `SCORE_ENABLED=1` in staging, verify telemetry and run history writes, then roll to production.
- Coordinate client release after server is live; HUD safely renders nothing if score field missing (feature-flag guard on client state as fallback).

## Open Items / Follow-ups
- Confirm DoT/environmental kill attribution path; ensure we can detect non-player sources before final implementation (may require tagging in `EnemyDeathSystem`).
- Decide whether invalid runs (death before treasure) should still create `run_scores` rows marked `valid_for_high_score=false` for analytics.
- Evaluate whether to surface high score on HUD or post-run summary (out of scope for initial delivery).
- Consider long-term leaderboard API backed by `run_scores` table.
