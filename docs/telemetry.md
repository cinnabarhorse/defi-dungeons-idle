## Telemetry for Game Balance

This document describes the balance-focused telemetry to record for Gotchiverse Live, how to model events, where to instrument in the server, and recommended storage formats for long-term analysis.

### Objectives

- **Balance tuning**: quantify difficulty, enemy lethality, player survivability, and weapon effectiveness.
- **Progression health**: monitor run success rates, time-to-kill, drop rates, and economy caps.
- **Change safety**: track outcomes per game version and difficulty to de-risk balance patches.

## Event Model

- **Transport**: server emits append-only newline-delimited JSON (NDJSON), one JSON object per line.
- **Versioning**: each event has `eventType` and `eventVersion`. Only add fields in minor updates; avoid breaking changes.
- **Context**: include `gameVersion` (git sha), `roomId`, `sessionId`, `difficultyTierId`, and a `difficultySnapshot` at run start.
- **Privacy**: if needed, hash or pseudonymize `playerId`.

### Common Event Envelope (TypeScript)

```ts
export interface TelemetryEventBase {
  eventId: string; // uuid
  eventType: string; // e.g., 'attack_resolved'
  eventVersion: number; // version per eventType schema
  timestamp: number; // ms since epoch
  roomId: string;
  sessionId?: string; // per player
  playerId?: string; // hashed if required
  gameVersion: string; // git sha
  serverRegion?: string;
  difficultyTierId?: string;
  difficultySnapshot?: {
    enemyHealthMultiplier: number;
    enemyDamageMultiplier: number;
    enemySpeedMultiplier: number;
    enemyAggroRangeMultiplier: number;
    dropRateMultiplier: number;
    xpMultiplier: number;
    levelCost: number;
    maxEarnings: number;
  };
}
```

## What to Track (Balance-Oriented)

- **Sessions/Runs**
  - session_started/session_ended, run_started/run_ended
  - session length, active time, afk time
  - players per room, concurrent players

- **Difficulty Tiers**
  - selected tier id; eligibility checks (lickTonguesRequired) pass/fail
  - snapshot of multipliers at run start
  - win/clear rate, run length, deaths per run by tier

- **Enemy Spawning and Scaling**
  - enemy_spawned with base type and scaled stats
  - time-to-first-aggro, time-to-first-attack
  - enemies_alive gauge (periodic), spawn rate per minute

- **Player Combat (melee/ranged)**
  - attack_resolved: hit, crit, base/final damage, targetEnemyType, distance, coneTargets
  - hit rate, crit rate, DPS windows, TTK by enemy type
  - lifeSteal_heal_applied amount and source

- **Enemy Combat**
  - enemy_attack_resolved: hit/crit, damage, targetPlayerId
  - enemy DPS by type; player damage taken per minute
  - evasion outcomes for both sides

- **Projectiles and Grenades**
  - projectile_fired/projectile_hit with distance and travel time
  - grenade_thrown, grenade_exploded with totals and per-target impacts

- **Deaths/Survivability**
  - player_death with cause, killerEnemyType, time since run start
  - enemy_killed with cause (melee/ranged/grenades), killerId, overkill

- **Loot/Economy**
  - enemy_drop_spawned and lick_tongue_drop_spawned (type, rarity)
  - item_picked_up with time since drop
  - earnings vs levelCost, maxEarnings cap rate

- **World/Map Flow**
  - portal_guardian_spawn_chance_triggered, portal_guardian_spawned
  - portal_used with destination and new difficulty
  - map_transition timings; optional position heatmap sampling

- **Performance Context (low-cardinality)**
  - server tick drift, broadcast size, average loop duration

## Event Payloads (TypeScript)

Place types in `apps/server/src/types/telemetry.ts` (self-contained, no workspace packages).

```ts
export interface AttackResolvedPayload {
  weaponType: 'melee' | 'ranged';
  isHit: boolean;
  isCrit: boolean;
  baseDamage: number;
  finalDamage: number;
  targetEnemyId: string;
  targetEnemyType: string;
  targetHpBefore: number;
  targetHpAfter: number;
  distancePx?: number;
  coneTargets?: number;
}

export interface EnemyKilledPayload {
  enemyId: string;
  enemyType: string;
  maxHp: number;
  cause: 'melee' | 'ranged' | 'grenades' | 'other';
  killerPlayerId?: string;
  timeSinceRunStartMs: number;
  overkillDamage?: number;
}

export interface GrenadeExplodedPayload {
  grenadeId: string;
  wearableSlug: string;
  position: { x: number; y: number };
  radiusPx: number;
  travelTimeMs: number;
  fuseMs: number;
  enemies: Array<{
    enemyId: string;
    enemyType?: string;
    damage: number;
    hp: number;
    maxHp: number;
    distancePx?: number;
  }>;
  players: Array<{
    playerId: string;
    damage: number;
    hp: number;
    maxHp: number;
    distancePx?: number;
  }>;
  totalEnemyDamage: number;
  totalPlayerDamage: number;
}

export interface EnemySpawnedPayload {
  enemyId: string;
  enemyType: string;
  spawnX: number;
  spawnY: number;
  scaledStats: {
    maxHp: number;
    damage: number;
    speed: number;
    aggroRange: number;
  };
}

export interface EnemyAttackResolvedPayload {
  enemyId: string;
  enemyType: string;
  attackKind: 'melee' | 'ranged';
  isHit: boolean;
  isCrit?: boolean;
  baseDamage?: number;
  finalDamage: number;
  targetPlayerId: string;
  targetHpBefore: number;
  targetHpAfter: number;
}

export interface PlayerDeathPayload {
  playerId: string;
  cause: 'enemy_melee' | 'enemy_ranged' | 'grenade' | 'other';
  killerEnemyId?: string;
  killerEnemyType?: string;
  timeSinceRunStartMs: number;
}

export interface DropSpawnedPayload {
  dropId: string;
  itemType: string;
  itemCategory: string;
  rarity?: string;
  enemyId: string;
  enemyType: string;
  position: { x: number; y: number };
}

export interface PortalUsedPayload {
  portalType: 'og' | 'alpha' | 'fomo';
  destination: 'treasure_room' | 'new_map';
  newDifficultyTierId?: string;
}
```

## NDJSON Examples

```json
{"eventId":"...","eventType":"attack_resolved","eventVersion":1,"timestamp":1737580000000,"roomId":"r1","sessionId":"s1","playerId":"p1","gameVersion":"a1b2c3","difficultyTierId":"normal_2","difficultySnapshot":{"enemyHealthMultiplier":1.2,"enemyDamageMultiplier":1.1,"enemySpeedMultiplier":1,"enemyAggroRangeMultiplier":1.1,"dropRateMultiplier":1.1,"xpMultiplier":1.1,"levelCost":1,"maxEarnings":2},"payload":{"weaponType":"melee","isHit":true,"isCrit":false,"baseDamage":12,"finalDamage":14,"targetEnemyId":"e123","targetEnemyType":"blue_slime","targetHpBefore":40,"targetHpAfter":26,"distancePx":48,"coneTargets":2}}
{"eventId":"...","eventType":"grenade_exploded","eventVersion":1,"timestamp":1737580001500,"roomId":"r1","sessionId":"s1","playerId":"p1","gameVersion":"a1b2c3","difficultyTierId":"normal_2","payload":{"grenadeId":"gren_xxx","wearableSlug":"frag","position":{"x":512,"y":420},"radiusPx":120,"travelTimeMs":300,"fuseMs":300,"enemies":[{"enemyId":"e1","enemyType":"cactus","damage":20,"hp":0,"maxHp":20,"distancePx":30},{"enemyId":"e2","enemyType":"blue_slime","damage":10,"hp":15,"maxHp":25,"distancePx":90}],"players":[],"totalEnemyDamage":30,"totalPlayerDamage":0}}
```

## Instrumentation Hotspots (Server)

- `apps/server/src/lib/actions/attack.ts`
  - After melee damage is applied and `damage_applied` is broadcast: emit `attack_resolved` with hit/crit, base/final damage, enemy type, and cone target count.
  - For ranged: after `fireProjectileAtTarget`, emit a `projectile_fired`; on hit (in projectile system), emit `projectile_hit` and `attack_resolved`.

- `apps/server/src/lib/actions/throw-grenade.ts`
  - On `grenade_thrown` broadcast: emit `grenade_thrown` telemetry (distance, travelTimeMs, fuseMs, cooldownMs).
  - In `handleExplosion`: emit `grenade_exploded` with per-target arrays and totals.

- `apps/server/src/lib/systems/EnemyDeathSystem.ts`
  - At death resolution: emit `enemy_killed` with cause and killerId.
  - In `spawnEnemyDrop` and `spawnLickTongueDrop`: emit `drop_spawned`.
  - When guardian spawn chance triggers/spawns: emit `guardian_chance_triggered` and `guardian_spawned`.

- `apps/server/src/lib/systems/EnemySpawnSystem.ts`
  - In `applyDifficultyScaling` / `spawnEnemyOfType`: emit `enemy_spawned` with `scaledStats`.

- `apps/server/src/lib/systems/EnemySystem.ts`
  - In `performEnemyMeleeAttack`: emit `enemy_attack_resolved` for each resolved target.
  - In `fireEnemyProjectile` (projectile system): emit ranged `enemy_attack_resolved`.

- `apps/server/src/rooms/GameRoom.ts`
  - At run start/end: emit session/run lifecycle events with `difficultySnapshot`.
  - On portal use / world transitions: emit `portal_used`, `map_transition`.

## Storage Format and Pipeline

- **Format**: NDJSON. Append-only, one event per line.
- **Ingestion**: Ship logs to a warehouse (ClickHouse/BigQuery/Snowflake). Partition by `ingestion_date`; cluster by `eventType`, `difficultyTierId`, `enemyType`.
- **Schema control**: include `eventVersion`; only additive changes. Document changes alongside code.
- **Retention**: raw events 30–90 days; derived aggregates longer.
- **High cardinality**: hash/anonymize `playerId` if needed; keep `roomId` and `sessionId`.

## Derived Metrics (Computed Offline)

- **TTK/TTD**: time-to-kill per enemy type; time-to-death per player/tier.
- **DPS**: per weapon type and tier; grenade efficiency (avg enemies hit, damage/throw).
- **Rates**: hit, crit, and evasion rates by enemy type and tier.
- **Danger index**: enemy damage/minute vs player health pools per tier.
- **Economy**: realized drop rates vs configured; pickup latency; earnings vs `levelCost`; `maxEarnings` cap rate.
- **Progression**: win rate per tier/character; average run length; deaths/minute.

## Sampling and Volume Controls

- Emit outcomes, not all attempts (e.g., prefer `attack_resolved` over `attack_started`), except when measuring latency.
- Optionally aggregate high-frequency counters per player every 5s (hits, misses, crits, damageDealt, damageTaken).
- Sample `position_sampled` every 3–5s per player for heatmaps.

## Privacy & Security

- Pseudonymize `playerId` when exporting outside the secure environment.
- Avoid storing PII; keep event context limited to gameplay.
- Include `gameVersion` to attribute changes to releases.

## Implementation Notes

- Add a minimal `TelemetryService` in `apps/server/src/lib/telemetry/` with a single `emit(event: TelemetryEventBase & { payload: unknown })` method. Start with a no-op or file logger; swap to a proper sink later.
- Define interfaces above in `apps/server/src/types/telemetry.ts` (inline types; do not import workspace packages).
- Gate emission behind an env flag (e.g., `TELEMETRY_ENABLED`) and batch writes to reduce overhead.
