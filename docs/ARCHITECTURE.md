# 🏗️ Gotchiverse Live Architecture

## System Overview

Gotchiverse Live is an idle-first multiplayer 2D pixel world built with modern web technologies. The architecture follows a client-server model optimized for ultra-fast loading and smooth gameplay.

## High-Level Architecture

```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│                 │◄──────────────► │                 │
│   Next.js App   │                 │ Colyseus Server │
│   (Client)      │     Real-time   │   (Game Logic)  │
│   Port 3001     │   Communication │   Port 1999     │
│                 │                 │                 │
└─────────────────┘                 └─────────────────┘
         │                                   │
         │                                   │
    ┌────▼────┐                         ┌────▼────┐
    │ Phaser  │                         │ Express │
    │ Game    │                         │   API   │
    │ Engine  │                         │         │
    └─────────┘                         └─────────┘
```

## Core Components

### 1. Client Architecture (`apps/client`)

**Technology Stack:**

- Next.js 14 (App Router) - React framework
- Phaser 3.87 - 2D game engine
- Tailwind CSS + Radix UI - Styling and components
- Colyseus.js - Real-time client
- TypeScript - Type safety

**Key Components:**

```typescript
// Game Management
GameManager; // Orchestrates Phaser + Colyseus
MainScene; // Main game scene
LoadingScene; // Asset loading
Player; // Player entity

// UI Layer
GameHUD; // React overlay for UI
(Button, Slider); // Reusable UI components
useGameManager; // React hook for game state
```

**Client Features:**

- **Phaser Game Engine**: Handles rendering, input, and game mechanics
- **React UI Overlay**: HUD elements like chat, settings, wallet connection
- **Client Prediction**: Smooth movement with server reconciliation
- **PWA Support**: Installable with offline capabilities
- **Mobile Optimized**: Touch controls and responsive design

### 2. Server Architecture (`apps/server`)

**Technology Stack:**

- Colyseus 0.15 - Real-time multiplayer framework
- Express.js - HTTP server and API endpoints
- Node.js - Runtime environment
- TypeScript - Type safety

**Key Components:**

```typescript
// Room Management
GameRoom            // Main game room logic
LobbyRoom           // Room discovery and matchmaking
PlayerSchema        // Player state schema
EntitySchema        // Game entity schema

// Game Systems
MapGenerator        // Procedural world generation
Movement Validation // Anti-cheat and physics
Combat System       // Attack mechanics
```

**Server Features:**

- **30Hz Game Loop**: Server simulation at 30 FPS
- **15Hz Snapshots**: Optimized network updates
- **Room Management**: Auto-scaling room instances
- **Anti-cheat**: Server-authoritative movement validation
- **Matchmaking**: Public/private room creation

### 3. Shared Packages

#### Types Package (`packages/types`)

Central type definitions shared between client and server:

```typescript
// Game State
(PlayerState, EntityState, RoomState);

// Input/Output
(MoveInput, AttackInput, EmoteInput, GameSnapshot);

// Enums (as const objects)
(Direction, Animation, EntityKind);

// Configuration
(GameConfig, NetworkMessage, RoomInfo);
```

#### Shared Package (`packages/shared`)

Common utilities and game logic:

```typescript
// Constants
GAME_CONFIG; // Tile size, speeds, etc.
NETWORK_CONFIG; // RTT limits, reconnection
PERFORMANCE_CONFIG; // Memory and bandwidth limits

// Utilities
(distance, manhattanDistance, worldToTile);
(generateRoomId, generatePlayerId);
(lerp, clamp, getTimestamp);

// Validation
validateMoveInput; // Movement anti-cheat
validateAttackInput; // Combat validation
validatePlayerName; // Input sanitization

// Pathfinding
GridPathfinder; // A* pathfinding
getNextMoveDirection; // Simple movement helper
```

## Network Protocol

### Message Flow

```
Client                          Server
  │                              │
  ├─► join_room ─────────────────►│
  │◄───────────────── room_joined ├
  │                              │
  ├─► move {x, y, seq} ──────────►│
  │◄──────────── move_accepted/rejected ├
  │                              │
  ├─► attack {dir/target} ───────►│
  │◄─────── attack_accepted ──────┤
  │                              │
  │◄─── state updates (15Hz) ─────┤
```

### Input Schema

```typescript
// Movement (client prediction)
{
  seq: number,        // Sequence number
  ts: number,         // Timestamp
  targetTileX: number,// Grid X coordinate
  targetTileY: number // Grid Y coordinate
}

// Combat
{
  dir?: Direction,    // Attack direction
  targetId?: string   // Target player ID
}
```

### State Synchronization

- **Colyseus Schema**: Binary serialization for efficient network updates
- **Delta Compression**: Only changed properties are sent
- **Client Prediction**: Immediate local feedback with server reconciliation
- **Interpolation**: Smooth animation between server updates

## Performance Optimizations

### Client Performance

- **Asset Loading**: Lazy loading with progressive enhancement
- **Memory Management**: Object pooling for entities
- **Rendering**: Pixel-perfect scaling with `image-rendering: pixelated`
- **Network**: Efficient binary protocol with Colyseus

### Server Performance

- **Tick Rate**: 30Hz simulation with 15Hz network updates
- **Room Isolation**: Separate processes for scalability
- **Anti-cheat**: Minimal validation overhead
- **Memory**: Target ≤64MB per room instance

## Security & Anti-cheat

### Movement Validation

```typescript
// Server-side validation
validateMoveInput(input, currentPos, lastMoveTime) {
  // Check bounds, distance, and speed limits
  // Reject moves that exceed physics constraints
}
```

### Input Sanitization

- Player names: Alphanumeric + underscore/dash only
- Chat messages: Length limits and content filtering
- Movement: Grid-based validation with speed checks

## Deployment Strategy

### Client Deployment (Cloudflare Pages)

```bash
# Static site generation
next build && next export
# CDN deployment with edge caching
```

### Server Deployment (Fly.io)

```bash
# Containerized deployment
docker build -t gotchiverse-server .
flyctl deploy --remote-only
```

### Infrastructure

- **Client**: Global CDN (Cloudflare Pages)
- **Server**: Multi-region containers (Fly.io)
- **Assets**: R2 storage with CDN caching
- **Monitoring**: Health checks and error reporting

## Scaling Considerations

### Horizontal Scaling

- **Room Instances**: Auto-scale based on player demand
- **Regional Deployment**: Reduce latency with geo-distribution
- **Load Balancing**: Route players to optimal regions

### Vertical Scaling

- **Interest Management**: Limit updates to nearby players (64+ players)
- **Spatial Partitioning**: Divide large worlds into sectors
- **State Compression**: Optimize network payload size

## Development Workflow

### Monorepo Structure

```
pnpm workspaces     # Dependency management
turbo               # Build orchestration
TypeScript          # Shared types across packages
```

### Development Commands

```bash
pnpm start          # Start client + server with cleanup
pnpm dev            # Start development mode
pnpm build          # Build all packages
pnpm type-check     # TypeScript validation
```

## Quality Gates

### Performance Targets

- Desktop TTI: ≤2.5s (p95)
- Mobile TTI: ≤4.0s (p95)
- Lighthouse Performance: ≥90
- RTT: ≤120ms (p95)
- Client Memory: ≤150MB
- Server Memory: ≤64MB per room

### Testing Strategy

- **Unit Tests**: Core game logic validation
- **Integration Tests**: Client-server communication
- **Load Tests**: 64-100 concurrent players per room
- **Soak Tests**: 1-hour stability validation

This architecture provides a solid foundation for an idle-first multiplayer pixel world that can scale to support thousands of concurrent players across multiple regions while maintaining ultra-fast loading times and responsive gameplay.
