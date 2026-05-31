## Join Room Flow – Questions for Confirmation

Please answer inline under each question (or mark N/A). Once clarified, I’ll implement the new flow.

### Goals and Scope

- **Single entry point**: Should the lobby show only one primary CTA labeled "Play now" with no secondary buttons (Create room, Join code, Debug) visible?

Yes, exactly.

- **Join by link only**: Are we fully deprecating manual join codes in the lobby in favor of shareable links?

Yes, the link that is generated can contain the room code, but I don't want a UI where the user needs to input the room code. It's too clunky.

- **Environment parity**: Apply across both desktop and mobile layouts of the `Lobby` component?

Yes.

### Matchmaking Behavior for "Play now"

- **Default behavior**: Should "Play now" create a new room or first try to join any available non-full public room?

It should always create a new room.

- **Capacity target**: What is the default max players per room? Is it dynamic by difficulty/region?

Right now it is 100, but I want to change it to 3 for the Dungeon Room.

- **Room selection policy**: If joining existing rooms, how are rooms prioritized (most players, least latency, newest, random, same difficulty)?

The only way to join an existing room is with a link.

- **Difficulty selection**: If difficulty tiers exist, how is difficulty chosen in the single-button flow (default tier, last used, random, auto-scale)?

We still need to show the difficulty selector. That is already on the UI.

- **Persistence of choice**: Should we remember last-used difficulty/character across sessions?

Yes, that would be great.

### Invite Link Generation (In-Room)

- **Who can generate**: Can any player in the room generate a link, or only the creator/host?

Good question. Probably only the host.

- **UI affordance**: Do you want a visible "Invite" button in the in-game HUD, a pause/menu panel, or both?

Let's put it directly on the HUD at the top of the HUD.

- **Copy behavior**: Should clicking "Generate link" immediately copy to clipboard and show a toast? Include a secondary "Show QR" option?

Yes, please copy it directly to the clipboard.

- **One link per room**: Is the invite link deterministic (same canonical link for the room) or per-request tokens that rotate?

It's the same canonical link for that room.

- **Expiration**: Should links expire when the room empties, after X minutes, or never until server restart?

Yes, the link should expire when the game is over or the room empties.

- **Revocation**: Should the room owner be able to revoke previously generated links?

No, that's not necessary.

### Invite Link Format and Routing

- **URL shape**: Preferred path? Examples: `/play/{roomId}` vs `/room/{roomId}` vs `/r/{shortId}`.

https://dungeons.aavegotchi.com/play?roomId={roomId}

- **Query vs path**: Any preference for path param vs query param (e.g., `?room=`)? We currently use `nuqs` for URL state.
- **Short IDs**: Do you want human-friendly short IDs (6–8 chars) instead of long UUIDs?

I want a human friendly short ID like six to eight characters.

- **Deep-linking**: Should the link also capture difficulty/region in the URL, or is room ID sufficient to imply all context?

Broom ID should be enough.

- **SEO**: Should these routes be noindex/nofollow?
  Sure.

### Joining via Link

- **Capacity check**: If the room is full, what’s the fallback (queue, auto-create a sibling room, show full message, redirect to Play now)?

If the room is full, just tell the user that there was an error joining the room and then push them back to the main menu.

- **Auto-create fallback**: If full, should we create a new room with the same settings and place the user there?

No.

- **Auth state**: If the user is not connected/authenticated, do we prompt connect first or allow guest join?

For the Dungeon room, we should force them to off first before allowing them to join.

- **Character selection timing**: Should we show character selection before joining, or join immediately and select in-room?

Probably best to show character selection before joining. After the user has authed.

- **Already in another room**: If a user clicks a link while in a different room, should we prompt to leave current room?

Yes, there could be a warning popup.

### Access Control and Privacy

- **Public vs private**: Are rooms public by default but unlisted unless you have the link?

Yes, exactly.

- **Invite enforcement**: Should invite links bypass any lobby matching and always force-join the specified room (capacity permitting)?

Yes, exactly.

- **Role restrictions**: Any role required to generate links (e.g., host only)? If so, who is host and how is host determined?

Only the host. The host is whoever created the room.

- **Ban/kick**: If a player is banned from a room, should their invite links stop working?

We don't need to support banning yet.

### Debug Tools Relocation

- **Placement**: Should the debug UI live in an in-game pause menu, developer-only hotkey, or an onscreen toggle?

Probably only the debug menu when we press B.

- **Availability**: Debug visible only in development builds, or also in production behind a flag/role?

Only in development builds.

- **Features**: Which current debug features must move over (spawn, god mode, teleport, perf overlays, logs, etc.)?

### Multi-Region and Latency

- **Region pinning**: Should invite links pin the room’s region so invitees join the same region even if it’s not their closest?

Yes, exactly.

- **Region migration**: If the original region becomes unavailable, should the link transparently route to a new region or fail closed?

No, just fail.

### Room Lifecycle and Persistence

- **Idle timeout**: Do rooms auto-close after X minutes of inactivity? If so, should links then 404 or auto-recreate?

Yes, room should stop automatically after inactivity. And the room links should be invalidated.

- **Server restarts**: After a deploy/restart, should links remain valid and map to re-created rooms, or become invalid?

invalid.

- **State carryover**: Should room state (difficulty, wave, seed) be preserved when players rejoin via the same link?

Yes, of course.

### Security

- **Tokenization**: Should the invite include a signed token that verifies room and expiry, or is a plain ID acceptable?

Just a plain idea is probably okay.

- **Abuse mitigation**: Any rate limits for generating links or joining by link?

No.

- **Visibility**: Any concerns about room enumeration; do we require non-guessable IDs?

Non-guessable IDs would be good.

### UI/UX Details

- **CTA text**: Confirm final label is exactly "Play Now" (capitalization/spaces)?

Yes.

- **Loading states**: Do you want a visible "Finding room…" / "Creating room…" state with cancel?

No.

- **Errors**: Standardized toasts for errors (room full, invalid link, expired, network)? Any custom copy?

Whatever is intuitive and default.

- **Mobile specifics**: Any differences for the mobile layout of `Lobby` (reduced text, larger CTA, sticky footer)?

Not really.

### Telemetry and Analytics

- **Events**: Track events for match start, join via link, capacity full, link generated/copied?

We don't have any telemetry setup yet, but we will do that soon in a new PR.

- **Attribution**: Should we track which player generated the invite when invitees join?

Yes, we will do that later.

### Implementation Preferences

- **Routing**: Prefer an RSC route for join handling with minimal client code, consistent with Next.js App Router guidance?

Yes.

- **State**: Use `nuqs` for any URL state and avoid client-side global stores for joining?

I'm not sure what that means, but probably yes.

- **Server source of truth**: Confirm capacity checks and admission remain server-authoritative.

Absolutely.

- **API shape**: Any preference for endpoints: `POST /rooms` (create), `POST /rooms/{id}/invite` (token), `POST /join` (by token/id)?

No strong preference.

### Edge Cases

- **Reused links**: If an old link is used after the room has ended, should we auto-create a fresh room or show a helpful error with a "Play now" CTA?

You should not create a fresh room. If the link has expired, it should go back to the main menu.

- **Multiple tabs**: If the same user opens multiple tabs with the invite, should only one be admitted?

I'm not sure. Let's keep it open for now.

- **Version skew**: If invitee’s client build is outdated, should we block join and force reload?

Yes.

---

Add any other constraints or preferences I missed. Once I have your answers, I’ll implement the flow and migrate UI, routes, server checks, and tests accordingly.
