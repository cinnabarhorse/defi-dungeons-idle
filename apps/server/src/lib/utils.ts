// Utility functions
// Moved from @gotchiverse/shared to simplify build process

import type { Direction } from '../types';
import { Direction as DirectionValues } from '../types';
import { GAME_CONFIG } from './constants';

export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function manhattanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

export function normalizeDirection(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Direction {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? DirectionValues.RIGHT : DirectionValues.LEFT;
  } else {
    return dy > 0 ? DirectionValues.DOWN : DirectionValues.UP;
  }
}

export function getDirectionVector(direction: Direction): {
  x: number;
  y: number;
} {
  switch (direction) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export function isValidTilePosition(x: number, y: number): boolean {
  return (
    x >= 0 && x < GAME_CONFIG.MAP_WIDTH && y >= 0 && y < GAME_CONFIG.MAP_HEIGHT
  );
}

export function worldToTile(
  worldX: number,
  worldY: number
): { x: number; y: number } {
  return {
    x: Math.floor(worldX / GAME_CONFIG.TILE_SIZE),
    y: Math.floor(worldY / GAME_CONFIG.TILE_SIZE),
  };
}

export function tileToWorld(
  tileX: number,
  tileY: number
): { x: number; y: number } {
  return {
    x: tileX * GAME_CONFIG.TILE_SIZE,
    y: tileY * GAME_CONFIG.TILE_SIZE,
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generatePlayerId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function getTimestamp(): number {
  return Date.now();
}