# Remove duplicate HUD timers: introduce `useInterval`/`useNow` and consolidate

## Goals

- Replace duplicated `setInterval` effects in `GameHUD.tsx` and `MobileGameHUD.tsx` with a single source of time truth.
- Add small, reusable hooks: `useInterval` and `useNow` for safe, composable timer behavior.
- Standardize client interval usage to `window.setInterval`/`window.clearInterval` with stable callback refs.
- Reduce effect churn and re-render frequency while preserving UX precision (200ms during countdowns, 1s elsewhere).

## Scope

- Client only. Server timers (game loop, snapshots, perf, lobby refresh) are out of scope.
- Immediate targets:
  - `apps/client/src/components/GameHUD.tsx`
  - `apps/client/src/components/MobileGameHUD.tsx`
- Secondary targets (standardize later, optional for this pass):
  - `apps/client/src/hooks/useCurrentPlayerHp.ts`
  - `apps/client/src/hooks/useInventory.ts`
  - `apps/client/src/app/page.tsx` (portal guardian label)
  - `apps/client/src/app/initPhaser.ts` (ping loop stays, but ensure cleanup and typing)

## New utilities

Create two hooks in `apps/client/src/hooks/`:

1. `useInterval.ts`

- Safely runs a callback on an interval, handles enable/disable and cleanup.
- Uses a ref to avoid dependency churn and stale closures.
- API: `useInterval(callback: () => void, delayMs: number | null, enabled = true)`

2. `useNow.ts`

- Returns a `now` timestamp that updates on a fixed cadence.
- Built on top of `useInterval`.
- API: `useNow(delayMs: number | null, enabled = true): number`

## HUD consolidation plan

### Before (current patterns)

- Multiple `useEffect + setInterval` blocks per component for:
  - next timed spawn countdown (1s)
  - room countdown remaining ms (200ms)
  - staging auto-close remaining ms (1s)
  - enemy intensity countdown (1s)
  - PWA status polling (5s)
- Duplicated between `GameHUD.tsx` and `MobileGameHUD.tsx`.

### After (target patterns)

- Single `now` tick per HUD:
  - `const fast = roomPhase === 'countdown';`
  - `const tickMs = fast ? 200 : 1000;`
  - `const now = useNow(tickMs, true);`
- Derive all displays from props and `now` without additional intervals:
  - `countdown = format(nextTimedSpawnAt - now)` -> 'PAUSED' when not scheduled
  - `countdownRemainingMs = Math.max(0, countdownEndsAt - now)` when in `countdown`
  - `autoCloseRemainingMs = Math.max(0, autoCloseAt - now)` when in `staging`
  - `intensityCountdown = format(enemyDifficultyNextAt - now)` or 'PAUSED'/'--:--'/'READY'
- PWA status:
  - Prefer event-driven updates (`beforeinstallprompt`, `appinstalled`, `visibilitychange`, `focus`).
  - If polling retained, wrap in `useInterval(() => setPWAStatus(getPWAStatus()), 60_000)` and avoid 5s churn.

### Detailed edits

For both `GameHUD.tsx` and `MobileGameHUD.tsx`:

1. Import the hooks:
   - `import { useNow } from '@/hooks/useNow';` (adjust alias to project standard)
   - If aliasing not configured, use relative import `../../hooks/useNow`.
2. Remove interval effects for:
   - nextTimedSpawn countdown (1s)
   - countdownEndsAt remaining (200ms)
   - autoCloseAt remaining (1s)
   - enemyDifficultyNextAt countdown (1s)
3. Add a single `now` tick:
   - `const tickMs = roomPhase === 'countdown' ? 200 : 1000;`
   - `const now = useNow(tickMs, true);`
4. Replace state-updating interval effects with derived values:
   - Memoize derived strings where needed using `useMemo` with dependencies `[now, <relevant props>]`.
   - Example derivations:
     - Next timed spawn text:
       - guards: zero or missing timestamp -> 'PAUSED'
       - otherwise `formatSeconds(Math.max(0, Math.floor((nextTimedSpawnAt - now)/1000)))`
     - Room countdown:
       - only when `roomPhase === 'countdown'`
       - `countdownRemainingMs = Math.max(0, countdownEndsAt - now)`
     - Staging auto-close:
       - only when `roomPhase === 'staging'`
       - `autoCloseRemainingMs = Math.max(0, autoCloseAt - now)`
     - Enemy intensity:
       - pause guard: `!enemyDifficultyEnabled` -> 'PAUSED'
       - missing/zero timestamp -> '--:--'
       - negative remaining -> 'READY'
       - otherwise `mm:ss` from `(enemyDifficultyNextAt - now)`
5. Keep `useCurrentPlayerHp` as-is for this pass. Optionally switch to consuming `now` later.
6. PWA status:
   - Prefer event-driven, otherwise use a single `useInterval` with a slower cadence (e.g., 60s) and ensure cleanup.

### Edge cases & behavior invariants

- Do not update related state every tick if it can be derived from `now`; prefer local memo/compute to reduce React state updates.
- Preserve existing formatting for timers ('PAUSED', '--:--', 'READY') and the 200ms precision during countdown phase.
- Ensure transitions between phases adjust `tickMs` seamlessly; `useNow` should re-arm interval on cadence change.
- Avoid creating a feedback loop: `now` is the only ticking state; derived values must not schedule additional timers.

## Secondary refactors (optional follow-up)

- `useCurrentPlayerHp.ts`:
  - Either keep as is (fast polling by interval), or switch to consuming a shared `now` from a context if we add a `TickerProvider`.
- `useInventory.ts` (60s refresh): leave as is; interval is coarse and independent.
- `app/page.tsx` portal label (500ms): consider replacing with `useNow(1000)` rounding logic or keep 500ms if UX demands.
- `initPhaser.ts` ping: keep independent `setInterval`; ensure `clearInterval` on disconnect (already present).

## File-by-file checklist

- `apps/client/src/hooks/useInterval.ts`
  - Implement hook with ref-callback and cleanup.

- `apps/client/src/hooks/useNow.ts`
  - Implement on top of `useInterval`.

- `apps/client/src/components/GameHUD.tsx`
  - Remove four interval `useEffect`s.
  - Add `useNow`; compute derived countdowns.
  - Adjust imports and remove unused vars.

- `apps/client/src/components/MobileGameHUD.tsx`
  - Mirror the `GameHUD` changes.

- `apps/client/src/app/page.tsx` (optional)
  - Consider `useNow(1000)` and derive seconds via `Math.ceil((ts - now)/1000)`. Keep 500ms if required.

## Testing strategy

- Unit-ish (component-level):
  - Render HUD with fixed timestamps; advance fake timers; verify countdown text transitions and boundary conditions ('READY', '--:--', 'PAUSED').
  - Verify 200ms cadence during `roomPhase==='countdown'` and 1s otherwise.
- Integration/manual:
  - Join a room and observe HUD updates during phase transitions (staging -> countdown -> in_game).
  - Validate intensity countdown styling and transitions.
  - Confirm no lingering intervals via React Profiler/console noise when HUD unmounts.
- Performance:
  - Use React Profiler to compare commit frequency before vs after.
  - Ensure re-renders drop from multiple interval-driven effects to one tick.

## Rollout

- Implement hooks.
- Refactor `GameHUD.tsx` and `MobileGameHUD.tsx` in one PR.
- Optional follow-up PRs for secondary refactors.

## Acceptance criteria

- Only one active interval per HUD component in steady state.
- Countdown, auto-close, and intensity display behavior matches current UX across phases.
- No memory leaks; all intervals are cleaned up on unmount.
- ESLint/TypeScript clean, no new warnings.
