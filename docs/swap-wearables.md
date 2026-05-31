## Swap Wearables (Dual-Weapon Cycling)

### Summary of Changes

- Display both equipped hand weapons next to grenades in `apps/client/src/components/GameHUD.tsx` and `apps/client/src/components/MobileGameHUD.tsx`, highlighting the active weapon.
- Replace the melee/ranged toggle with weapon cycling: pressing `N` cycles between equipped hand weapons (Left ↔ Right). All attacks use the active weapon.
- Remove the current melee/ranged toggle button from the left HUD on desktop; on mobile, map the existing weapon switch to cycle.
- Make the server authoritative for the player’s active weapon index/hand and replicate it to clients.
- Ensure the attack action pipeline derives damage/projectile/melee behavior from the authoritative active weapon.
- Active weapon selection is kept in server room state (ephemeral) and replicated; cycling does not write to the database. Only equip/unequip actions persist to DB as they already do.

### Implementation Plan

#### Client

1. Weapon HUD State
   - Add a lightweight `weaponHudState` exposed to HUDs with:
     - `weapons: Array<{ slot: 'left' | 'right'; slug: string; name: string; iconUrl: string }>`
     - `activeIndex: number`
   - Derive from replicated player equipment; no workspace package imports.

   There is no such thing as a two handed weapon in our game.

2. UI: AbilityBar extension (weapons group)
   - Reuse and extend the existing `AbilityBar` to support a dedicated weapons row/group that renders small, clickable icons for each equipped weapon; visually emphasize the active weapon; call `onSelect(index)` on tap/click.

We already have the AbilityBar. Please make sure you re-use or extend that component. Don't create a new component.

- Desktop: render the weapons group adjacent to grenades inside `GameHUD.tsx` (same container area, consistent glass styling).
- Mobile: render a compact weapons group near the `AbilityBar` in `MobileGameHUD.tsx`, ensuring touch targets ≥ 40px.

3. Input + Selection
   - Bind `N` to request a weapon cycle via the existing input layer (e.g., `GameScene`), debounced (≥150ms).
   - Replace the desktop left-bar melee/ranged toggle button with nothing (removed); on mobile, extend the grenade bar to include weapon entries and allow cycling/selection there.
   - Optimistic UI: update the HUD’s active weapon immediately on key press/tap, then reconcile with the server echo; on mismatch, revert to server state.
   - Allow direct selection by tapping a weapon in the `AbilityBar` weapons group (sends a set-active request if we support direct set).

4. Icons
   - Use the same icon mapping/resolution as grenades in `AbilityBar` (via `wearables.ts` derivation or existing util).

#### Server

1. State and Validation
   - Add an ephemeral `activeWeaponSlot` (or `activeWeaponIndex`) per player in Colyseus player state; no DB writes on cycle.
   - On room join/reconnect, default the active weapon to the first available hand (prefer `handLeft` if present, else `handRight`).
   - Validate cycles only when the player has ≥1 equipped hand weapon; if only one, cycling is a no-op.

2. Messages
   - Add `cycle_weapon` message: server advances the active selection with wraparound and updates the replicated player state.
   - Optional: `set_active_weapon` message for direct selection by index/slot, with validation.

3. Replication
   - Replicate the ephemeral `activeWeaponSlot` (or `activeWeaponIndex`) via Colyseus `PlayerSchema` so clients observe state changes immediately.
   - Equipment equip/unequip continues to update DB and existing snapshots (`players.equipped_wearables`, `players.derived_stats`).

4. Attack Pipeline
   - Ensure `startAction('attack_enemy')` resolves the active weapon server-side and uses its stats (range, projectile/melee, cooldown, damage, etc.). Do not rely on legacy client `weaponMode` flags.

#### Edge Cases

- No weapons equipped → hide `WeaponBar`; ignore `N`.
- One weapon equipped → cycling is a no-op; UI still highlights the single weapon.
- Desync → server rejects invalid requests and re-sends authoritative state.

#### Acceptance Criteria

- `N` cycles equipped hand weapons; with a single weapon, no visual/index change occurs.
- Both HUDs show equipped weapons next to the grenades (via extended `AbilityBar`); the active is clearly highlighted.
- All attacks consistently use the active weapon as decided by the server; swapping is allowed during windup/cooldown and applies to subsequent attacks.
- The old melee/ranged toggle is removed on desktop; mobile extends the grenade bar for weapon selection/cycle.
- Cycling does not perform any database writes; replication latency is ≤ 1 RTT, with optimistic UI.

#### Indicative Files to Touch

- Client: `apps/client/src/components/GameHUD.tsx`, `apps/client/src/components/MobileGameHUD.tsx`, extend `apps/client/src/components/AbilityBar.tsx`, input handling in `apps/client/src/game/GameScene.ts`, local types in `apps/client/src/types/`.
- Server: add ephemeral player state field in `apps/server/src/schemas/index.ts`, handle messages and cycling in `apps/server/src/rooms/GameRoom.ts`, wire handlers in `apps/server/src/index.ts` if needed.

### Clarifications Needed

1. Where is the current authoritative list of equipped hand weapons kept and replicated? A pointer to the data shape would help wire the HUD without duplication.

data/weapons.ts has a full list. And we should be storing them in the Supabase user table per character.

2. Do we treat two-handed weapons as occupying both hands (single selectable entry), or as a special case that disables cycling?

No such thing as two-handed weapons.

3. Which asset path should we use for weapon icons in HUD (svg vs png), and is there a canonical way to map a weapon slug to an icon?

Same as we do for grenade.

4. For mobile, should we keep a visible weapon-cycle button near the grenade bar, or rely solely on the existing TouchControls mapping?

Just extend the grenade bar.

5. During attack windup/cooldown, should cycling be locked out, queued, or allowed to swap immediately for the next attack?

Allowed to swap.

6. Do we need gamepad support parity now (e.g., LB/RB to cycle), or can we defer?

Let's defer for now and do a pass on that later.
