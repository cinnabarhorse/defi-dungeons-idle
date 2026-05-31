// Game configuration constants
// Generated from /data/game-config.ts to avoid drift
export { GAME_CONFIG } from '../data/game-config';
export const FOG_OF_WAR_ENABLED = true;
export const FLOOR_TILEMAPS_ENABLED = true;

// Admin configuration
export const ADMIN_ADDRESS = '0xC3c2e1Cf099Bc6e1fA94ce358562BCbD5cc59FE5';

// Centralized render depths to avoid z-order bugs (e.g., entities above FoW)
export const RENDER_DEPTHS = {
  // Fog-of-war overlay depth; must exceed any y-based entity depth
  fog: 100000,
  // Layers that intentionally render above fog (e.g., bullets, UI flashes)
  overFogProjectiles: 100001,
  uiOverlay: 200000,
};
