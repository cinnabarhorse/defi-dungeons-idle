### Timed Grenades — Design Spec (MK2, M67)

**Goal**: Introduce a timed grenade class that is dropped or thrown, then explodes after a fixed fuse (3s), dealing AoE damage with falloff and optionally applying status effects to enemies in range. MK2 and M67 are representative of this type. Timed grenades do significantly more damage but are harder to use due to the delay and placement requirements.

### Behavior

- **Action flow**
  - Player arms a grenade from the HUD; next left-click triggers a `throw_grenade` action.
  - The grenade travels (or is dropped) to a ground position. It does not explode on impact.
  - After a fuse of 3000 ms measured from landing, it explodes once.
  - Explosion applies AoE damage with falloff and optional status effects to enemies in radius.

- **Server authority**
  - Server validates target range, schedules the detonation, and computes all damage/status results.
  - Server broadcasts an authoritative `grenade_thrown` (for visuals) and `grenade_exploded` (final AoE) to clients.

- **Damage model**
  - Linear falloff from center-to-edge by default, consistent with `computeGrenadeDamage(distance, config)`.
  - Damage applies to enemies only; breakables and environmental objects follow current grenade rules.

- **Status effects**
  - Timed grenades may apply statuses (e.g., stun, slow, burn) sourced from grenade-specific abilities on the player, consistent with current ability/status systems.

### Data model

- Use existing fields in `GrenadeWeaponDefinition` in `data/weapons.ts`:

```29:40:/Users/coderdan/GitHub/gotchiverse-live/data/weapons.ts
export interface GrenadeWeaponDefinition {
  blastRadiusPx: number;
  damageCenter: number;
  damageEdge: number;
  throwSpeedPxPerSec: number;
  maxRangePx?: number;
  cooldownMs: number;
  explodeOnImpact: boolean;
  fuseMs?: number;
  ammoPerUse: number;
  healingSplash?: HealingSplashParams;
}
```

- Defaults (for reference):

```304:319:/Users/coderdan/GitHub/gotchiverse-live/data/weapons.ts
function makeGrenadeForCategory(
  category: WeaponCategory,
  overrides: Partial<GrenadeWeaponDefinition> = {}
): GrenadeWeaponDefinition {
  const globalBase: GrenadeWeaponDefinition = {
    blastRadiusPx: 80,
    damageCenter: 60,
    damageEdge: 15,
    throwSpeedPxPerSec: 1000,
    maxRangePx: 1000,
    cooldownMs: 3000,
    explodeOnImpact: true,
    fuseMs: 0,
    ammoPerUse: 1,
    healingSplash: undefined,
  };
```

- Timed grenade configuration uses:
  - `explodeOnImpact: false`
  - `fuseMs: 3000`
  - Higher `damageCenter`/`damageEdge` than impact grenades
  - Possibly longer `cooldownMs` (trade-off for higher damage)

### Client UX

- Show the armed state and max throw range ring.
- On throw, render the projectile if there is travel; if dropped at feet, place a visible ground indicator at the drop point.
- During fuse, show a subtle ticking indicator and optional countdown; on explosion, play VFX/SFX and screen shake as per existing effects.
- Disable the grenade HUD icon during cooldown and display a cooldown timer.

### Tuning placeholders (to confirm)

- MK2 (timed frag):
  - blastRadiusPx: 96–112
  - damageCenter: 110–140
  - damageEdge: 35–55
  - cooldownMs: 2500–4000
  - fuseMs: 3000

- M67 (timed heavy frag):
  - blastRadiusPx: 112–128
  - damageCenter: 130–170
  - damageEdge: 45–70
  - cooldownMs: 3000–4500
  - fuseMs: 3000

These are intentionally higher than current impact frags; final values subject to your direction and playtests.

### Open questions for you

1. Placement semantics
   - Should timed grenades always be dropped at the player’s feet (no travel), or still thrown to the clicked point and then wait 3s after landing? If both are desired, how do we choose (e.g., right-click drop vs left-click throw)?

Right click (desktop) or long press (mobile) sounds good.

2. Fuse timing origin
   - Confirm: start fuse on landing, not on throw start. Any variation for zero-travel drop (fuse starts immediately at drop)?

Sounds good., No variations.

3. Line-of-sight and obstacles
   - Should walls/obstacles block or attenuate explosion damage, or is it purely radius-based as today?

   Purely radius based for now.

4. Friendly fire / self damage
   - Can the explosion hurt the thrower or allies, or enemies only? If allies can be affected, is there reduced damage or just status-only effects?

   No friendly fire.

5. Status effects
   - Which effect(s) do timed frags apply by default (e.g., stun/slow/burn)? Fixed or chance-based? What duration(s) and stacking rules?

Same as current ones.

6. Cooldowns and stacking
   - Target cooldown for MK2/M67? Any shared cooldown across all grenades, or per-grenade independent (current system supports per-grenade)? Max active timed grenades per player at once?

   Normal cooldown for grenades.

7. Damage falloff shape
   - Keep linear falloff, or use a sharper profile (e.g., exponent > 1 near center)? If sharper, we can add an optional config `falloffExponent`.

Sensible defaults.

8. Interaction with breakables and environmental objects
   - Should timed grenades damage/destroy breakables the same as impact frags?

   Sure.

9. Visuals and audio
   - Preference for fuse indicator (blinking sprite, beeping, countdown number)? Specific assets or reuse existing projectile/explosion VFX and SFX?

   Countdown number for now.

10. Cancellation and persistence

- Can players cancel an armed throw? Once placed, can the grenade be moved/defused/picked up or is it always guaranteed to detonate?

Can't cancel, defuse, or move.

11. Edge cases

- If the thrower dies/disconnects before detonation, should the grenade still explode? Any special handling in multiplayer (ownership transfer, cleanup)?

Sensible defaults.

12. Economy / ammo

- Still unlimited ammo as previously discussed, or should timed grenades have special limits/costs?

Still unlimited ammo.

### Implementation notes (once confirmed)

- Data: set MK2 and M67 `grenade` configs to `explodeOnImpact: false`, `fuseMs: 3000`, and updated damage/radius/cooldown.
- Server: reuse existing `throw_grenade` action and scheduled detonation; ensure the explosion happens after `travelTimeMs + fuseMs` with no impact trigger.
- Client: add fuse visualization for placed grenades; reuse existing cooldown UI and explosion VFX hooks.

### Detailed implementation plan

1. Data updates

- Set timed behavior on MK2/M67 in `data/weapons.ts` using grenade overrides:
  - `explodeOnImpact: false`
  - `fuseMs: 3000`
  - Increase `damageCenter`/`damageEdge` and possibly `blastRadiusPx` vs current impact presets; keep “normal” grenade cooldown rule.
  - Keep linear falloff (no new field needed).
- Regenerate shared data if needed via existing scripts so both client/server reflect changes.

2. Server: action and explosion timing

- Reuse `throw_grenade` action; when receiving a throw:
  - Compute `travelTimeMs` from origin→target and `throwSpeedPxPerSec`.
  - Schedule explosion for `travelTimeMs + fuseMs` (fuse starts on landing).
  - For “drop” mode, origin==target ⇒ `travelTimeMs=0`, fuse runs immediately.
- Ensure AoE damage loop remains radius-only (no LoS), enemies-only, and applies existing grenade-linked statuses (e.g., stun) via current ability system.
- Ensure no friendly fire: do not damage allied players; keep existing enemy damage broadcast and status broadcast.
- Broadcast:
  - `grenade_thrown` including `travelTimeMs`, `fuseMs`, and `blastRadius` for client visuals.
  - `grenade_exploded` at resolution time for VFX sync.

3. Client: controls and visuals

- Throw vs Drop controls
  - Left-click while armed: throw to clicked position (existing behavior).
  - Right-click (desktop) or long-press (mobile): drop at player’s feet (send `target={x:player.x,y:player.y}`; `travelTimeMs` becomes 0 on server).
  - Update handler at the grenade pointer code path to implement right-click drop instead of cancel.

```3374:3427:/Users/coderdan/GitHub/gotchiverse-live/apps/client/src/game/GameScene.ts
    private handleGrenadePointerDown(pointer: Phaser.Input.Pointer) {
      if (!this.armedGrenadeSlug || !this.room) return;

      if (pointer.button === 2) {
        this.disarmGrenade();
        return;
      }

      if (pointer.button !== 0) {
        return;
      }
      // ... existing code ...
    }
```

- Fuse countdown indicator
  - On `grenade_thrown`, if `fuseMs > 0`, show a world-space countdown (3→2→1) at the target position for the fuse duration; remove it on `grenade_exploded`.
  - For drop mode, countdown begins immediately.
  - Keep existing explosion circle VFX and screen shake.

- Cooldown UI
  - Continue to use per-grenade cooldown overlay; no changes needed beyond ensuring HUD disables during cooldown.

- Mobile long-press
  - Implement long-press detection for grenade drop (press-and-hold on map when armed), falling back to tap to throw.

4. QA and verification

- Unit tests
  - Verify `computeGrenadeDamage` linear falloff remains correct and stable.
  - Add a small test around explosion scheduling: `travelTimeMs + fuseMs` controls detonation time (mock timer).

- Manual/E2E tests
  - Throw to far target: explosion exactly 3s after landing; right-click drop: explosion 3s after drop.
  - Multiple enemies in radius take damage with falloff; statuses apply per current abilities.
  - No friendly fire: the thrower and allies never take damage from the blast.
  - Pure radius behavior: obstacles/walls do not block damage.
  - HUD cooldown disables grenade button and shows timer; arming state cancels on action start and on ESC.
  - Multiplayer: all clients observe identical detonation time/location and damage results.

5. Tuning pass (initial)

- MK2: raise damage vs frag baseline; consider `blastRadiusPx ~ 96–112`, `damageCenter ~ 120–140`, `damageEdge ~ 40–55`, `cooldownMs` within normal range.
- M67: raise damage and radius vs heavy-frag baseline; consider `blastRadiusPx ~ 112–128`, `damageCenter ~ 140–170`, `damageEdge ~ 50–70`.
- Iterate via playtests; ensure time-to-kill and risk/reward align with “harder to use, higher damage”.

6. Rollout and metrics

- Ship behind a feature flag if desired; log grenade usage by slug, hits per explosion, and average damage.
- Watch for grief or spam vectors (even with no friendly fire) and adjust cooldowns if needed.
