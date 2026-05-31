## Portal Spawning and Boss Room Selection

### Goal

Introduce two portals on every floor: one to proceed to the next floor and one to enter a dedicated Boss room. Players choose which portal to use. Portals spawn at random valid locations on the floor.

### Motivation

- Replace the 30s `Portal Guardian` gate with player-driven routing choices.
- Increase tactical variety: risk/reward (boss first vs. rushing the next floor).
- Enable clearer progression hooks for rewards, scoring, and difficulty.

## Player Flow (High-Level)

1. Player enters a floor.
2. Two portals exist (or appear per gating rules):
   - Next Floor Portal
   - Boss Room Portal
3. Player discovers and interacts with either portal.
4. If Next Floor Portal: transition to next floor as today (no boss).
5. If Boss Room Portal: load boss encounter map; upon victory, resolve rewards and transition (see rules below).

## Core Rules (Initial Proposal)

- Exactly two portals per standard floor: `next_floor` and `boss_room`.
- Portals spawn on valid, walkable tiles with spacing constraints from spawn point, from each other, and from critical POIs.
- Portals are visible entities with distinct art/FX so players can tell them apart at a glance.
- Server-authoritative spawn and usage; client only renders and requests interaction.
- Boss room is a separate map/instance; victory yields rewards and determines return/forward routing.

## Spawning & Placement

- Spawn on floor creation on the server.
- Uniform random on walkable tiles, with constraints:
  - Minimum distance from player spawn.
  - Minimum distance between the two portals.
  - Avoid blocked/obstacle tiles and no-spawn zones.
  - Prefer open areas (configurable weight) to reduce unfair clustering.
- Optionally delay activation (vs. visibility) behind optional gates (kill count, timer, or objective).

## Visibility, UX, and Input

- Both portals are visible in-world with distinctive color/shape/FX.
- Optional minimap icons with unique symbols/colors.
- Clear, concise interact prompt (e.g., “Enter Next Floor” vs “Enter Boss Room”).
- Optional confirmation dialog before transition to avoid accidental use.

## Boss Room

- Separate map layout and encounter logic.
- Boss selection scaling with floor depth and difficulty tier.
- Camera/arena boundaries defined; no backtracking mid-fight.
- Rewards and exits:
  - Victory -> Reward grant -> Route either back to current floor exit area or directly to the next floor (configurable).
  - Defeat -> Run ends or fallback behavior per current rules.

  COMMENT: No, defeating the boss ends the run. It leads to the Treasure Room.

## Networking and Authority

- Server computes and broadcasts portal types and positions with the floor state.
- Client requests portal use; server validates proximity, state, and transitions the player.
- Prevent race conditions in co-op: a portal use can be single-use or multi-use, configurable.

## Migration From Current System

- Replace `Portal Guardian` 30s spawn gate with portal spawning at floor init, unless we preserve an activation gate.
- Re-map any treasure room logic to boss rewards or keep treasure rooms as a separate system (decision needed).
- Update UI/tooltips/tutorial text to reflect the new flow.

## Implementation Outline (High-Level)

### Data & Types

- Add `PortalType` with `next_floor` and `boss_room`.
- Add a `Portal` interface: id, type, position, isActive, visibility, FX id.
- Extend floor state payload to include an array of portals.

### Server (Authoritative)

- On floor generation, sample two valid positions and create portal entities.
- Persist portal state in the floor state; broadcast to joining players.
- Validate interaction requests; perform transition:
  - `next_floor`: load/generate next floor; spawn player(s).
  - `boss_room`: load boss instance; spawn player(s) into arena.
- Handle post-boss routing and rewards server-side.
- Telemetry: record spawn seeds, chosen portal, time-to-choice, outcomes.

### Client

- Render two portal entities with distinct art/FX and labels.
- Show interaction prompt and optional confirmation.
- Minimap icons for portals (optional, configurable).
- Subtle screen-space indicator when portal is off-screen (optional).

### Content

- Create/assign sprites, VFX, SFX for `next_floor` and `boss_room` portals.
- Boss room maps and encounter scripts (reuse existing where possible).

### QA & Testing

- Unit: portal placement validator (tile validity, spacing), boss routing function.
- Integration: join floor -> see two portals -> use each path -> confirm transitions and rewards.
- E2E soak: random seeds across many floors ensure distribution and no softlocks.

## Open Questions to Confirm

1. Should portals be visible immediately on floor load, or only become active/usable after a condition (timer, kill count, objective)? If gated, is visibility also gated?

Yes, immediately visible once found.

2. Do we fully remove the `Portal Guardian` flow, or keep it as an optional gate (e.g., portals only activate after guardian is defeated)?

You can keep the flow for now. But killing the portal guardian doesnt do anything, he's just another Elite.

3. Does the treasure room still exist as a concept? If yes, how is it reached now (boss victory, rare portal variant, or separate trigger)?

Yes, the treasury room comes after killing the BOss.

4. After defeating the boss, where does the player go: back to the current floor (near a safe exit), directly to the next floor, or to a dedicated reward/treasure room?

To the treasure room.

5. Is the `boss_room` portal always present on every floor, or only from a certain floor depth/difficulty tier?

Let's say that the boss portal only begins on the 3rd floor. So you have to clear two floors before it.

6. Are both portals always usable, or can one be disabled based on run modifiers or events?

Always usable.

7. Portal spawn constraints: minimum distance from player spawn, from each other, and from major POIs. What specific distances do you want (in tiles)?

1-2 rooms away at a minimum.

8. Should portal placement favor open spaces (weighted sampling) or be uniformly random among valid tiles?

Either is fine.

9. Any no-spawn zones (e.g., not inside narrow corridors, dead-ends, or locked rooms)?

No corridors / connectors or special rooms, only room-base.

10. Fog of War: should portals be revealed through fog, or discovered only when explored? Should minimap show them when unseen?

Discovered only when explored.

11. Interaction UX: require a press-and-hold, or a single press with confirmation dialog? Do we want an “Are you sure?” for boss entry only, or for both portals?

Walking up to the portal should show the name of the portal or a text such as "Next floor" or "Fight boss".

12. Co-op behavior: if one player uses a portal, do all party members get pulled, offered a vote/UI, or remain on the floor? Is there a countdown sync?

Yes they get pulled.

13. Are portals single-use (consume after use) or persistent for a period? If persistent, do we allow returning (e.g., from boss back to floor) or is it one-way?

Good question. Probably not possible to return.

14. Boss selection rules: per-floor boss pool, scaling by floor depth; any exclusions or special floors?
15. Boss rewards: specific drops, XP multipliers, currency. Any guaranteed drops or pity rules?
16. Scoring: how should boss clears vs. skipping impact leaderboard score? Multipliers by depth/time?
17. Timers: does the floor timer still matter (e.g., speed bonus)? Any time-based penalties for boss fights?

Yes it does. The boss gets harder the longer your run goes.

18. Death handling: on boss defeat or player death, do we end the run, respawn, or allow retries?

On boss run you can enter the treasure room.

19. Audio/FX direction: preferred color/theme for `next_floor` vs. `boss_room` portals; any existing assets to reuse?
20. Minimap: distinct icons/colors for the two portals? Always visible or only after discovery?
21. Accessibility: colorblind-friendly patterns for portal differentiation?
22. Performance: any limits on FX/particles for portal visuals on low-end devices?
23. Telemetry: which events do you want tracked (portal seen, first seen time, used, boss outcome, reward summary)?
24. Back-compat: do we need a feature flag to roll this out gradually (e.g., only on certain queues or seeds)?
25. Admin/debug tools: commands to force-spawn portals, lock/unlock usage, or jump to boss room for testing?

## Acceptance Criteria (to be finalized after answers)

- Two distinct portals are present per floor with clear visuals and labels.
- Server-authoritative placement and usage; no client-only transitions.
- Players can choose either portal; transitions are stable and deterministic.
- Boss encounter loads reliably; rewards and routing align with design.
- Minimap and UI accurately reflect portal states and destinations (if enabled).
- Telemetry collected for portal discovery/usage and boss outcomes.

## References

- Related: `timed-spawn.md`, `fog-of-war.md`, `minimap.md`, `floor-chunk-virtualization.md`, `ATTACK_SYSTEMS.md`.
