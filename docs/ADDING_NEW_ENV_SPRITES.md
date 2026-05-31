## Adding New Environment Sprites (Map Editor + In-Game)

This guide explains how to add new environment sprites to the Map Editor UI and ensure they render correctly in-game, including optional collision support.

### 0) File locations and naming

- Put environment images under `apps/client/public/sprites/env/`.
  - Floors: `apps/client/public/sprites/env/floors/<theme>/<your_file>.png`
  - Other env: `apps/client/public/sprites/env/<your_file>.png`
- Prefer 32px or 64px multiples for tile dimensions for clean grid alignment.
- Use lowercase, snake_case for IDs. Avoid spaces in filenames (e.g. `bush_corner_top_left.png`).

### 1) Add the sprite files

Place your PNGs in the appropriate folder. Example:

```
apps/client/public/sprites/env/floors/cyberkawaii/MY_TILE.png
```

Tip (macOS): check pixel size quickly:

```bash
sips -g pixelWidth -g pixelHeight apps/client/public/sprites/env/floors/cyberkawaii/MY_TILE.png
```

### 2) Register assets in the Map Editor

Update `apps/client/src/data/map-editor-assets.ts` and add entries to the correct category:

```ts
// Floors (client-only rendering, no collision)
{
  id: 'my_theme_floor_center',
  name: 'My Theme Floor Center',
  sprite: 'floors/my_theme/center.png', // path relative to /sprites/env/
  category: 'floors',
}

// Walls (rendered above floors in the editor; good for blocking tiles like bushes)
{
  id: 'my_theme_bush_corner_top_left',
  name: 'My Theme Bush Corner TL',
  sprite: 'floors/my_theme/BUSH_CORNER_TOP_LEFT.png',
  category: 'walls',
}
```

Notes:

- `sprite` is the path relative to `/sprites/env/`. The editor preloads from `/sprites/env/${sprite}`.
- Categories: `floors`, `walls`, `nature`, `rocks`, `special`, `characters`, `enemies`, `spawn`.
- The editor automatically shows your assets grouped by category.

### 3) Make obstacles collide in-game (optional)

If your new sprite should block movement (e.g., bushes/walls), add its collision config in the source obstacles file:

1. Edit `data/obstacles.ts` and add entries to `OBSTACLE_CONFIGS` using the asset ID you registered above:

```ts
my_theme_bush_corner_top_left: {
  width: 64,
  height: 64,
  collisionRadius: 32,
},
```

2. Propagate the source data to both apps:

```bash
pnpm run generate:shared
```

This updates:

- `apps/client/src/data/obstacles.ts`
- `apps/server/src/data/obstacles.ts`

The server uses these values for collision checks.

### 4) How sprites are loaded in-game

The game dynamically loads any sprite referenced by chunk assets, using the `sprite` field from chunk data. No manual loader edits are needed:

- See `apps/client/src/game/GameScene.ts` → `generateDynamicSpriteMapping()`.
- Floor tiles are rendered on the client by `EnvironmentSystem` using assets with `category: 'floors'`.

### 5) Ensuring server entities exist (if needed)

Floor tiles are client-only. Obstacles that need collision must exist as server entities. If you introduce a new obstacle type/category that the server does not yet spawn, add handling in `apps/server/src/utils/MapGenerator.ts` (inside its chunk asset processing) to create an `EntityKind.OBSTACLE` entity for your asset IDs or for `category === 'walls'`.

Minimal example (pseudocode):

```ts
if (asset.category === 'walls') {
  // create obstacle entity with state.assetId = asset.assetId
}
```

### 6) Verify

- Open the Map Editor: your items should appear under the chosen category and place correctly.
- Save a chunk and run the game; floors render automatically and obstacles collide if configured and spawned.

### 7) Troubleshooting

- Sprite not visible in the editor: check `sprite` path matches the file under `/public/sprites/env/`.
- Sprite loads in editor but not in-game: ensure your chunk includes the asset; the loader only loads what chunks reference.
- No collision: add the asset ID in `data/obstacles.ts`, run `pnpm run generate:shared`, and ensure the server spawns an obstacle entity for it.
- Misaligned visuals: confirm image dimensions are multiples of 32 or 64 and adjust placement/rotation in the editor.

### 8) Quick checklist

- [ ] PNG placed under `apps/client/public/sprites/env/...`
- [ ] Asset added to `apps/client/src/data/map-editor-assets.ts` with correct category
- [ ] If collidable: add to `data/obstacles.ts` and `pnpm run generate:shared`
- [ ] If new category needs entities: update `MapGenerator` to spawn `OBSTACLE`
- [ ] Verify in Map Editor and in-game
