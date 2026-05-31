### Staging Refactor Plan

#### Objectives

- Reduce `apps/server/src/rooms/GameRoom.ts` complexity by extracting cohesive staging-room logic.
- Keep a single authoritative Colyseus room (`GameRoom`). Use composition, not a second Room class.
- Preserve behavior: phases, countdown, late-join, auto-close refunds, staging layout + NPCs.

#### Approach

- Create a small, stateless helper module with pure functions that operate on the `GameRoom` instance passed in.
- Timers and server state remain in `GameRoom` to avoid cross-room orchestration.
- Narrow API: functions receive `room` and simple params (no circular imports).

#### Module

- File: `apps/server/src/rooms/StagingRoom.ts`
- Style: TypeScript functions, no classes; minimal types to avoid circular deps.
- Exports (incremental):
  - `initializeStagingEnvironment(room: any, countdownMs: number): void`
  - `spawnStagingNpcs(room: any, centerX: number, centerY: number): void`
  - (Next steps) `handlePortal(room, client, data)`, `startCountdown(room, client)`, `beginRun(room, starterSessionId)`, `scheduleAutoClose(room, deadlineMs)`, `clearAutoClose(room)`; refund helpers.

#### Milestones

- [x] Author this plan document
- [x] Step 1: Extract init + NPC functions to `StagingRoom.ts` and delegate from `GameRoom`
- [x] Lint modified files and fix issues
- [x] Update this plan with checkmarks for completed steps
- [x] Step 2: Extract portal handlers (`handleStagingPortalInteraction`, `startStagingCountdown`, `beginDungeonRun`)
- [x] Step 3: Extract timers and refund helpers (pure logic in module; timers/state in `GameRoom`)
- [x] Cleanup: centralize constant passing, remove dead code, update docs

#### Scope of Step 1

- Move logic from `GameRoom.initializeStagingEnvironment` and `GameRoom.spawnStagingNpcs` into module functions.
- Replace bodies of those methods with thin delegates to the module.

#### Risks / Pitfalls

- Circular deps if importing `GameRoom` into module. Avoid by typing `room: any` or a small interface.
- Hidden private field access. Keep state on `GameRoom`; read/write through `room` in module.
- Asset paths/types. Reuse existing imports (`EntitySchema`, `NPCSchema`, `EntityKind`, `CHUNKS`).

#### Testing Checklist

- Staging room renders with chunk-provided portal location when present; fallback works.
- NPC trio spawns at correct offsets; stats set via `getCharacterStats`.
- Portal entity includes countdown metadata and optional sprite fields.
- Spawn points used on join.

#### Rollback Plan

- Delegates are thin; revert import and restore original method bodies if needed.
