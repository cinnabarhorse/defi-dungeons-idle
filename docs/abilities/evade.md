### Evade — Clarifying Questions and Implementation Plan

This proposes a new passive ability that lets a target automatically dodge incoming hits. As requested:

- Evade applies to both melee and ranged hits
- Evade does not work for grenade hits
- Evade can be attached to wearables (not weapons) and to enemy types
- On proc, show an overhead "EVADE" text above the entity (player or enemy)

Please confirm answers to the questions below before we implement.

## Clarifying questions

### Scope & triggers

- Attack sources: Confirm Evade rolls against all direct-hit sources except grenades:
  - melee single-target and melee cleave/aoe
  - ranged projectiles (per projectile)
  - exclude `grenades` weaponType entirely

Yes

- Multi-hit semantics: Roll Evade once per incoming hit instance (per projectile and per target in AoE)?

Yes

- PvP: Enabled vs players as attackers too?

Yes

- Environment: Should Evade apply vs environmental hazards/dots (if any later), or direct attacks only?

Direct attacks only.

### Chance model & stacking

- Param shape: `chance: number` (fraction, 0.10 = 10%). OK?

Yes.

- Stacking across multiple wearables: Additive on chances with hard clamp at 100%? Or diminishing returns?

Yes.

- Source restrictions: Confirm Evade should be provided by wearables (not weapons) and enemy base types. Should characters themselves be allowed to have Evade in their base `abilities` or keep it strictly to wearables/enemies?

Keep it strictly to wearables and enemies.

- Separate channels: Do you want separate `chanceMelee` and `chanceRanged` params, or one `chance` with `appliesTo?: 'melee' | 'ranged' | 'all'` (default `'all'` but still ignoring grenades)?

Interesting question, but for now let's just make it chance.

- Internal cooldown: Any ICD after a successful proc (e.g., cannot Evade again for N ms)? If yes, what default?

No cooldown.

### Interaction with other systems

- Critical Strike: If Evade procs, should the hit be fully negated before any crit/heal numbers are computed (recommended), meaning no crit floater for that hit?

Yes, exactly.

- Life Steal: Confirm Evade negates the hit entirely so attacker gains 0 life steal from that hit.

Yes.

- On-hit statuses (e.g., stun, thorns, future effects): Should Evade prevent all on-hit effects from applying?

Yes.

- Cleave/AoE: Evaluate per target. Some targets may Evade while others are hit. OK?

Yes.

- Enemy abilities: Enemies can have Evade too. Any exceptions (e.g., certain bosses ignored)?

No exceptions.

### UX / feedback

- Overhead text: Copy as exactly `EVADE`? Preferred color/size? Proposal: bold cyan/blue text similar to crit styling but distinct.

Let's call it MISS instead. Just use red, just like crit.

- SFX: Play a subtle whoosh on Evade? We have `public/sfx/fastwoosh.mp3` available. Use it?

No SFX

- Logging/telemetry: Emit a small server log/metric `attack_evaded` for later balancing?

You can put a placeholder there. We'll add it later.

## Data model (proposal)

Add a new ability to the shared data model with a simple param shape and filtering like other abilities.

```ts
// data/abilities.ts (root single source of truth)
export interface EvadeParams {
  /** Probability to dodge a qualifying incoming hit (0.10 = 10%). */
  chance: number;
  /** Applies to melee, ranged, or all (grenades always excluded). Default: 'all'. */
  appliesTo?: 'melee' | 'ranged' | 'all';
  /** Optional internal cooldown in ms after a successful Evade. */
  cooldownMs?: number;
}

export const ABILITIES = {
  // ...existing
  evade(params: EvadeParams): AbilityInstance<EvadeParams> {
    return {
      id: 'evade',
      kind: 'passive',
      params: { appliesTo: 'all', ...params },
    };
  },
};
```

Attach Evade to:

- Wearables only (not weapons) for players, e.g.:

```ts
abilities: [{ id: 'evade', params: { chance: 0.1, appliesTo: 'all' } }];
```

- Enemy base types (in `apps/server/src/data/enemies.ts` generated from root `data/enemies.ts`), e.g.:

```ts
abilities: [{ id: 'evade', params: { chance: 0.05, appliesTo: 'melee' } }];
```

## Server-authoritative integration (high level)

We’ll compute Evade on the target at the moment a hit would be applied. If Evade succeeds, skip damage and on-hit effects, and broadcast an `attack_evaded` message so clients can render the overhead text.

### Aggregation & RNG utilities

- Add in `apps/server/src/lib/ability-utils.ts`:
  - `aggregateEvade(abilities, weaponType)` → `{ chance: number, cooldownMs?: number }` (sum chances, clamp to 1; choose stacking rule per your answer)
  - `getPlayerEvade(characterId, weaponType)` and `getEnemyEvade(enemyType, weaponType)`
  - `rollEvade(chance): boolean`
  - Optional: track per-entity last-proc timestamps to enforce `cooldownMs` if used

### Melee: player → enemy

- File: `apps/server/src/lib/actions/attack.ts`
- Inside the per-target loop (post target collection, before HP subtraction):
  - Check `getEnemyEvade(enemy.enemyType, 'melee')`; if roll passes, broadcast `attack_evaded` and skip damage for that target.
  - Proceed normally for non-evaded targets. Life steal uses only actual damage dealt (unchanged).

### Melee: enemy → player

- File: `apps/server/src/lib/systems/EnemySystem.ts` in `performEnemyMeleeAttack`
- Before per-target damage application:
  - Check `getPlayerEvade(target.characterId, 'melee')`; if evaded, broadcast `attack_evaded` and skip that target

### Ranged projectiles

- File: `apps/server/src/lib/systems/ProjectileSystem.ts`
- Player projectile → enemy branch: before applying `enemy.hp -= projectile.damage`, check `getEnemyEvade(enemy.enemyType, 'ranged')`; if evaded, broadcast `attack_evaded` and skip damage
- Enemy projectile → player branch: before computing/assigning damage to player, check `getPlayerEvade(player.characterId, 'ranged')`; if evaded, broadcast `attack_evaded` and skip damage
- Grenades: No Evade checks (explicitly excluded)

### Networking

- New server → client message: `attack_evaded`

```ts
// payload proposal
{
  attackerId: string;
  targetId: string;
  weaponType: 'melee' | 'ranged'; // never 'grenades'
  timestamp: number;
}
```

## Client UX integration

- File: `apps/client/src/app/page.tsx`
  - Add `this.room.onMessage('attack_evaded', ...)` and render an overhead floater on the `targetId` container:
    - Text: `EVADE`
    - Style: bold, cyan/blue (e.g., `#66ccff`), stroke `#000`, tween upward and fade over ~600ms (mirroring damage/heal floaters)
  - Optional: play a subtle whoosh SFX if approved

## Acceptance criteria

- Player Evade cancels enemy melee and ranged hits; shows `EVADE` floater; no HP loss; no life steal for attacker
- Enemy Evade cancels player melee (and ranged) hits; shows `EVADE` floater; no HP loss; no life steal for player
- Evade never cancels grenade damage
- Cleave/AoE roll per target; mixed outcomes are possible in one swing
- Works in multiplayer; all clients see the same `EVADE` on the same entity at the same time

## Test plan (initial)

- Unit: `aggregateEvade` (stacking, appliesTo filtering, clamp), `rollEvade`
- Manual: set high Evade % and verify behavior on each path:
  - player melee → enemy, player ranged → enemy
  - enemy melee → player, enemy ranged → player
  - grenade explosions still hit
  - cleave with several enemies; only some evade

## Open decisions to confirm

- Stacking rule and hard cap for `chance`
- Separate chances per channel vs single chance with `appliesTo`
- Internal cooldown after a successful Evade (value?)
- Color/size for `EVADE` floater and whether to add SFX
- PvP enabled/disabled
- Whether characters (not just wearables/enemies) may ever specify Evade in base abilities

Once confirmed, we’ll implement server-first (authoritative, via the existing action system) and wire up the client floater for a consistent experience.
