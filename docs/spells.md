## Magic System: Design Questions (pre-implementation)

This document gathers focused questions to finalize the design for the initial Magic system and the two starter spells before implementation.

### Scope Confirmation

- **Autocast timing**: Confirm that when autocast is enabled, the spell triggers on every successful base attack hit event (not on miss), consuming mana per trigger.
- **Stacking model**: Spells add effects in addition to the character’s normal attack without replacing it. Confirm no mutual exclusivity with abilities like grenades.
- **Server authority**: All gameplay effects resolve on the server; clients are visual only. Confirm this is required for anti-cheat.

## Core Resource: Mana

- **Max mana formula**: How is max mana determined? Fixed per archetype, derived from level/stats, or equipment-modified?

Derived from level/stats/progression, and equipment-modified. All characters should have a base mana as well.

- **Regen**: What is the baseline mana regeneration per second (in- and out-of-combat)? Does regen pause during cast, and is there a floor (e.g., minimum 0.5/s)?

Let's regen 0.25 mana per second as default.

- **Costs**: What are the mana costs per cast for the two spells? Are costs whole numbers or can they be fractional? Round strategy on deduction?

3 mana per cast.

- **Insufficient mana behavior**: On a hit event, if mana < cost, should the spell silently skip, queue until enough mana, or partially resolve? The base attack should still complete.

The spell should show that it is disabled and will not auto-cast until enough mana is returned.

- **Mana potions**: Existing Mana Potions are present in inventory types. Should they restore a fixed amount or a percentage? Any cooldown or GCD?

+50 mana per use. No cooldown.

- **UI format**: For the mana bar (under HP), show numeric text (current/max) and a blue bar? Any preferred color (e.g., indigo-500/400) and size relative to HP?

Blue is fine.

## Spells: Definitions and Tuning

### Freezing Attack (on-hit slow)

- **Effect specifics**:
  - Slow type(s): movement speed only, attack speed only, or both?

Same as the existing Slow status effect.

- Slow magnitude: percentage reduction(s)? Provide default values and level scaling rules.
  Same as the existing Slow status effect.

- Duration: base duration in seconds; does it refresh, stack additively, or only strongest applies?

Same as the existing Slow status effect.

- Diminishing returns: cap(s) for total slow? Separate caps for move and attack speed slow?

Same as the existing Slow status effect.

- Immunities: bosses or elites partially/fully immune? Provide multipliers (e.g., 50% effectiveness) if applicable

Same as the existing Slow status effect.
.

- **Trigger**:
  - Trigger on each successful hit instance, including multi-hit/projectile pierce? For AoE/base attacks hitting multiple enemies, apply to all hit enemies?

Yes

- Apply before or after damage calculation? (Typically after, for clear cause.)

After

- **Synergy**:
  - Interactions with stun (current branch): can slow and stun coexist? Should slow be suppressed during stun?

Yes they can coexist.

- Visual FX: preferred color/ice particles; need distinct VFX for partial immunes?

Same as the existing Slow status effect.

- **Default values proposal (if helpful)**: Move slow 30%, Attack slow 20%, 2.5s duration, refresh on hit, strongest-only, boss effectiveness 50%, mana cost TBD.

Same as the existing Slow status effect.

### Bounce Attack (chain ricochet)

- **Chain rules**:
  - Max targets: provide default (including the first target?)

default: 4 (including first target.)

- Targeting radius per bounce: constant or grows/shrinks per hop? LOS required or radius-only? Should walls block?

Short radius, only 200 pixels. Yes, walls should block.

- Target selection: nearest-next, random within radius, or priority (e.g., lowest HP)?

Nearest next.

- Repeat hits: can the chain hit the same target multiple times? Usually no; confirm.

No.

- Timing: instant hops vs. short travel time per hop (e.g., 60–120 ms)?

Short travel time.

- Damage model: flat per bounce, or falloff (e.g., -15% per hop)? Can on-hit effects (like Freeze) apply on each bounce?

Yes they can.

- Failure mode: if fewer enemies than max, stop early without error.

Yes.

- **Integration with base attack**:
  - Is the first hit the base attack’s target, and the chain continues from there?

Yes.

- If the initial target dies mid-chain, should the chain continue from the last valid hop?

Yes.

- **FX**:
  - Chain lightning-esque visual? Preferred color/fx? Do we need per-hop sound?

TBD. Just use current animations.

- **Default values proposal**: Max targets 4 (including first), 200 px radius per hop, nearest-next, no repeat targets, -20% damage per hop, instant hops, mana cost 3 per use.

## Autocast and Manual Cast UX

- **Toggling**: Desktop right-click on spell, Mobile long-press. Should toggled state persist across sessions (localStorage) and/or per-character on server?
- **Indicators**: Show an “AUTO” or glow badge on the spell icon when enabled? Any color preference?

Yes AUTO text on it would be good.

- **Manual cast**: Is there also a manual activation (left-click / tap) on cooldown, or are these strictly on-hit procs when enabled? If manual exists, what are keybinds/buttons?

Yes we can have manual activation. Re-use the existing AbilityBar.

- **Cooldowns**: Are spells gated only by mana, or also by a cooldown/GCD? If cooldowns exist, specify per-spell cooldown.

A short cooldown makes sense.

- **Priority**: If multiple spells are set to autocast, do all eligible ones proc on each hit (consuming mana for each), or is there a priority/limit per hit?

Yes, all proc.

## Systems Integration (Server-first)

- **Action system**: Confirm we should hook into the existing `startAction` flow for attacks and extend server on-hit resolution to apply spell side-effects (per project conventions). If a separate action is desired, propose `cast_spell` with spellId, but still triggered by attack success.

Good question. Spells may also eventually have their own action. So maybe we can have a separate action, while also keying into existing attack actions?

- **Damage and modifiers**: Should spell damage (if any) be additive to base damage, or multiplicative modifiers?

Additive.

Provide formulas or the intended interaction model.

- **Networking**: Clients receive authoritative events for spell procs (e.g., `spell_proc`, `apply_slow`, `chain_hit`) to drive VFX only. Any batching requirements?

Nope.

- **Persistence**: Autocast state per player saved server-side (account/character) or just client-side preference?

Probably client-side is OK?

## Progression, Unlocks, and Economy

- **Availability**: Are these two spells available to all characters by default, or unlocked via level/archetype/quest?

Only available on "staff" type weapons.

- **Scaling**: Do spell magnitudes/costs scale with level, stats (e.g., Intelligence), or gear? Provide simple rules/tables.

Not yet.

- **Upgrades**: Will spells have ranks/points later? If so, reserve fields for rank in data and caps.
- **Costs**: Any gold cost to unlock/upgrade? Not needed now, but influences data structures.

Not yet.

## Data Model and Configuration

- **Data location**: Store spell configs next to abilities data (e.g., `apps/server/src/data/abilities` or top-level `data/abilities.ts`), avoiding shared workspace packages per project conventions.
- **Type shape**: Proposed minimal fields per spell: `id`, `name`, `description`, `manaCost`, `cooldownMs?`, `autocastEnabledByDefault?`, `effects` (e.g., `{kind: 'slow', movePct, atkPct, durationMs, caps?}` / `{kind: 'bounce', maxTargets, radius, falloff, allowRepeat, los}`), `scaling?`.

Also add in a "damage".

- **Tuning flags**: Include simple on/off flags to quickly disable a spell in live.

## HUD and UI Details

- **Mana bar**: Under HP, same width and typography. Confirm color (blue/indigo), show `current/max` text or only bar? Round numbers? Animations duration same as HP bar (300 ms)?
- **Ability bar**: Should spells appear as their own row/section in `AbilityBar`, or integrated alongside grenades/weapons? How many slots do we reserve initially?
- **Mobile gestures**: Long-press duration threshold (ms) to toggle autocast? Haptic feedback on toggle?
- **Tooltips**: Desktop hover tooltip with cost and effect summary. Include “Autocast: Right-click to toggle”.

## Edge Cases and Rules

- **Concurrent procs**: On multi-projectile hits, do we cast once per enemy hit or once per attack? If per enemy, confirm mana deduction per enemy.
- **Hit immunity**: If an enemy is immune to slow, still consume mana (cast attempted) or detect and skip cost?
- **Cap interactions**: Global slow cap per enemy (e.g., 60%) across all sources? If yes, how do we display clamped effects to players/devs?
- **PvP**: Any PvP considerations (e.g., reduced durations) or is this PvE-only for now?

## Telemetry and QA

- **Analytics**: Track spell cast counts, hit counts, average chain length, mana spent, and damage contribution for balancing?
- **Debug overlays**: Temporary server text for spell procs (e.g., “Freeze 30% 2.5s”, “Bounce x4 (-20%/hop)”) shown in existing debug panel registry.
- **Acceptance criteria**:
  - Mana bar visible and accurate on desktop and mobile HUDs.
  - With autocast enabled, spells trigger only on successful hits, consume mana correctly, and never block base attack.
  - Freezing Attack applies a slow that respects caps/immunities and refresh rules.
  - Bounce Attack chains to valid nearby enemies per design and respects “no repeat target” if set.

## Initial Defaults (if you prefer a starting point)

- **Freezing Attack**: 30% move slow, 20% attack slow, 2.5s, refresh on hit, strongest-only, boss effectiveness 50%, mana cost 12.
- **Bounce Attack**: Max 5 targets including first, 450 px radius per hop, nearest-next, no repeats, -20% damage per hop, instant hops, mana cost 16.
- **Mana**: Max 100, regen 2.5/s (in-combat), 5/s (out-of-combat), clamped [0, max].
- **HUD**: Mana bar under HP, indigo gradient, numeric current/max text.

Please confirm/adjust the above and answer the questions; I’ll implement immediately after.

### Implementation Plan

This plan reflects the answers above and follows project conventions (server-authority, action system, no shared workspace packages for types).

#### 1) Data, Types, and Config

- Create `apps/server/src/types/spells.ts` (interfaces only, no enums):
  - `interface SpellDefinition { id: string; name: string; description: string; manaCost: number; cooldownMs?: number; autocastEnabledByDefault?: boolean; enabled?: boolean; allowedWeaponTypes?: ReadonlyArray<string>; damage?: number; effects: FreezeEffect | BounceEffect; }`
  - `interface FreezeEffect { kind: 'freeze'; // Uses existing Slow status under the hood }`
  - `interface BounceEffect { kind: 'bounce'; maxTargets: number; radius: number; falloffPerHop: number; allowRepeat: boolean; losRequired: boolean; travelMs: number; appliesOnHitEffects: boolean; }`
  - `interface PlayerSpellState { autocastEnabledBySpellId: Record<string, boolean>; cooldownUntilBySpellId: Record<string, number>; }`
- Create `apps/server/src/data/spells.ts` with two entries:
  - `freezing_attack`: `manaCost: 3`, short `cooldownMs` (TBD, recommended 500–800 ms), `allowedWeaponTypes: ['staff']`, `effects: { kind: 'freeze' }`, `damage: 0`.
  - `bounce_attack`: `manaCost: 3`, short `cooldownMs` (TBD), `allowedWeaponTypes: ['staff']`, `effects: { kind: 'bounce', maxTargets: 4, radius: 200, falloffPerHop: 0.2, allowRepeat: false, losRequired: true, travelMs: 80, appliesOnHitEffects: true }`, `damage: 0` (base damage comes from the attack; this adds chaining).
- Add a simple `SPELLS_BY_ID` map for quick lookup and feature flag `enabled`.

#### 2) Player Stats: Mana

- Extend server-side player stats/state to include `mana` and `maxMana` and ensure they are propagated to clients:
  - Update `apps/server/src/schemas/index.ts` player schema to add `mana` and `maxMana` (integers or numbers, clamped [0, max]).
  - Define `maxMana` formula hook: base + level/stats/equipment modifiers (wire in the existing progression pipeline; if not ready, start with base and TODO hook-ins, keeping code paths prepared).
- Regen:
  - Update `apps/server/src/lib/systems/PlayerRegenSystem.ts` to regenerate mana at `0.25 / s` (frame-rate independent), clamped to `maxMana`.
  - Ensure regen continues always (no special cast-pausing per answer).
- Mana potions:
  - In the existing item-use flow, implement `+50` mana on use, no cooldown, with clamp to `maxMana`.

#### 3) Action System and Server Spell Resolution

- Manual cast path:
  - Add a `startAction('cast_spell')` message and server handler that validates: player alive, weapon type allowed, spell `enabled`, mana ≥ `manaCost`, cooldown not active.
  - Deduct mana, set `cooldownUntilBySpellId[spellId]` now + `cooldownMs` (if defined), then resolve spell effects.
- Autocast path (on-hit):
  - In the server attack-hit resolution (the same place that confirms a successful hit for `attack_enemy`), trigger eligible spells:
    - Only if player weapon type includes `staff`.
    - For each spell with autocast enabled (client-side preference mirrored/validated on server as needed), and not on cooldown, and mana ≥ cost: deduct mana, set cooldown, and resolve effects for that hit.
    - If mana < cost, skip and do not queue; client will show disabled state.
  - Apply spells after base damage calculation, per answer.
- Effects implementation:
  - Freezing Attack: call existing Slow/Status system with the same parameters/stacking/caps/immunity rules as the current Slow effect and the configured duration (reusing the same constants/paths used by other sources of Slow).
  - Bounce Attack:
    - Start from the initial successful target (the base attack’s first victim).
    - Iteratively find next target: nearest enemy within 200 px of the last hit target, not yet hit in this chain, using line-of-sight block via tile collision/raycast. Stop early if none.
    - Schedule per-hop impact with `travelMs` delay for each hop to simulate short travel; on impact, apply a new damage instance based on base hit damage with `-20%` per hop falloff and propagate on-hit effects if configured.
    - Do not allow repeat hits of the same target; stop after `maxTargets` including the first.
- Networking/VFX:
  - Broadcast authoritative events to nearby clients for VFX only: `spell_proc` with `{ spellId }`, `chain_hit` with `{ fromId, toId, hopIndex }`, and rely on existing status VFX for Slow.

#### 4) Client HUD and Ability Bar

- Mana bar UI:
  - Add `useCurrentPlayerMana` hook similar to `useCurrentPlayerHp` (reads from scene/registry or room state) returning `{ mana, maxMana }`.
  - In `apps/client/src/components/GameHUD.tsx` and `apps/client/src/components/MobileGameHUD.tsx`:
    - Render a Mana bar directly under the HP row, same width and typography, blue/indigo gradient, numeric `current/max`, 300 ms width transition to match HP.
    - If mana insufficient for a given spell and autocast is enabled, show a subtle disabled indicator on that spell slot (dim icon + tooltip text like “Not enough mana”).
- AbilityBar integration:
  - Add spell slots into the existing `AbilityBar` model without duplicating logic. Spells should:
    - Support left-click/tap to manual cast (which sends `startAction('cast_spell')`).
    - Support right-click (desktop) / long-press (mobile) to toggle autocast; show `AUTO` badge when enabled.
    - Show per-spell short cooldown (ring/overlay) if `cooldownMs` configured.
  - Only display spells when the equipped weapon type is `staff`.

#### 5) Persistence and Preferences

- Store autocast toggles client-side in localStorage keyed by `{accountOrCharacterId}:{spellId}`.
- Optionally echo the state to the server on join for validation; server should tolerate missing state and simply rely on per-hit checks.

#### 6) Validation, Rules, and Edge Cases

- Multiple spells enabled: all eligible spells may proc on the same hit (each consuming mana).
- Multi-projectile/AoE: procs evaluate per successful enemy hit. Each proc consumes mana once per affected enemy if the spell applies per-enemy (Freeze does; Bounce is anchored to the first hit and then chains).
- Immunities: If enemy is Slow-immune, effect application fails but mana is still spent (cast attempted), per common RPG convention. If you prefer skipping cost on immunity detection, we can add a pre-check (optional later).
- Global caps: Respect existing Slow caps/stacking rules.

#### 7) Telemetry and Debuggability

- Add counters: `spells.castCount`, `spells.manaSpent`, `spells.bounce.avgChainLen`, `spells.freeze.applied`.
- Debug text in server registry for development: show “Freeze Xs” and “Bounce n/4” in existing serverPerf text area when debug is enabled.

#### 8) Testing

- Unit tests (server):
  - Mana regen clamps, potion restores +50, insufficient mana skip.
  - Freeze application respects existing Slow rules and boss multipliers.
  - Bounce chaining: honors radius, LoS, nearest-next, no repeats, falloff, travel timing, early stop when fewer targets.
- Integration tests:
  - Autocast on-hit with staff weapon, cooldown respected, mana deducted per proc.
  - Manual cast via `cast_spell` action.
- Client tests (light): render Mana bar; AbilityBar toggles `AUTO`; insufficient mana visual state.

#### 9) Rollout Steps

- Implement server stats/schema + regen + potion; surface mana to clients.
- Add spell types/config and server spell resolution (freeze + bounce).
- Wire autocast on-hit in attack success pipeline.
- Implement client Mana UI + AbilityBar spell slots and toggles.
- Ship behind data `enabled` flags (default on in development). Validate in staging.

#### 10) Open Values to Finalize (defaults used if not specified)

- `cooldownMs`: short—recommend 600 ms for both spells initially.
- `Freeze` duration/magnitudes: pulled from existing Slow config; no new values needed.
- `Bounce` travel time: 80 ms per hop; falloff 20%; radius 200 px; max targets 4 (incl. first).
