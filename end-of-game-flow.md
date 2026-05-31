# End of Run Flow Redesign (Technical Doc)

## Overview
This document translates the "End of Run Flow Redesign" PRD into an implementation-oriented spec for DeFi Dungeon. The redesign splits the end-of-run experience into a four-step, forward-only flow that reduces cognitive load and clarifies primary actions.

## Goals
- Increase perceived reward value and excitement
- Reduce decision friction and cognitive load at run end
- Increase replay rate and shorten time to next run
- Improve clarity of what happened and what to do next
- Make CTA hierarchy unambiguous, one primary action per step

## Non-Goals
- Reward contents, economy, loot tables, or chest art changes
- Major overhaul of leaderboard or action log features
- Changes to run scoring formulas

## Success Metrics
Primary:
- Replay rate: percent of sessions that start a new run within 60 seconds of run end
- Time to next run: median seconds from run end to run start

Secondary:
- Chest open rate
- Leaderboard view rate
- Action log download rate
- Drop off rate on end flow: leaving game within 30 seconds of run end

Quality:
- Fewer misclicks on CTAs (especially on mobile)
- Lower back and forth navigation events during end flow

## Flow Sequence
Steps:
1. Victory Moment
2. Reward Reveal
3. Reward Result
4. Run Summary and Next Action

Navigation model:
- Forward-only progression by default
- Back behavior limited to Summary details (accordion) only
- Escape key or close button exits to lobby only from Summary

## State Machine
States:
- `victory`
- `reward_reveal`
- `reward_result`
- `summary`

Transitions:
- `victory` -> `reward_reveal` on timer or click/tap
- `reward_reveal` -> `reward_result` on chest open success
- `reward_result` -> `summary` on Continue
- `summary` -> `new_run` on Play Again

## Component Structure
Suggested structure:
- `EndFlowController` (state machine + data orchestration)
- Step components:
  - `VictoryMoment`
  - `RewardReveal`
  - `RewardResult`
  - `RunSummary`
- Shared:
  - `PrimaryCTAStack`
  - `LoadingOverlay`
  - `DetailsAccordion`

## Step Specifications

### 1) Victory Moment
Purpose: emotional resolution, short and punchy.

UI:
- Full screen header: "VICTORY" or "DEFEAT"
- Subline: short reinforcement, e.g. "Run Complete"
- Character pose or simple animation
- Minimal UI chrome

Primary interaction:
- Tap or click anywhere to continue
- Auto advance after 2.0s (victory) or 2.5s (defeat)

Buttons:
- Primary: Continue (optional visible)
- No other CTAs

Audio and VFX:
- Victory stinger, small particle burst

Edge cases:
- If reward unavailable, proceed to Reward Reveal with alternate messaging

Acceptance criteria:
- No stats visible
- No chest or leaderboard visible
- Proceed with tap or auto advance

### 2) Reward Reveal
Purpose: maximize reward ritual and perceived value.

UI:
- Large chest centered
- Title: "Victory Chest" or "Run Rewards"
- Single button: "Open Chest"
- Small status text: "Server authoritative, opens once"

Primary interaction:
- Tap Open Chest

Server behavior:
- On click, call reward open API
- Disable button immediately, show opening state

Loading states:
- Fast path: chest opening animation starts immediately, results within 400ms
- Slow path: after 400ms show "Opening..." plus spinner
- Timeout after 10s with "Retry" button

Buttons:
- Primary: Open Chest
- No other buttons

Acceptance criteria:
- No run stats visible
- No replay or lobby buttons visible
- Open Chest cannot be double triggered

### 3) Reward Result
Purpose: translate reward into motivation and meaning.

UI:
- Reward cards list with icons and quantities
- Short affordance text per reward type, e.g. "Used for crafting"
- Optional "New" or "Upgrade" tags
- Small footer hint: "Rewards added to inventory"

Buttons:
- Primary: Continue
- Secondary: View Leaderboard (only if competitive mode)

Interaction:
- Continue goes to Run Summary
- Leaderboard opens overlay or navigates, returns to Run Summary on close

Acceptance criteria:
- Reward outcomes are visible and legible on mobile
- Continue always present as primary CTA
- Leaderboard is not shown before rewards are revealed

### 4) Run Summary and Next Action
Purpose: reflection and clear next steps.

UI layout:
- Compact summary panel with key stats only:
  - Outcome
  - Floor reached
  - Difficulty
  - Rooms cleared
  - Leverage
- Everything else behind Details accordion

Buttons hierarchy:
- Primary: Play Again
- Secondary: Back to Lobby
- Tertiary: Download Action Log
- Optional: View Leaderboard if not already offered

Details accordion:
- Shows deep stats: potions used, max depth, quest score, modifiers
- Default collapsed

Acceptance criteria:
- Play Again is the most visually dominant
- Action log is present but visually de-emphasized
- No chest CTA here

## Copy Guidelines
- Keep language short and action oriented
- Avoid dense numeric blocks unless behind Details
- Victory moment: 1 short line max
- Reward reveal: emphasize ritual and finality, "opens once"
- Reward result: brief explanation to connect reward to purpose

## Telemetry and Analytics
Events:
- `end_flow_started { run_id, outcome, mode, difficulty }`
- `end_flow_step_viewed { run_id, step_name }`
- `end_flow_continue_clicked { run_id, from_step }`
- `chest_open_clicked { run_id }`
- `chest_open_succeeded { run_id, reward_count, server_latency_ms }`
- `chest_open_failed { run_id, error_code, server_latency_ms }`
- `reward_result_continue_clicked { run_id }`
- `summary_play_again_clicked { run_id }`
- `summary_back_to_lobby_clicked { run_id }`
- `action_log_download_clicked { run_id }`
- `leaderboard_view_clicked { run_id, source_step }`

Funnel metrics:
- Step 1 viewed -> Step 2 viewed -> Chest open succeeded -> Step 4 viewed -> Play Again

## Edge Cases and Requirements
Reward availability:
- If no reward: Step 2 shows "No chest this run" and primary CTA becomes Continue
- If player has < 1 USDC/GHO staked: Step 2 shows the chest as a teaser and it cannot be opened (shows a “Stake Now” CTA + refresh)
- If reward already opened: Step 2 becomes Reward Result with cached results

Inventory constraints:
- If inventory full: show modal at Reward Result with options
- Auto convert to currency, if supported
- Send to mailbox, if supported
- Otherwise block Continue until resolved

Connectivity and server errors:
- Offline at Step 2: show "Reconnect to open chest" with Retry
- Timeouts: Retry with exponential backoff capped at 3 retries
- Server authoritative: prevent duplicate opens across clients

Input methods:
- Keyboard: Enter triggers primary CTA, Esc only works on Summary
- Controller: A confirms primary, B goes back only within Summary details

## Data Requirements
Run Summary payload:
- Outcome
- Floor reached
- Difficulty
- Rooms cleared
- Leverage
- Detailed stats (for accordion)

Reward Open endpoint:
- Returns list of rewards and metadata
- Provides server latency for analytics

Caching:
- Cache reward results per `run_id` for recovery and re-entry

## Acceptance Criteria Checklist
- Exactly one primary CTA per step
- Stats not visible until Summary step
- Chest opening can only occur once per `run_id`
- Flow works on mobile and desktop layouts
- Fast path feels instant, slow path has clear status feedback
- Replay button is fastest to reach and largest on Summary
- Choice set per step is minimal to reduce decision time

## Technical Implementation Plan
### Scope and Assumptions
- Scope limited to Idle Dungeon end-of-run UI (victory/defeat) in the main game screen.
- Forward-only progression until Summary; no step-back navigation.
- “Play Again” returns to lobby (no immediate restart).

### Key Files to Touch
- `apps/client/src/components/idle/IdleDungeonScreen.tsx`
- `apps/client/src/types/messages.ts`
- `apps/server/src/rooms/VictoryChestSystem.ts` (reference only)
- `apps/server/src/rooms/IdleMode.ts` (reference only)
- `apps/client/e2e/victory-chest.spec.ts`
- `apps/client/e2e/helpers/idle-helpers.ts`

### Plan
1. Audit current end-of-run rendering and data sources in `IdleDungeonScreen`.
2. Add a client-side end-flow state machine with `victory | reward_reveal | reward_result | summary` steps.
3. Extract step UI into focused components and enforce one primary CTA per step.
4. Implement reward reveal/result behavior with edge cases (no chest, already opened, timeout/retry).
5. Instrument analytics events for each step and CTA.
6. Update E2E tests to reflect the new multi-step flow.
7. Validate with `pnpm test:agent` (and `pnpm test:ui:agent` if UI coverage is needed).

### Progress Log
_Last updated: 2026-01-31_

- [x] (1) Audited existing end-of-run UI in `IdleDungeonScreen.tsx` (previously showed full summary + chest panel immediately).
- [x] (2) Implemented end-flow state machine scaffold + step components (new `EndFlowController`).
- [~] (3) Step UIs extracted into a focused component; still reusing existing summary markup via `renderSummary()` (will continue tightening).
- [~] (4) Reward reveal/result wired to the existing server-authoritative victory chest messages (open once + cached results). Retry button added; timeout UX still uses existing 8s client timeout.
- [x] (5) Analytics events: wired via a minimal `trackEvent()` helper (uses PostHog if present, otherwise logs in dev).
- [x] (6) Updated `apps/client/e2e/victory-chest.spec.ts` to follow the new step flow + test IDs.
- [x] Added `apps/client/e2e/end-of-run-flow.spec.ts` to assert all 4 steps + gating (summary not visible until step 4), CTA contract (no secondary CTA on reward reveal), and a victory auto-advance check.
- [x] Added `apps/client/e2e/victory-chest-teaser.spec.ts` to validate the locked/.teaser chest behavior when stake requirement is not met.
- [ ] (7) Local validation pending (CI will confirm via `tests.yml`).

### Open Questions
- Where should new analytics events be wired (existing client analytics utility, or new tracker)?
- Should the Reward Result step include inventory-full handling now or defer to a future change?
