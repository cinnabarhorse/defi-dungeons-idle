## Performance Review – 2025-10-19

### Executive summary

- **Server-side priorities**: tighten per-client interest filtering, batch timers under the main tick, decimate non-critical subsystems (regen/vacuum/AI), route/batch broadcasts.
- **Client-side priorities**: reduce input send rate and per-frame allocations, throttle non-critical updates, pool sprites, virtualize heavy React lists and dynamically import large panels.
- **Database/persistence**: debounce/batch inventory/equipment writes, use prepared statements, and ensure covering indexes.

### Highest-impact recommendations (top 10)

1. **Make interest filtering per-client (smaller patches, lower WS bandwidth)**
   - Today, schema `@filter` uses shared sets like `_visibleEnemyIds`, which can over-include entities for some clients. Replace with a `Map<sessionId, Set<id>>` and use `client.sessionId` in the predicate. Populate per-client sets during `updateFogOfWar()`.
   - Hotspot:

```151:166:apps/server/src/schemas/index.ts
  @filter(function (
    this: GameRoomState,
    client: any,
    key: string,
    enemy: EnemySchema
  ) {
    if (!enemy) return false;
    if (!this._fogActiveForClients) return true;
    const set = this._visibleEnemyIds;
    if (set && enemy.id) {
      return set.has(enemy.id);
    }
    return true;
  })
  @type({ map: EnemySchema })
  enemies = new MapSchema<EnemySchema>();
```

- Change `_visibleEnemyIds`/`_visibleNpcIds`/`_visibleProjectileIds` to `visibleEnemyIdsByClient`, etc., and look up by `client.sessionId`.

2. **Lower input send rate and reuse payload object (less GC, less bandwidth)**
   - Bump `inputSendIntervalMs` to 33–50 ms (30–20 Hz). Keep `inputKeepaliveMs` ~150–200 ms. Server already consumes latest input per tick.
   - Avoid `this.inputPayload = { ...this.mobileInputPayload }` each frame; copy fields instead.
   - Hotspot:

```4367:4401:apps/client/src/game/GameScene.ts
      // Throttle/coalesce input sends
      const now =
        (this.time && typeof this.time.now === 'number'
          ? this.time.now
          : time) | 0;
      const elapsedSinceLast = now - this.lastInputSentAt;

      // Compute a cheap, stable signature for payload values
      const sig = `${this.inputPayload.left ? 1 : 0}|${this.inputPayload.right ? 1 : 0}|${
        this.inputPayload.up ? 1 : 0
      }|${this.inputPayload.down ? 1 : 0}|${this.inputPayload.sprint ? 1 : 0}`;

      const unchanged = sig === this.lastInputSignature;
      const dueInterval = elapsedSinceLast >= this.inputSendIntervalMs;
      const dueKeepalive = elapsedSinceLast >= this.inputKeepaliveMs;
      const isActive =
        !!this.inputPayload.left ||
        !!this.inputPayload.right ||
        !!this.inputPayload.up ||
        !!this.inputPayload.down ||
        !!this.inputPayload.sprint;

      if (
        (dueInterval && (this.inputDirty || !unchanged || isActive)) ||
        dueKeepalive
      ) {
        try {
          this.room.send(0, this.inputPayload);
          this.lastInputSentAt = now;
          this.lastInputSignature = sig;
          this.inputDirty = false;
        } catch (e) {
          // Swallow transient send errors in update loop
        }
      }
```

3. **Batch timers under the main tick (reduce Node timers and GC churn)**
   - Replace scattered `setTimeout`/`setInterval` for abilities, explosions, respawns with a per-room min-heap (timer wheel) and service it in `gameTick()`.
   - Hotspot for tick setup:

```1643:1656:apps/server/src/rooms/GameRoom.ts
  private setupGameLoop() {
    // Game simulation tick at 30Hz
    this.tickInterval = setInterval(() => {
      const startHr = process.hrtime.bigint();
      this.gameTick();
      const endHr = process.hrtime.bigint();
      const elapsedMs = Number(endHr - startHr) / 1_000_000; // ns → ms
      this.recordTickSample(elapsedMs);
    }, 1000 / GAME_CONFIG.SERVER_TICK_HZ);

    // Snapshot broadcast at 15Hz
    this.snapshotInterval = setInterval(() => {
      this.broadcastSnapshot();
    }, 1000 / GAME_CONFIG.SNAPSHOT_HZ);
```

4. **Decimate non-critical subsystems and stagger work (smoother frame budget)**
   - Run `updatePlayerRegen` ~5–10 Hz, `updateVacuumSystem` ~10–15 Hz, and enemy AI ~10–15 Hz with per-entity staggering. Keep projectile updates at full rate only for active/nearby items.
   - Hotspot:

```2465:2515:apps/server/src/rooms/GameRoom.ts
    // Apply cached player inputs per tick and handle bot respawning
    for (const [playerId, player] of this.state.players) {
      ...
    }

    // Update all active actions
    this.actionManager.updateActions(this);

    // Update bot AI movement
    this.updateBotMovement(now);

    // Update enemy AI movement
    {
      updateEnemyMovement(this as any, now);
    }

    // Update projectiles
    {
      updateProjectiles(this as any, now);
    }

    // Update vacuum system for all players
    {
      updateVacuumSystem(this as any, now);
    }

    // Apply player HP regen from abilities/wearables
    {
      updatePlayerRegen(this as any, now);
    }

    // Update fog-of-war after processing movement and interactions
    this.updateFogOfWar();
```

5. **Spatial partitioning for AI/projectiles (update only near players)**
   - Maintain grid- or chunk-based indexes. For each tick, union tiles around players to select candidate enemies/projectiles; skip the rest.

6. **Route/batch broadcasts (cut message fanout and scheduler overhead)**
   - Replace room-wide broadcasts for ephemeral events (evades, damage ticks, perf logs) with audience-limited sends (targets and nearby observers). Optionally batch per-tick into `tick_events` arrays.

7. **Snapshot strategy: dynamic cadence by entity class**
   - Keep 10–15 Hz baseline but send low-importance entities less frequently. Combine with per-client interest filtering and ensure permessage-deflate is enabled.

8. **DB writes: debounce/batch equipment/inventory updates**
   - Coalesce in-memory for 250–500 ms and persist in a single transaction. Use prepared statements for hot queries and add covering indexes (e.g., `player_inventories(player_id, item_type, item_name)`).
   - Impact areas: `apps/server/src/lib/db/repos/inventory.ts`, `.../equipment.ts`, `.../players.ts`, and `apps/server/src/lib/equipment-service.ts` snapshot updates.

9. **Client: throttle secondary updates and avoid runtime asset measurement**
   - Keep `minimapUpdateThrottleMs`/`floorVisibilityThrottleMs` ≥100 ms (consider 150–200 ms on low-end). Precompute frame dimensions offline and ship JSON; avoid `new Image()` measuring in preload.
   - Hotspots:

```4504:4521:apps/client/src/game/GameScene.ts
      if (
        this.environmentSystem &&
        this.cameras &&
        this.cameras.main &&
        time >= this.nextFloorVisibilityUpdateAt
      ) {
        this.environmentSystem.updateVisibleFloors(this.cameras.main);
        this.nextFloorVisibilityUpdateAt =
          time + this.floorVisibilityThrottleMs;
      }
      ...
      if (this.minimapCamera && time >= this.nextMinimapUpdateAt) {
        this.updateMinimapPlayerMarker();
        this.nextMinimapUpdateAt = time + this.minimapUpdateThrottleMs;
      }
```

```1206:1264:apps/client/src/game/GameScene.ts
      // Pre-measure animated strips to compute frame dimensions, then load as spritesheets
      if (animatedSpecs.length > 0) {
        const measurements = await Promise.all(
          animatedSpecs.map(
            (spec) =>
              new Promise<{
                key: string;
                url: string;
                frameWidth: number;
                frameHeight: number;
              }>((resolve) => {
                const img = new Image();
                img.onload = () => {
                  const totalW = img.naturalWidth || (img as any).width || 0;
                  const totalH = img.naturalHeight || (img as any).height || 0;
                  const horizontal = totalW >= totalH;
                  const frameWidth = horizontal
                    ? Math.max(1, Math.floor(totalW / spec.frameCount))
                    : totalW;
                  const frameHeight = horizontal
                    ? totalH
                    : Math.max(1, Math.floor(totalH / spec.frameCount));
                  resolve({
                    key: spec.key,
                    url: spec.url,
                    frameWidth,
                    frameHeight,
                  });
                };
                img.onerror = () => {
                  // Fallback: load as image if we can't measure
                  staticSpecs.push({ key: spec.key, url: spec.url });
                  resolve({
                    key: spec.key,
                    url: spec.url,
                    frameWidth: 0,
                    frameHeight: 0,
                  });
                };
                img.src = spec.url;
              })
          )
        );
```

10. **React UI: split, memoize, virtualize, and lazy-load heavy panels**

- `apps/client/src/app/me/inventory/inventory-client.tsx` (~2.4k lines) and `apps/client/src/components/GameHUD.tsx` (~949 lines) are re-render hotspots.
- Actions:
  - Split into smaller memoized components; use `useMemo`/`useCallback` and selector hooks that derive minimal state.
  - Virtualize large lists (wearables, loot) and ensure stable keys.
  - Use `next/dynamic` to defer non-critical panels; wrap in `Suspense`.
  - Move giant static data like `apps/client/src/data/wearables.ts` out of the client bundle (serve via RSC/JSON on demand).

### Networking and tick cadence

- **Inputs**: 20–30 Hz is sufficient (server applies latest per tick). Keep keepalive ~150–200 ms.
- **Snapshots**: 10–15 Hz is fine; rely on per-client filtering and audience routing to shrink payloads.
- **Broadcasts**: Prefer audience-limited sends; batch ephemeral events per tick.

### AI, pathfinding, and timers

- **Spatial partitioning**: Use grid/chunk indexes; only update entities near players.
- **Staggering**: Add lightweight per-entity phase offset to distribute cost across ticks.
- **Unified scheduler**: Replace scattered timers with a per-room queue executed in `gameTick()`.

### Database & persistence

- **Debounce/batch**: Accumulate equipment/inventory mutations and commit via batched transactions.
- **Prepared statements**: Use named prepared statements for hot queries in inventory/equipment/players repos.
- **Indexes**: Ensure composite indexes for frequent filters (e.g., `(player_id, item_type, item_name)`).
- **Derived JSON**: Avoid repeated stringify in hot paths; compute once and persist via a queue.

### Quick, low-risk configuration knobs

- Client: `inputSendIntervalMs` → 33–50 ms; `inputKeepaliveMs` → 150–200 ms.
- Server: decimate `regen`/`vacuum` to 10 Hz; enemy AI to 10–15 Hz with staggering; keep snapshots 15 Hz.
- Verify permessage-deflate on WebSocket server.

### Suggested implementation plan (small PRs)

- PR1: Per-client interest filtering in `@filter` predicates and fog-of-war.
- PR2: Input throttling + input object reuse; throttle secondary client updates.
- PR3: Per-room scheduler and tick decimation for `regen`/`vacuum`/AI.
- PR4: UI virtualization and dynamic imports for inventory/HUD.

### Evidence snippets (additional)

- Client floor/minimap throttles and runtime asset measuring shown above.
- Server tick setup and `gameTick()` responsibilities shown above.
- Schema-level filtering uses shared sets; convert to per-client.

### Expected impact

- **Bandwidth**: 20–50% reduction from per-client filters and input throttling.
- **Server CPU**: 20–40% lower average tick time from decimation, batching, and partitioning.
- **Client FPS**: Fewer GC spikes and steadier frame times from pooling, throttling, and UI virtualization.

