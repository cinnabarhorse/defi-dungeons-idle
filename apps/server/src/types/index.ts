// Game types - inlined to eliminate workspace dependency
// Previously from @gotchiverse/types

import { PlayerSchema } from 'src/schemas';

// Game State Types
export interface PlayerState {
  id: string;
  name: string;
  wallet?: string;
  x: number;
  y: number;
  dir: Direction;
  anim: Animation;
  hp: number;
  avatarId: string;
}

export interface EntityState {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  state: Record<string, any>;
}

export interface RoomState {
  id: string;
  seed: number;
  region: string;
  players: Map<string, PlayerState>;
  entities: Map<string, EntityState>;
  startedAt: number;
}

// Input/Output Schemas
export interface MoveInput {
  seq: number;
  ts: number;
  targetTileX: number;
  targetTileY: number;
}

export interface EmoteInput {
  id: string;
}

export interface GameSnapshot {
  players: PlayerState[];
  entities: EntityState[];
  ts: number;
}

// Direction type using const assertion
export const Direction = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

// Animation type using const assertion
export const Animation = {
  IDLE: 'idle',
  WALK: 'walk',
  ATTACK: 'attack',
  ATTACK_RANGED: 'attack_ranged',
  THROW: 'throw',
  HURT: 'hurt',
  DEATH: 'death',
  SPRINT: 'sprint',
} as const;

export type Animation = (typeof Animation)[keyof typeof Animation];

// EntityKind type using const assertion
export const EntityKind = {
  PLAYER: 'player',
  PROJECTILE: 'projectile',
  COLLECTIBLE: 'collectible',
  OBSTACLE: 'obstacle',
  SPAWN_POINT: 'spawn_point',
  TREASURE_CHEST: 'treasure_chest',
  ROAD: 'road',
  ENEMY: 'enemy',
  PORTAL: 'portal',
  DEBUG_RECTANGLE: 'debug_rectangle',
} as const;

export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

// Configuration Types
export interface GameConfig {
  TILE_SIZE: number;
  MAP_WIDTH: number;
  MAP_HEIGHT: number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  SERVER_TICK_HZ: number;
  SNAPSHOT_HZ: number;
  MAX_PLAYERS: number;
  MOVEMENT_SPEED: number;
  ATTACK_COOLDOWN: number;
  BASE_HP: number;
}

// Networking Types
export interface NetworkMessage {
  type: string;
  data: any;
  timestamp: number;
}

// Room Management Types
export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  region: string;
  isPrivate: boolean;
  metadata?: Record<string, any>;
}

// Audio Types
export interface AudioConfig {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

// UI Types
export interface HUDState {
  showChat: boolean;
  showPlayerList: boolean;
  showSettings: boolean;
  connectedWallet?: string;
  playerName: string;
}

// Room API surface used by lib systems
export interface GameRoomApi {
  tryAutoHeal?: (player: PlayerSchema) => boolean;
  clients?: Iterable<any>;
  emitMatchEvent?: (
    eventName: string,
    payload?: Record<string, unknown>
  ) => void;
}

// Re-export inventory types for convenience
export * from './inventory';
export * from './portal';
export * from './spells';
