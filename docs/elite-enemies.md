## Elite enemies – design and implementation plan

### Best practices

- **Server-authoritative mechanics**: All elite decisions (spawn, stats, abilities, minion orchestration) live on the server to prevent exploits.
- **Single source of truth**: Centralize elite archetypes, stat multipliers, and ability sets in shared data; derive everything else from that.
- **Composition over inheritance**: Implement abilities as composable modules plugged into combat hooks (pre-roll, on-hit, on-tick, on-kill) rather than subclassing enemies.
- **Deterministic generation**: Use per-floor seeded RNG so elite presence/archetype/rolls are reproducible for debugging and test sims.
- **Spatial constraints**: Only spawn in rooms (never connectors), validate walkability and collision; place minions in a ring/arc that avoids doorways.
- **Group identity**: Tag the elite leader with `isElite` and give spawned companions a `leaderId` for coordinated AI, aggro sharing, leashing, and formation while leaving those companions otherwise normal enemies.
- **Telegraphing and readability**: Distinct visuals (scale, outline/aura, nameplate color, ability icons) for instant recognition and counterplay planning.
- **Counterplay and fairness**: Cap stacking effects and add ICDs (internal cooldowns); provide clear tells for dangerous abilities.
- **Difficulty scaling**: Tie spawn chance, stat boosts, minion counts, and ability weights to room tier/biome; cap elites per floor.
- **Risk and reward**: Scale XP/loot with a computed threat score; avoid farming exploits via minion reward rules.
- **AI-aware scaling**: Larger bodies affect pathing and avoidance; ensure target selection and swarm behavior remain smooth.
- **Observability**: Telemetry for spawn/kill, TTK, ability activations, wipe rates to drive tuning.
- **Integrate with action pipeline**: Attacks continue to flow through the existing action/timing system to keep animations and timing consistent.

### Implementation outline

#### Data modeling (shared config)

- Add `EliteArchetype` definitions alongside existing enemy data, e.g. fields:
  - `id`, `label`, `sizeMultiplier`, `healthMultiplier`, `damageMultiplier`, `speedMultiplier`
  - `abilityIds[]`, `minMinions`, `maxMinions`, `minionTypeIds[]`
  - `spawnWeight`, `allowedRoomTiers[] | record`, `allowedBiomes[]`, `visualTags[]`
  - `rewardMultiplier`, `baseThreatWeight`
- Extend game config with elite knobs:
  - `eliteSpawnChanceByRoomTier`, `eliteMaxPerFloor`, `minDistanceBetweenElites`
  - `minionRingRadiusTiles`, `maxFormationAttempts`, `maxElitesPerRoomBySize`
- Source of truth: prefer top-level `data/` and sync into server via existing generator (e.g., `scripts/generate-shared-files.ts`) to avoid drift.

#### Schemas and state

- Extend enemy schema with: `isElite`, `eliteArchetypeId`, `leaderId` (for minions), `sizeMultiplier`, `visualTags[]`, `threatScore`, `rewardMultiplier`.
- Ensure these fields propagate in server->client state updates; clients treat them as read-only for rendering.

#### Spawn logic (server)

- `apps/server/src/lib/systems/EnemySpawnSystem.ts` owns the pipeline via `spawnEliteGroup`:
  - Reject connector chunks; only true rooms can host elites.
  - Roll room eligibility with seeded RNG and enforce floor caps/min distance (`GameRoom.trySpawnEliteInChunk`).
  - Select an archetype filtered by room tier/biome, find a safe leader tile, and spawn the elite leader first.
  - Spawn companions in a ring; each companion only receives a `leaderId` and keeps its native stats so it behaves like a standard enemy outside aura range. Base stats are cached for later aura buffs.
- `apps/server/src/rooms/GameRoom.ts` integrates the spawn flow: `spawnElitesForDungeon` triggers after layout load, and `handleEliteDeathCleanup` clears group membership/reset buffs when the leader dies.

#### Aura application (runtime)

- `apps/server/src/lib/systems/AuraSystem.ts` – `applyAuras` runs every tick:
  - Collects any entity with `_auraSources` (leaders today, future player gear) and evaluates range checks for each aura definition.
  - Aggregates unique aura IDs (duplicates do not stack) so multiple distinct auras can affect the same target in a single tick.
  - Applies stat multipliers, mitigation, and regen, tagging recipients with `aura:buffed` plus any `aura:*` color tags for client rendering. Tags and stats revert automatically once the entity leaves every radius.
  - Shared buffs are expressed as ability references (see `data/abilities.ts`), so lifesteal, evade, speed, damage, mitigation, and regen all reuse the existing ability aggregation utilities.
  - Leader passives (e.g., lifesteal/evade) are attached as radius-zero aura sources so they flow through the same ability pipeline while affecting only the leader unless explicitly shared.
  - Uses cached `_baseDamage`, `_baseSpeed`, and `_baseAttackCooldownMs` snapshots populated at spawn time (`applyEliteLeaderModifiers` / `applyEliteMinionModifiers`) to restore original stats before reapplying the aggregated modifiers.
- `apps/server/src/lib/systems/EnemySpawnSystem.ts` seeds `_baseDamage`, `_baseSpeed`, and `_baseAttackCooldownMs` on both leaders and companions so aura application/reversion has stable baselines.
- Client-side (`apps/client/src/app/helpers.ts`, `apps/client/src/lib/entity-manager.ts`) listens for the aura tags to draw the glow and update HP bar color on non-elites.

#### Abilities system (server)

- Add ability hook points (if not already present): `onPreAttackRoll`, `onAttemptHit`, `onDamageDealt`, `onDamageTaken`, `onTick`, `onKill`, `onEnterCombat`.
- Implement modules (assign via `abilityIds`):
  - Lifesteal: heal a fraction of damage dealt; capped per second or per attack.
  - Evade: pre-damage roll to negate hits; may include an ICD to create windows of vulnerability.
  - Regeneration: periodic heal while in combat or out of combat with ramp-up.
  - Thorns/retaliate, Shield/overshield, or other controlled mechanics as needed.
- All attacks and hit resolutions continue to flow through the existing action/attack pipeline; abilities only hook the calculations and results.

#### AI and coordination (server)

- Companions (normal enemies with a `leaderId`) follow/assist their leader with a leash distance and re-form their ring when idle.
- Elite aggro broadcasts to nearby companions; they prefer the elite’s current target.
- On leader death: minions may enrage, flee, or lose aura, depending on archetype design.

#### Rendering (client)

- On spawn/update, if `isElite`:
  - Apply `sizeMultiplier` scale and optional outline/aura shader.
  - Use elite nameplate color and unique HP bar style; show an elite icon.
  - Optional: tooltip or on-hover quick icons for abilities.
- Clients render aura visuals based on server tags:
  - `apps/client/src/app/helpers.ts`/`apps/client/src/lib/entity-manager.ts` read `visualTags`; any enemy with `aura:*` or the generic `aura:buffed` marker (added server-side when inside the radius) receives the glow/aura circle even if `isElite` is false.
- Do not compute elite status locally; use server snapshots only.

#### Balance and rewards (server)

- Compute a `threatScore` from multipliers and ability weights.
- Rewards: scale XP/loot with `threatScore` (leader gets the bulk); minions have baseline or reduced rewards to prevent farming.
- Add tier-based caps to avoid degenerate combos (e.g., evade + regen limits per tier).

#### Telemetry and testing

- Emit events for elite spawn/kill, ability activations, player wipes, and fight duration.
- Use existing combat simulation to measure TTK and death rates against archetypes across tiers.
- Add an admin/debug toggle to force elite spawn for verification in staging.

#### Safeguards

- Guarantee at most one elite in small rooms; permit >1 in large rooms if spaced by `minDistanceBetweenElites`.
- Avoid doorways and critical interaction tiles for leader/minion placement.
- If valid minion spots cannot be found within `maxFormationAttempts`, spawn fewer minions or skip the elite.

### File-by-file change map

- `data/enemies.ts`: Add `EliteArchetype[]` and archetype definitions (ability IDs, stat multipliers).
- `data/game-config.ts`: Add elite spawn frequency, caps, and formation radii.
- `scripts/generate-shared-files.ts`: Include elite fields in the sync step to server data.
- `apps/server/src/schemas/index.ts`: Extend enemy schema with elite fields and ensure serialization.
- `apps/server/src/lib/systems/EnemySpawnSystem.ts`: Implement `spawnEliteGroup` and integrate into room population.
- `apps/server/src/lib/systems/EnemySystem.ts`: Add ability hook system and modules (lifesteal, evade, aura, regen, etc.).
- `apps/server/src/rooms/GameRoom.ts`: Ensure room vs connector classification is surfaced; call the elite spawner for eligible rooms.
- `apps/client/src/game/GameScene.ts`: Apply scale/visuals for elites; add UI indicators.

### Defaults for v1 (tunable)

- Spawn chance: 10–20% in eligible rooms by tier; 0% in connectors.
- Caps: 1 elite per small room (2 for large), `eliteMaxPerFloor` configurable.
- Formation: 4–6 minions on a 3–4 tile radius ring, avoiding doorways.
- Abilities: lifesteal (5–15%), evade (5–20% with ICD), aura (+10% minion AS), optional regen (small).
- Rewards: leader +150% XP/loot; companions keep their baseline rewards (they are normal enemies outside of aura buffs).

### Questions to confirm

1. Which room tiers/biomes should allow elites and at what spawn rates per tier?

room-base. let's have a 10% chance of spawning initially

2. Target minion count range and preferred ring radius per archetype? Any minion type restrictions?

minions must all be the same type as the leader. 8-10 minions

3. Final v1 ability set and caps (lifesteal %, evade % + ICD, aura type/values, regen rules)?

lifesteal and evade, auras that also apply to the nearby minions.

4. Visual direction: scale multiplier, outline/aura treatment, HP/nameplate colors, and any ability icons needed?

i'll add some auras later. for now just use a default red/green/blue/yellow aura

5. Rewards policy: leader reward multiplier, minion reward policy (none/reduced/baseline)? Any loot table changes?

tbd

6. Global caps: maximum elites per floor, minimum spacing between elites, and per-room caps by room size?

1 elite per floor. should be definable either in game_config or in the difficulty-tier

7. Connector detection: confirm the canonical room vs connector flag/field to reference in the spawn system.

yes

8. Data flow: confirm using top-level `data/` as the source of truth and syncing into server (no shared workspace packages); any additional generators to update?

yes, always top-level data folder

9. Telemetry: specific metrics and dashboards you want to see (spawn counts, TTK, wipes, ability activations)?

not yet

10. Admin controls: do you want a config/env flag to force elite spawns in staging/dev for testing?

not needed

Once these are confirmed, the first implementation step will be data/schema updates, followed by server spawn logic and abilities, then client visuals.
