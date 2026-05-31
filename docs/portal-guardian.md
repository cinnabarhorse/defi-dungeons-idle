## Portal Guardian Overhaul — Open Questions

### Goals (per request)

- Spawn exactly one Portal Guardian (PG) on map 25-40 seconds after the match begins.
- Player objective: find and kill the PG.
- Killing the PG spawns two portals directly next to the PG:
  - One portal → Treasure room
  - One portal → Harder version of the dungeon
- HUD shows a quest: "Find the Portal Guardian".

### Spawning and Placement

- Where should the PG spawn?
  - Random safe location anywhere on the map?
  - Weighted toward specific chunk types or away from player spawn?
  - Minimum distance from any player on spawn (e.g., ≥ 600 px)?
- Should PG spawn be delayed until at least one player moves X distance/time, or immediately at room start?
- Fog-of-War interaction: should PG be hidden by FoW as usual, or special rules (e.g., slightly larger visibility radius around PG)?
- If the map generator produces unreachable pockets, should we respawn/relocate PG automatically if its tile is unreachable from any player?

### PG Behavior and Balance

- Target stats: health, damage, aggro range, speed, special attacks? Keep current baseline or adjust for its boss role?
- Leashing: should PG be leashed to a radius around its spawn (prevent kiting across the whole map)?
- Multi-target aggro: should PG prioritize the highest DPS, nearest, or the last hitter?
- Rewards: should PG drop guaranteed loot in addition to opening the portals? If so, what items/amounts?

### Portal Spawn After PG Death

- Positioning: "directly next to the PG" — how close should portals appear? e.g., ±96–128 px offset to the left/right?
- Collision/safety: if immediate neighbors are blocked, may portals spiral-search nearby safe tiles? Max search radius?
- Visual differentiation: do the two portals need distinct art/colors to indicate destination (Treasure vs Harder)? If yes, which art maps to which?
- Lifetime: do portals persist indefinitely until used, or should they despawn after a timer (e.g., 60s)? Do they disappear after use by one player or after the first use by the party?

### Deterministic Outcomes and Difficulty Step

- Mapping: which portal is Treasure vs Harder? Fixed (e.g., left=Treasure, right=Harder) or randomized per run?
- "Harder version" definition: increase difficulty by exactly one tier (e.g., normal_1 → normal_2 → …), or jump more than one tier?
- Cap behavior at top tier (beyond_hell): if already at max, should the Harder portal keep you at max, be disabled, or convert to Treasure?
- Unlock rules: can the Harder portal skip progression prerequisites (tongue/difficulty unlocks), or should it respect unlock eligibility?

### Multiplayer and Room Transitions

- Scope of teleportation: when a player uses a portal, should the entire room transition or only that player? If only one, do others see the portal persist for their own use?
- Sync behavior: if multiple players choose different portals near-simultaneously, which outcome wins? Tie-break rule?
- Post-teleport: should the unused portal auto-close immediately after a transition, or remain for latecomers for N seconds?
- New map behavior: should each new dungeon map also spawn a fresh PG (loopable objective), or is the PG a one-time objective per run?

### HUD Quest and UX

- Quest text placement: where in the HUD should "Find the Portal Guardian" live? Replace existing PG diagnostics or show both?
- Quest state transitions: after discovery/killing PG, should the quest update to "Defeat the Portal Guardian" → "Choose your path" → clear after portal use?
- Directional hints: do we surface soft pointers (e.g., minimal arrow, distance hint) or keep discovery purely exploratory?
- Audio/visual cues: spawn chime when PG appears; special death animation; portal opening SFX; HUD banner/toast copy approval?

### Anti-cheat and Authority

- Confirm: all PG logic (spawn, portals, interactions) remains fully server-authoritative; client only renders and requests interactions.
- Interaction guardrails: minimum distance to interact (e.g., 100 px), rate limiting, and server path validity checks okay?

### Edge Cases and Failure Modes

- If PG dies on an obstacle edge or near map bounds, is it acceptable for portals to adjust within a search radius up to X px?
- If no safe spot is found within the radius, should we fall back to fixed offsets (e.g., near center) or re-roll placement?
- Reconnection/late joiners: if they join after PG is killed, should they see portals immediately, or should a new PG spawn for them?

### Telemetry and Economy

- Events to capture: pg_spawned, pg_killed, portals_opened, portal_used (with destination), new_map_entered, treasure_room_entered.
- Rewards in Treasure room: confirm payout rules are unchanged; any additional bonus for killing PG?

### Content/Art

- Portal art mapping: which visual corresponds to Treasure vs Harder? Should we rename from OG/Alpha/FOMO to explicit labels?
- Scale: keep 2.0x scale for portals and PG for readability, or adjust?

### Acceptance Criteria (to confirm)

- Exactly one PG spawns at initial map load, server-authoritative, in a reachable location.
- On PG death, exactly two portals spawn near the death point; one always leads to Treasure, the other always leads to a harder tier.
- Entering a portal triggers the intended destination consistently (no randomness) and handles multiplayer deterministically.
- HUD shows a clear quest "Find the Portal Guardian" with sensible state transitions.
- Telemetry is emitted for major actions.

### Proposed decisions and enhancements (recommended defaults)

- Spawning & placement
  - Spawn PG after either 25s elapsed or once any player traverses ≥ 2 chunks; whichever comes first.
  - Weight spawn toward mid-map connectors and away from player spawn; enforce ≥ 600 px from any player.
  - Validate reachability server-side; if unreachable, re-roll up to 5x then relocate to nearest reachable safe tile.

- Behavior & balance
  - Leash radius 900 px; out-of-leash for 3s triggers reset and 3%/s regen until re-engaged.
  - Boss kit adds 2 random affixes (from a curated boss pool) and a stagger/break bar for counterplay.

- Discovery & pressure
  - Soft cues: low hum/SFX within 1200 px; faint screen vignette intensifies as you near the PG.
  - Threat meter starts on PG spawn; thresholds: 20 (elite rate +10%), 40 (hazards enabled), 60 (blood moon: +projectiles, +speed). No hard fail; pressure escalates spawns/affixes.

- Portals on death
  - Placement: attempt ±128 px horizontal offsets; spiral-search safe tiles up to 256 px.
  - Visuals: Gold = Treasure, Crimson = Harder; distinct VFX/SFX.
  - Lifetime: 90s total; first interaction starts a 10s grace window where both portals remain before despawning.
  - Mapping: fixed for clarity — Left/Gold → Treasure, Right/Crimson → Harder.

- Harder path definition
  - Increase difficulty by +1 tier and roll 1 global dungeon modifier (e.g., Double Elites, Low Light, Arcane Storm).
  - At max tier, convert Harder to Elite Treasure (better loot with a mini-gauntlet) or Boss Rush, configurable per season.
  - Respect unlock prerequisites; show a "Sealed" state if not eligible.

- Treasure path spice
  - 30–45s micro-challenge room (traps/mimics/waves) to gate payout; clear times add a small bonus.

- Multiplayer flow
  - Room-wide transition: first portal interaction triggers a 3s countdown with a clear HUD banner; whole party transfers together to the chosen destination.
  - During countdown, stepping into the same portal grants a small party bonus; stepping into the other portal only provides a UI hint — outcome remains the first choice to avoid splits.

- Looping behavior
  - Each new dungeon map spawns a fresh PG to maintain the objective loop.

- Telemetry additions
  - pg_found (first discovery), threat_threshold_entered (20/40/60), portal_chosen (treasure|harder), party_transitioned, treasure_challenge_cleared.

- Anti-cheat
  - Keep spawn, leash, death detection, portal spawn, interactions, countdown, and transitions fully server-authoritative.

Please annotate any decisions inline; I’ll implement accordingly.

### Implementation Plan (exact planned changes)

1. Server — Portal Guardian spawn timing (25–40s after match start)

- File: `apps/server/src/rooms/GameRoom.ts`
  - Add helper `private schedulePortalGuardianSpawn(minMs = 25000, maxMs = 40000)` that:
    - Clears any previous PG timer
    - Schedules a `setTimeout` with a random delay in [minMs, maxMs]
    - On fire: if phase is `in_game` and no PG exists, call `this.spawnEnemyOfType('portal_guardian')` and `this.broadcast('portal_guardian_spawned', ...)`
  - Invoke `schedulePortalGuardianSpawn()` when the run transitions to `in_game` (inside `setPhase(..., nextPhase === 'in_game')`) and once after dungeon population if already in-game.
  - Optional (if we adopt the movement gate): wire a light-weight movement listener that, upon any player travelling ≥ 2 chunks-equivalent distance since start, fast-forwards the timer to spawn immediately (no schema changes; purely server-side counters).

2. Server — Remove chance-based PG spawning on kills

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - Delete the per-kill PG unlock/threshold/chance logic.
  - Keep general kill metrics and normal follow-up enemy spawn.

3. Server — Spawn two deterministic portals near PG death

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - Implement `spawnPortalsAfterGuardianDeath(room, originX, originY)` to:
    - Attempt ±128 px horizontal offsets from `(originX, originY)` (use spiral safe-tile search up to 256 px)
    - Spawn exactly two entities of kind `portal` with `state`: `{ portalType: 'og'|'alpha', destination: 'treasure_room'|'new_map', interactionRadius: 40, indestructible: true }`
    - Broadcast `portals_opened` with `portalCount: 2`

4. Server — Deterministic portal interaction

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - In `handlePortalInteraction(...)`:
    - Parse `destination` from entity state; if `treasure_room` → call `transitionAllPlayersToTreasureRoom(room)`
    - If `new_map` → compute next tier via `DIFFICULTY_TIER_SEQUENCE` (+1 step, clamped) and call `transitionAllPlayersToNewMap(room, nextTier)`
    - Broadcast `portal_used` with `{ portalType, destination, usedBy }`
  - No randomness; server-authoritative distance check (100 px).

5. Server — Telemetry hooks (non-blocking)

- File: `apps/server/src/rooms/GameRoom.ts` and `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - Emit events via `GameRoomApi` if available: `pg_spawned`, `pg_killed`, `portals_opened`, `portal_used (destination)`, `treasure_room_entered`, `new_map_entered`.

6. Client — HUD quest copy and state

- File: `apps/client/src/components/GameHUD.tsx`
  - Replace the old PG diagnostics cluster with a quest chip: `Quest: Find the Portal Guardian`
  - When `portal_guardian_spawned` is received (already wired in `initPhaser.ts`), update copy to `Quest: Defeat the Portal Guardian`
  - When `portals_opened` is received, update copy to `Quest: Choose your path`
  - Keep styling consistent with existing HUD chips; mobile HUD mirrors the same copy in `MobileGameHUD.tsx`.

- File: `apps/client/src/app/initPhaser.ts`
  - Reuse existing `onMessage('portal_guardian_spawned'| 'portals_opened')` handlers to update a lightweight quest state in React via existing setters (no schema additions required).

7. Client — Portal visuals (no art changes required)

- Files: `apps/client/src/lib/portal-sprite-manager.ts`, `apps/client/src/lib/portal-sprite-config.ts`
  - Ensure two portals render correctly; no code changes unless we later map gold/crimson variants.

8. Configurables (constants)

- File: `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - Offsets: ±128 px; search radius: up to 256 px; collision radii as currently coded.
- File: `apps/server/src/rooms/GameRoom.ts`
  - Spawn delay window: 25–40s; expose as top-level constants for tuning.

9. Backward-compatibility and cleanup

- Leave server state fields `pgSpawnChancePercent`, `pgThresholdKills`, `pgKillsUntilChance` unused; do not remove schema fields to avoid migrations. Client HUD stops rendering these diagnostics.

10. QA checklist

- On entering `in_game`, PG spawns between 25–40s; toasts/HUD quest update appear.
- Killing PG spawns 2 portals near the corpse; interactions are deterministic.
- Taking Treasure portal moves the room to the treasure room; the other portal moves to next difficulty tier.
- Mobile and desktop HUDs show correct quest text transitions.

11. Rollout

- Deploy server first (harmless to current clients; HUD shows quest text once client updates).
- Deploy client with HUD changes next.
