## Timed Enemy Spawns (every 15s)

### Goal

- **Objective**: Introduce a server-side timer that periodically spawns new enemies into each active room.
- **Baseline**: Spawn enemies every 15 seconds using the existing server spawning system so clients automatically render via `state.enemies.onAdd`.

### Open questions

- **Spawn frequency**: Fixed at 15s per room, or should it vary by difficulty tier?

Same on each tier.

- **Batch size**: Spawn 1 enemy per tick, or a small batch (e.g., 2–4) that scales with player count/difficulty?

Spawn 20 enemies per batch.

- **Population cap**: What is the max concurrent enemies per room to prevent unchecked growth? (e.g., 60/80/100?)

I'm not sure, let's start it at 200.

- **Player presence**: Should timed spawns pause when there are no players in the room?

Yes.

- **During transitions**: Pause or continue during `transitionAllPlayersToNewMap`/Treasure Room transitions?

All of the extra enemies should be removed, only the initial spawn enemies should remain when transitioning.

- **Enemy selection**: Use `getRandomEnemyType()` unfiltered, or restrict/weight per difficulty and blacklist bosses (e.g., never spawn `portal_guardian` via timer)?

Yes, never spawn the PG. Just spawn random enemy types.

- **Spawn bias**: Purely random safe locations, or biased near players at safe distance?

Purely random safe locations.

- **Difficulty scaling**: Keep 15s fixed or scale interval/batch size up across higher tiers?

Same per tier.

- **Debug controls**: Do you want an env flag or admin message to toggle/adjust spawn interval live?

No need.

- **Telemetry**: Log spawns and caps for quick ops debugging, or keep logs minimal?

Minimal logs for now.

### Proposed design (server-only)

- **Where**: `apps/server/src/rooms/GameRoom.ts`
  - Add a dedicated timed-spawn interval started in `onCreate()` and cleared in `onDispose()`.
  - Keep logic entirely server-side for anti-cheat; clients already listen for `state.enemies.onAdd`.
- **Spawn logic**: Reuse `spawnEnemyOfType(room, enemyType)` and `getRandomEnemyType()` from `apps/server/src/lib/systems/EnemySpawnSystem.ts`.
- **Timer**: `setInterval` every 15000 ms calls `maybeTimedSpawn()`.
- **Guards**:
  - Optionally require `room.state.players.size > 0`.
  - Respect a `maxEnemiesPerRoom` cap to prevent runaway growth.
  - Optionally pause during world transitions if desired.
- **Batching**: Spawn `batchCount` enemies per tick (default 1). Optional scaling by player count or difficulty.
- **Lifecycle**: Ensure the interval is cleared on `onDispose()` and not duplicated across restarts.

### Suggested configuration

Define a single source of truth for timed spawn parameters in `apps/server/src/lib/constants.ts`:

```ts
export const TIMED_SPAWN = {
  intervalMs: 15000, // 15 seconds
  batchCount: 1, // enemies per timed tick
  maxEnemies: 80, // population cap per room
  requireActivePlayers: true, // pause when no players present
  pauseDuringTransition: true, // optional if we add a transition flag
};
```

These settings can later be extended or varied by difficulty tier if desired.

### Implementation steps

1. **Config**: Add `TIMED_SPAWN` to `apps/server/src/lib/constants.ts`.
2. **Room fields**: In `GameRoom`, add `timedSpawnInterval: NodeJS.Timeout | null = null`.
3. **Startup**: In `onCreate()`, after `setupGameLoop()`, start the timed interval: `this.timedSpawnInterval = setInterval(() => this.maybeTimedSpawn(), TIMED_SPAWN.intervalMs);`.
4. **Logic**: Implement `private maybeTimedSpawn()`:
   - If `TIMED_SPAWN.requireActivePlayers` and `this.state.players.size === 0`, return.
   - If `this.state.enemies.size >= TIMED_SPAWN.maxEnemies`, return.
   - Determine `spawnCount` (default `TIMED_SPAWN.batchCount`; optionally scale by players/difficulty if we choose).
   - Loop `spawnCount` times: call `spawnEnemyOfType(this, getRandomEnemyType())`.
5. **Cleanup**: In `onDispose()`, `clearInterval(this.timedSpawnInterval)` if set.
6. **(Optional) Transition hook**: If we want to pause during transitions, either:
   - Track a `this.isTransitioning` flag and early-return in `maybeTimedSpawn()`, or
   - Temporarily clear/restart the interval around `transitionAllPlayersToNewMap`.
7. **Logging**: Minimal logs on spawn and when cap prevents spawning.

### Interactions and edge cases

- **Enemy-death spawns**: Existing on-death logic already queues a replacement spawn. Timed-spawns should work orthogonally; the cap prevents explosive growth.
- **Portal Guardian**: Keep PG spawning tied to kill-based chance only; do not include PG in timed-spawns.
- **Transitions**: If `pauseDuringTransition` is true, pause until the new map is ready to avoid spawning into an invalid state.
- **Performance**: Batching and caps guard against sudden sprite explosions; can tune per environment.

### Testing & validation

- Join a room, observe spawn logs roughly every 15s.
- Verify new enemies appear client-side via `state.enemies.onAdd` with no client changes needed.
- Confirm cap enforcement and pause behavior with zero players.
- Transition to a new map and verify the timer behavior matches the chosen policy.

### Rollout

- Start with conservative `batchCount` and a safe `maxEnemies`.
- Monitor server logs and client FPS, then adjust configuration as needed.

### HUD: enemy count and next-spawn countdown

- **Requirements**:
  - Show current enemy population on the map (live value).
  - Show a small countdown indicating time remaining until the next timed spawn occurs.

- **Server support**:
  - Add `nextTimedSpawnAt: number` (Unix ms) to `GameRoomState`.
  - Set `nextTimedSpawnAt = Date.now() + TIMED_SPAWN.intervalMs` when the interval is scheduled; update it immediately after each spawn to reflect the next cycle.
  - When paused (no players, transition, or cap reached), set `nextTimedSpawnAt = 0` (or keep previous but do not advance) so clients can hide or display a paused indicator.
  - During map transitions, clear extra enemies and reset `nextTimedSpawnAt` after the initial spawn wave for the new map.

- **Client HUD (Phaser overlay)**:
  - Enemy count: derive from `room.state.enemies.size` and/or maintain a reactive counter via `state.enemies.onAdd`/`onRemove`. Render a compact text label (e.g., top-right) updated when the collection changes.
  - Next spawn countdown: subscribe to `room.state` for `nextTimedSpawnAt`. Use a 1 Hz timer in the scene to compute `remainingMs = Math.max(0, nextTimedSpawnAt - Date.now())` and render as `mm:ss`. Hide or show "Paused"/"—" when `nextTimedSpawnAt` is `0` or the room is empty.
  - Keep logs minimal and avoid per-frame text updates; update once per second for the countdown and only on collection change for the enemy count.

- **Edge cases**:
  - If the enemy cap is reached, keep the countdown visible but annotate (e.g., "Cap reached") or set `nextTimedSpawnAt = 0` to indicate pausing until population drops.
  - During transitions, temporarily hide the countdown; it will resume once the new map schedules the next spawn.
