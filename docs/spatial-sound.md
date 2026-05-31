## Spatial Sound System – Implementation Plan

### Goal

Add proximity-based sound for in-world entities, starting with the Portal in `chunks-staging`. As the player approaches a portal, a looping pulsating sound fades in; as the player leaves, it fades out. The system should be generic for future sources (campfires, waterfalls, etc.).

### Scope (Phase 1)

- Implement a minimal spatial SFX manager in `LocalGameScene` (client).
- Register a looping `portalpulsating` sound for portals spawned in the staging chunks.
- Update per-frame volumes based on player distance; pause/mute when out of range.

---

### Files to Change

1. `apps/client/src/game/GameScene.ts`

- Add SFX asset mapping entry: `portalpulsating: '/sfx/portalpulsating.mp3'` to existing audio mapping in `preload`.
- No behavior change to `playSFX`; spatial SFX will manage volumes via direct `Phaser.Sound` instances.
- Ensure `refreshAudioSettings` triggers re-application of looped sound volumes (the spatial manager will read the current audio settings on its next update).

2. `apps/client/src/app/initPhaser.ts`

- Within `class LocalGameScene extends GameScene`:
  - Add a spatial sound registry data structure.
  - Add helpers to register/unregister/update spatial loops.
  - Integrate registration in `renderPortal` and cleanup in `entities.onRemove` for `portal` kind.
  - Hook into `update` to run per-frame volume adjustment.
  - Implement audio-unlock-safe start behavior for loops.

No server changes are required for Phase 1; the portal entity already exposes position and optional `interactionRadius`. The audio file already exists at `apps/client/public/sfx/portalpulsating.mp3`.

---

### Detailed Changes

#### 1) Asset loading (GameScene)

- In `preload`, extend the `audioMapping` object with:
  - `portalpulsating: '/sfx/portalpulsating.mp3'`
- Existing code iterates `audioMapping` with `this.load.audio(key, value)`, so this automatically loads the asset.

#### 2) Spatial sound registry (LocalGameScene)

- Add typed structures:

```ts
type SpatialFalloff = (distance: number, maxRadius: number) => number; // returns 0..1

interface SpatialSoundSource {
  id: string; // entityId
  key: string; // Phaser sound key (e.g., 'portalpulsating')
  sound: Phaser.Sound.BaseSound;
  x: number;
  y: number;
  maxRadius: number; // audible radius (px)
  baseVolume: number; // pre-mix (0..1) before user settings
  falloff: SpatialFalloff; // default quadratic
  hysteresis: number; // buffer to avoid boundary chattering (e.g., 20)
  isAudible: boolean; // current in-range state after hysteresis
  startOnUnlock: boolean; // handle Safari/Chrome auto-play restrictions
}
```

- Registry container: `spatialSoundSources: Map<string, SpatialSoundSource>`; keyed by `entityId`.

#### 3) Helper methods (LocalGameScene)

- `registerSpatialLoop(entityId, x, y, key, options)`
  - Create `sound = this.sound.add(key, { loop: true, volume: 0 })`.
  - If `this.sound.locked`, set `startOnUnlock = true`, and attach one-time `Phaser.Sound.Events.UNLOCKED` to start playback.
  - Otherwise, `sound.play({ loop: true, volume: 0 })` immediately.
  - Store in registry with defaults:
    - `maxRadius = options.maxRadius ?? 380`
    - `baseVolume = options.baseVolume ?? 0.9`
    - `falloff = options.falloff ?? quadratic`
    - `hysteresis = options.hysteresis ?? 20`
- `updateSpatialSource(entityId, x, y, options?)` – update position and overrides if needed.
- `unregisterSpatialSource(entityId)` – stop/destroy sound and delete from registry.
- `getFinalVolumeFor(source, distance)` – compute `((master/100) * (sfx/100)) * baseVolume * falloff(distance)` and clamp to [0,1]. Optionally apply a small lerp for smoothing.
- `updateSpatialSounds()` – see per-frame update below.

#### 4) Per-frame update loop

- In `update(time, delta)`, after calling `super.update(time, delta)`, call `this.updateSpatialSounds()`.
- Implementation outline:
  1. If muted or `this.sound` missing, set all source volumes to 0 and pause if not already paused; return early.
  2. Get current player position; if not available, set volume 0 for all sources and return.
  3. For each source:
     - Compute Euclidean distance d = sqrt((px - x)^2 + (py - y)^2).
     - Determine `shouldBeAudible` using hysteresis thresholds:
       - If currently inaudible: `d < (maxRadius - hysteresis)` → become audible.
       - If currently audible: `d > (maxRadius + hysteresis)` → become inaudible.
     - If inaudible → set volume 0; optionally pause sound to save CPU.
     - If audible → compute final volume; set via `sound.setVolume(final)`; ensure sound is playing (resume if needed).

Default falloff: quadratic ease toward the center:

```ts
function quadraticFalloff(d: number, R: number): number {
  if (d >= R) return 0;
  const t = 1 - d / R; // 0 at edge → 1 at center
  return t * t; // emphasized near-center presence
}
```

Optional smoothing: Lerp volume by ~0.08 per frame to avoid abrupt steps at low FPS.

#### 5) Integration with portals

- In `renderPortal(entity, entityId)`:
  - Determine center `(cx, cy)`:
    - For custom portal sprite: `centerX = sprite.x + width/2`, `centerY = sprite.y + height/2`.
    - For container portals: use the container `(entity.x, entity.y)` as center (or derive from halves if needed).
  - Resolve audible radius: prefer `state.soundRadius` if provided, else fallback to `Math.max(300, interactionRadius + 200)` (start value ~380).
  - Call `registerSpatialLoop(entityId, cx, cy, 'portalpulsating', { maxRadius, baseVolume: 0.9 })`.
  - If the entity moves (unlikely for portals), call `updateSpatialSource` from wherever movement is handled.

- In `this.room.state.entities.onRemove` for `portal` kind:
  - Call `unregisterSpatialSource(entityId)`.

#### 6) Audio unlock handling

- If `this.sound.locked` during registration:
  - Defer `sound.play()` and mark `startOnUnlock = true`.
  - Attach `this.sound.once(Phaser.Sound.Events.UNLOCKED, () => start any deferred spatial sounds at volume 0)`.

#### 7) Scene lifecycle cleanup

- On scene shutdown/destroy (`this.events.on('shutdown'/'destroy')`):
  - Iterate and `unregisterSpatialSource` for all.

---

### Edge Cases & Handling

- Player not yet spawned or temporarily undefined → set volumes to 0 (pause sounds) until available.
- Audio globally muted or SFX volume 0 → maintain loop state but set volume 0 (paused) to save CPU.
- Multiple portals within range → volumes mix; acceptable for Phase 1. Future: cap combined volume or prioritize nearest.
- Rapid enter/exit at boundary → hysteresis buffer eliminates chattering; optional lerp smooths volume steps.
- Mobile/Safari auto-play restrictions → handled via `sound.locked` and `UNLOCKED` event.
- Asset missing/unloaded → guard `this.sound.add` with try/catch; if add fails, skip registration.
- Scene pause/game over → Phaser typically pauses audio; spatial update loop should still drive volumes next frame when unpaused.

---

### Configuration & Defaults

- `maxRadius`: 380 px (tunable per entity via `state.soundRadius`).
- `baseVolume`: 0.9 (mixes with user Master/SFX).
- `falloff`: quadratic.
- `hysteresis`: 20 px.

Future: optional runtime switch `NEXT_PUBLIC_SPATIAL_SOUNDS=1` to enable/disable globally (not required for Phase 1).

---

### Testing Plan

1. Load `staging` (ensure `GAME_CONFIG.STAGING_ENABLED` and `chunks-staging` preloaded).
2. Spawn a portal (server will add `portal` entity) or call `window.spawnPortalsHere()`.
3. Approach from outside audible radius → confirm fade-in; retreat → fade-out.
4. Toggle mute and adjust SFX volume in HUD → confirm spatial loop respects settings.
5. Spawn two portals → confirm both audible and cleanup on removal.
6. Reload scene or transition floors → confirm no leaked sounds remain.

---

### Rollout

- Phase 1: portals in `chunks-staging` only.
- Phase 2: generalize to other ambience sources (e.g., fountains, torches) using the same registry.

---

### Implementation Checklist (mapped to tasks)

- Add `portalpulsating` SFX to `GameScene` audio mapping.
- Implement spatial sound registry and helpers in `LocalGameScene`.
- Register/unregister portal spatial loop in `renderPortal` and `onRemove`.
- Apply quadratic falloff with hysteresis and optional lerp.
- Handle audio unlock and scene shutdown cleanup.
