### Ammunition and Reloading — Design Questions and Concerns

This document captures open questions and edge cases to clarify before implementing ammunition and reloading mechanics. Please answer inline; I’ll reconcile into specs once resolved.

### Core mechanics

- **Which weapons are considered ranged now and in near-term roadmap?** Pistols, rifles/SMGs, bows, wands/staves, thrown items? Any that fire multiple projectiles per attack?

Whenever we add new weapons, we will determine whether they are melee or ranged. You don't need to worry about that now.

- **Is ammo a finite resource or a cooldown-like magazine system?**
  - Finite: bullets/arrows consumed from inventory, requires pickups/crafting/vendors.
  - Infinite: no global ammo, only a magazine capacity with reload time.

Right now we're going to consider them as infinite, but we may add finite bullets in the future.

- **Magazine model**: full-mag reload vs per-bullet reload (e.g., shotguns/revolvers)?

Full mag reload.

- **Different reload times when empty vs “tactical reload”?** Many games have faster reloads when there are rounds still in the magazine.

Sure, we can allow the tactical reload.

- **One-in-the-chamber rule?** If reloading with 1 round left, does final capacity become magazine_size + 1?

No, it fills up to the max capacity.

- **Auto-reload vs manual reload input**:
  - Auto: trigger on firing the last round.
  - Manual: allow `Reload` input to top-up anytime; should it be blocked when magazine already full?

Yes, it should work automatically. And there is also a way to manually reload it. Note that this is going to be primarily a mobile game so that the reload button will need to be somewhere on the HUD.

- **Can reload be cancelled/interrupted?** If yes, what interrupts: moving, dashing, attacking, taking damage, switching weapons?

No, let's make it so you can't interrupt reloading.

- **Movement during reload**: fully allowed, slowed, or locked? Can the player aim or rotate while reloading?

The player cannot move, they are totally locked while reloading.

- **Fire rate interaction**: if the weapon consumes multiple shots in a burst, do all shots reserve ammo at burst start?

Yes.

- **Jam/misfire mechanics**: out of scope for now?

Yes, out of scope.

### Weapon configuration and data model

- **Per-weapon config**: confirm we’ll store `magazineSize`, `reloadMs`, and optionally `perBulletReload`, `emptyReloadMs`, `tacticalReloadMs`, `burstSize`, `roundsPerShot`.

Sounds good.

- **Where should this config live?** Root `data/` replicated to both apps, or `apps/server/src/data` (and generated to client) to keep server as source of truth?

Let's make a new weapons.ts file. In the root data folder. That will be the source for all of our weapons going forward. And then the characters in characters.ts will import or inherit these weapons.

- **Do different variants of the same weapon exist?** If so, how do we resolve config precedence (base weapon → rarity/rolls → wearables/abilities → temporary buffs)?

Not currently, but we may add that in the future.

- **Are there shared ammo pools across weapons (e.g., “9mm” for multiple guns) or per-weapon isolated magazines?**

No, I don't think so.

- **Do abilities or wearables modify magazine size/reload speed?** If yes, need a clean modifier pipeline and clamping rules.

I think it's possible, yes. Make sure that you include that possibility in your architecture.

### Server authority and networking

- **Authoritative model**: Confirm server will own ammo/magazine state and validate attacks against it, with the client predicting UI only.

Yes, that's correct.

- **Action system integration**: introduce a `startAction` with type `reload_weapon` (similar to `attack_enemy`) so timing, animation, and interrupts are unified?

Yes, exactly.

- **Desync handling**: what’s the expected behavior if client thinks it has ammo but server says empty? (e.g., server rejects attack, client plays “empty click” and shows reload prompt.)

Yes, it would just automatically reload.

- **Latency and prediction**: can client preemptively gray-out fire input during reload, or only after server ack? Any tolerance window for re-fire after reload finishes server-side?

I'm not sure. Use the default best practice.

- **Multiplayer visibility**: should other players see a reload animation/state indicator?

No, that's not necessary.

### UX and UI

- **HUD**: where to display magazine count and reload progress? Existing `GameHUD`/`MobileGameHUD` regions or new widget?

Yes, it should be somewhere on the game HUD. Probably bottom right.

- **Prompts**: show “Press R to Reload” at low ammo/empty? Auto-hide after reload? Mobile control equivalent?

Yes, for desktop you can do press R to reload, but for mobile there needs to be a button. desktop can also have a button.

- **Progress feedback**: circular timer, bar, or numeric countdown during reload? Include percent? Show on crosshair?

I'm not sure what will look best, maybe a bar to begin with.

- **Low ammo cues**: color change, flashing, vibration (mobile), SFX?

Probably just basic color change for now.

- **Empty weapon behavior**: play “empty click” SFX, block attack input, auto-start reload, or both?

I think we covered this earlier.

### Animation, audio, and assets

- **Reload animation assets**: do we have per-weapon reload animations, or use generic? If none, should we block firing without animation for now and rely on UI/SFX?

No, we don't have any SFX right now, but I will add them.

- **SFX**: per-weapon reload SFX and “empty” SFX? Provide filenames or we’ll add placeholders.

You can add an optional SFX path for each weapon and I will fill that in later.

- **Crosshair/hand pose**: any changes while reloading (e.g., crosshair spread lock, hands-down pose)?

I'm not sure. Nothing for now.

### Edge cases and interactions

- **Weapon switching during reload**: does switching cancel reload? If switching back, does partial progress persist?

You can't switch weapons while reloading.

- **Dash/dodge while reloading**: allowed? If allowed, does it pause or cancel reload?

No, you can't dash or dodge.

- **Taking damage during reload**: chance to interrupt? Always interrupt? Threshold-based?

No, there's no chance to interrupt.

- **Partial reloads** (per-bullet): can the player accept a partial magazine after an interrupt?

No, you can't interrupt.

- **Queued inputs**: if attack is pressed during reload, should we queue the next shot to fire immediately when reload finishes?

Sure. But I think our default behavior will already handle this.

- **Multi-projectile and shotguns**: consume ammo per pellet or per trigger pull?

First pick or pull.

- **Burst weapons**: consume all burst ammo up-front or per projectile? What if ammo runs out mid-burst?

I'm not sure what whatever is default probably upfront.

- **Dual-wield**: if applicable, separate magazines or shared?

Separate magazines.

### Economy and inventory (if finite ammo)

- **Ammo items**: are bullets/arrows items in inventory? Stack sizes, max carry, rarity tiers?

No, we don't have them yet.

- **Refilling**: pickups, vendors, crafting, end-of-run rewards? Auto-refill between rooms?

We don't have inventory yet.

- **Death/respawn**: restore to default magazine and/or carried ammo?

Default magazine.

- **Difficulty tiers**: different default magazine and reload speed per difficulty?

Possibly, but nothing yet.

### Persistence and lifecycle

- **Session boundaries**: on join/room change, what is the initial magazine? Full? Persist from prior room?

Full.

- **Save/Load** (if applicable): does ammo persist across sessions?

No.

### Balancing and defaults

- **Agent pistol baseline**: confirm `magazineSize = 10`, `reloadMs = 3000`.

Correct.

- **Fire rate vs reload**: desired time-to-empty and time-to-full-cycle targets per weapon archetype?

I'm not sure, something that feels good.

- **Minimum and maximum limits**: global clamps on magazine and reload to keep the game balanced?

Yes, probably.

### Implementation details and constraints

- **States**: weapon state machine additions: `idle`, `firing`, `reloading`, `interrupted`.
- **Data flow**: server computes and broadcasts reload start/finish; client shows progress; attacks rejected while reloading.
- **Actions**: new `reload_weapon` action with start/end events, interrupt reasons, and progress duration.
- **Types and sharing**: confirm no cross-package workspace deps; we’ll inline types/configs per app and (optionally) generate copies.
- **Testing**: target e2e scenarios (auto-reload on empty, manual reload, interrupt by dash/switch/damage, latency tolerance, desync recovery).
- **Telemetry**: track shots fired, reload starts, reload cancels, time spent reloading, desync corrections for tuning.

### Open decisions that block implementation

- **Finite ammo vs infinite with magazine-only** (and if finite, inventory model and pickups).
- **Interrupt rules** (dash/move/attack/damage/switch) and whether partial progress persists.
- **Auto-reload policy** and manual reload input mapping on desktop and mobile.
- **Per-bullet vs full-mag reload for applicable weapons** and timing differences (empty vs tactical).
- **Server-client contract** for `reload_weapon` action, prediction allowances, and UI gating while awaiting server ack.
