### Thorns — Clarifying Questions

Please confirm the following so we can implement Thorns aligned with the abilities approach in `docs/ABILITIES.md` and the server-authoritative damage pipeline.

## Scope

- **Granting sources**: Confirm Thorns is a wearable-only passive (no weapons, no characters, no enemies). Any exceptions now or in future?
- **Targets**: Applies when a player takes damage from enemies. Should enemies ever have Thorns (future)?
- **Game modes**: Enabled in PvE and PvP?

## Damage model & order of operations

- **Basis**: Should reflection be computed from the player's final damage taken after mitigation (`finalDamage` from `calculateDamageAfterMitigation`) or from pre-mitigation damage? (Recommend: final damage taken.)
- **Overkill**: If incoming damage > current HP, compute reflection from the actual damage taken (clamped) or the attempted damage? (Recommend: actual taken.)
- **Mitigation on reflected damage**: Should the attacker’s defenses reduce reflected damage, or should reflection be pure/true damage that bypasses mitigation? (Recommend: apply normal mitigation to attacker for consistency unless you want “true reflect”.)
- **Crit interaction**: Enemy crits increase incoming damage, which indirectly increases reflection if we base on final damage. Should reflected damage itself be able to crit? (Recommend: no crit on reflect.)
- **Life steal interaction**: If the player has life steal, should reflected damage count as the player’s dealt damage for life steal healing? (Recommend: no, reflection does not trigger life steal.)
- **Damage types covered**: Reflect melee, ranged/projectiles, AoE, DoT ticks? Environmental hazards? (Recommend: all enemy-sourced direct damage, excluding environment.)

## Stacking & caps

- **Stacking rule**: Combine percentages additively across multiple wearables? e.g., 5% + 7% = 12%.
- **Global cap**: Any hard/soft cap on total reflection (e.g., 80%)?
- **ICD**: Any internal cooldown or per-hit minimum/maximum reflect? (Recommend: none.)

## Attribution & rules

- **Kill credit**: If Thorns kills an enemy, should kill credit go to the player? (Recommend: yes.)
- **Attack type tag**: For analytics/FX, label reflected kills/hits as `source: 'thorns'` or a special `weaponType: 'thorns'`? (Recommend: `source: 'thorns'`.)
- **Boss/elite rules**: Any reductions or immunity for bosses/elites?
- **PvP specifics**: Any separate percent or cap in PvP?

## Data model

- **Ability id**: Confirm `id: 'thorns'`.
- **Params**: Proposed schema:
  - `percent: number` (fraction, e.g., `0.10` for 10%)
  - `appliesFrom?: 'melee' | 'ranged' | 'all'` (default `'all'`) — only if you want to restrict by incoming damage type
- **Attachment points**: Wearables only. Example attachment in wearables data:

```ts
// In wearables effect map
'yoroi-armor': [
  { type: 'stat', modifiers: [/* existing */] },
  { type: 'ability', ability: ABILITIES.thorns({ percent: 0.10 }) },
];
```

## Engine integration (server-authoritative)

- **Aggregation**:
  - Add `ThornsParams` and `ABILITIES.thorns()` to `/data/abilities.ts` (mirrored to `apps/*/src/data/abilities.ts`).
  - Extend `/data/wearables.ts` effects to support an `ability` effect type and include it in aggregation results.
  - Update `/data/characters.ts` derivation to include wearable-provided abilities in `derived.abilities` (current logic only merges character + weapon abilities).
  - Add `aggregateThorns()` and `getPlayerThorns()` in `apps/server/src/lib/ability-utils.ts` to sum `percent` across `stats.abilities` with `id === 'thorns'`.

- **Damage hooks** (reflection happens when a player takes damage):
  - Melee: `apps/server/src/lib/systems/EnemySystem.ts` → after computing `finalDamage` and applying to player, compute `reflect = round(actualTaken * totalThornsPercent)` and apply to the attacking enemy (respecting chosen mitigation policy), then broadcast a `thorns_reflect` event; call `handleEnemyDeath` if HP ≤ 0.
  - Ranged: `apps/server/src/lib/systems/ProjectileSystem.ts` → when an enemy projectile hits a player (after `finalDamage`), compute and apply reflection to projectile owner.

- **Validation**:
  - Enforce “weapons cannot have Thorns” in `scripts/generate-shared-files.ts` during `validateWeaponDefinitions()` (throw if any weapon declares `id === 'thorns'`).

## Networking & FX

- **Server events**:
  - New: `thorns_reflect: { playerId, attackerId, damage, attackerHp, attackerMaxHp }`.
  - Alternatively reuse existing `enemy_damaged` but include `source: 'thorns'` to distinguish.
- **Client**:
  - Damage floater on attacker with a distinct color (e.g., purple) and optional “REFLECT” label.
  - HUD: Show aggregated Thorns % in character panel/tooltips.

## Validation

- Basic coverage:
  - Reflection triggers on melee and ranged hits against the player.
  - Multiple wearables stack additively; cap is respected if configured.
  - Reflection does not trigger life steal; no crit on reflect.
  - Boss rules honored if specified; no loops/infinite chains.

---

### Proposed Implementation Plan (pending your answers)

1. Data & registry

- Add `ThornsParams` and `ABILITIES.thorns()` to `/data/abilities.ts` and regenerate shared files.
- Extend `/data/wearables.ts` effects to support `{ type: 'ability', ability: AbilityInstance }` and aggregate these into `aggregation.abilities`.
- Update `/data/characters.ts` to include `aggregation.abilities` in `derived.abilities`.
- Add validation: disallow `thorns` in weapon ability lists during `validateWeaponDefinitions()`.

2. Server ability utils

- Implement `aggregateThorns(abilities)` and `getPlayerThorns(characterId)` in `apps/server/src/lib/ability-utils.ts`.

3. Server damage pipeline

- Enemy melee path: in `EnemySystem.performEnemyMeleeAttack`, after `finalDamage` is applied to the player, compute and apply reflect to the enemy; broadcast `thorns_reflect`; handle enemy death.
- Enemy ranged path: in `ProjectileSystem.updateProjectiles`, after applying damage to the player, reflect to the projectile owner enemy; broadcast and handle death.
- Decide whether reflection damage is mitigated by enemy defenses (per your answer).

4. Client UX (light)

- Render reflect floaters with a distinct style and optional label.
- Add aggregated Thorns % to character details.

5. Tests (optional now)

- Unit-test aggregation and reflection arithmetic.
- Integration sanity tests: melee reflect, ranged reflect, stacking and cap.

If you confirm the above (or adjust where needed), I’ll proceed with the implementation honoring your answers.
