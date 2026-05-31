// Input validation functions
// Moved from @gotchiverse/shared to simplify build process

import type { MoveInput, Direction } from '../types';
import { Direction as DirectionValues } from '../types';
import { GAME_CONFIG } from './constants';
import { isValidTilePosition, manhattanDistance } from './utils';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMoveInput(
  input: MoveInput,
  currentX: number,
  currentY: number,
  lastMoveTime: number
): ValidationResult {
  // Check if input is valid
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'Invalid input format' };
  }

  // Check required fields
  if (
    typeof input.targetTileX !== 'number' ||
    typeof input.targetTileY !== 'number'
  ) {
    return { valid: false, error: 'Missing target coordinates' };
  }

  // Check if target position is valid
  if (!isValidTilePosition(input.targetTileX, input.targetTileY)) {
    return { valid: false, error: 'Target position out of bounds' };
  }

  // Check movement distance (prevent teleporting)
  const distance = manhattanDistance(
    currentX,
    currentY,
    input.targetTileX,
    input.targetTileY
  );
  if (distance > GAME_CONFIG.MOVEMENT_SPEED * 2) {
    // Allow some tolerance
    return { valid: false, error: 'Movement distance too large' };
  }

  // Check timing (prevent too frequent moves)
  const now = Date.now();
  const timeSinceLastMove = now - lastMoveTime;
  const minMoveInterval = 1000 / GAME_CONFIG.MOVEMENT_SPEED; // ms per tile

  if (timeSinceLastMove < minMoveInterval * 0.5) {
    // Allow some tolerance
    return { valid: false, error: 'Moving too fast' };
  }

  return { valid: true };
}
