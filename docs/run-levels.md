## Run Levels (Per-Run, Ephemeral Progression)

> **Deprecated:** The run-level mechanic has been replaced by the kill streak system. See `docs/kill-streak.md` for the current design and implementation details.

### Goal

- **Add a new, per-run level system** that resets at the end of each run, alongside the existing meta level. On each run-level up, the player’s archetype-specific "levelTrait" is increased for the remainder of that run only.

### Non-Goals

- Do not alter or remove the existing meta-level system, meta XP, or stat allocation flows.
- Do not persist run levels beyond the lifetime of a run (ephemeral by design).

---

## Definitions

- **Meta Level**: Account progression stored in player profile (DB-backed). Survives across sessions. Awards unspent points, unlocks, etc.
- **Run Level**: Session progression. Starts at 1 every run, grants archetype-specific incremental power on level-up, and resets when the run ends or the player leaves.
- **Archetype Level Trait**: A compact rule per archetype that applies an incremental modifier on each run-level up (e.g., "+1% base damage per level"). Some archetypes TBD are fine; system must support gaps.

---

## High-Level Design

1. Server owns all run-level computation and modifiers (authoritative). Client is read-only for display and celebration.
2. Run XP is earned from the same events that award meta XP (enemy kills, bosses, etc.), but with an independent curve and level thresholds.
3. On run-level up, compute the new cumulative per-run modifier from the player’s chosen archetype, then apply to derived stats via existing server stat sync.
4. At run end (victory/leave/death), clear run-level state and do not persist it to the player’s profile. Optionally log to telemetry.

---

## Data Model (Server Runtime)

- `RunProfile` (in-memory, per sessionId):
  - `level: number` (default 1)
  - `totalXp: number` (default 0)
  - `xpIntoLevel: number`
  - `xpForNextLevel: number`
  - `archetypeId: string` (chosen on start; source of levelTrait)
  - `modifiers: RunLevelModifiers` (derived from level and archetype)
  - `createdAt`, `updatedAt`: timestamps for telemetry

- `RunLevelModifiers` (composed into stat sync):
  - Use existing progression modifier fields when possible:
    - `damageMultiplier: number`
    - `attackSpeedScalar: number` (lower is faster; clamped server-side)
    - `maxHealthMultiplier: number`
    - `maxHealthFlatBonus: number`
  - Extend with additional fields as needed for levelTrait coverage:
    - `movementSpeedMultiplier?: number`
    - `armorBonus?: number`
    - `lifeStealPercent?: number`
    - `criticalChanceBonus?: number`
    - `evadeChanceBonus?: number`
    - `hpRegenPerSecondBonus?: number`

Notes:

- We will not introduce workspace packages for shared types (per project rule). Define types in `apps/server/src/lib/progression/runLevels.ts` and mirror light client types where needed.

---

## Math

- Independent run XP curve (small ramp suitable for a single session). Example (tunable):
  - Early levels cheap to promote early trait feels; ramp to a modest cap (e.g., 20–40) per run.
  - Overflow within a level carries over (like meta).

- Mapping levelTraits → modifiers (examples):
  - "+1% base damage per level" → `damageMultiplier = 1 + (0.01 * runLevel)`
  - "+1% attack speed per level" → `attackSpeedScalar = pow(0.99, runLevel)` (server clamps min ms)
  - "+1% movement speed per level" → `movementSpeedMultiplier = 1 + (0.01 * runLevel)`
  - "+1% armor per level" → `armorBonus = runLevel`
  - "+1% hp regen per level" → `hpRegenPerSecondBonus = base * 0.01 * runLevel` (define base)
  - "+1% life steal per level" → `lifeStealPercent = 0.01 * runLevel`
  - "+1 Crit Strike per level" → `criticalChanceBonus = 0.01 * runLevel` (or per-mille if desired)
  - "+1 Evade per level" → `evadeChanceBonus = 0.01 * runLevel`

Clamping & Composition:

- Compose run modifiers with existing meta modifiers multiplicatively/additively per stat semantics.
- Respect existing server clamps (e.g., `attackSpeed >= 150ms`, armor-derived mitigation capped at 80%).

---

## Server Integration

- Initialize on run start (e.g., room transitions into `in_game` or player joins active run):
  - `RunProfile` seeded with level 1, 0 XP, archetype.
  - Cache in `GameRoom` keyed by sessionId.

- Awarding XP (alongside meta XP):
  - Hook into existing enemy defeat distribution flow to compute run XP shares.
  - Apply XP to `RunProfile`, update level, compute `modifiers` from archetype rule.
  - Re-sync player stats by composing meta + run modifiers in `syncPlayerCharacterStats`.
  - Send run progression message to client.

- Networking (server → client):
  - `run_progression:profile` (on join/initial): `{ level, totalXp, xpIntoLevel, xpForNextLevel, archetypeId }`
  - `run_progression:xp_awarded`: `{ amount, totalXp, level, levelUps, xpIntoLevel, xpForNextLevel }`
  - `run_progression:reset`: on run end/leave/death (if reset on death is desired).

- Telemetry (optional, not persistent progression):
  - Record `runLevelAfter` and `runXpGained` into `game_players` row via `metadata` JSON for analytics.

---

## Client Integration

- Add `useRunProgression` hook similar to `useProgression`, subscribing to run messages and exposing `{ level, totalXp, progress }`.
- HUD:
  - Option A: Two stacked thin bars at top: meta XP (existing), run XP below with distinct color.
  - Option B: Single bar with dual markers; or small pill near the level badge showing run level.
  - Display run-level up celebration distinct from meta (different accent color/label).
- Builds page: no required changes for MVP; archetype list is informational. The authoritative mapping lives on server. Optional: show levelTrait for the selected archetype.

---

## Systems Touchpoints (references)

- Enemy XP awarding (also ideal hook for run XP):

```5040:5144:apps/server/src/rooms/GameRoom.ts
private awardXpForEnemyDefeat(
  enemy: any,
  enemyId: string,
  attackType: 'melee' | 'ranged' | 'grenades',
  killerId?: string
): Map<string, number> {
  // ... run XP can be computed in parallel to meta XP here
}
```

- Composing modifiers and syncing derived stats:

```40:75:apps/server/src/lib/player-stats.ts
export function syncPlayerCharacterStats(
  player: PlayerSchema,
  options: SyncPlayerOptions = {}
): CharacterDerivedStats {
  const baseStats = getCharacterStats(player.characterId || 'coderdan');
  // ... apply options.progressionModifiers (extend to include run-level modifiers)
}
```

- Existing HUD XP/Level display (add run bar/pill):

```409:425:apps/client/src/components/GameHUD.tsx
// Global XP bar and level badge (add run-level UI here)
```

---

## Edge Cases

- Multiple level-ups in one tick: accumulate and emit a single celebration event with final level.
- Death within a run: configurable — keep run level or reset (see questions). If reset, send `run_progression:reset` and re-sync.
- Rejoins/latency: server sends authoritative `run_progression:profile` on join/rejoin to rehydrate client state.

---

## Testing Plan

- Unit: run XP curve, level thresholds, trait → modifier mapping, clamping behavior.
- Integration: defeating enemies awards both meta and run XP, level-ups update derived stats, HUD reflects changes.
- Regression: verify meta level unaffected; no persistence of run-level beyond session.

---

## Implementation Steps (MVP)

1. Server: introduce `RunProfile`, archetype → levelTrait mapping, and XP curve helper in `apps/server/src/lib/progression/runLevels.ts`.
2. Server: wire run XP into enemy defeat flow; compute level-ups; compose run modifiers into `syncPlayerCharacterStats`.
3. Server: add run progression messages; initialize/reset lifecycle.
4. Client: add `useRunProgression` and HUD UI elements; celebrate run-level ups.
5. Telemetry: (optional) write run-level end-state into `game_players.metadata`.

---

## Questions for You

Please confirm these so we can lock math/UX and implement without rework:

### Scope & Lifecycle

- Should run level reset on death, or only on leaving/finishing the run?

Death should result in the run ending for that player.

- Do you want a hard cap for run level (suggested 20–40), and what number?

99 is the highest level.

- Should run XP be awarded from the same sources as meta XP (kills, bosses, etc.) and at the same moments? Any extra sources (chests, events)?

Just kills for now.

### Curve & Pace

- Preferred time-to-level targets for run levels (e.g., first 5 levels within X minutes)?

First 10 levels within 5 mins could feel pretty nice.

- Separate run XP curve per difficulty tier/intensity, or one curve with a difficulty multiplier?

I'm not sure. Smething simple for the default right now.

### Trait Semantics

- For archetypes with `levelTrait` like Crit, Evade, HP Regen, Life Steal, Magic Find: are these mechanics already present server-side? If not, which should be added for MVP?

Yes they are.

- For attack speed, confirm semantics: we’ll apply `attackSpeedScalar = pow(1 - p, level)` so lower ms is faster (consistent with your current stat model). OK?

That's right.

- For armor: do you want this to increase percent damage reduction, flat reduction, or both?

% damage reduction.

### UI/UX

- Preferred visualization: separate run XP bar under the meta XP bar, or a compact pill near the level badge?
- Distinct colors/theme for run vs meta? Provide palette preference if any.

Use something defualt that you think makes since. WIll optimize later.

### Telemetry

- Do you want run-level end-state recorded to `game_players.metadata` (for analytics) even though it’s not persistent progression?

### Archetype Source of Truth

- The `@builds/` page lists 16 archetypes. Confirm the server should be the single source of truth for levelTrait effects, independent of client UI lists.

Yes you can create a new data/archetypes.ts file if you'd like. And then include it in the shared generation and import into client/server.

Once these are answered, I’ll finalize the plan and begin implementation.

---

## Finalized Implementation Plan

### Constraints from Answers

- Run ends for the player on death → run level resets because the run terminates.
- Run level cap: 99.
- XP source: kills only (for now).
- Early pacing target: first 10 run levels within ~5 minutes.
- Attack speed semantics: multiplicative scalar; lower ms is faster; clamp to existing min.
- Armor: percent damage reduction (respect global caps).
- UI: ship a sensible default; refine later.
- Source of truth: create shared `data/archetypes.ts` and feed both client/server via shared generation script.

### 1) Shared Data & Types

- Create `data/archetypes.ts`:
  - Export `ARHETYPES` with `id`, `name`, and `levelTrait` descriptor (e.g., `type: 'damage_multiplier' | 'attack_speed' | 'movement_speed' | 'percent_dr' | 'hp_regen' | 'life_steal' | 'crit' | 'evade' | 'magic_find'`, `perLevelValue` as number in normalized units, plus optional notes).
  - Keep it minimal; missing archetypes can be `levelTrait: { type: 'none' }`.
- Extend `scripts/generate-shared-files.ts` to copy `data/archetypes.ts` into:
  - `apps/server/src/data/archetypes.ts`
  - `apps/client/src/data/archetypes.ts`
- Define server-only types in `apps/server/src/lib/progression/runLevels.ts` to avoid workspace packages:
  - `RunProfile`, `RunLevelModifiers`, helpers to compute modifiers from archetype + level.

### 2) Server: Run Progression Core

- Add `apps/server/src/lib/progression/runLevels.ts`:
  - Constants: `RUN_LEVEL_CAP = 99`.
  - Curve: Provide `getRunLevelProgress(totalXp)` and `getRunXpForNextLevel(level)` using a simple escalating curve tuned to reach level 10 in ~5 minutes under default kill rate. Make the curve factors configurable via env (e.g., `RUN_XP_SCALE`, `RUN_XP_BASE`).
  - `applyRunXp(profile, amount)` → returns `{ profile, levelUps, previousLevel, currentLevel }` similar to meta.
  - `computeRunModifiers(archetypeId, runLevel)` → fold `levelTrait` into `RunLevelModifiers`, respecting global clamps.

- Integrate in `apps/server/src/rooms/GameRoom.ts`:
  - Lifecycle:
    - On player enters run (room transitions to `in_game` or spawn): initialize `RunProfile` for `sessionId` using selected archetype.
    - On death/leave: clear `RunProfile`; emit `run_progression:reset`.
  - XP award hook:
    - Inside `awardXpForEnemyDefeat(...)`, after computing shares, compute run XP using the same shares (kills only) and apply via `applyRunXp`.
    - On `levelUps > 0`, recompute run modifiers and call existing `applyProgressionToPlayer(sessionId, { fullHeal: true, ... })` ensuring `syncPlayerCharacterStats` composes meta + run modifiers.
  - Networking:
    - On join/rejoin: send `run_progression:profile` with full state.
    - On award: send `run_progression:xp_awarded` with totals and level ups.
    - On end/reset: send `run_progression:reset`.

- Compose modifiers in `apps/server/src/lib/player-stats.ts`:
  - Extend `SyncPlayerOptions` to include `runLevelModifiers?: RunLevelModifiers`.
  - Combine into a single internal `modifiers` object before applying to `stats`:
    - Multiplicative stacks (e.g., damage) multiply; additive stacks add; respect existing clamps.
  - Keep behavior compatible with existing meta progression.

- Telemetry (optional, can be enabled later):
  - On death/leave, call `applyStats` with `metadata` containing `{ runLevelAfter, runXpGained }`.

### 3) Client: State & UI

- Add `apps/client/src/hooks/useRunProgression.ts`:
  - Mirror `useProgression` shape: maintain `{ level, totalXp }` and `levelProgress` using client copy of curve helpers (generated from server or duplicated deterministically).
  - Subscribe to `run_progression:*` messages.

- HUD updates:
  - `apps/client/src/components/GameHUD.tsx` and `MobileGameHUD.tsx`:
    - Add a second, thinner run XP bar under the existing meta bar with a distinct color (e.g., teal/green gradient).
    - Optionally add a small pill near the level badge: "Run Lv {n}".
    - Trigger existing level-up celebration UI with a variant for run levels.

### 4) Lobby/Builds Integration

- Keep `apps/client/src/app/builds/page.tsx` as informational; do not rely on its list for logic.
- Optionally read `data/archetypes.ts` client copy to show the `levelTrait` for the selected archetype (non-blocking).

### 5) Configuration & Tuning

- Add env vars to server:
  - `RUN_XP_BASE`, `RUN_XP_GROWTH`, `RUN_XP_KILL_MULTIPLIER` to quickly tune pacing.
- Default theme colors for run XP bar distinct from meta; finalize later.

### 6) Testing

- Unit:
  - Curve monotonicity, cap at 99, overflow handling, multi-level-ups.
  - Trait-to-modifier mapping correctness and clamps.
- Integration:
  - Defeating enemies awards both meta and run XP; run-level-ups recompute stats; client HUD reflects changes.
- E2E (smoke):
  - Death ends run and resets run progression; rejoin shows fresh run state.

### 7) Rollout

- Feature flag `enableRunLevels` read on server; default enabled in staging.
- Add simple admin debug command to grant run XP for tuning on dev servers.

### Deliverables Summary

- `data/archetypes.ts` + shared generation wiring.
- `apps/server/src/lib/progression/runLevels.ts` core utilities.
- `GameRoom` integration for lifecycle, XP, messaging.
- `player-stats` composition of meta + run modifiers.
- `useRunProgression` hook and HUD UI additions.
- Optional telemetry and tuning envs.
