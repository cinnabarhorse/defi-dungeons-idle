## Minimap — Implementation Plan (no code yet)

### Goal

- Add a small, performant minimap fixed to the bottom-left of the game view that helps player orientation without distracting from gameplay.

### Constraints and preferences

- Client: Next.js App Router, React, Tailwind, Shadcn UI; prefer minimal `use client` and avoid duplicating logic.
- Game rendering: Phaser in `apps/client` (`initPhaser.ts`, `GameScene.ts`).
- Prefer single source of truth for world state (no duplicating world models in React) and keep heavy logic inside Phaser where possible.
- Mobile-first and responsive; minimize performance overhead.

## Approaches (choose one)

### Option A — Phaser secondary camera (recommended MVP)

- Create a second camera in `GameScene` that renders world layers into a small viewport located at bottom-left of the main canvas via `setViewport(x, y, w, h)`.
- Configure the minimap camera:
  - Ignore UI and transient FX layers, render only ground/obstacles/important markers.
  - Follow player (translate scroll to player position). Choose zoom to show a local radius or entire room depending on room size.
  - Optional circular mask via `Graphics` for a round minimap; start square for MVP.
- Render player as a simple blip (small `Graphics` circle) or a tiny sprite; consider color coding.
- Pros: zero React↔Phaser sync cost, easiest to keep authoritative state in one place, strong performance.
- Cons: HUD styling around the minimap (borders/shadows) requires careful layering since the minimap is inside the Phaser canvas.

### Option B — React Canvas overlay (Canvas 2D)

- Render a separate `<canvas>` in `GameHUD.tsx` positioned with Tailwind at bottom-left.
- Subscribe to a thin, read-only state bridge exposed by `GameScene` (player position, world bounds, relevant entities). Draw simplified tiles and blips at downscaled resolution.
- Pros: Easy to wrap with Shadcn/Tailwind for consistent UI, straightforward hover/click affordances later.
- Cons: Requires a state bridge to avoid duplicating world logic; careful throttling needed to avoid jank.

### Option C — Hybrid RenderTexture

- Use a Phaser `RenderTexture` to draw a minimap snapshot and present it in a React `<canvas>` or `<img>` via data URL.
- Pros: Best of both worlds for styling and single source of truth.
- Cons: Complexity and potential texture copy cost; likely overkill for MVP.

## Recommended plan (MVP: Option A)

1. Decide scope for MVP
   - Show ground layer, player blip, and room/world bounds. Omit enemies/items initially.

2. Camera setup in `GameScene`
   - Add `minimapCamera = this.cameras.add(…)` with a small viewport (e.g., 160×160 px) anchored bottom-left of the game canvas.
   - Configure zoom and scroll to center around the player or show the entire room if small.
   - Exclude UI/FX layers via `ignore` and include core tilemap layers.

3. Player blip
   - Add a small `Graphics` circle or a tiny sprite positioned at the player world coordinates; ensure the blip is visible to the minimap camera.

4. Mask and frame (optional in MVP)
   - Square first; later add a circular mask.
   - Add a simple border frame using Phaser `Graphics` or skip and rely on the canvas edge for MVP.

5. Layering with HUD
   - Verify `GameHUD.tsx` / `MobileGameHUD.tsx` absolute overlays do not occlude the minimap viewport area.
   - If needed, slightly offset the minimap viewport from the exact bottom-left to avoid overlap with HUD buttons.

6. Responsiveness
   - Default: render on `md` and up; on `sm` hide or reduce to 120×120. Consider a HUD toggle.
   - Ensure minimap repositions/resizes on window resize and camera size changes.

7. Performance guardrails
   - Keep minimap viewport small (≤ 180×180) and limit rendered layers.
   - Avoid per-frame heavy drawing; rely on engine culling.
   - Throttle any custom overlay updates (non-tilemap elements) to ~10 Hz.

8. Configuration and types
   - Define `MinimapOptions` (size, showRadiusVsFullRoom, showOnMobile, colors) in a local client types file (e.g., `apps/client/src/types/ui.ts`).
   - No workspace package dependencies; inline types locally.

9. QA
   - Verify correct positioning in `page.tsx` layout.
   - Walk around large/small rooms; confirm blip tracks accurately and camera bounds clamp correctly.
   - Test world transitions handled by `WorldTransitionSystem`—minimap updates to new room bounds without leaks.
   - Test mobile: hidden or reduced as designed; no overlap with `MobileGameHUD.tsx` controls.

## Future enhancements (post-MVP)

- Enemy and party blips with color coding.
- Fog-of-war integration and discovery radius.
- Chunk boundaries grid toggle for debugging (off by default).
- Click-to-expand full map modal using Shadcn `Dialog`.
- Objective markers, portals, and ping system.
- Telemetry overlay (optional FPS/CPU impact display).

## Acceptance criteria

- Minimap is visible bottom-left on desktop, updates smoothly as the player moves, and has negligible impact on frame time.
- No duplication of world state outside Phaser for MVP.
- Does not occlude or conflict with existing HUD controls; adapts to window resizes.
- Cleanly handles room/world transitions without artifacts.

## Risks and mitigations

- HUD overlap with the Phaser canvas corner: offset viewport or adjust HUD z-index and padding.
- Performance on low-end devices: keep viewport small, limit layers, throttle overlays.
- Very large rooms: show local-radius mode; add option to show full-room only when expanded.

## Observability

- Add simple FPS diff measurement with/without minimap enabled during QA.
- Optionally log render time deltas to debug only; strip in production.

## Rollout plan

- Ship MVP behind a client setting (default on for desktop, off for mobile). Toggle via HUD settings and persist in `localStorage`.
- Gradually enable on mobile after confirming performance.

## Open questions

1. Scope: Should MVP show entire room or a local radius around the player?

Local radius

2. Shape: Square or circular mask for the MVP?

Circular mask

3. Size: Preferred default size (e.g., 160×160) and mobile behavior (hide vs smaller)?

160x160, 120x120 for mobile

4. Content: Player-only blip for MVP, or also show exits/portals?

player-only blip for now

5. Styling: Minimal engine-drawn frame acceptable, or do you want a styled HUD frame now?

minimal OK

6. Toggle: Add a HUD toggle immediately, or add after MVP stabilizes?

no toggle

7. Future: Should enemies/party blips be included in the next iteration, and any color palette preferences?

nope

8. Phaser only, no React needed
