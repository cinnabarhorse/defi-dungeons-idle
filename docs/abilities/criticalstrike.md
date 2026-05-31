### Critical Strike – Clarifying Questions

Please confirm the following so we can implement Critical Strike aligned with the abilities approach described in `docs/ABILITIES.md`.

## Scope

- **Targets**: Should Critical Strike apply to both players and enemies? Any exceptions (e.g., bosses, environment)?

Yes, it should apply to everyone. There is no resistance against critical strikes.

- **Attack types**: Which damage sources can crit? melee, ranged, AoE, projectiles, on-hit effects, DoTs?

melee, range, aoe, projectiles, yes, everything.

- **PvP**: Enabled in PvP as well?

Yes.

## Computation and RNG

- **Chance parameter**: Use `chance` as a fraction (e.g., `0.10` for 10%)?

Yeah.

- **Multiplier parameter**: Use `multiplier` (e.g., `2` for 2× damage on crit)?

Yes.

- **Roll granularity**: Roll per-hit instance? For multi-projectile shots, roll per projectile or once per shot?

Per projectile.

- **Determinism**: Server-only RNG is fine. Any need for deterministic seeds per room/tick?

No, server only RNG is fine.

## Stacking and Caps

- **Stacking (chance)**: Aggregate `chance` additively across sources (character + weapon + wearable)?

Whatever is industry standards.

- **Stacking (multiplier)**: How should multiple multipliers combine?
  - Additive on the bonus portion (e.g., base 1×, +1× → 2×; +0.25× → 2.25×)
  - Multiplicative (e.g., 2× then 1.25× → 2.5×)
  - Max-of (take the highest)

Whatever is industry standard.

- **Caps**: Any hard/soft caps on total crit chance (e.g., 100% hard cap) or multiplier?

No hard cap needed.

## Damage Pipeline Integration

- **Order**: When should the crit multiplier apply relative to mitigation/resistances?
  - Before mitigation (crit scales base damage, then defenses reduce)
  - After mitigation (crit scales final damage)

I'm not sure whatever is industry standard.

- **Overkill**: If damage exceeds remaining HP, we’ll deal only remaining HP. Any special rules for crit overkill?

No special rules needed except for life steal, which has already been handled.

- **Life Steal interaction**: Life Steal uses final post-mitigation damage per `ABILITIES.md`. Confirm that crit increases Life Steal proportionally (since it raises final damage).

Yes, that is correct.

## Interactions and Counters

- **Crit resistance/avoidance**: Should we plan a future `crit-resistance`/`crit-avoidance` ability? If yes, how should it combine with chance (subtract, multiplicative reduce) and/or multiplier (reduce bonus portion)?

Not needed right now.

- **Friendly targets / environment**: Exclude non-hostile targets and breakables from crits?

Breakables might be included. Let's include them for now.

## Data Model

- **Ability id**: Confirm `id: 'critical-strike'`.
- **Params**: Proposed schema for per-source params:
  - `chance: number` (fraction, e.g., `0.10`)
  - `multiplier: number` (e.g., `2`)
  - `appliesTo?: 'melee' | 'ranged' | 'all'` (default `'all'`)
- **Attachment points**: Same pattern as Life Steal — reference in `characters.ts`, `enemies.ts`, `wearables.ts`, and weapons via:
  - `abilities: [{ id: 'critical-strike', params: { chance: 0.10, multiplier: 2 } }]`

## BushidoGotchi Rollout

- **Apply to**: BushidoGotchi (confirm exact character key/id in `data/characters.ts`).
- **Initial values**: What values should we start with? Example proposal: `chance: 0.10`, `multiplier: 2`.

## UI / FX (Optional)

- **Floaters**: Show a distinct "CRIT!" damage floater color/size? Any preference (e.g., gold/yellow)?

Make the text bigger. With a more intense red color.

- **SFX**: Play a crit hit sound?

No sound yet.

- **HUD**: Display aggregated crit chance in character panel/tooltips?

Yes.

## Validation

- **Tests**: Any required unit/integration tests on the server? e2e scenario to verify crit frequency and multiplier?

Not yet.

---

If you confirm the above (or adjust where needed), I’ll implement `critical-strike` on the server damage path, aggregate stacking across sources at runtime, and add it to Aishido Gotchi.
