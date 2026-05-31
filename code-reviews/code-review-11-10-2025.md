# Code Review — Author Templates Importing (11/10/2025)

## Findings

- Reduce hardcoded key duplication
  - Bodies API (`bodies/route.ts`) maintains a local `BODY_KEYS` list while `_lib/files.ts` already holds the authoritative key map. Prefer deriving allowed keys from `_lib/files.ts` to avoid drift.
  - `_lib/files.ts` still lists per-file keys (`rofl-room`, `rofl-pond`). With `custom-bodies` in place, these can be removed to simplify the surface area.

- Make editor body list dynamic
  - `AuthorTemplatesPanel.tsx` uses static `BODY_OPTIONS` and `BODIES_BY_FILE`. This requires code edits when adding new bodies.
  - Recommendation: two-step selector: (1) Body Source (e.g., `room-base`, `connector-base`, `custom-bodies`) from an API that lists available authoring keys; (2) Body Template populated from `/api/authoring/bodies?key=<selected>`. Remove static maps entirely.

- Remove ordering map
  - `BODIES_BY_FILE` drives save-time ordering. Prefer preserving the order returned by `/api/authoring/bodies` (module export order) and replace-or-append the current body. For special pinning (e.g., `room-base-40`), keep an optional `pinIds` list local to the handler.

- Normalize cache typing
  - With `BodiesCache = Map<string, BodyRecipe[]>`, remove any lingering `as any` casts and index as `Map<string, ...>` uniformly.

- Consolidate fetch helper
  - `fetchJson` is defined in `AuthorTemplatesPanel.tsx`. Consider moving to a small `/apps/client/src/app/map-editor/lib/http.ts` or reusing an existing util to reduce duplication and ease testing.

- Generalize validation
  - `_lib/validation.ts` contains a switch over authoring file keys. Instead of enumerating, detect file category by heuristic (e.g., path includes `/bodies/` vs `/blueprints/`) using `_lib/files.ts` metadata or add a `kind` map to `_lib/files.ts`. This avoids updates when keys change.

- API for discoverability
  - Add `/api/authoring/keys` that lists available authoring keys from `_lib/files.ts` so the UI never hardcodes keys.

- Scaffold UX
  - Add a “New Body” button that prompts for `id`, creates a stub in `data/maps/bodies/custom/index.ts` (or in a new file and re-exports via index), and refreshes the list. This eliminates manual file editing.

- Minor cleanup
  - `authoring-helpers.ts` `BODY_CONST_NAME_OVERRIDES` is only needed for legacy base/connector names; confirm it isn’t applied to custom files and document this.
  - Ensure `renderBodyModule` guards write targets for custom index vs single-body files (today it treats them uniformly). Consider a light router that decides whether to overwrite a single-file body file or update the custom index export list.

## Checklist

- [ ] Derive allowed authoring keys from `_lib/files.ts` in `bodies/route.ts`; delete local `BODY_KEYS`.
- [ ] Remove `rofl-room` and `rofl-pond` keys from `_lib/files.ts`; keep `custom-bodies` only.
- [ ] Replace static `BODY_OPTIONS` with dynamic keys list from `/api/authoring/keys` and dynamic body list from `/api/authoring/bodies`.
- [ ] Remove `BODIES_BY_FILE`; preserve order from loaded bodies; append or replace saved body; keep optional pin list for base files.
- [ ] Move `fetchJson` to a shared helper and reuse.
- [ ] Generalize validation by kind (bodies vs blueprints) instead of key enumeration.
- [ ] Add `/api/authoring/keys` to expose discoverable authoring keys for the UI.
- [ ] Implement “New Body” scaffold flow writing to `custom/index.ts` and refreshing the list.
- [ ] Audit for and remove any remaining `as any` casts introduced during the refactor.

### Code review – Elite enemies (11/10/2025)

#### Critical bugs

- [ ] Fix elite minion aura application being skipped. In `applyEliteAuras`, all `isElite` enemies are skipped, which excludes elite minions from receiving aura effects and regen.
  - Change the guard to skip only the elite leader, not minions.
  - Suggested guard: `const isLeader = enemy.isElite && enemy.leaderId === enemy.id; if (isLeader) continue;`
  - Add a quick sim test ensuring elite minions gain/lose buffs when entering/leaving aura radius.

#### Server refactors

- [ ] Gate spawn log behind debug flag. In `spawnEliteGroup`, the `console.log('spawning elite group:', ...)` should be wrapped with `if (DEBUG_LOGS) ...`.
- [ ] Extract elite ability setup. Factor lifesteal/evade/aura setup into `initEliteLeaderAbilities(leader, archetype)` to keep `spawnEliteGroup` concise.
- [ ] Unify name prefix handling. We set `namePrefix: '★ '` in `initial`, and later enforce a star again; keep only one code path.
- [ ] Consider moving `setVisualTags` and `computeThreatScore` to a small `lib/elite.ts` for reuse and testability if needed elsewhere.
- [ ] Remove unused `ELITE_ARCHETYPE_IDS` from generated client/server files if not referenced; keep only in `/data/enemies.ts` or drop entirely.

#### Client refactors (deduplicate elite helpers)

- [ ] Move `ELITE_AURA_COLOR_MAP`, `normalizeVisualTags`, and aura color helpers into `apps/client/src/lib/elite-utils.ts`.
  - Expose: `normalizeVisualTags(input)`, `getEliteAuraColor(tagsOrEnemy)`, `isElite(enemy)`, `clampSizeMultiplier(n)`.
- [ ] Update both `renderEnemySprite` and `EntityFactory.createEnemyConfig` to import these helpers and remove local copies.
- [ ] Extract a single `updateEnemyEliteVisuals(scene, enemyId, enemy)` used on create and in `applyServerState` to avoid repeated styling logic (stroke, hp bar color, aura element sizing).
- [ ] Prefer `isElite(enemy)` over name-star checks; leave the star purely as presentation.

#### Data/config hygiene

- [ ] Ensure all archetypes include `visualTags` like `['elite', 'aura:color']` and rely on tags to derive UI color; remove `auraColor` field if unused.
- [ ] Keep elite data single-sourced in `/data/enemies.ts`; avoid manual edits to generated app files (already enforced by generator).

#### Performance/UX tweaks

- [ ] Cache `auraColorCss` on the entity container (e.g., `enemyContainer.setData('auraColorCss', ...)`) to avoid repeated string conversions.
- [ ] Gate all debug logs; avoid unnecessary runtime string ops in hot paths.

#### Telemetry/testing

- [ ] Emit telemetry for elite spawn/kill and ability activations if telemetry is available, to verify balance in staging.
- [ ] Add a staging/admin toggle to force-spawn an elite group for QA verification.

#### Cleanups

- [ ] Remove dead exports/constants related to elites that are unused (`ELITE_ARCHETYPE_IDS` duplicates).
- [ ] Remove commented code and normalize duplicate helpers.

---

#### Code references

Duplicate client-side elite helpers:

```329:395:apps/client/src/app/helpers.ts
const ELITE_AURA_COLOR_MAP: Record<string, number> = {
  red: 0xff5c5c,
  green: 0x5cff8d,
  blue: 0x5ac0ff,
  yellow: 0xffd866,
};

function normalizeVisualTags(input: any): string[] {
  // ... more code ...
}

function resolveEliteAuraColor(visualTagsInput?: any): number {
  // ... more code ...
}

function resolveEliteAuraColorForEnemy(enemy: any): number {
  return resolveEliteAuraColor(enemy?.visualTags);
}
```

### Server: AuraSystem, EnemySpawnSystem, EnemySystem (11/10/2025)

#### Bugs / Behavior

- [ ] Aura regen is too coarse at low values. Current tick uses a 500ms bucket with `Math.max(1, ...)`, forcing ≥2 HP/s when any regen is present. Track fractional carry-over and allow 0 HP ticks.
- [ ] Aura stacking by `effect.id` is non-deterministic. When multiple sources with the same `id` overlap, the first one wins arbitrarily. Define a rule: pick strongest per field or combine (e.g., multipliers multiply, DR uses multiplicative stacking, regen sums).
- [ ] Leader self-buffing via minion aura. Leader emits `elite_minion_aura` and currently buffs itself if within radius. Add an `affectsCarrier` flag (default false) or skip when `sourceId === enemy.id`.
- [ ] Attack speed aura does not affect ranged cadence. Only melee `attackCooldownMs` is adjusted; ranged uses `rangedAttackSpeed` and optional reload/burst. Decide desired behavior and implement.
- [ ] Mixed time sources. Replace `Date.now()` with the tick `now` in enemy charge, staging invulnerability, and other timing checks to avoid drift.
- [ ] Enemy ID collision handling only checks once. On rare collision, spawn returns `null`. Retry until unique or include a counter.

#### Refactors / Maintainability

- [ ] Extract a `setFacingDirectionFromDelta(enemy, dx, dy)` helper; remove repeated dir-setting branches in melee/ranged/roam.
- [ ] Normalize base-stat caching. Ensure `_baseDamage`, `_baseSpeed`, `_baseAttackCooldownMs` are set at spawn for all enemies, not lazily in aura application.
- [ ] Encapsulate enemy metadata reads/writes (reload fields, aura meta, elite meta) with typed helpers instead of `(enemy as any)` everywhere.
- [ ] Optimize visual tag updates. `updateVisualTags` does repeated linear scans. Consider a Set-backed helper or early-outs when no changes.
- [ ] Gate `console.log('spawning elite group'...)` behind `DEBUG_LOGS`.
- [ ] Consider spatial filtering for auras (grid/quad) to reduce O(N×M) checks when many sources/enemies exist.

#### Tests to add

- [ ] Aura stacking semantics: same-id sources, different-id sources, verify determinism.
- [ ] Regen math at low fractional values (e.g., 0.2/s), ensure long-run correctness and no HP inflation.
- [ ] Ranged cadence under attack-speed aura with and without reload/burst config.
- [ ] Leader not self-buffing with `elite_minion_aura`.
- [ ] Activation hysteresis (R_in/R_out) keeps enemies stable near thresholds.

```256:317:apps/client/src/lib/entity-manager.ts
const ELITE_AURA_COLOR_MAP: Record<string, number> = {
  red: 0xff5c5c,
  green: 0x5cff8d,
  blue: 0x5ac0ff,
  yellow: 0xffd866,
};

function normalizeVisualTags(input: any): string[] {
  // ... more code ...
}

function resolveEliteAuraColor(enemy: any): { colorInt: number; colorCss: string } {
  // ... more code ...
}
```

Elite minion aura bug (leaders-only should be skipped):

```105:126:apps/server/src/lib/systems/EnemySystem.ts
function applyEliteAuras(room: Room<GameRoomState>, now: number) {
  const leaders = new Map<string, EnemySchema>();
  // ... more code ...
  for (const [, enemy] of room.state.enemies) {
    if (!enemy || enemy.hp <= 0) continue;
    if (enemy.isElite) continue; // Skips elite minions too
    const leaderId = enemy.leaderId;
    // ... more code ...
  }
}
```

Ungated spawn log:

```587:593:apps/server/src/lib/systems/EnemySpawnSystem.ts
console.log(
  'spawning elite group:',
  options.chunk.gridX,
  options.chunk.gridY
);
```
