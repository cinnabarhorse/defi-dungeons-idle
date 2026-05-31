### Grenades feature — questions and implementation plan

This document proposes adding a new `weaponType` called `grenades`, used by the following wearables:

- mk2-grenade
- m67-grenade
- link-bubbly

High-level behavior:

- If a player has one or more grenade wearables equipped, show clickable grenade buttons on the HUD using each wearable’s `svgId` as the icon.
- Clicking a grenade button “arms” that grenade; the player’s next click in the world throws it to that location.
- The player plays a throwing animation (row 10, 3 frames) when the throw is initiated.
- The projectile uses the wearable’s base SVG for visuals while traveling.
- On landing, the grenade explodes, dealing damage in a radius with damage falloff from center to edge.
- Damage, radius (and later status effects) are configured per weapon.

We will keep the server authoritative for combat, and use the existing action system rather than invoking direct attack handlers.

### Open questions for confirmation

- Ammo/economy
  - Are grenades consumable with a finite count per run/session? If yes, how are counts granted and persisted (drops, shop, loadout)?

Currently there is no limit.

- Is there a per-grenade cooldown, a shared cooldown across all grenade types, or both?

Yes, grenades should have a cooldown. WHile it's cooling down, the icon should be disabled, greayed out, and show a timer.

- Equipping & HUD
  - Can a player equip multiple grenade wearables at once? If so, show all as separate buttons on the HUD?

Yes.

- How should we indicate the player is “armed” (e.g., cursor change, HUD highlight)? How to cancel arming (Esc/right-click)?

You can show the radius that the grenade can be thrown in around the character.

- Do we show an ammo count/badge on each grenade icon?

How about we show a small "unlimited" ♾️ badge.

- Throw behavior
  - Trajectory: parabolic arc or straight-line ray to target? (Proposal: parabolic with gravity for readability.)

Probably a parabolic art.

- Explosion trigger: explode on first solid collision vs. explode only at ground target? Any fuse time?

There could be a configurable fuse time. By default it's 0. The moment it touches an enemy or the ground, it explodes.

- Max range limit? What happens to clicks beyond range (snap to max)?

1000px max range. Snap to max.

- Damage model
  - Falloff: linear vs. quadratic. (Proposal: linear by default; can tune per grenade.)

Linear by default. Tuneable.

- Friendly fire/self-damage: should the thrower and allies take damage? Is PvP affected?

No, the thrower can't self-inflict. Allies can.

- Interactions
  - Should explosions destroy or push items/props? Knockback?

Yes, they can destroy props. No knockback initially, but could be configurable later.

- Any immunity windows for recently spawned enemies? Any boss resistances to AoE?

No.

- Content specifics
  - Confirm canonical slugs: `mk2-grenade`, `m67-grenade`, `link-bubbly`.

Yes

- Confirm each has a valid `svgId` in `data/wearables.ts` to use for the HUD icon and projectile.

Yes

- Any specific SFX/VFX preferences for explosion and throw? (We can add placeholders.)

None yet, add placeholders.

### Data model additions (shared config)

Add `grenades` to `weaponType` and extend weapon configs with a dedicated grenade block.

Key fields to add for grenade weapons:

- `weaponType: "grenades"`
- `grenade: {`
  - `blastRadiusPx: number` — explosion radius in pixels.
  - `damageCenter: number` — damage at epicenter.
  - `damageEdge: number` — damage at edge of radius.
  - `throwSpeedPxPerSec: number` — travel speed toward target.
  - `maxRangePx?: number` — optional max throw distance.
  - `cooldownMs: number` — cooldown applied after throw.
  - `explodeOnImpact: boolean` — explode on first solid hit; if false, explode on reaching target.
  - `fuseMs?: number` — optional fuse time before explosion.
  - `ammoPerUse: number` — typically 1.
    `}`

Notes:

- Damage falloff will be computed server-side: `damage = damageEdge + (damageCenter - damageEdge) * clamp01(1 - (distance / blastRadiusPx)^p)` where `p` defaults to `1` (linear), tunable per grenade if needed later.

Yes.

- We’ll keep the root `data/weapons.ts` as the single source of truth and continue generating app-level copies for client and server.

Yes.

### Client UX and HUD

- Show a grenade hotbar only if the player has at least one `weaponType: "grenades"` wearable equipped.

Yes.

- Each grenade shows as a Shadcn `Button` with the wearable’s `svgId` rendered as the icon.

Yes.

- Clicking a grenade button arms it: the next world click sends a throw command; HUD button highlights while armed.

yes.

- Add a cancel affordance (Esc/right-click) to exit arming without throwing.

On mobile there is no esc/right-click. Maybe tapping the button again disarms it.

- Wrap the HUD component in `Suspense` with a lightweight fallback; keep the component client-only and small.
- While armed, optionally show a preview marker at the cursor and a faint ring for the blast radius at the target position.

### Throw animation and visuals

- On client action start, request the player animation `throw` which maps to spritesheet row 10, frames 3; if unavailable, gracefully fall back to idle.
- The projectile uses the wearable’s base SVG rendered as a sprite; we’ll interpolate along a curved path if parabolic trajectory is chosen.
- Minimal VFX for now: a radial flash on explosion and a brief screen shake (optional).

### Server authority, networking, and anti-cheat

- Introduce a new action: `throw_grenade` with payload `{ wearableId, target: { x, y } }`.

Perfect.

- Validate server-side: the player is alive, has the wearable equipped, has ammo (if applicable), is not on cooldown, and target is within max range.
- Server simulates the projectile or schedules explosion timing; upon impact/landing, compute AoE and apply damage with falloff to entities in radius.
- Broadcast authoritative `grenade_exploded` event with the final explosion position and damage results to all clients in the room.

Perfect.

- Reuse the existing action system for initiation, timing, and state; do not call raw attack handlers directly.

### Implementation steps (cross-repo)

1. Data layer
   - Update `data/weapons.ts` to add `weaponType: "grenades"` and introduce grenade configs for:
     - `mk2-grenade`
     - `m67-grenade`
     - `link-bubbly`
   - Ensure `scripts/generate-shared-files.ts` forwards new fields, then regenerate `apps/client/src/data/weapons.ts` and `apps/server/src/data/weapons.ts`.
   - In `data/wearables.ts`, set these wearables to `weaponType: "grenades"` and link to the appropriate weapon keys.

2. Server
   - Add `throw_grenade` to `apps/server/src/lib/actions/factory.ts` and create `apps/server/src/lib/actions/throw-grenade.ts` for validation and scheduling.
   - Compute explosion AoE and damage in the server room/system; emit results to clients.
   - Add minimal cooldown and ammo checks (if ammo is enabled now).

3. Client
   - Add an `AbilityBar` component in `apps/client/src/components` and mount it in the HUD overlay for the play scene.
   - Implement arming -> next-click-to-throw flow; send `startAction` for `throw_grenade` to the server.
   - Play throwing animation (row 10) on action start; render minimal projectile and explosion VFX client-side using the authoritative positions.

4. Damage model
   - Implement the linear falloff function on the server; add a small unit test around the function.

5. QA
   - Manual tests: edge clicks, out-of-range clicks, collide with walls, multiple enemies in blast, cancel arming.
   - Verify multiplayer consistency: all clients see the same explosion time/location and damage numbers.

### Initial tuning (proposed defaults)

- mk2-grenade
  - blastRadiusPx: 96
  - damageCenter: 80
  - damageEdge: 20
  - throwSpeedPxPerSec: 900
  - cooldownMs: 1500
  - explodeOnImpact: true
  - ammoPerUse: 1

- m67-grenade
  - blastRadiusPx: 112
  - damageCenter: 100
  - damageEdge: 30
  - throwSpeedPxPerSec: 850
  - cooldownMs: 1800
  - explodeOnImpact: true
  - ammoPerUse: 1

- link-bubbly
  - blastRadiusPx: 80
  - damageCenter: 60
  - damageEdge: 15
  - throwSpeedPxPerSec: 1000
  - cooldownMs: 1200
  - explodeOnImpact: true
  - ammoPerUse: 1

These are placeholders to be tuned during playtesting.

### Notes aligning with existing conventions

- Server remains authoritative for combat and uses the existing action system to coordinate timing and state.
- The root `data` module remains the single source of truth; generated files feed the client/server apps.
- Use union string types and interfaces for TS; avoid enums.
- Keep client components small and isolated; prefer server components elsewhere.
