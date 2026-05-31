## Arena-style run (3–5 minutes)

Scope: Keep hero selection, difficulty tiers, and map selection unchanged. This document specifies only enemy spawning, bounty rotation, and rewards for a fast, replayable arena loop.

### Run overview

- **Length**: 3–5 minutes
- **Cadence**: 25s build → 15s surge → 10s recovery (~50s cycles)
- **Decision**: At ~3–4 minutes, choose to extract (bank rewards) or trigger a short finale wave for a bonus

---

### Enemy spawning

- **Baseline (Build)**
  - interval: 12s
  - batch: 8
  - behavior: evenly stagger each batch across ~1.5s in 200ms sub-chunks to avoid spikes

- **Surge window (+pressure)**
  - interval: 6s
  - batch: 12
  - visual/audio telegraph at surge start/end
  - readability: during surges, cap concurrent projectile count and reduce non-critical VFX opacity to preserve clarity

- **Recovery window (+payoff)**
  - interval: 16s
  - batch: 4
  - guaranteed small chest reward after recovery completes

- **Population and validity guards**
  - cap: 120 concurrent enemies per room
  - pause spawns when no players present
  - never spawn Portal Guardian via timer
  - remove or pause spawns during map transitions (unchanged from current behavior)
  - fairness: never spawn within ~200px of a player without a 300–500ms telegraph; bias collision ties in player’s favor by 1px; 600ms post-hit i-frames; clamp burst damage to ≤35% max HP per 500ms

- **Elite injectors**
  - frequency: 1 elite every 2 surges or on every ~60 total enemy kills (whichever comes first)
  - per-run limit: max 4 elites
  - modifiers: pick 2 simple modifiers (e.g., +HP, short dash, volley shot)
  - reward: elite chest on defeat

- **Risk chest hazards**
  - trigger: opening a marked “risk chest” immediately spawns a local hazard burst
  - burst: 6 enemies within a ring radius ~160px from the opener (safe minimum distance)
  - reward tradeoff: stronger loot (see Rewards) balanced by the hazard

---

### Bounties (one active at a time)

- **Rotation**
  - frequency: every 45–60s, pick one bounty; duration 45–60s
  - optional: failure has no penalty; next bounty rotates on timer
  - selection rule: prefer bounties that are feasible given active enemies; fallback to generic kill targets
  - HUD: compact bounty pill with timer and progress; colorblind-safe indicators; optional SFX cue on start/complete

- **Targets scale lightly by player count**
  - 1 player: base targets
  - 2 players: +25%
  - 3 players: +50%
  - difficulty tiers: scale targets and timers by tier; avoid overlapping with surge starts to preserve readability

- **Bounty types**
  1. Cull-type: defeat X enemies of a specific family (e.g., Slimes, Shooters)
     - target: 12–18 (base 15)
  2. Time attack: defeat 30 enemies within 30s
     - target: 30 in 30s
  3. No-hit window: take no damage for 20s
     - target: 20s without damage events
  4. Streak sustain: maintain a streak ≥ 2× for 20s
     - target: keep streak above threshold without decay
  5. Shrine defense: protect a spawned shrine for 30s
     - target: shrine HP > 0 at timer end; spawns extra aggro nearby
  6. Elite hunt: defeat an elite within 30s (only offered when an elite is present)
     - target: 1 elite in 30s

- **Bounty rewards**
  - completion: 1 small chest + +10% score bonus for the next 30s
  - failure: none (rotate next bounty as scheduled)

---

### Rewards

- **Streak multiplier**
  - base: 1.0×; +0.5× per 10 kills; cap 5.0×
  - decay: after 3s without a kill; reset on taking damage
  - impact: scales score and currency drops
  - clarity: show a small on-kill popup that scales with current multiplier

- **Chest types**
  - Small chest (recovery and bounty rewards)
    - 60%: common currency (e.g., GHST shards) x [5–10]
    - 25%: uncommon item (consumable/utility)
    - 10%: rare item
    - 5%: jackpot ticket (cosmetic/bonus roll)
  - Risk chest (player-triggered risk lever)
    - contents ~2× small chest value; +15% chance to upgrade one roll to rare
    - opening triggers the 6-enemy hazard burst
    - telegraph: red ring preview for ~400ms before enemies appear; safe radius ~160px from opener
  - Elite chest (elite kill)
    - guaranteed: rare item or currency bundle x [2–3× small]
    - 10%: epic item
  - Finale chest (if finale completed)
    - 1 rare + 1–2 uncommon + currency bundle x [3× small]

- **Extraction vs Finale**
  - extraction (safe): bank all current loot at ~3–4 minutes
  - finale (risky): 20s high-pressure wave with elite chance; succeed to earn a finale chest; failure yields standard drops only
  - UX: clear prompt with a 5s decision timer; input leniency with buffered confirm/cancel

---

### Tuning levers (initial defaults)

- cycle durations: 25s build, 15s surge, 10s recovery
- spawn intervals/batches: 12s×8 (build), 6s×12 (surge), 16s×4 (recovery)
- cap: 120 enemies
- elite: every 2 surges or 60 kills; max 4 per run
- bounty timing: 45–60s cadence; 45–60s duration
- streak: +0.5× per 10 kills; 3s decay; 5.0× cap
- risk burst: 6 enemies at ~160px ring
- telegraphs: 300–600ms for standard attacks; 600–900ms for elites; 900–1200ms for finales

---

### HUD, accessibility, and performance

- Event strip: narrow surge/recovery ribbon with short timer; avoid intrusive flashes.
- Accessibility toggles: colorblind-safe palette, motion reduction (lower screenshake/vignettes), SFX ducking during callouts.
- Friction goals: <10s to first action; <2s restart; instant retry button on summary.
- Performance bounds: cap concurrent projectiles; stagger add-to-state during surges to protect FPS/network.

---

### Competition and telemetry

- Leaderboards: daily/weekly seeded arena runs segmented by character and difficulty; server-authoritative scores.
- Ghosts/replays: optional ghost from best local run using server snapshots; export top-run highlight clip.
- Track: run length, kills/min, deaths/min, average streak, bounty completion rate, elite kill rate, % time in surge, restart latency, time-to-first-action, offscreen vs onscreen damage, burst damage windows.

---

### Notes

- Anti-cheat/server authority preserved: spawning, bounty validation, and chest rolls are server-side.
- Keep visuals readable and spikes bounded to protect network/FPS.
- Difficulty tiers, hero selection, and maps remain unchanged; these parameters layer on top.

---

### Implementation plan (server + client)

- Server authority only; clients render/hud. Constants live in `apps/server/src/lib/constants.ts` as single source of truth.

- Server: core loop and cycles
  - Add arena scheduler to `apps/server/src/rooms/GameRoom.ts` inside `setupGameLoop()`:
    - New state in `apps/server/src/schemas/index.ts` → `GameRoomState`:
      - `currentCycle: 'build' | 'surge' | 'recovery'`
      - `cycleEndsAt: number`, `nextCycleAt: number`
      - `surgesCompleted: number`
      - `arenaRunEndsAt: number`, `arenaDecisionAt: number`
      - `finaleActive: boolean`
      - `elitesSpawned: number`
      - `activeBounty?: { kind: string; target: number; progress: number; endsAt: number; params?: Record<string, any> }`
      - `bountyScoreBuffEndsAt: number`
    - Replace fixed `TIMED_SPAWN` loop with computed spawn params per cycle:
      - Build: interval 12s, batch 8
      - Surge: interval 6s, batch 12
      - Recovery: interval 16s, batch 4
    - Implement staggered sub-chunks: split each batch into ~200ms slices over ~1.5s to smooth spikes.
    - Guards preserved: pause with no players, during transitions, in treasure rooms; cap enemies at 120.
    - Never select `portal_guardian` in timed/cycle spawns.

- Server: spawn fairness and readability
  - Update `apps/server/src/lib/systems/EnemySpawnSystem.ts` to accept `minDistanceFromPlayers` and use 200px for arena spawns.
  - Add post-hit i-frames and burst clamp in damage systems:
    - Track `player.lastDamagedAt` in `PlayerSchema` or room-side map.
    - In `apps/server/src/lib/systems/EnemySystem.ts` (and other damage sources), ignore damage within 600ms of last hit.
    - Clamp cumulative damage to ≤35% max HP per 500ms window.
  - Cap concurrent projectiles during surges in `apps/server/src/lib/systems/ProjectileSystem.ts` using a ceiling from constants; drop or delay new spawns when capped.

- Server: elite injector
  - In `GameRoom`, on every 2nd surge end or when `state.totalEnemyKills` increases by ~60 (whichever first), and `elitesSpawned < 4`, spawn an elite:
    - Implement `spawnElite()` (reusing `spawnEnemyOfType`) with elite flag and 2 simple modifiers (+HP, dash, volley) applied via enemy stats/AI params.
    - On elite death (hook in `apps/server/src/lib/systems/EnemyDeathSystem.ts`), spawn an Elite chest entity and apply guaranteed rare/currency bundle reward logic.

- Server: risk chest hazards
  - Extend chest entity state (no schema change required) with `risk: true` when designated.
  - In `GameRoom.handleOpenChest` (already exists), if `risk`:
    - Broadcast a short hazard preview (red ring) to clients; after ~400ms, spawn 6 enemies in a ring at ~160px from opener.
    - Keep rewards ≈ 2× small chest value with +15% upgrade chance.

- Server: bounty rotation and validation
  - Add a lightweight bounty scheduler in `GameRoom`:
    - Every 45–60s, pick one bounty with 45–60s duration; prefer feasible types based on current enemies.
    - Bounty types: cull-family, time-attack, no-hit window, streak sustain, shrine defense (spawn/destroy shrine entity near players), elite hunt when elite present.
    - Track progress server-side via existing kill hooks (`recordEnemyKill`), damage hooks (no-hit), current streak map (streak sustain), and simple proximity/HP checks (shrine defense).
    - On success: spawn a Small chest and set `bountyScoreBuffEndsAt = now + 30_000` (+10% score for 30s); on failure: none; auto-rotate.

- Server: streak multiplier and scoring
  - Maintain `streakByPlayerId` and `multiplierByPlayerId` in `GameRoom`:
    - +0.5× per 10 kills; decay if no kill for 3s; reset on player damage.
    - Apply multiplier when calling `queueScoreDelta` in `awardXpForEnemyDefeat` (and scale coin drop quantities in `spawnEnemyDrop`).
  - Add damage hook (player took damage) to reset streak: integrate in `EnemySystem.performEnemyMeleeAttack` and other damage paths.

- Server: extraction vs finale
  - At ~3–4 minutes (`arenaDecisionAt`), broadcast a decision prompt.
  - On extract: finalize and bank current loot.
  - On finale: set `finaleActive = true` for ~20s, temporarily increase spawn pressure (extra surge), then spawn a Finale chest on success.

- Server: constants and feature flag
  - Centralize arena defaults in `apps/server/src/lib/constants.ts` (cycles, caps, projectile caps, bounty timing, streak rules, hazard ring radius, elite frequency/limit).
  - Toggle via per-room option or `ARENA_MODE_ENABLED` env; when enabled, override `TIMED_SPAWN` with arena params while preserving existing guards.

- Client (Phaser + React HUD)
  - `apps/client/src/app/initPhaser.ts` and `apps/client/src/game/GameScene.ts`:
    - Handle new messages: `arena:cycle`, `bounty:start`, `bounty:update`, `bounty:complete`, `hazard:preview`, `finale:start|end`, `arena:decision`.
    - Draw hazard preview ring ~400ms before hazard spawns; reduce non-critical VFX opacity during surges.
  - `apps/client/src/components/GameHUD.tsx`:
    - Add a narrow event strip (build/surge/recovery) with short timers.
    - Add a compact bounty pill with progress and timer.
    - Add a streak multiplier indicator; small on-kill popup scaled by current multiplier.
    - Add extraction/finale prompt UI with buffered confirm/cancel.

- Data/DB and telemetry
  - Reuse `chest_opens` for chest rewards; add lightweight logs for bounties and elites (new tables `bounty_events`, `elite_kills`) if desired.
  - Track metrics: run length, kills/min, average streak, bounty completion rate, elite kill rate, % time in surge, offscreen vs onscreen damage, burst windows.

- Rollout and safety
  - Ship behind `ARENA_MODE_ENABLED` and a per-room option; default off.
  - Keep existing dungeon/treasure flow unaffected when arena mode disabled.
  - Include simple admin toggle to force cycle state for testing.
