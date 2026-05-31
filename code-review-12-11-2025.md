## Code Review — First Boss Kill Guaranteed Currency

Checklist

- [x] Add a DB helper to detect prior boss kills
  - [x] `hasPreviousBossKill` checks JSON metadata `isBossEncounter=true` or falls back to known boss types (default `portal_guardian`).
  - [x] Preserves optional `excludeKillId` to ignore the current kill row.
- [x] Guarantee GHST/USDC on first boss kill
  - [x] Use the existing boss drop path in `EnemyDeathSystem`.
  - [x] If both GHST and USDC rolls are zero on first boss kill, request one currency using the larger base amount (min 0.1).
  - [x] Keep the function non-async by using a small async IIFE; no signature changes.
  - [x] Spawned item metadata includes `guaranteedFirstBossKill: true` when applied.
- [x] Add `isBossEncounter` tag to kill metadata
  - [x] Augment `recordEnemyKill` metadata to future‑proof analytics and the helper query.
- [x] Keep allocation semantics unchanged
  - [x] If pools are empty, allocations remain null and no coins are spawned (consistent behavior).

Refactoring / Cleanliness

- [x] Centralized prior-kill detection in repo; `EnemyDeathSystem` contains no DB query text.
- [x] Reused the existing spawn/registration flow; minimal edits to boss path only.
- [x] Minor comment trimming; kept only clarifying comments aligned with file style.

Testing / Risks

- [ ] Consider a unit test for `hasPreviousBossKill` (metadata=true and fallback type path).
- [ ] Consider an integration test that simulates: first boss kill → guaranteed currency, second boss kill → probability-based behavior.
- [ ] Note: Guarantee depends on loot pool availability; document operational expectation (weekly top-ups) to avoid silent non-drops.

Observability

- [x] `enemy_kills.metadata.isBossEncounter` aids dashboards.
- [x] Distribution metadata includes `guaranteedFirstBossKill` for audits.

Potential Follow-ups (optional)

- [ ] Expand `bossEnemyTypes` list if/when new bosses are added.
- [ ] Add an indexed materialized view or partial index for `isBossEncounter=true` if this becomes hot.

## Code Review Checklist — 12/11/2025

### Client

- [ ] Admin withdrawals: verify batch approval happy-path and partial failures messaging; prevent double-submission with `approvingBatch` across single-row actions.
- [ ] Admin withdrawals: confirm selection resets correctly on filter changes and on refresh; ensure ENS/username enrichment doesn’t flicker rows.
- [ ] Admin withdrawals: confirm copy server wallet button only appears with address; clipboard errors are silent by design — acceptable?
- [ ] DialogueBox: confirm username fetch honors session and cleans up on unmount; placeholder `${playerName}` replacement works across all dialogues.
- [ ] TopRuns: style/lint pass after trailing blank removal.

### Server

- [ ] WorldTransitionSystem: boss aura application aligns with `AuraSystem.applyAuras` expectations (`_auraSources` pattern).
- [ ] WorldTransitionSystem: confirm boss spawn message and metrics emit once; patch rate restoration is always executed.

### Data (Dialogues & Shops)

- [ ] Keep TS dialogue spec and generated JSON in sync. Verified shop menu now lists Health Potion and Mana Potion (no MK2 Grenade).
- [ ] Shop item grant types: confirm `potion` is supported by inventory UI and server item normalization.

### Scripts & Build

- [ ] `generate:dialogues` runs in `prebuild` and rewrites JSON as expected; ensure CI has `tsx` available.
- [ ] `scripts/generate-dialogues.ts`: dynamic import path works on CI/Prod node version; top-level awaits inside loop are acceptable (sequential gen).

### Routes & Admin

- [ ] Trimmed trailing whitespace in `admin-gotchis` and `admin-runs`; no functional changes — re-run quick smoke tests.

### Migrations

- [ ] Ensure migrations still apply cleanly after trailing whitespace trims.
- [ ] `withdrawal_rejected` status: confirm API and client filters include the new status (already present in UI constants).

### Supabase Function

- [ ] Weekly top-up: confirm envs and webhook; removed trailing blanks; edge deploy script OK.

### General Cleanup

- [ ] Removed trailing blank lines across scripts and configs; re-run linters.
- [ ] No `as any` added outside existing engine patterns; no redundant try/catch added in hot paths.

### Follow-ups (optional)

- [ ] Consider extracting batch approval API into a server bulk endpoint to reduce sequential requests.
- [ ] Add a small unit/integration test for dialogue username substitution edge cases (no session, ENS only, wallet only).

## Code Review Checklist — 12/11/2025 (Open Branch Changes)

### Client (page, dialogue, summary)

- [x] Remove noisy console logs in `app/page.tsx` (start, treasure, chat, share, stream loader).
- [x] Remove AI-note comments like “removed/moved below” and redundant inline notes.
- [x] Keep clipboard share UX but silence clipboard failures; consider toast on failure later.
- [ ] Extract join-room metadata fetch into a helper; add abort signal and timeout.
- [ ] Extract mobile/orientation detection into a reusable hook to avoid duplicate listeners.
- [ ] Narrow `phaserGame: any` by introducing a minimal interface (destroy, switchWeapon, setActiveWeaponIndex, castSpell, setSpellAutocast, handleMobileInput).
- [x] Trim dead commented JSX in `DialogueBox.tsx`; keep typing effect and responses intact.
- [ ] Consider memoizing `NotificationDock` derivations; cap item dock updates with requestAnimationFrame for bursts.

### Server (systems/transitions)

- [x] Gate server-side console logs behind `DEBUG_LOGS` in `EnemyDeathSystem` and `WorldTransitionSystem`.
- [ ] Consider reducing empty `try/catch {}` blocks by guarding with feature checks where safe; keep true fault boundaries.
- [ ] Extract boss-room setup (chunk load + spawn) into a helper to simplify `transitionAllPlayersToBossRoom`.
- [ ] Replace dynamic `require` calls with typed imports where module order permits; keep runtime guard where necessary.

### Data & Generated Files

- [x] Do not edit auto-generated `loot-table.ts` and `game-config.ts` (synced from `/data`).
- [ ] Add a generator note in PR description to clarify provenance of large diffs.

### DB & Schema

- [x] Add `floorReached` to `GameRow`/`GameRecord` and update logic wiring (no slop).
- [ ] Add a small unit test to validate `updateMetrics({ floorReached })` clamps and updates correctly.

### Tests

- [ ] Add a fast unit test for dialogue `${playerName}` replacement with ENS/session/short wallet fallback.
- [ ] Consider a light integration test to assert portal-used events and floor leverage snapshot emissions.

### Maintainability follow-ups (optional)

- [ ] Split `app/page.tsx` into: lobby container, game container, notifications provider, leverage dialog.
- [ ] Move toast/notification composition into a small utility to dedupe “create id; set; auto-clear” pattern.
