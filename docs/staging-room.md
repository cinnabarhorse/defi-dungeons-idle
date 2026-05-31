## Staging Room – Clarifying Questions

### Implementation Summary

- Added explicit room phases (`staging` → `countdown` → `in_game`/`ended`) persisted on `games` via migration `20250928_000020_staging_room_phase.sql`, including timestamps for countdown start, run start, late-join cutoff, auto-close deadline, and the player who triggered the portal.
- Server now enforces staging logic in `GameRoom`: credit charge/refund queue, 15-minute inactivity auto-close with refunds, 3-second countdown on portal interaction, one-minute late-join window, 10-second post-start invulnerability, and deterministic staging spawn points.
- Late join requests after the window are rejected; disconnects before start issue automatic refunds. New Colyseus messages (`staging_countdown`, `staging_run_started`, `staging_cancelled`, `staging_auto_close`, `late_join_closed`) keep clients in sync.
- Client HUD (desktop & mobile) surfaces staging status: player count panel shows "Enter portal" CTA, countdown timer, and auto-refund timer; a bottom overlay guides players. Screen fade plays on teleport transition.
- A minimal staging layout now loads during room creation (portal, spawn pads, fixed NPC trio) while enemies/NPCs spawn only after the run begins.
- Type-checks: `pnpm --filter @gotchiverse/server type-check` and `pnpm --filter @gotchiverse/client type-check`.


### High-Level Goals

- What are the primary goals for the staging room beyond coordinating player arrival (e.g., teach controls, show tips, lore, cosmetic showcase)?

Yes, I think we can put a few NPCs in the staging room for people to talk to. I will also be designing it in a way that has some lore and cosmetics to show off.

But the main goal is just coordinating player arrivals.

- Should the staging room be a permanent part of every session or only certain modes/maps?

Currently we only have the dungeon mode, but in the future we might have more modes. However, I'm only worried about the dungeon mode for now.

- Is the staging flow intended for both public and private rooms or only public rooms?

Both public and private rooms.

### Flow and State Machine

- Should the room lifecycle be explicit states: `staging` → `in_game` → `post_game`? If so, are there other states we should support (e.g., `aborted`, `intermission`)?

Up to you.

- How should we persist the "room has started" state (memory-only, database field, cache)?

If you want to add it to the database, we can. It might be good to have a record.

- When the first portal entry occurs, do we immediately transition to `in_game` regardless of current player count, or should we wait for a minimum player threshold?

You don't need to wait for a minimum player threshold except for one. As long as there is one player in, then the game can begin.

- Should there be an optional auto-start after a timeout if nobody enters the portal?

If nobody enters the portal after a certain period of time, let's say 15 minutes. Then the run should be cancelled without charging the players.

- After transition to `in_game`, should we allow any player to join mid-run (late-join) into the main room indefinitely, or only until some cutoff (e.g., boss spawn)?

I would say we could have a one minute cutoff and once that one minute has passed, no new players can join. We don't need to show that cutoff on the UI though.

### Capacity and Admission

- Maximum players is 3. Before the game starts, what happens to the 4th+ player who attempts to join? Deny, queue, or create a new staging instance?

Just deny entry.

- If the room is already in `in_game`, anyone who joins should go straight to the main room. Should we also enforce the 3-player cap mid-run, or is late-join capped differently?

Yes, the three-player cap should be enforced at all times.

- If a player disconnects in staging (before start), do they retain their spot for a grace period? If so, how long?

They don't retain their spot. If they disconnect, the run should proceed without charging them.

- If the staging room is full and someone disconnects, should the next queued player be admitted automatically?

We don't have a queue system. We don't need to do that.

### Portal Mechanics

- Trigger: Should portal entry be a proximity-based interact (e.g., press `E`) or automatic on overlap?

Right now it's clicking on the portal. You can keep it that way for now.

- Should we display a confirm prompt (e.g., "Enter and start run now?"), or is a single action sufficient?

A single action is sufficient.

- Should there be multiple portals or exactly one? If multiple, do all of them initiate start, and do they lead to the same destination?

I think just one portal for now.

- After someone triggers the portal, do we play a short countdown (e.g., 3 seconds) to teleport all, or teleport instantly?

A countdown could be nice.

- Do we need a lock visual/animation change on the portal after start (non-returnable)?

I wouldn't worry about that for now.

### Late Joiners and Rejoins

- For players joining after start, should they spawn at the main room’s standard spawn point or a different entry point (e.g., near the portal’s destination)?

Standard spawn point.

- If a player reloads/disconnects after the transition, should rejoin place them in the main room automatically?

Yes. But I don't know if we're handling disconnects very gracefully right now. I'm not too worried about it yet.

- If a player attempts to navigate back to the staging map (via coordinates or manual URL), should we hard-block and force-spawn in main room?

It's not possible. and should not be possible.

### Level Design (Staging Room)

- Should the staging room be a single chunk or a small set of chunks? Any target dimensions?

Probably will be a single chunk.

- Are there specific assets (tiles/sprites) you want for the staging aesthetic (e.g., portal type, banners, signage, spawn pads)?

Yes, I will generate a chunk for the staging room.

- Should enemies, traps, or pickups exist in staging, or is it a safe zone only?

It's a safe zone only.

- Where should players spawn in staging (exact coordinates or region)? Should spawns be separated per player or on a shared pad?

I will add some spawn point in the chunk.

- Should we include tutorial UI elements, signage sprites, or NPCs in staging?

Yes, we should add some NPCs.

- Do you want any emote or ready-up pads as an alternative or in addition to the portal?

Nope. But there should be a chat.

- Should we author this layout via the existing map editor (`apps/client/src/app/map-editor/page.tsx`) and commit a new chunk set (e.g., `data/chunks-staging.ts`), or embed it within existing chunk files?

Yes, I will create a new chunk with the math editor.

### Transition to Main Room

- What exact main room instance should staging transition into (current default/main dungeon room)?

Yes, current default main dungeon room.

- What spawn point in the main room should be used for teleported players? One shared location or separate per player?

Yes, one shared location.

- Should we perform a brief cinematic/animation/screen fade during teleport?

Yes, I think we could that would be nice.

- Any buffs or temporary invulnerability upon arrival in the main room?

Maybe a 10 second invulnerability would be nice.

### Server Authority and Validation

- Where should the staging → in_game transition be enforced (authoritative server only)?

Yes, server only.

- Which server subsystem currently owns room lifecycle and should hold the canonical `hasStarted` flag?

I'm not sure. Please do some research.

- What events/messages should we reuse or add for: portal entered, room started, force-teleport all?

Up to you.

- Should we debounce/mutex-guard portal triggers to prevent double-start race conditions?

Sure, yes.

### Persistence and Data Model

- Do we need a persistent record of staging start times, start triggers, and participants?

It wouldn't be a bad idea to keep records of that.

- Should we store a `room_state` field (enum/map) and timestamps in the database?

Up to you. I'm leaning towards yes.

- Do we need to track who triggered the start for analytics/moderation?

Sure.

### UI/UX in Staging

- What on-screen copy do you want (e.g., "Waiting for players (1/3)", "Enter portal to begin")?

Yes, enter portal to begin.

- Show player count in staging (e.g., 2/3)?

Yes.

- Should there be a visible countdown if auto-start is enabled, or a status indicator once someone is in the portal?

A countdown would be nice.

- Any audio cues or music change in staging vs main room?

I will add in some music later.

### Edge Cases and Safeguards

- If two players try to enter the portal at nearly the same time, should only the first trigger the start, with others following via broadcast?

Yes.

- If the portal is triggered but a player disconnects in the same tick, should we still start and mark them as late-join on reconnect?

Yes.

- If the main room is temporarily unavailable (e.g., loading failure), should we cancel start and stay in staging, or retry with backoff?

Um, retry a few times and then just stay in staging.

- Should we block portal use if fewer than N players are present (N configurable), or is anyone allowed to start at any time?

The minimum threshold is 1.

### Performance and Limits

- Any budget constraints on the staging map (sprite count, animated effects, particle systems)?
  No.

- Any device-specific accommodations (mobile layout, low-end clients)?

Yes, everything is mobile specific, mobile layout.

### Telemetry and Moderation

- What events do you want logged: staging_enter, portal_interact, room_start, late_join, teleport_success/fail?

Up to you.

- Any admin tools needed to force-start, force-cancel, or move specific players?

Up to you.

### Testing and Rollout

- Acceptance criteria for manual QA (e.g., 1, 2, 3 players; late join; disconnect/reconnect)?
- Do you want an automated e2e test covering the staging flow with 1–3 players?
- Should we guard with a feature flag or environment variable for rollout?
- Any backwards-compat considerations for existing rooms or saved sessions?

### Naming and Configuration

- Preferred identifiers: room key for staging (e.g., `staging`), main room key to enter, and event names?
- Where should configuration live (server config file, DB settings, env var)?
- Should max players (3) be configurable per room/mode?

Yes.

### Art and Audio

- Which portal sprite/animation should we use? Existing asset or new art?
- Any specific VFX/SFX for portal activation, countdown, and teleport?

### Security / Anti-Cheat

- Should all teleport/start transitions be server-authorized with client-side inputs treated as requests only?

Yes. Always.

- Any additional validation on player position and interaction radius for portal entry?

Not right now.

### Final Notes

In the future we will have another public room. Try and reuse as much logic as you can from this staging room for that future public room. The public room will allow up to 100 players in it.
