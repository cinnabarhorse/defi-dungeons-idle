### XP + Levels: Questions to Confirm Before Implementation

These questions will lock down scope, math, server integration, and UI so we can implement Levels/XP confidently and avoid rework.

### Core scope and identity

- **Account binding**: Confirm Levels/XP/stat allocations are keyed by wallet address (checksummed EVM address). Any multi-wallet linking or just 1 wallet = 1 profile?

1 wallet = 1 profile.

- **Chain/silo**: Are progress and stats shared across all supported networks, or per-chain (e.g., Polygon vs Base)? If shared, which chain is the source of truth for identity?

Just Base.

- **Guest mode**: Do we support guests without wallets? If yes, do they earn temporary XP that can later bind to a wallet?

No guest mode for now. But we will have free trials.

### Level curve (1 → 999) and XP to next level

- **Curve style**: Do you want an explicit 1..999 table or a deterministic formula that generates the table? If formula, which family:
  - Linear: XP_N = a·N + b
  - Quadratic: XP_N = a·N² + b·N + c
  - Exponential-like: XP_N = base·N^p (p > 1) or base·growth^(N)
  - Hybrid/tiers: piecewise (e.g., linear early, quadratic mid, steeper late)

Probably hybrid/tiers. Which means we'll need to have an XP chart.

- **Target pacing**: Rough time-to-level targets (solo average) you want at key milestones?
  - L10, L20, L50, L99 (minutes/hours of average play)

L10 = 1 hour. L20 = 4 hours. L50 = 30 hours. L99 = 100 hours.

- **Upper bound**: L99 is hard cap? After L99, do we allow prestige or overflow XP?

Nope, L99 is the cap.

- **Overflow**: When leveling up mid-session, does overflow XP carry to the next level?

yes, you can level up multiple times in a single match.

- **Death penalty interaction**: On level loss from death, what happens to XP within the prior level? Reset to 0, keep current XP, or clamp to (XP needed − 1)?

Lose 1 level and reset level progress to 0.

### XP sources and distribution

- **Sources**: Only enemy kills grant XP (as stated), or also quests, events, chests, bosses, assists, room completion, difficulty multipliers?

only enemies + bosses. Difficulty tiers should have XP muiltipliers applied.

- **Per-enemy XP**: Should XP be derived from enemy metadata (e.g., tier/HP/damage) or a static per-enemy-type table? If table, will you author values in `data/enemies.ts` (client) and `apps/server/src/data/enemies.ts` (server) for parity?

Yes, you can update `data/enemies.ts` with the base XP per enemy. And then apply the difficulty-tier multipliers.

- **Attribution**: Who gets XP when multiple players damage the same enemy?
  - Last hit only
  - Shared by damage fraction (minimum floor per contributor?)
  - Proximity-based or team-wide share

Team-wide share, with 60% going to the last hit and 40% to team members.

- **Minimums**: Any min/max XP per kill? Disable XP from trivial enemies far below player level?

> Disable XP from trivial enemies far below player level?
> I like that idea.

- **Level difference scaling**: Scale XP by player level vs enemy level (or tier) to prevent farming low-tier mobs at high levels?

Yes, please update this file with the logic you plan to use for that.

- **Group scaling**: Any party/room-size multipliers?

Yes, enemy difficulty should scale with party size. So it makes sense that XP would scale too.

- **Boss/champion bonuses**: Extra XP multipliers for elites/bosses?

Yes.

### Death penalty: “dying loses one level”

- **Floor**: Minimum level stays at 1, never drops below 1, correct?

Correct.

- **XP after level loss**: On level-down, does the player:
  - Keep their current XP within the new level
  - Reset XP to 0 of the new level
  - Set XP to (XP needed − 1)

Lose one level and reset XP progress to 0.

- **Frequency**: Multiple deaths in a row can chain multiple level losses within one match?

Player can only die once in a match.

- **Trigger**: Apply immediately upon server-confirmed death, even if player disconnects?

Yes.

- **Abuse prevention**: Any cooldown on subsequent level losses to avoid grief loops?

No.

### Stat points and progression economy

- **Points per level**: How many allocatable points per level-up? Do we give any starting points at Level 1?

1 point per level. No starting points.

- **Respec**: Allow respecs? If yes:
  - Free at will, or limited via item/cost/cooldown?
  - Full respec vs single-point adjustments?

Yes, we will allow respecs. Probably via a potion or some other thing we can buy.

- **Caps**: Hard caps per stat or only soft diminishing returns?

No cap per stat.

- **Persistence on death-level-down**: When a level is lost, do previously allocated points remain, or are points removed to match the new level? If removed, which stat loses points first?

I feel like we should track which stat was applied at each level and then when they lose a level, remove the latest stat.

- **Names**: Confirm spellings and intended fantasy flavor:
  - Energy (attack speed)
  - Aggression (damage)
  - Spookiness → should this be “Spookiness”?
  - Brain Size (mana)

  Yeah.

### Stat formulas and stacking rules

- **Energy → attack speed**: Define the formula precisely. Examples:
  - Multiplicative haste: final_cooldown = base_cooldown / (1 + k_energy · Energy)
  - Additive reduction: final_cooldown = base_cooldown · max(0.2, 1 − k_energy · Energy)

Whatever you think is a standard default.

- **Aggression → damage**: Define exact scaling, e.g. final_damage = base_damage · (1 + k_aggr · Aggression). Should it apply before/after other multipliers (abilities, crits, wearables)?

Whatever you think is a standard default.

- **Spookiness → HP**: Max HP multiplier or flat per point? Any retroactive full-heal on max-HP increase?

Whatever you think is a standard default.

- **Brain Size → mana**: Do we already have mana? If not, confirm:
  - Max mana per point (flat vs multiplier)
  - Mana regen baseline and scaling
  - Which abilities consume mana and their costs

Whatever you think is a standard default.

- **Order of operations**: Specify calculation order and whether bonuses are additive or multiplicative with existing gear/abilities. Any global caps (e.g., max 80% attack-speed reduction)?

Whatever you think is a standard default.

- **Rounding**: Round at each step or only at the end? Integer vs float HP/mana/damage/cooldown?

Whatever you think is a standard default.

### Multiplayer specifics

- **AFK/leeches**: If XP is shared, require minimum contribution threshold? Time-in-combat requirement?

No

- **Friendly summons**: If a player’s summon/pet/mine gets the kill, does the owner get XP credit?

Yes

- **PVP**: Any XP for killing players? Any anti-exploit rules (e.g., no XP from same wallet repeatedly)?

No

### Persistence and backend

- **Data store**: Prefer Supabase Postgres, or store in our existing server persistence layer? If Supabase, confirm project/connection details.

Store in local storage for now. We will add in supabase db soon.

- **Schema (proposal)**: `profiles` keyed by wallet address with columns: `level`, `xp`, `points_unspent`, `energy`, `aggression`, `spookiness`, `brain_size`, timestamps.

OK

- **Authoritative updates**: Server-only awards XP on enemy death; client is display-only. OK?

Yes

- **Concurrency**: Handle duplicate award events idempotently? Any rate limits?

Correct. No rate limits.

- **Migration**: Existing users start at L1 with 0 XP and 0 extra points?

Yes.

### Server integration points

- **Award location**: Confirm we award XP in the server’s enemy-death path (e.g., `EnemyDeathSystem`), using authoritative attribution.

Sure.

- **Broadcast**: On level-up or stat allocation, broadcast updated profile to all client sessions of that wallet.

I don't think that's needed because leveling up will take place after the match. They can't update their stats within a match.

- **APIs**: Do you prefer REST endpoints, WebSocket messages via the room, or both for profile reads/writes? Any admin tools for grant/reset?

Probably REST endpoints. Yes, I will create some admin tools later.

### UI/UX

- **Panel placement**: Where should the new stat allocation panel live?
  - In-game `MobileGameHUD`
  - A persistent account page (e.g., `/builds` or a new `/profile`)
  - Both

I want to create a new tab system. On the main page. The left tab will be for playing the game. The right tab will be for managing the user profile.

"Play" and "Me". When the player levels up there should be a red notification on the new tab. And also, when you click on the "Me" tab, there should be a place that lets you upgrade your player.

- **Level-up modal**: On level-up mid-run, show a modal that pauses input until points are allocated, or allow deferring?

Only wait until after the game is over before allowing them to update their points.

- **Mobile-first**: We’ll use Shadcn UI/Radix + Tailwind. Any specific layout preferences? Tabs vs accordion?

Tabs.

- **Indicators**: Always-on XP bar + level number in HUD?

Yes.

- **Undo/confirm**: Draft points locally with Undo/Reset, then Confirm to persist?

Okay.

### Tuning, testing, and ops

- **Telemetry**: Track XP/min, deaths/level, time-to-level, respec usage for balancing?

You can add in telemetry placeholder within the code. But we are not adding any telemetry yet.

- **A/B toggles**: Should we feature-flag the system and/or the curve for iteration?

No, not for now.

- **Seeding**: Any initial XP grants or test profiles we should preload?

You can add a test button in development in the profile that lets me add XP to my player.

### Acceptance checklist (we’ll treat “Yes” to proceed)

- **Global account-based Levels/XP/stats, wallet-keyed**: Yes/No
- **Death always reduces exactly one level, floors at 1**: Yes/No
- **Deterministic level curve spec (formula or authored table) approved**: Yes/No
- **Stat-point economy (per-level points, caps, respec policy) approved**: Yes/No
- **Precise stat formulas (Energy/Aggression/Spookiness/Brain Size) approved**: Yes/No
- **Server-authoritative XP awards and persistence design approved**: Yes/No
- **UI locations (HUD + panel + modal behavior) approved**: Yes/No
