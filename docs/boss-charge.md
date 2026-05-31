# Ability: Bloodlust Charge (Power-up → Charge → Recovery)

## Goals

- Create a reusable server-authoritative ability with three phases:
  1. Power-up (3s): boss stands still and charges power.
  2. Charge: boss dashes toward a target player; first hit deals 2x normal damage.
  3. Recovery (3s): boss rests in place and takes 2x damage.
- Preserve action/attack systems and anti-cheat guarantees.
- Provide clear client VFX cues via lightweight server events.

## Server-side Design

### Runtime state (tracked per ability instance)

The ability stores ephemeral state on each enemy under a private runtime key:

- `state: 'idle'|'powerup'|'charge'|'recovery'`
- `stateUntil: number // unix ms`
- `nextReadyAt: number // unix ms cooldown gate`
- `targetPlayerId: string`
- `targetX: number`
- `targetY: number`
- `vx: number`
- `vy: number`
- `stuckFrames: number`
- `hasHitDuringCharge: boolean`

Incoming damage multipliers continue to use `(enemy as any).incomingDamageMultiplier` so shared hooks work unchanged.

Keep these as properties on the object instance (not decorated with @type) to avoid network churn.

### Triggers

- Ability is opt-in via enemy abilities list (`bloodlust_charge`).
- Enter `powerup` if:
  - State is `idle`
  - `now >= runtime.nextReadyAt`
  - A valid target player exists
- On entering `powerup` (duration `powerupMs`):
  - Freeze movement/attacks (skip default handlers while special is active)
  - Snapshot player position to `(targetX, targetY)`
  - Set `stateUntil = now + powerupMs`
  - Broadcast `boss_special_state` { state: 'powerup', enemyId, durationMs: powerupMs, targetX, targetY }

### Power-up phase handling

- While in `powerup`, keep `anim='idle'` and do not move.
- When `now >= stateUntil`, transition to `charge`:
  - Compute `(vx, vy)` as normalized vector from boss `(x,y)` to `(targetX, targetY)`
  - Reset `hasHitDuringCharge=false`
  - Broadcast `boss_special_state` { state: 'charge_start', enemyId, targetX, targetY }

### Charge phase handling

- Each tick while `state==='charge'`:
  - Recompute `(vx, vy)` toward the current target position so the dash homes in.
  - Move by `(vx * speed, vy * speed)` with `speed = chargeSpeed` (configurable) and respect `checkObstacleCollision`.
  - If collision occurs, end charge early and transition to `recovery`.
  - Check for player hit: for each alive player, if distance to boss <= `hitRadius`, and `hasHitDuringCharge===false`:
    - Deal damage: `raw = enemy.damage * chargeDamageMultiplier` → `final = calculateDamageAfterMitigation(player, raw).finalDamage`
    - Apply to `player.hp` and broadcast a standard damage event
    - Set `hasHitDuringCharge=true`
  - End conditions:
    - Close enough to `(targetX, targetY)` (e.g., <= 10px)
    - Obstacle collision
    - Max dash time exceeded (safety cap, e.g., 1.5–2.0s)
  - On end: transition to `recovery` and broadcast `boss_special_state` { state: 'charge_end', enemyId }

### Recovery phase handling

- On entering `recovery` (duration `recoveryMs`):
  - Freeze in place; `anim='idle'`
  - Set `(enemy as any).incomingDamageMultiplier = incomingDamageMultiplier` (default 2.0)
  - Set `stateUntil = now + recoveryMs`
  - Broadcast `boss_special_state` { state: 'recovery', enemyId, durationMs: recoveryMs }
- When `now >= stateUntil`:
  - Clear multiplier (set to 1)
  - Set `state='idle'`, `nextReadyAt = now + cooldownMs`
  - Broadcast `boss_special_state` { state: 'ended', enemyId }

### Integration points

- `updateEnemyMovement(...)`:
  - After determining activity, but before default attack/move logic, call `runEnemyAbilities(...)`.
  - Ability handlers trigger entry into powerup when eligible, run per-phase logic, and return a boolean `handled`.
  - If `handled===true`, skip normal movement/attack handling for that enemy this tick.

- Enemy-to-player damage during charge uses the same mitigation pipeline used in `performEnemyMeleeAttack` (armor, staging invulnerability, kill checks, etc.). Reuse helpers where possible.

- Player-to-enemy damage multiplier (2x during recovery):
  - Hook into `AttackEnemyAction.performInteraction` before `applyAuraDamageMitigation` with a helper:
    - `function applyEnemyIncomingDamageModifiers(enemy: EnemySchema, damage: number): number` → multiplies by `(enemy as any).incomingDamageMultiplier ?? 1`
  - Then pass the modified value into `applyAuraDamageMitigation` and existing flow.

### Configuration knobs (per ability instance)

Add an ability to the enemy entry in `apps/server/src/data/enemies.ts`:

```ts
abilities: [
  {
    id: 'bloodlust_charge',
    params: {
      powerupMs: 2400,
      recoveryMs: 3000,
      cooldownMs: 9000,
      chargeSpeed: 11,
      chargeDamageMultiplier: 2,
      incomingDamageMultiplier: 2,
      hitRadius: 30,
      maxDashMs: 1400,
    },
  },
];
```

## Client-side Design (Phaser)

### Event-driven VFX

Handle server broadcasts `boss_special_state` in `GameScene`:

- `powerup`:
  - Apply red tint and a pulsing scale tween (1.0↔1.15, yoyo, easeOut) for duration
- `charge_start`:
  - Stop pulse, optionally add a brief motion streak or speedlines
- `charge_end`:
  - Clear charge VFX
- `recovery`:
  - Apply a distinct “vulnerable” VFX (e.g., white blink, shader outline) for duration
- `ended`:
  - Clear all special tweens/tints for that enemy

Maintain per-enemy VFX handles (tweens, timers) to safely cleanup on state changes or death.

## Edge cases

- If boss dies while in special, immediately cancel and clear multipliers; broadcast `ended` implicitly via standard death flow, and ensure client cleans VFX.
- If no target exists when cooldown completes, delay entering `powerup` until first valid target.
- Ensure only one special runs at a time and cooldown prevents immediate re-triggering.
- Abort charge if stuck on terrain for several consecutive frames.

## Telemetry/Debug

- Optional: log phase transitions and hits on the server with enemyId and timestamps to tune timings.
- Optional: dev overlay tag on client above boss showing special state for testing.

## Files to modify

- Server:
  - `apps/server/src/lib/abilities/enemyAbilities.ts` (ability runtime + state machine)
  - `apps/server/src/lib/systems/EnemySystem.ts` (hook into ability manager)
  - `apps/server/src/lib/actions/attack.ts` (incoming damage multiplier hook)
  - `apps/server/src/data/enemies.ts` (attach ability reference + params)
- Client:
  - `apps/client/src/game/GameScene.ts` (listen for `boss_special_state`, apply/remove VFX)
  - Optionally `apps/client/src/lib/enemy-sprite-manager.ts` for centralized VFX helpers

## Rollout

- Gate by boss type so only the intended boss uses the special.
- Start with generous telegraph (3s) and moderate charge speed; tune after playtests.

---

## Questions

1. Which boss `enemyType` should use this first (e.g., `portal_guardian`, `rektdoggo_boss`, other)?

Rektdoggo_boss

2. Preferred dash behavior when colliding with walls: stop immediately and enter recovery, or slide along wall briefly?

Stop immediately.

3. Hit rules during charge:
   - Single hit per charge (current plan), or allow multi-hit over time if the boss passes through multiple players?

Single hit.

4. Visual style for vulnerability: white flash, outline shader, or a specific effect you prefer?

Idle state

5. Cooldown preference for the first iteration (e.g., 10–15s), and should the boss re-evaluate immediately after recovery or always wait full cooldown?

10-15s sounds good.
