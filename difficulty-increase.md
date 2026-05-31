## Difficulty increase within a run (keep tier constant)

### Goal

- Keep `difficultyTier` constant for the entire run.
- When descending to the next floor, increase difficulty slightly via the existing Intensity meter (within-tier), not by changing tiers.
- Do not auto-restore HP/MP on floor transitions or when entering the boss room.

### Scope

- Server-only changes in `apps/server/src`.
- No client changes needed; HUD already reads the Intensity meter (`enemyDifficultyLevel`).

### Current behavior (for context)

- Tier bumps on portal use (applies to `next_floor` as well today):

```ts
// apps/server/src/lib/systems/EnemyDeathSystem.ts (handlePortalInteraction)
// Determines next tier and always advances before transition
const current = String(room.state.difficultyTier || 'normal_1');
const idx = Math.max(0, DIFFICULTY_TIER_SEQUENCE.indexOf(current));
const nextIdx = Math.min(DIFFICULTY_TIER_SEQUENCE.length - 1, idx + 1);
const newDifficulty =
  DIFFICULTY_TIER_SEQUENCE[nextIdx] || room.state.difficultyTier;
transitionAllPlayersToNewMap(room, newDifficulty);
```

- HP is restored on boss room entry:

```ts
// apps/server/src/lib/systems/WorldTransitionSystem.ts
// inside transitionAllPlayersToBossRoom(...)
player.hp = player.maxHp; // heals on boss entry
```

- HP is restored on new floor:

```ts
// apps/server/src/lib/systems/WorldTransitionSystem.ts
// inside transitionAllPlayersToNewMap(...)
player.hp = player.maxHp; // heals on floor transition
```

### Proposed changes

1. Keep tier constant on floor descent; only advance tier on explicit `new_map`

- Update portal handling to:
  - Use the current `difficultyTier` for `next_floor` transitions.
  - Only advance tier when `destination === 'new_map'`.
- On `next_floor`, bump the Intensity (`enemyDifficultyLevel`) a bit so the next floor is slightly harder without a tier change.

Patch (inside `handlePortalInteraction(...)`):

```ts
// apps/server/src/lib/systems/EnemyDeathSystem.ts
if (destination === 'boss_room') {
  transitionAllPlayersToBossRoom(room);
} else {
  const current = String(room.state.difficultyTier || 'normal_1');
  let nextDifficulty = current;

  if (destination === 'new_map') {
    const idx = Math.max(0, DIFFICULTY_TIER_SEQUENCE.indexOf(current));
    const nextIdx = Math.min(DIFFICULTY_TIER_SEQUENCE.length - 1, idx + 1);
    nextDifficulty = DIFFICULTY_TIER_SEQUENCE[nextIdx] || current;
  } else if (destination === 'next_floor') {
    try {
      if (typeof (room as any).incrementEnemyDifficultyLevel === 'function') {
        (room as any).incrementEnemyDifficultyLevel(1, 'next_floor');
      }
    } catch {}
  }

  transitionAllPlayersToNewMap(room, nextDifficulty);
}
```

2. Add helper to nudge the within-tier Intensity meter

```ts
// apps/server/src/rooms/GameRoom.ts
public incrementEnemyDifficultyLevel(
  delta: number = 1,
  reason?: string,
  now = Date.now()
): void {
  if (!this.enemyDifficultyConfig.enabled) return;
  const before = Math.max(0, Math.floor(this.state.enemyDifficultyLevel ?? 0));
  const after = Math.max(0, before + Math.floor(delta));
  if (after === before) return;
  this.state.enemyDifficultyLevel = after;
  // Preserve enemyDifficultyNextAt so the cadence continues unchanged
}
```

3. Scale XP (and score) with Intensity

- Reuse Intensity (`enemyDifficultyLevel`) to proportionally increase XP rewards as players descend. Score already derives from XP in `awardXpForEnemyDefeat`, so it scales automatically.

Patch (multiply total XP pool by an Intensity multiplier):

```ts
// apps/server/src/rooms/GameRoom.ts
// inside awardXpForEnemyDefeat(...), before computing shares
const baseXp = Math.max(0, enemyStats.baseXp || 0);
// ...
const intensity = Math.max(0, Math.floor(this.state.enemyDifficultyLevel ?? 0));
const xpPerLevel = Math.max(
  0,
  Number((GAME_CONFIG as any)?.enemyDifficultyMeter?.xpPerLevel ?? 0.05)
);
const intensityXpMul = 1 + intensity * xpPerLevel;

const totalXpPool =
  baseXp *
  this.getDifficultyXpMultiplier() *
  this.getGroupXpMultiplier(partySize) *
  intensityXpMul;
```

- Optional config (no migration required; defaults to 0.05 when missing):

```ts
// apps/server/src/data/game-config.ts
enemyDifficultyMeter: {
  // ...existing fields
  xpPerLevel: 0.05,
}
```

4. Disable HP/MP restoration on transitions

- Remove HP auto-restore on boss room entry:

```ts
// apps/server/src/lib/systems/WorldTransitionSystem.ts
// transitionAllPlayersToBossRoom(...)
// delete: player.hp = player.maxHp;
```

- Remove HP auto-restore on new floor:

```ts
// apps/server/src/lib/systems/WorldTransitionSystem.ts
// transitionAllPlayersToNewMap(...)
// delete: player.hp = player.maxHp;
```

- MP is not forcibly reset in these transitions; no additional MP change needed.

### Tuning

- Terminology: refer to `enemyDifficultyLevel` as Intensity across code/docs/UI.
- Per-floor bump size: adjust `incrementEnemyDifficultyLevel(1, ...)` to taste (e.g., higher value or scale by floor index).
- XP scaling slope: tune `enemyDifficultyMeter.xpPerLevel` (default 0.05) to increase or flatten progression pacing.
- The global per-minute Intensity meter remains as configured.

### QA checklist

- Start `normal_1`; descend 3 floors:
  - `difficultyTier` remains `normal_1` in metadata and messages.
  - `enemyDifficultyLevel` increases by +1 per descent.
  - No HP/MP auto-restore on floor transitions.
- Enter boss room: no HP/MP auto-restore.
- Meter countdown continues across floors; existing enemies rescale only when the meter ticks (unchanged behavior).

### Rollback

- Revert the `handlePortalInteraction` logic to restore tier bumps.
- Reinsert the `player.hp = player.maxHp` lines in `WorldTransitionSystem.ts` to restore auto-heal on transitions.
