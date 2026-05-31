## Upgrade Tier UI (replace “Stake USDC”)

### Screenshot analysis (target UX)

The mock shows an **Upgrades** screen with:

- **Current tier card**
  - Title: `Current: Tier 2 (Nightmare) 100 USDC`
  - Lines:
    - `Runs/day: 20 — Difficulty: Nightmare`
    - `Chests: On`
- **Next upgrade card**
  - Title: `Next upgrade: Tier 3 (Hell) 1000 USDC`
  - Progress label: `Progress: 100 / 1000`
  - A horizontal **progress bar** (green fill over grey track; segmented look optional)
  - “You will get:” list with checkmarks:
    - `Runs/day: 30`
    - `Difficulty: Hell`
    - `Chests: On`
  - Primary CTA button: `[ Stake +900 USDC ]`
  - Secondary action: `( View all tiers )`
- **Details accordion** (collapsed by default):
  - `Lockup, unstake rules, rewards info`

### Mapping to existing gotchiverse-live data (already matches the mock)

We can build this “upgrade tier” UI without inventing new tiers:

- **Daily runs per day** comes from `GAME_CONFIG.dailyRuns.tiers` (client/server shared config):
  - `0 → 10 runs/day`
  - `100 → 20 runs/day`
  - `1000 → 30 runs/day`
- **Difficulty** comes from `DIFFICULTY_TIERS`:
  - `normal` (0 staked)
  - `nightmare` (100 staked)
  - `hell` (1000 staked)
- **Victory chest eligibility** is currently communicated in UI copy as:
  - “Stake at least **1 USDC/GHO** to unlock this chest.”

This is why the mock’s Tier 2 / Tier 3 values line up with the current codebase.

### Product decisions (confirmed)

- **Entry point**: Replace the existing staking CTA label with `Upgrades` and open this dialog UI.
- **Currency label**: Use **USDC/GHO** in the CTA and copy (matching current staking support).
- **Chest status**: `Chests: On` when **total staked >= 1** (USDC + GHO).
- **Tier 1 label**: Display Tier 1 stake requirement as **Free** (not `0 USDC`).
- **Stake CTA behavior**: `Stake +Δ` **prefills** the amount and opens `TopupForm`.
- **Max tier state**: Keep the “Next upgrade” card, show **100%** progress, and **disable** the stake CTA.
- **Lockup semantics**: Each staking event has its **own** unlock time; staking again **does not** reset/extend existing lockups.
- **Details accordion**: Include lockup duration + earliest withdrawal time, withdrawal caveats, immediate effects of withdrawing on difficulty/runs, and reward caveats.

> Note: the screenshot shows `USDC` labels; the product decision is to use `USDC/GHO` labels in this implementation.

---

## PRD

### Overview

Replace the current “Stake USDC” entry point with an **Upgrade Tier** UI that:

- Shows the player’s **current tier** (stake threshold + key perks)
- Shows the **next tier** and the player’s **progress** toward it
- Offers a single-click **Stake +Δ (USDC/GHO)** CTA for the exact additional amount needed to reach the next tier
- Lets the player view **all tiers** and read **staking details**

### Goals

- Make staking feel like **progression** (clear current state, clear next step).
- Reduce confusion about what staking unlocks (runs/day, difficulty, chests).
- Reduce time-to-upgrade by presenting a single, obvious action (“Stake +Δ”).

### Non-goals

- Redesign the entire staking/topup flow or contract logic (reuse `TopupForm`).
- Change the underlying tier thresholds (use existing config as source of truth).
- Add new currencies or chains.

### Success metrics

- Users can answer “What do I get if I stake more?” from a single screen.
- Users can stake the exact delta to next tier in ≤ 2 interactions.
- No regressions in:
  - Daily runs calculations
  - Difficulty eligibility
  - Victory chest gating

### Target users

- Players who want more runs/day and higher difficulty.
- Players who see chest teasers and need to understand why.

---

## PRD (machine-readable JSON)

```json
{
  "version": 1,
  "project": "Upgrade Tier UI",
  "overview": "Replace the generic staking CTA with an upgrade-tier view that shows current tier, next tier progress, and a stake-delta action.",
  "goals": [
    "Show current tier (runs/day, max difficulty, chests status) derived from existing stake-based configs",
    "Show next tier (requirements, progress bar, perks list)",
    "Provide a primary CTA to stake exactly the delta required to reach the next tier",
    "Provide access to a full tiers list and staking details"
  ],
  "nonGoals": [
    "Do not change onchain staking behavior or add new staking contracts",
    "Do not change tier thresholds (reuse existing config)",
    "Do not require manual UI testing as a gate"
  ],
  "successMetrics": [
    "Players can see current + next tier in one dialog/screen",
    "Primary CTA label is deterministic: Stake +<delta> USDC/GHO",
    "Automated tests pass without flaky UI behavior"
  ],
  "openQuestions": [],
  "stack": {
    "framework": "Next.js / React (existing apps/client)",
    "hosting": "Existing deployment",
    "database": "Existing",
    "auth": "Existing session auth"
  },
  "routes": [
    {
      "path": "N/A (existing Lobby dialog)",
      "name": "Upgrade Tier Dialog",
      "purpose": "Show current/next tier and trigger staking"
    }
  ],
  "uiNotes": [
    "Match the mock structure: Current card, Next upgrade card with progress bar, perks list, Stake +Δ CTA, View all tiers, Details accordion.",
    "Use deterministic formatting for stake/progress numbers (no flicker, stable rounding).",
    "Add stable data-testid attributes for E2E tests."
  ],
  "dataModel": [
    {
      "entity": "UpgradeTierViewModel",
      "fields": [
        "currentTierNumber",
        "currentDifficultyId",
        "currentDifficultyName",
        "currentStakeThreshold",
        "currentRunsPerDay",
        "chestsEnabled",
        "nextTierNumber",
        "nextDifficultyId",
        "nextDifficultyName",
        "nextStakeThreshold",
        "nextRunsPerDay",
        "progressCurrent",
        "progressTarget",
        "progressRatio",
        "stakeDeltaToNext"
      ]
    }
  ],
  "importFormat": {
    "description": "Not applicable",
    "example": {}
  },
  "rules": [
    "Current tier is the highest tier whose stake requirement is <= total staked (USDC + GHO).",
    "Next tier is the next stake requirement above current stake, if any; otherwise the player is at max tier.",
    "Progress is shown as <currentStake> / <nextStakeThreshold> with a ratio for the progress bar.",
    "Primary CTA uses stakeDeltaToNext = max(0, nextStakeThreshold - currentStake).",
    "If no next tier exists, show the next-upgrade card in a 'Max tier' state with progress 100% and a disabled Stake +Δ CTA.",
    "Chests enabled is true when total staked >= 1 (USDC + GHO).",
    "Tier 1 displays stake requirement as 'Free' (not '0 USDC').",
    "Lockup is per staking event: each stake has its own unlock time; staking again does not reset/extend existing lockups."
  ],
  "qualityGates": [
    "pnpm test:agent",
    "pnpm typecheck",
    "pnpm lint"
  ],
  "stories": [
    {
      "id": "US-001",
      "title": "Create upgrade-tier view model helpers",
      "status": "open",
      "dependsOn": [],
      "description": "As a developer, I want a deterministic way to compute current/next tier and delta so the UI is consistent across screens.",
      "acceptanceCriteria": [
        "Add a pure helper that takes totalStaked (number) and returns the UpgradeTierViewModel",
        "Example: totalStaked=100 -> currentTier=2 (Nightmare), nextTier=3 (Hell), delta=900, progress=100/1000",
        "Negative case: totalStaked=0 -> currentTier=1 (Normal, Free), nextTier=2 (Nightmare), delta=100, progress=0/100",
        "Negative case: totalStaked>=1000 -> nextTier is null and delta is 0"
      ]
    },
    {
      "id": "US-002",
      "title": "Implement Upgrade Tier dialog UI",
      "status": "open",
      "dependsOn": ["US-001"],
      "description": "As a player, I want to see my current tier and next upgrade so I understand what staking unlocks.",
      "acceptanceCriteria": [
        "Add a dialog that renders the mock structure: current card, next card, progress bar, perks list, Stake +Δ CTA, View all tiers, Details accordion",
        "Use stable formatting for stake/progress (no excessive decimals; deterministic rounding)",
        "Add data-testid hooks for: current-tier, next-tier, progress, stake-delta-cta, view-all-tiers, details",
        "Negative case: when nextTier is null, show max-tier state with 100% progress and a disabled stake CTA"
      ]
    },
    {
      "id": "US-003",
      "title": "Wire Upgrade Tier dialog into Lobby where Stake USDC exists today",
      "status": "open",
      "dependsOn": ["US-002"],
      "description": "As a player, I want the existing stake entry points to show the upgrade-tier UI instead of a generic stake prompt.",
      "acceptanceCriteria": [
        "Replace the existing Daily Runs staking CTA label with `Upgrades` and open the Upgrade Tier dialog",
        "Replace the staking CTA inside the Daily Runs info dialog with the same `Upgrades` entry point (or route to it)",
        "Example: stake CTA label shows Stake +<delta> USDC/GHO when a next tier exists",
        "Negative case: if staking is not available (no session/wallet), show a disabled CTA with a clear reason"
      ]
    },
    {
      "id": "US-004",
      "title": "Update automated tests for new Upgrade Tier UI",
      "status": "open",
      "dependsOn": ["US-003"],
      "description": "As a developer, I want tests to validate the new UI so we can refactor safely.",
      "acceptanceCriteria": [
        "Update E2E selectors that referenced 'Stake USDC' to use data-testid hooks and/or the new `Upgrades` trigger",
        "Example: a test can assert progress text '100 / 1000' when staked=100",
        "Negative case: max-tier shows no next upgrade CTA",
        "All quality gates pass"
      ]
    }
  ]
}
```

---

## Implementation plan (concrete to this repo)

### Proposed placement (replacing existing UI)

The current “Stake USDC” entry points are in `apps/client/src/components/Lobby.tsx`:

- **Daily Runs row CTA**: button labeled `Stake USDC` that opens a dialog with `TopupForm`
- **Daily Runs info dialog footer CTA**: button labeled `Stake USDC/GHO` that opens a dialog with `TopupForm`

Decision: replace these dialogs/triggers with an `Upgrades` entry point that opens a new **Upgrade Tier** dialog (matching the mock structure), and keep `TopupForm` available from within that dialog (so we don’t reimplement staking).

### Data sources / computations

- Use total staked amount already available in the Lobby (`stakedUsdcBalance` and/or derived `dailyRunsStaked`).
- Combine:
  - `DIFFICULTY_TIER_SEQUENCE` + `DIFFICULTY_TIERS` for tier name + threshold (0/100/1000)
  - `GAME_CONFIG.dailyRuns.tiers` for runs/day at threshold
- Determine:
  - **current tier**: highest tier with `required <= totalStaked`
  - **next tier**: next tier above `totalStaked` (or null)
  - **progress**: `totalStaked / next.required` (clamped 0–1)
  - **stake delta**: `next.required - totalStaked` (clamped at 0)
  - **chests enabled**: `totalStaked >= 1`

### UI components (suggested)

- `apps/client/src/components/upgrade-tier/UpgradeTierDialog.tsx`
  - Dialog header: “Upgrades” + optional info icon
  - Body: current card, next card, tier list toggle, details accordion
- `apps/client/src/components/upgrade-tier/UpgradeTierCards.tsx`
  - Pure presentational: cards, progress bar, check list
- `apps/client/src/lib/upgrade-tier.ts`
  - Pure helpers to build the view model (testable without React)

### Staking flow integration

Primary CTA button (`Stake +Δ USDC/GHO`) should:

- Open the existing `TopupForm`
- Pre-fill `amount` with the computed delta and default to `USDC` (user can switch to `GHO`)

Notes:

- Today, `TopupForm` uses `nuqs` query params (`token`, `amount`) and floors the amount to an integer.
- If prefill via query params is undesirable, consider adding optional props to `TopupForm` for initial token/amount.

### “View all tiers”

Minimum viable implementation:

- Expand/collapse a tiers list inline (reuse the existing “Daily Run Tiers” presentation pattern already in `Lobby.tsx`).

Better UX:

- Show a combined tiers table with columns:
  - Stake threshold
  - Runs/day
  - Max difficulty
  - Chests on/off

### “Details” accordion content

Use existing copy as the source of truth where possible:

- Lockup: “Lock USDC/GHO for 30 days”
- Unstake: earliest withdrawal time, and any cooldown/penalties (must match the system-of-record)
- Re-staking: each stake has its own unlock time; staking again does not reset/extend existing lockups
- Effect of withdrawing: how difficulty eligibility / runs/day change immediately after withdrawing
- Rewards caveats: clarify stake affects runs/day, difficulty eligibility, and chest access

### Quality gates

- `pnpm test:agent` (default)
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e` (recommended after updating selectors, if the feature affects flows covered by E2E)

---

## Open questions (remaining)

- None.


