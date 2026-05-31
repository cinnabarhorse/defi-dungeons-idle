/**
 * Obstacle Configuration
 * Defines collision dimensions for different tree and stone types
 */

export interface ObstacleConfig {
  width: number;
  height: number;
  collisionRadius: number; // Radius in pixels for collision detection
  // Optional rendering hint. When 'overlay', client will render at a constant low depth
  // above floor tiles but below y-sorted entities. When 'entity', normal y-sorting applies.
  // 'floor' is reserved for items rendered with floor tiles.
  renderLayer?: 'floor' | 'overlay' | 'entity';
  // Whether this obstacle should participate in collision checks. Defaults to true
  // for obstacles that block movement. Set to false for purely visual props.
  hasCollision?: boolean;
  // Constant depth to use when not y-sorting (e.g., for renderLayer 'overlay').
  // Example: 2 renders just above the floor layer (depth 1) but below entities.
  depthHint?: number;
}

/**
 * Obstacle configurations based on actual sprite dimensions
 * These values should match the actual sprite sizes for accurate collision
 */
export const OBSTACLE_CONFIGS: Record<string, ObstacleConfig> = {
  // Trees
  green_tree: {
    width: 64,
    height: 96,
    collisionRadius: 32, // Roughly half the width
  },
  pink_tree: {
    width: 64,
    height: 96,
    collisionRadius: 32,
  },
  cyberkawaii_tree: {
    width: 64,
    height: 96,
    collisionRadius: 32,
  },

  // Plants
  green_plant: {
    width: 32,
    height: 32,
    collisionRadius: 16,
  },

  // Bush walls (Cyberkawaii)
  cyberkawaii_bush_block: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_start: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_start_1: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_middle: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_middle_1: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_middle_2: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_corner_top_left: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_corner_top_right: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_corner_bottom_left: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_corner_bottom_right: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_top_middle_left: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  cyberkawaii_bush_top_middle_right: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },

  // Rocks and crystals
  rock_left: {
    width: 48,
    height: 32,
    collisionRadius: 24,
  },
  rock_right: {
    width: 48,
    height: 32,
    collisionRadius: 24,
  },
  triple_rocks: {
    width: 64,
    height: 48,
    collisionRadius: 32,
  },
  triple_rocks_plants: {
    width: 64,
    height: 48,
    collisionRadius: 32,
  },
  double_rocks_small: {
    width: 48,
    height: 32,
    collisionRadius: 24,
  },
  double_rocks_big: {
    width: 64,
    height: 48,
    collisionRadius: 32,
  },
  crystals_purple: {
    width: 48,
    height: 64,
    collisionRadius: 24,
  },
  crystals_green: {
    width: 48,
    height: 64,
    collisionRadius: 24,
  },
  crystals_fucsia: {
    width: 48,
    height: 64,
    collisionRadius: 24,
  },
  crystal_ball_pillar: {
    width: 24,
    height: 72,
    collisionRadius: 12,
  },
  daoportal: {
    width: 512,
    height: 320,
    collisionRadius: 180,
    renderLayer: 'overlay',
    hasCollision: true,
    depthHint: 2,
  },
  brick_wall: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  // Alias for hyphen-style assetId used in chunks
  'brick-wall': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  // CK Dungeon wall set (lowercase ids equal to filenames)
  ck_dungeons_wall_front_1: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_front_1-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_front_1-2': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_front_2: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_front_2-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_front_3: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_front_3-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_front_3-2': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_rectangles_corner: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_rectangles_corner-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_rectangles_side: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_rectangles_side-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_squares_corner: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_squares_corner-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  ck_dungeons_wall_squares_side: {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  'ck_dungeons_wall_squares_side-1': {
    width: 64,
    height: 64,
    collisionRadius: 32,
  },
  fire_pillar: {
    width: 26,
    height: 78,
    collisionRadius: 13,
    hasCollision: true,
  },
  // CK Fountain (sprite sheet 3 frames horizontally; frame size 164x228)
  ck_fountain: {
    width: 164,
    height: 228,
    collisionRadius: 72, // collide around the basin; smaller than half width
    hasCollision: true,
  },
  // ROFL Pond base (sprite size 512x192 from artwork; collide around rim)
  rofl_pond_ck: {
    width: 512,
    height: 192,
    collisionRadius: 170, // block near the stone rim, allow center water visuals to be non-blocking
    renderLayer: 'overlay',
    hasCollision: true,
    depthHint: 2,
  },
};

function getConfigForAsset(assetId: string): ObstacleConfig {
  const config = OBSTACLE_CONFIGS[assetId.toLowerCase()];
  if (!config) {
    throw new Error(
      `No obstacle configuration found for assetId: "${assetId}". ` +
        `Available configurations: ${Object.keys(OBSTACLE_CONFIGS).join(', ')}`
    );
  }
  return config;
}

export function getObstacleCollisionRadius(assetId: string): number {
  return getConfigForAsset(assetId).collisionRadius;
}

export function getObstacleConfig(assetId: string): ObstacleConfig {
  return getConfigForAsset(assetId);
}
