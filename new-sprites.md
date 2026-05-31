## Goal

Adopt gotchi-generator 1.1.0 dynamic Aavegotchi spritesheets with 6 animation rows and variable frame counts, and use them across gameplay and UI previews.

## Spritesheet structure

- Rows (0-indexed):
  - 0: idle
  - 1: fly/sprint (also used for walk at lower fps)
  - 2: throw/wand (also used for ranged attack)
  - 3: melee attack
  - 4: hurt
  - 5: die
- Per-row frame counts: `[6, 7, 3, 6, 4, 7]`
- Max columns: `7` (used to compute frameWidth)

## Client changes

### 1) Centralize spritesheet constants

- Add `apps/client/src/lib/gotchi-spritesheet.ts` with:
  - `export const GOTCHI_ROW_FRAME_COUNTS = [6, 7, 3, 6, 4, 7] as const;`
  - `export const GOTCHI_MAX_COLS = 7;`
  - `export type GotchiRow = 0|1|2|3|4|5;`
  - Helper to safely get `endFrame = GOTCHI_ROW_FRAME_COUNTS[row] - 1`.

### 2) Load PNG once to derive frame size, then load as spritesheet

- In `apps/client/src/lib/sprite-manager.ts`:
  - Preload the PNG as an Image to get `imageWidth`/`imageHeight`.
  - Compute `frameWidth = Math.floor(imageWidth / GOTCHI_MAX_COLS)` and `frameHeight = Math.floor(imageHeight / 6)`; fallback to `64x64` on failure.
  - Then call `load.spritesheet` with the computed frame size.
  - Ensure `NEAREST` scale mode for crisp pixels.

### 3) Register animations for all 6 rows with variable frame counts

- Build animations using the centralized mapping:
  - Row 0: `idle_{down|right|up|left}` → endFrame 5, repeat -1, ~8 fps.
  - Row 1: `sprint_*` → endFrame 6, repeat -1, ~10–12 fps; also create `walk_*` aliases on the same row at ~6–8 fps.
  - Row 2: `throw_*` and `attack_ranged_*` → endFrame 2, repeat -1 while active; frameRate/timeScale tuned to server intervals (defaults sensible; server can speed up).
  - Row 3: `attack_*` → endFrame 5, repeat -1 while active; frameRate/timeScale tuned to server intervals (defaults sensible; server can speed up).
  - Row 4: [defer in gameplay] do not register or play `hurt_*` in runtime for now; if server sends `hurt`, keep current animation or fall back to idle. Keep row 4 available for preview/demo only.
  - Row 5: `death_*` → endFrame 6, repeat 0, ~8–10 fps (hold last frame), then start fade-out after 3 seconds.
- Direction strategy: use right-facing frames and `flipX` for left; keep up/down keys for compatibility, reusing the same row.

### 4) Add a playback helper with action mapping and timing

- In `sprite-manager.ts` export `playAavegotchiAnimation(
  sprite: Phaser.GameObjects.Sprite,
  action: 'idle'|'walk'|'sprint'|'attack'|'attack_ranged'|'throw'|'death',
  direction: 'left'|'right'|'up'|'down',
  intervalMs?: number
)` that:
  - Maps action to the appropriate row animation key.
  - Applies `flipX` on left by playing the right-facing key.
  - Time-scales attack/throw animations to match `intervalMs` from server.
  - No-ops if an animation lock is active (the caller manages the lock).
  - Note: `hurt` is intentionally ignored in runtime; treat as idle/current animation for now.

### 5) Use Sprite instead of Image and actually play animations

- In `apps/client/src/game/GameScene.ts` (gotchi creation path):
  - Replace `this.add.image` with `this.add.sprite` using the sheet key.
  - Immediately play `idle_{dir}`.
  - In `updatePlayerAnimation`, for gotchis call `playAavegotchiAnimation(...)` instead of swapping textures, honoring the existing attack animation lock.
  - Keep sprint alpha effect; visual motion comes from the sprint row.

### 6) CharacterSelector gotchi preview: play all 6 rows

- Upgrade `apps/client/src/components/GotchiPreview.tsx` to support spritesheet playback:
  - Load the provided `url` as a spritesheet using the same frame-size logic and constants.
  - In a "demo mode", cycle through the 6 rows sequentially in exact order 0→5 at 12 FPS:
    - Play each row once at 12 FPS, then advance to the next (include hurt and death in preview).
    - For `death` in preview, hold the last frame briefly, then continue the cycle (do not fade in preview).
    - Loop the 6-row cycle continuously.
  - Keep the current static fallback if spritesheet load fails, and warn in the console/server logs.
- In `apps/client/src/components/CharacterSelector.tsx`:
  - When the user selects the Gotchis tab, pass a prop like `demoAllAnimations` to `GotchiPreview` so it auto-plays all 6 rows during preview.

## Server changes (minimal)

- Keep generation endpoints unchanged.
- Optionally, in `apps/server/src/lib/gotchi-sprites.ts`, switch base-path resolution to the package API `getPackageBasePath()` for clarity (env overrides continue to work).
- On spritesheet fallback to still image, log a warning in server and/or client console as appropriate.

## Acceptance criteria

- Gotchi in-game uses Sprite animations for idle/walk/sprint/throw/attack/death with correct row/frame counts; `hurt` is skipped in gameplay for now.
- Attack/throw animations respect server intervals; death holds last frame and begins fade-out after 3 seconds.
- CharacterSelector Gotchi previews auto-cycle all 6 rows at 12 FPS in exact order (0→5) when the Gotchis tab is active.
- SVG/static fallbacks still work if spritesheet isn’t available, with a warning logged.

## QA checklist

- Verify frame sizing across multiple generated sheets (different resolutions) and ensure no frame bleeding.
- Confirm left direction uses flipX and matches right frames visually.
- Validate walk vs sprint fps feels distinct and consistent (defaults sensible; server may speed up).
- Ensure animation lock prevents overrides during attack/death.
- Confirm death holds last frame and begins fade-out after 3 seconds.

## Tasks

- Centralize gotchi row frame counts and max columns in a constants module.
- Update PNG loader to prefetch natural size and register animations with variable end frames (skip `hurt` in gameplay for now).
- Add playback helper with action mapping, flipping, and interval-aware timing.
- Switch gotchi entity to Sprite and use animation playback in `GameScene`.
- Honor animation lock for gotchi animations in the update path.
- Upgrade `GotchiPreview` to cycle all 6 rows in CharacterSelector’s Gotchis tab (12 FPS, exact order, no fade in preview).
- Optional: switch server base path resolution to the package API; log warning on still-image fallback.
- QA tuning: fps/time scaling; death fade begins after 3 seconds.

## Decisions applied

- Row semantics fixed for all sheets: idle, sprint, throw/ranged, melee, hurt, die.
- Frame timing: use sensible defaults; server may speed up via intervals.
- Death: hold last frame, start fade-out after 3 seconds.
- Hurt: do not implement in gameplay initially; include in preview demo only.
- Direction: use normal left flipX from right.
- Fallback: show idle still image and log a warning if spritesheet playback unavailable.
- No special memory constraints for multiple previews.

## Open questions

1. Confirm row semantics: are rows 0..5 strictly idle, sprint, throw/ranged, melee, hurt, die for all generated sheets, or are there sheet variants we should detect?

THat's it. No variants that I'm aware of.

2. Frame timing targets: preferred durations for attack (melee vs ranged) and sprint per cycle? Should walk be a separate server state or visually derived from velocity when server reports `walk`?

Sensible defaults that can be sped up by the server.

3. Death behavior: hold last frame indefinitely, or fade out after N ms? Any SFX sync requirements?

Fade out after 3 seconds.

4. Hurt behavior: should we auto-return to idle after animation completes client-side, or rely solely on server `animUntil`?

Let's actually not implement the hurt animation yet. Just skip that for now.

5. Preview carousel pacing: desired per-row display time in the CharacterSelector (e.g., 1.0s each), and ordering exactness (0→5)?

Use 12 FPS. Yes, exact order.

6. Direction policy: OK to implement left by flipX of right for gotchis, or do any gotchi assets depend on non-flipped left frames?

Yes, normal flipping.

7. Fallback policy: if spritesheet load fails, acceptable to show idle SVG still image, or should we retry/poll `/api/gotchis`?

Show idle still image but give a warning in the server/console.

8. Any constraints on memory/texture retention for multiple gotchi previews simultaneously in the selector?

No.
