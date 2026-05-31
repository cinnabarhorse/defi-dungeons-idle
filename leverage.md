## Leverage – design analysis (current thoughts)

### What Leverage is

- **Dial**: Player-chosen risk/reward multiplier, default 1x, up to 10x max.
- **Scope**: Party-wide; one value applies to everyone in the room.
- **Locking**:
  - **Per room**: Can be set once (no increases or decreases after first enemy engagement).
  - **Per floor add-on**: Stani offers an additional one-time floor-level boost; Stani disappears after that single interaction whether or not the player takes Leverage.

Suggested stacking model for clarity and control:

- Let `F` = floor-level Leverage from Stani (chosen once per floor).
- Let `R` = room-level Leverage (chosen once per room, e.g., at entry).
- **Total L** used for calculations: `L = clamp(F + R, 1, 10)`.
  - Intuition: Stani establishes the baseline for the floor; each room can push higher, but the absolute cap is still 10x.

### What Leverage affects

- **Archetype trait**: Multiply the archetype’s streak-based trait by `L` (as-is). This means whatever the archetype levels—damage, attack speed, crit, movement, evade, DR, life steal, magic/potion find—scales by `L`.
- For Shadowknight specifically: only `life_steal` is bumped by `L`; Leverage does not directly increase base damage.
- **Score**: Multiply score-per-kill and other combat-earned score by `L` at the time points are granted.
- **Incoming damage**: Multiply final damage taken by `L` at the last stage (after armor, evasion rolls, etc.). This preserves real risk at high L regardless of mitigation stacking.

Notes on application order:

- Applying `L` to incoming damage last prevents defensive archetypes (e.g., percent damage reduction) from neutralizing the risk.
- Applying `L` to score at the moment of gain prevents retroactive exploits when changing rooms.

### Archetype interactions and exploit risks

Below: what happens if `L` scales the archetype’s streak-based trait, and mitigation ideas where needed.
Per your direction, v1 applies every archetype trait "as-is" under Leverage; notes below are risk callouts for future tuning, not current exclusions.

- **Warrior (damage_multiplier)**: High synergy with `L`; straightforward, risky-but-fair. No special issues.
- **Berserker (attack_speed)**: Streak computes a decreasing attack speed scalar with a minimum floor. `L` accelerates reaching that floor. Risk acceptable if the existing min scalar remains intact.
- **Assassin (critical)**: `L` drives higher crit chance quickly. Keep crit chance caps; consider boss-specific adjustments if burst becomes too spiky.
- **Ranger (attack_range)**: `L` hastens reaching the range cap. Ensure projectile lifetime and map geometry limits remain; otherwise kiting gets too safe.
- **Mage (mana_regen)**: `L` enables near-constant casting. If resource loops trivialize risk, gate extreme regen with diminishing returns at very high streak.
- **Rogue (evade)**: `L` quickly approaches the evade cap, making hits rare; when hits land, `L` also makes them brutal (post-mitigation). Likely okay but monitor: evade + high movement can nullify danger unless there are unavoidable threats (AOE, homing, ground effects).
- **Paladin (percent_damage_reduction)**: `L` accelerates DR to its cap, but final damage is multiplied by `L` after mitigation, so risk still rises meaningfully. Verify that unavoidable damage sources exist; otherwise Paladin may feel safest at high L.
- **Shadowknight (life_steal)**: Per your confirmation, only the life steal trait increases with `L`; Leverage does not directly add base damage. Risk: sustain may become very strong at high `L`; if needed later, consider partial scaling or applying life steal before the incoming-damage multiplier to keep risk meaningful.
- **Guardian (hp_regen)**: Similar sustain risk; consider excluding regen from `L` or soft-capping regen’s contribution as streak rises.
- **Scout (movement_speed)**: `L` speeds up mobility; can turn many threats into non-threats. Keep speed caps and ensure some enemy kits close distance or deny space.
- **Bard (magic_find)** and **Farmer (potion_coin_find)**: These scale with `L` as-is for v1. Risk: economy inflation; we can later shift emphasis to the score-based loot bias and reduce their leverage sensitivity if needed.
- **Enchanter, Warlock, Necromancer, Shaman (TBD or none)**: No current issues; revisit once traits land.

Implementation baseline (per your direction): **apply Leverage to archetypes as-is**. Keep incoming damage multiplied by `L` post-mitigation and the party-wide single-value rules for room/floor. We’ll monitor telemetry and adjust individual traits if outliers emerge.

### Score → loot quality bias (boss chest)

Goal: Higher score should shift post-boss loot toward better tiers without guaranteeing top rarity.

Simple, tunable mapping (examples):

- Compute a score bias: `bias = clamp(k · ln(1 + score / S0), 0, biasCap)`
  - Start points: `k ≈ 0.6`, `S0 ≈ median clear score at L=1 for the floor`, `biasCap ≈ 1.25`.
- Reweight rarity tiers `w_i` toward higher tiers: `w'_i = w_i · (1 + bias · ((i - 1) / (N - 1)))`, then renormalize.
- Optional: small quantity kicker at high `bias` (e.g., up to +5%) so high-L runs feel juicier without flooding the economy.

This produces diminishing returns at extreme scores and avoids hard walls while still rewarding high-risk play.

### Preventing infinite farming per floor (without a hard floor cap)

Tools that work well together:

- **Spawn budgets per room**: Each room has a finite enemy budget keyed to its tier and layout. Once depleted, spawners fall back to trickle or shut off.
- **Per-enemy-type diminishing score**: Past an expected count for that room, score from that type in that room decays sharply (resets in a new room). This keeps total floor score uncapped while blocking local loops.
- **Room progression bonus**: Add a forward-progress multiplier that fades if the party lingers too long in the same room. Encourages pushing deeper for more score-per-kill.
- **Respawn lockouts**: Prevent backtracking farms by marking cleared rooms “cold” for a period or until new events occur.
- **Anti-cheese detectors**: Detect repeated kills at the same coordinates/patterns and taper score gains there.
- **Hazard escalation**: A soft “corruption” that ramps ambient threats the longer a room is farmed, increasing risk faster than reward.
- **Time gating for eligibility**: Use the existing `scoreEligible` flag to exclude obviously farmed segments from high-score submissions (e.g., extreme time spent with little progression), without altering the player’s visible score mid-run.
- **Boss pull-forward**: If farming persists, pre-trigger boss or miniboss events that force movement and reset spawns.
- **Final boss scales with run length**: Increase boss HP/damage/mechanics based on total run duration and/or time-on-floor. Telegraph this clearly and cap the scaling to protect normal runs.
- **Nullify on boss death**: If the party dies to the scaled boss, mark the run as null (no score submission). This creates strong anti-farm pressure without hard-capping visible score.

These avoid a hard numeric cap while making infinite loops unprofitable or too dangerous.

### UX and flow

- **Stani interaction**: A single floor-level decision; Stani vanishes after that first interaction. UI should preview how `L` affects outgoing power, incoming damage, and score. Make clear that Stani’s choice stacks with per-room choices but never exceeds 10x.
- **Room choice**: A once-per-room prompt (or altar/pedestal) before combat begins. Lock the choice on first enemy engagement.
- **HUD**: Show current `L` with a small badge so the risk state is always visible to the party.

### Telemetry to watch while tuning

- Distribution of `F` and `R` choices; deaths by `L`; boss kill rate at `L`; time-in-room vs score rate; loot tiers vs score.
- Sustain-heavy archetypes at high `L` (Shadowknight, Guardian) and evasion builds (Rogue) for survivability outliers.

### Bottom line

- The mechanic fits the game well: clear agency, high drama, strong replayability. The biggest risks (infinite farm and sustain builds) are manageable by: applying `L` post-mitigation for incoming damage, restricting `L` to offensive outputs, and using room-local anti-farm pressure rather than hard floor caps.

### Implementation plan (server + client)

#### 1) Data model and room lifecycle

- Add leverage state to the room (party-wide):
  - `floorLeverage` (F, number, default 1)
  - `roomLeverage` (R, number, default 1)
  - `leverageTotal` (L = clamp(F + R, 1, 10))
  - `floorLeverageLocked` (boolean)
  - `roomLeverageLocked` (boolean)
  - `floorLeverageSetAt` and `roomLeverageSetAt` (timestamps)
  - `staniActive` (boolean per floor; true until first interaction, then false)
- Reset behavior:
  - On new game or new floor: set `F=1`, `R=1`, unlock both, `staniActive=true`.
  - On entering a new room: set `R=1`, unlock `roomLeverageLocked=false` until first enemy engagement or a short timeout.

Server-facing files/areas:

- `apps/server/src/rooms/GameRoom.ts` (room fields + lifecycle resets)
- `apps/server/src/schemas/index.ts` (expose minimal leverage state to clients)

#### 2) Setting Leverage (networking and rules)

- New messages (add to `apps/server/src/types/messages.ts`):
  - `leverage:state` → broadcast current `{ F, R, L, floorLocked, roomLocked }` to all clients when it changes, and periodically on join.
  - `leverage:set_floor` (host-only) → payload `{ value: number }`; allowed once per floor if `!floorLeverageLocked`. On success: set F, lock floor, despawn Stani.
  - `leverage:set_room` (host-only) → payload `{ value: number }`; allowed once per room before combat if `!roomLeverageLocked`. On first enemy engagement or timeout, lock.
  - Optional errors/acks: `leverage:error`, `leverage:ack`.
- Lock triggers:
  - Room-level locks on first combat event (first projectile hit or melee hit) or N seconds after room spawn.
  - Floor-level locks immediately after Stani interaction (regardless of selection) and Stani despawns.

Server-facing files/areas:

- `GameRoom.ts` → handle inbound `leverage:set_*`, broadcast `leverage:state`, lock on first combat.
- NPC/interaction flow for Stani (wherever current floor NPC interactions are processed) → invoke `leverage:set_floor` server logic.

#### 3) Applying Leverage to gameplay

- Outgoing power (archetype streak):
  - Compute `L` once per tick for each session: `L = clamp(F + R, 1, 10)`.
  - Pass `L` into kill streak modifier calculation and apply it to the archetype trait “as-is”. Shadowknight only levels life_steal, so only LS is increased; no direct base damage bump comes from Leverage for that archetype.
  - Implementation:
    - `apps/server/src/lib/progression/killStreak.ts` → update `computeKillStreakModifiers(archetypeId, units, leverage=1)`:
      - For additive traits (`damage_multiplier`, `movement_speed`, `mana_regen`, `attack_range`, `magic_find`, `potion_coin_find`, `hp_regen`, `life_steal`, `critical`, `evade`): multiply the computed additive bonus by `leverage` before capping.
      - For `attack_speed`: treat `effectiveUnits = units * leverage` within the existing exponential to reach the min scalar faster; respect existing caps.
      - For `percent_damage_reduction`: multiply the additive by `leverage` but clamp to the existing `MAX_ARMOR_PERCENT`.
    - Ensure `syncPlayerCharacterStats` in `apps/server/src/lib/player-stats.ts` receives the updated kill streak modifiers via the existing flow.
- Incoming damage (risk):
  - Apply `L` to damage the player takes at the last stage (after mitigation).
    - Central points:
      - `apps/server/src/lib/player-stats.ts` → keep `calculateDamageAfterMitigation()` as-is; apply `Math.round(finalDamage * L)` at call sites.
      - `apps/server/src/lib/systems/ProjectileSystem.ts` and `apps/server/src/lib/systems/EnemySystem.ts` → multiply the returned `finalDamage` by `L` when damaging a player.
    - Keep normal clamping and death handling unchanged.
- Score gain:
  - Multiply score deltas by `L` at the moment they are awarded.
    - In `apps/server/src/rooms/GameRoom.ts`, wherever `queueScoreDelta(sessionId, amount)` is called, pass `amount * L` instead.
  - Score should not retroactively change if `L` changes later.

#### 4) Stani NPC (floor-level Leverage)

- Interaction UI: one-time dialogue presenting a slider 1x–10x and a confirm/cancel. Stani disappears after the first interaction (choice or pass).
- Client side:
  - `apps/client/src/components/DialogueBox.tsx` → add Stani branch that calls `leverage:set_floor` once, then disables further prompts for the floor.
  - On receipt of `leverage:state`, update local HUD.

#### 5) Room-level Leverage selection (pre-combat)

- Prompt host at room start (or via an altar/prompt) to choose R once, lock on first engagement or timeout.
- Client side:
  - `initPhaser.ts`/scene entry → if host and `!roomLeverageLocked`, show small modal slider; send `leverage:set_room` on confirm.
  - Reflect locked state in UI (read-only after lock).

#### 6) HUD and settings – display only

- `apps/client/src/components/MobileGameHUD.tsx` → show compact badge in the status bar (e.g., `Lx5`). Optional tooltip: `F+R→L`.
- Settings overlay: read-only line `Leverage: xL (Locked/Unlocked)`.

#### 7) Score → loot quality bias on boss kill

- Input: use the player’s (or party’s) final score for the run when rolling boss drops.
- Implementation path (source of truth is `/data/loot-table.ts` → generates server file):
  - In `/data/loot-table.ts`, add a function `getScoreWearableRarityMultipliers(score, tierId)` returning a rarity multiplier map using the bias formula `bias = clamp(k * ln(1 + score / S0), 0, cap)` and mapping it to `common..godlike` weights. Export it and merge with `getEliteWearableRarityMultipliers` when selecting boss wearables.
  - In `apps/server/src/data/loot-table.ts` (generated), modify `rollBossDrops(context)` to accept score (e.g., extend `EnemyDropContext` with `playerScore?: number`), combine difficulty-based and score-based rarity multipliers before selecting the wearable.
  - Keep currency logic; optionally apply a small tier upshift from `bias`.
- Thread `playerScore` into the boss drop call from the boss death pathway in `GameRoom.ts`.

#### 8) Anti-farming (without hard floor cap)

- Room-level spawn budgets:
  - In `apps/server/src/lib/systems/EnemySpawnSystem.ts`, add per-room enemy budgets and taper spawns after depletion.
- Diminishing score per enemy type per room:
  - Track kill counts per enemy type in the room; after an expected quota, scale score deltas by a decay factor (resets when entering a new room).
- Time/progression pressure:
  - Maintain/extend `scoreEligible` gating in `GameRoom.ts` for extreme edge cases.
- Boss pull-forward and hazard escalation:
  - If stalling, accelerate timed spawns or pre-trigger mini-events; increase ambient hazards.

#### 9) Boss difficulty scaling by run length + nullification on death

- Scaling trigger: when boss room is entered, compute `bossScale = 1 + g * ln(1 + (runDurationMs / T0))` with caps, and apply to boss HP/damage (and optionally mechanics) on spawn.
  - Apply via existing difficulty rescale paths or boss spawn code.
  - Files: `GameRoom.ts` (track run duration), `EnemySpawnSystem`/boss spawn path (apply `bossScale`).
- Nullify on boss death condition: if the party dies to the scaled boss (and boss not killed), mark the run as null (`scoreEligible=false`) before finalization.

#### 10) Telemetry and persistence

- Record `F`, `R`, `L` per floor and room; lock timings; who set them.
- Persist final `L` and score in run metadata for post-run analysis.
- Extend score submissions to include eligibility reasons when nullified (e.g., boss death under scaling).

#### 11) Configuration and tuning knobs

- ENV or config constants:
- `LEVERAGE_ENABLED`, `LEVERAGE_MAX` (default 50), `LEVERAGE_ROOM_TIMEOUT_MS`.
  - Boss scaling: `BOSS_SCALE_GROWTH`, `BOSS_SCALE_T0_MS`, `BOSS_SCALE_CAP`.
  - Score bias: `SCORE_BIAS_K`, `SCORE_BIAS_S0_BY_FLOOR`, `SCORE_BIAS_CAP`.
- Expose safe defaults; wire to admin/QA toggles where helpful.

#### 12) QA checklist

- Verify locking rules (cannot change after engagement; Stani disappears after first interaction).
- Confirm L affects: archetype streak outputs, score deltas, incoming damage post-mitigation.
- Shadowknight: confirm only life steal trait rises with L; no extra base damage beyond other sources.
- Boss loot rarity visibly improves with higher scores; economy remains stable.
- Anti-farm: stalling yields lower score rate and/or higher risk; boss scaling + nullify works and is clearly telegraphed.
