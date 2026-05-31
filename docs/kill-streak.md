## Kill Streak (Per-Run, Ephemeral, Tapering Multiplier)

### Goal

- Replace the existing run-level system with a kill-streak mechanic that increases a per-run archetype-based modifier on every enemy kill and slowly tapers when the player stops killing.

### Core Mechanics

- \[Increment\] Each kill grants streak units. Default weights:
  - Trash/common enemies: +1 unit
  - Elites: +10 units (bosses may map to elite by default; see Tuning)
- \[Archetype modifier\] Continue using the archetype trait mapping (damage, attack speed, armor, etc.), but scale by current streak units instead of run level.
- \[Taper\] After a short grace period of inactivity, streak units decay over time until they reach 0.
- \[Server authoritative\] All streak state and calculations live on the server and are sent to clients for display only.

### Defaults (tunable)

- STREAK_UNIT_TRASH = 2
- STREAK_UNIT_ELITE = 20
- STREAK_UNIT_BOSS = 10 (same as elite unless tuned separately)
- STREAK_DECAY_GRACE_MS = 10000 (no decay for 10s after last kill)
- STREAK_DECAY_RATE_UNITS_PER_SEC = 1 (linear decay by 1 unit/sec)
- STREAK_UNIT_CAP = 9999 (hard cap to avoid runaway numbers)

Notes:

- Keep existing stat clamps (e.g., armor %, min attack speed scalar) when composing modifiers.
- Do not introduce workspace packages for types; define server types locally and mirror a minimal client type if needed (project rule).

### Decisions to confirm before implementation

- Archetype scaling
  - Keep exact trait math, but per streak unit instead of per run level?

Yes.

- Prefer `valuePerUnit` (with `valuePerLevel` kept as alias) or keep current field name?

Can change the name.

- Enemy weighting
  - Classification → units mapping OK?
    - trash/common: +1
    - elite: +10
    - boss: +10 (or a distinct higher value?)
    - any other classes (miniboss, champion) needing distinct weights?

    No need to do Boss because game ends after that.

- Killer vs party
  - Award units to killer only (default), or share/assist units to nearby contributors?

  Killer only.

- Decay model
  - Linear decay after inactivity OK?
    - Grace: 3000 ms
    - Rate: 1 unit/sec
  - Alternative preferred (e.g., exponential)? Pause decay while in menus/paused?

  That sounds good to me.

- Cap
  - Hard cap at 9999 units acceptable, or a different cap?

  That sounds good.

- Reset rules
  - Reset to 0 on player death and on run end/room leave?
  - On reconnect to the same room/session, preserve current streak?

  Yes, reset.

- Network updates
  - Emit `kill_streak:updated` only on integer unit changes to reduce spam?
  - Include `source` payload `{ enemyType, classification }`?

  It should emit on every enemy kill right?

- UI
  - Remove run XP bar and run level entirely, replace with a compact Kill Streak pill/badge?

Yes get rid of the XP bar. Just keep the multiplier in the top right.

- Display format: "KS 123" or "KS x1.23" (multiplier-style)? Any thresholds for special FX (e.g., 50/100)?

Keep the multiplier in the top right.

- Audio/VFX
  - Reuse existing run-level-up SFX or add a lighter “streak up” sound?

Don't use the run-level-up SFX anymore. I'll add a new one later.

- Small on-kill tick effect vs only at thresholds?

No effect yet.

- Boss behavior
  - Treat bosses as elite by default (+10) or give a distinct larger bump?

  No bump.

- Anti-cheat and authority
  - Confirm all streak logic is server-authoritative and client is display-only.

  yes.

- Feature flagging
  - Fully replace run-levels, or gate with `ENABLE_KILL_STREAKS=1` and keep run-level code path for fallback?

  Fully replacde.

- Scoring/loot tie-ins
  - Any additional score/loot multipliers tied to streak beyond archetype modifiers (e.g., bonus score per N units), or keep it strictly via archetype trait effects?

  Strictly via archetypes.

---

## Data Model (Server Runtime)

- `KillStreakProfile` (in-memory, per sessionId):
  - `units: number` (current streak units)
  - `archetypeId: string`
  - `modifiers: KillStreakModifiers` (derived from `units` + `archetype`)
  - `lastKillAt: number` (ms)
  - `updatedAt: number` (ms)

- `KillStreakModifiers` (same shape/fields as `RunLevelModifiers` today):
  - `damageMultiplier`, `attackSpeedScalar`, `movementSpeedMultiplier`, `armorBonus`, `lifeStealPercent`, `criticalChanceBonus`, `evadeChanceBonus`, `hpRegenPerSecondBonus`, `manaRegenMultiplier`, `attackRangeMultiplier`, `magicFindBonus`, `potionCoinFindBonus`, `maxHealthMultiplier`, `maxHealthFlatBonus`.

Computation:

- Replace level-based math with unit-based math. Example mapping versus current `runLevels.ts`:
  - `damage_multiplier`: `damageMultiplier = 1 + valuePerUnit * units`
  - `attack_speed`: `attackSpeedScalar = clamp(pow(1 - valuePerUnit, units), MIN, 1)`
  - `movement_speed`: `movementSpeedMultiplier = 1 + valuePerUnit * units`
  - `percent_damage_reduction`: cap % to `MAX_ARMOR_PERCENT` before converting
  - Other traits follow the same additive-per-unit or multiplicative-per-unit logic currently used per level

---

## Server Code Changes

### 1) New Streak Core (server)

- Add `apps/server/src/lib/progression/killStreak.ts` with:
  - `export interface KillStreakProfile { units: number; archetypeId: string; modifiers: KillStreakModifiers; lastKillAt: number; updatedAt: number }`
  - `export function createKillStreakProfile(archetypeId: string): KillStreakProfile`
  - `export function cloneKillStreakProfile(p: KillStreakProfile): KillStreakProfile`
  - `export function computeKillStreakModifiers(archetypeId: string, units: number): KillStreakModifiers` (ported from `computeRunModifiers`, replace `level` with `units` and `valuePerLevel` with `valuePerUnit` semantics)
  - `export function applyKillStreakIncrement(profile: KillStreakProfile, unitDelta: number, now = Date.now())`
  - `export function applyKillStreakDecay(profile: KillStreakProfile, now = Date.now())` (no-op within `STREAK_DECAY_GRACE_MS` since `lastKillAt`)
  - `export function resolveArchetypeForCharacter(...)` (reuse existing server helper)

Notes:

- Keep clamps and calculations identical to `runLevels.ts` where applicable.
- Do not reference workspace packages for shared types [[memory:7369650]].

### 2) Replace Run-Level Integration (room)

File: `apps/server/src/rooms/GameRoom.ts`

- Remove/replace run progression fields and methods with kill-streak ones:
  - Replace `runProgressionBySession: Map<string, RunProfile>` with `killStreakBySession: Map<string, KillStreakProfile>`
  - Replace `ensureRunProgressionForPlayer` with `ensureKillStreakForPlayer`
  - Replace `resetRunProgressionForSession`/`resetRunProgressionForAllPlayers` with `resetKillStreakForSession`/`resetKillStreakForAllPlayers`
  - Replace `sendRunProfileToClient` and `sendRunResetToClient` with streak variants

- Network messages (authoritative → client):
  - Remove: `run_progression:profile`, `run_progression:xp_awarded`, `run_progression:reset`
  - Add: `kill_streak:profile` `{ units, archetypeId }`
  - Add: `kill_streak:updated` `{ deltaUnits, units, archetypeId, source }`
  - Add: `kill_streak:reset` `{ reason }`

- Award streak on enemy death (killer-only):
  - In `handleEnemyDeath` flow, where XP is distributed (`awardXpForEnemyDefeat`), stop awarding run XP to all share recipients; instead, look at the `killerId` only.
  - Determine classification using existing `enemyStats.classification` and map to unit delta:
    - `trash/common` → `STREAK_UNIT_TRASH`
    - `elite/boss` → `STREAK_UNIT_ELITE` (or `STREAK_UNIT_BOSS` if separate)
  - Call `awardKillStreakUnitsToPlayer(killerSessionId, unitDelta, { enemyId, enemyType, attackType, classification })`.

- Apply streak modifiers to derived stats:
  - In `applyProgressionToPlayer` replace `runLevelModifiers` with `killStreakModifiers` from the current profile before calling `syncPlayerCharacterStats`.

- Decay loop:
  - In the main update tick (same cadence as other systems), call `updateKillStreakDecay(now)`:
    - Iterate `killStreakBySession`, apply decay per profile via `applyKillStreakDecay`, and if `modifiers` changed, re-apply stats and send `kill_streak:updated`.

- Reset on death/leave/run end:
  - On `handlePlayerDeath(...)`: call `resetKillStreakForSession(sessionId, { reason: 'death' })`.
  - On run end or room disposal: `resetKillStreakForAllPlayers({ reason: 'run_end' })`.

### 3) Composition in stats

File: `apps/server/src/lib/player-stats.ts`

- Replace `runLevelModifiers?: RunLevelModifiers` with `killStreakModifiers?: KillStreakModifiers` in `SyncPlayerOptions`.
- Where composing:
  - Replace all uses of `runModifiers?.*` with `killStreakModifiers?.*`.
  - Keep multiplicative vs additive semantics identical to current implementation.

### 4) Archetype data (server)

File: `apps/server/src/data/archetypes.ts`

- Keep the trait type and mapping, but update comments/semantics to refer to per-streak-unit instead of per-run-level.
- If desired, rename `valuePerLevel` → `valuePerUnit`. To minimize churn, you may:
  - Add `valuePerUnit` and keep `valuePerLevel` as a backward-compatible alias in the type; use `valuePerUnit ?? valuePerLevel ?? 0` in computation.

### 5) Enemy classification source (server)

Files:

- `apps/server/src/rooms/GameRoom.ts` (already has `enemyStats.classification` in XP flow)
- `apps/server/src/lib/systems/EnemyDeathSystem.ts` (classification is resolved for loot; no change required for streak; rely on `GameRoom` XP flow)

---

## Client Code Changes

### 1) Networking and state plumbing

Files:

- `apps/client/src/app/initPhaser.ts`
  - Replace handlers: `onRunProgressionProfile`/`onRunProgressionXpAward` with `onKillStreakProfile`/`onKillStreakUpdated`.
- `apps/client/src/app/page.tsx`
  - Replace local state: `runLevel`, `runXpIntoLevel`, `runXpForNextLevel` with `killStreakUnits`.
  - Replace effects and notifications that reference run-level ups with streak updates (optional toast when reaching thresholds: 50, 100, etc.).
- `apps/client/src/game/GameScene.ts`
  - Wire new messages `'kill_streak:profile'`, `'kill_streak:updated'`, `'kill_streak:reset'`.
  - Replace run-level SFX (`runlevelup`) with a short streak-increase SFX (new asset or reuse).

### 2) HUD updates

Files:

- `apps/client/src/components/GameHUD.tsx`
- `apps/client/src/components/MobileGameHUD.tsx`

Changes:

- Remove the run XP bar and level-readout UI.
- Add a compact Kill Streak pill near the level/HP area, e.g., `KS x1.23` or archetype-coded label.
- Where run trait display exists (short label block), compute the value from `killStreakUnits` using the same client-side formatting mirrors used previously for run traits.

### 3) Archetype display (client)

Files:

- `apps/client/src/data/archetypes.ts`
- `apps/client/src/components/Lobby.tsx`

Changes:

- Update descriptions from “per run level” → “per streak unit”.
- If adopting `valuePerUnit`, mirror the type change client-side.

---

## Feature Flags and Config

- Add server env flags:
  - `ENABLE_KILL_STREAKS=1`
  - `STREAK_UNIT_TRASH=1`
- `STREAK_UNIT_ELITE=20`
  - `STREAK_UNIT_BOSS=10`
  - `STREAK_UNIT_CAP=9999`
- `STREAK_DECAY_GRACE_MS=10000`
  - `STREAK_DECAY_RATE_UNITS_PER_SEC=1`

Behavior:

- If `ENABLE_KILL_STREAKS=1`, disable run-level message emission and profile maintenance entirely.

---

## Removal/Deprecation

- Remove or gate the following run-level pieces when kill streaks are enabled:
  - Server: `apps/server/src/lib/progression/runLevels.ts` usage and `run_progression:*` messages.
  - Server: all `runProgressionBySession` state and helpers in `GameRoom`.
  - Client: run-level state, handlers, and HUD bars.
  - Docs: add a deprecation header to `docs/run-levels.md` referencing this document.

---

## Implementation Checklist (Files and Key Edits)

Server:

- `apps/server/src/lib/progression/killStreak.ts` (NEW): streak core (types, math, increment/decay)
- `apps/server/src/rooms/GameRoom.ts`: replace run-level plumbing with kill-streak; award on kill; decay in update; reset on death/leave; send new messages; compose modifiers in `applyProgressionToPlayer`
- `apps/server/src/lib/player-stats.ts`: accept `killStreakModifiers` and compose them (replace `runLevelModifiers`)
- `apps/server/src/data/archetypes.ts`: comment/type rename to `valuePerUnit` (keep alias)

Client:

- `apps/client/src/app/initPhaser.ts`: wire `'kill_streak:*'` messages
- `apps/client/src/app/page.tsx`: local state and handlers for kill streak units; remove run-level references
- `apps/client/src/components/GameHUD.tsx`: replace run-level bar with Kill Streak pill/readout; compute and show trait value from units
- `apps/client/src/components/MobileGameHUD.tsx`: same as above
- `apps/client/src/components/Lobby.tsx`: text updates (per streak unit)
- `apps/client/src/game/GameScene.ts`: optional SFX and on-screen feedback on notable thresholds

Docs:

- `docs/run-levels.md`: mark deprecated when kill streaks are enabled
- `docs/kill-streak.md`: this document

---

## Tuning and Edge Cases

- Bosses: default to elite weight; can set `STREAK_UNIT_BOSS` higher if desired.
- Party/assist: by default, only the killer gains streak units (prevents passive leeching). Optionally add a small assist unit (e.g., 0.5) to nearby contributors behind a flag.
- Death: resets streak to 0.
- Room transitions/end: reset for all players.
- Anti-cheat: server-only; ignore any client attempts to modify streak.

---

## Validation Plan

- Unit tests (server):
  - `computeKillStreakModifiers` parity with run-level math given identical inputs (swap `level` for `units`).
  - Increment → modifiers increase; decay → modifiers decrease; clamps respected.
  - Elite weighting applies correct unit delta.

- Integration tests:
  - On enemy death with `killerId`, server emits `kill_streak:updated` with expected units and re-syncs stats when thresholds cause meaningful deltas.
  - On idle > grace period, decay ticks reduce units toward 0 and emit updates periodically.

- E2E smoke:
  - Kill several trash → watch `KS x…` climb; stop killing → watch gradual taper; kill an elite → large bump.
