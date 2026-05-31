## Gotchiverse Live — Code Review (12/10/2025)

This checklist focuses on performance (game loop, rendering, React, networking), code cleanliness, and refactoring opportunities. Items are ordered by expected impact vs. effort.

### High‑impact performance

- [ ] Throttle/quantize input network sends. In `GameScene.update`, inputs are sent every frame. Send only on change or at ~15–20 Hz, and coalesce keys into a bitmask to reduce payloads.
- [ ] Gate debug logging behind a compile‑time flag and strip in production. Replace `console.log` with a minimal logger (no‑op in prod) across client/server.
- [ ] Normalize polling intervals in HUD/components. Consolidate multiple `setInterval` usages into a single scheduler/ticker or react-query style staleTimes. Prefer requestAnimationFrame for UI animations.
- [ ] Remove global debug helpers in production. Guard `window.spawnPortalsHere`/`spawnRektDoggos` with `process.env.NEXT_PUBLIC_DEBUG === '1'` and ensure they’re undefined in prod builds.
- [ ] Decompose `apps/client/src/app/page.tsx` into client leaf components; keep most logic in an RSC wrapper. This reduces hydration and re-renders.

### Client rendering (Phaser/React)

- [ ] Avoid per-frame expensive canvas strokes. Aura/border `setStrokeStyle` should be applied only on state change; cache computed aura colors and reuse graphics.
- [ ] Minimap/UI throttles: verify 100ms throttles are respected and not recomputed earlier; prefer schedule via `time.now` checks—not `setInterval`.
- [ ] Ensure all scene resources are disposed. On disconnect, call scene destroy hooks and clear entity maps. Verify `clearAllEntities()` is always reached on room leave.
- [ ] Add production guard for DOM event listeners added from Phaser (hover/click helpers) to avoid unnecessary listeners during gameplay.

### React/Next.js hygiene

- [ ] Reduce surface of `'use client'`. Make pages/layouts server components; wrap only UI controls (HUD, Joystick, Wallet connect) as client components and use Suspense fallbacks.
- [ ] Extract large effect blocks into custom hooks with stable deps; add memoization and selectors to avoid re-renders in `GameHUD`/`MobileGameHUD`.
- [ ] Standardize event listeners with a `useEventListener` hook that handles add/remove and options (e.g., `{ passive: true }`).
- [ ] Use `nuqs` consistently for shareable UI state (tabs/filters) and remove ad‑hoc state duplication.

### Networking & server tick

- [ ] Confirm server tick uses a fixed timestep and accounts for drift. If using `setInterval`, prefer a loop that catches up using `now` and processes multiple fixed ticks as needed.
- [ ] Snapshot broadcasting: ensure snapshot interval frequency is tuned; coalesce broadcasts when no state change occurred (dirty flags).

### Types & code cleanliness

- [ ] Replace pervasive `any` with typed interfaces. Start with hot paths: `initPhaser`, `GameScene`, helpers rendering functions, and server room handlers.
- [ ] Introduce discriminated unions for entity kinds and actions (e.g., `kind: 'portal' | 'collectible' | ...`). Remove stringly‑typed checks.
- [ ] Create shared, app‑local type modules (no workspaces) per the project rule; adopt them across client/server instead of inline `any` casts.
- [ ] Centralize action payload types; ensure `attack_enemy` and others share a single source of truth.

### Assets & build

- [ ] Convert large spritesheets (e.g., floors) to WebP/optimized atlases and enable long‑term immutable caching. Verify texture compression and mipmap settings.
- [ ] Lazy‑load non‑critical UI (Shop/Inventory/detail panes) via dynamic import with Suspense.

### Tooling & DX

- [ ] Add an ESLint rule budget for `any` usage (warn over threshold) and forbid `console.*` in production code.
- [ ] Consider bundle analyzer for client to ensure Phaser submodules and assets are tree‑shaken; verify `import type Phaser` patterns are used where possible.

### Quick wins

- [ ] Add `{ passive: true }` to mouse/touch listeners where appropriate.
- [ ] Hoist stable callbacks/constants out of components to reduce effect churn.
- [ ] Replace duplicate timers in HUD with a single `useInterval` utility.

---

### Pinned references

Game loop sends input every frame — throttle and send on change:

```3981:4000:apps/client/src/game/GameScene.ts
update(time: number, delta: number): void {
  // Skip loop if not connected with room yet
  if (!this.room) {
    return;
  }

  // ... build inputPayload ...
  this.room.send(0, this.inputPayload);
}
```

Server tick processes gameplay per tick — ensure fixed timestep and drift handling:

```2338:2387:apps/server/src/rooms/GameRoom.ts
private gameTick() {
  const now = Date.now();
  this.state.lastTick = now;
  this.updateEnemyDifficultyMeter(now);
  // ... players, actions, AI, projectiles, vacuum, regen ...
  this.updateFogOfWar();
}
```

Multiple UI intervals — consolidate into a single scheduler:

```284:337:apps/client/src/components/GameHUD.tsx
useEffect(() => {
  const id = setInterval(update, 1000);
  return () => clearInterval(id);
});
// ... other setInterval(...) blocks in same component
```

Global debug helpers — guard for prod:

```3872:3897:apps/client/src/app/initPhaser.ts
if (typeof window !== 'undefined') {
  (window as any).spawnPortalsHere = () => { /* ... */ };
  (window as any).spawnRektDoggos = (count: number = 3) => { /* ... */ };
}
```
