# Portal Sprites

## Portal Sprite System

Each portal type has its own animated spritesheet with split left/right halves that combine to form the complete portal.

### Portal Files

- ✅ `alpha_portal.png` - Alpha portal spritesheet with animation frames (blue/cyan)
- ✅ `fomo_portal.png` - FOMO portal spritesheet with animation frames (orange/red)
- ✅ `og_portal.png` - OG portal spritesheet with animation frames (purple/violet)
- ✅ `portal.png.meta` - Unity metadata file (reference only)

## Spritesheet Structure

Each portal file contains split halves:

- **Layout**: 10 frames per row × 2 rows = 20 total frames
- **Frame size**: 44×52 pixels each (half-width sprites)
- **Animation**: Left and right halves combine to create full portal effect

```
Top Row (Left Half):     frame_0  frame_1  frame_2  frame_3  frame_4  frame_5  frame_6  frame_7  frame_8  frame_9
Bottom Row (Right Half): frame_10 frame_11 frame_12 frame_13 frame_14 frame_15 frame_16 frame_17 frame_18 frame_19
```

**Portal Assembly**:

- Top row sprites (0-9) = Left half of portal
- Bottom row sprites (10-19) = Right half of portal
- Both halves animate simultaneously to create the full 88×52 pixel portal

## How It Works

1. Each portal type loads its own spritesheet as two animated sprites (left + right)
2. Left half uses frames 0-9, right half uses frames 10-19
3. Both halves animate in sync at 15 FPS
4. Alpha portals are blue/cyan, FOMO portals are orange/red, OG portals are purple/violet
5. One portal of each type spawns randomly per map

## Implementation Status

- ✅ Portal system fully implemented with split-half rendering
- ✅ Individual portal type spritesheets supported
- ✅ 10-frame animation system for each half
- ✅ All three portal types (Alpha, FOMO, OG) ready
- ✅ **Portal system complete with proper full-width rendering!**
