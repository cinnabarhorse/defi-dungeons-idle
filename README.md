# 🎮 DeFi Dungeon

A 2D top-down pixel world where you can play, explore, and earn with your Aavegotchi.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers (client + server)
pnpm start

# Alternative: Start development without cleanup
pnpm dev
```

## ⚙️ Configuration

### Server Connection

The client connects to your deployed Colyseus Cloud server by default:

- **Production**: `wss://sg-sgp-4a9ac90a.colyseus.cloud`
- **Local Development**: Create `apps/client/.env.local` and add:
  ```
  NEXT_PUBLIC_SERVER_URL=ws://localhost:1999
  ```

## 🏗️ Architecture

### Monorepo Structure

```
├── apps/
│   ├── client/          # Next.js frontend (port 3001)
│   └── server/          # Colyseus backend (port 1999)
├── packages/
│   ├── types/           # Shared TypeScript types
│   └── shared/          # Shared utilities & constants
```

### Technology Stack

**Client:**

- Next.js 14 (App Router)
- Phaser 3.87 (Game Engine)
- React 18 (UI Overlay)
- Tailwind CSS + Radix UI
- Colyseus.js (Client)
- PWA Support

**Server:**

- Colyseus 0.15 (Real-time Multiplayer)
- Express.js
- TypeScript
- 30Hz server tick, 15Hz snapshots

## 🎯 Features Implemented

### ✅ Core Game Features

- **Real-time Multiplayer**: Up to 100 players per room
- **Grid-based Movement**: Click-to-move with WASD/arrow key support
- **Combat System**: Basic attack mechanics with cooldowns
- **Procedural Maps**: Seeded world generation with obstacles
- **Player State**: HP, animations, direction tracking
- **Chat System**: Real-time messaging
- **Emote System**: Express yourself with emojis

### ✅ Technical Features

- **Performance Optimized**: Target ≤2.5s TTI desktop, ≤4.0s mobile
- **Mobile Responsive**: Landscape-first design with safe areas
- **PWA Ready**: Installable progressive web app
- **Real-time Networking**: Client prediction with server authority
- **Audio Controls**: Volume sliders for SFX and music
- **Wallet Integration**: Optional Thirdweb wallet connection

## 🎮 Controls

- **Movement**: WASD or Arrow Keys, or Click/Tap to move
- **Attack**: Spacebar
- **Emotes**: 1, 2, 3 keys
- **Chat**: Click chat button in HUD

## 🔧 Development

### Scripts

```bash
pnpm start        # Start both client and server with cleanup
pnpm dev          # Start development without cleanup
pnpm stop         # Stop all development processes
pnpm build        # Build all packages for production
pnpm lint         # Run linting
pnpm type-check   # TypeScript type checking
```

### Development URLs

- **Client**: http://localhost:3001
- **Server**: ws://localhost:1999
- **Health Check**: http://localhost:1999/health

### Project Configuration

- **Tile Size**: 32×32 pixels
- **Map Size**: 64×64 tiles
- **Server Tick**: 30Hz
- **Snapshot Rate**: 15Hz
- **Max Players**: 100 per room
- **Movement Speed**: 4 tiles/second
- **Attack Cooldown**: 1000ms

## 🌍 Game World

### Map Generation

- Procedurally generated worlds using seeded randomization
- Border walls for boundaries
- Random obstacles (trees, stones)
- Water patches for visual variety
- Safe spawn points with clearance

### Player Features

- **Health System**: 100 HP base, damage on attack
- **Animation States**: Idle, Walk, Attack, Hurt, Death
- **Direction Tracking**: 4-directional movement
- **Name Display**: Player names above characters
- **Health Bars**: Visual HP indicators

## 🔮 Planned Features

### Audio System

- SFX channels with volume control
- Background music
- Tap-to-unlock audio policy compliance

### Enhanced Authentication

- Full Thirdweb wallet integration
- Guest mode support
- Player profiles and progression

### Advanced Gameplay

- Inventory system
- Item collection and usage
- More combat mechanics (projectiles, different attacks)
- Room-based progression

### Performance & Scaling

- Code splitting and lazy loading
- Texture atlas pipeline with TexturePacker
- Interest management for 64+ players
- Multi-region deployment

## 🚢 Deployment

### Server Deployment (Fly.io/Railway)

```bash
# Build and deploy server
cd apps/server
docker build -t gotchiverse-server .
# Deploy to your preferred platform
```

### Client Deployment (Cloudflare Pages)

```bash
# Build client
cd apps/client
pnpm build
# Deploy to Cloudflare Pages
```

## 📊 Performance Targets

- **Desktop TTI**: ≤2.5s (p95)
- **Mobile TTI**: ≤4.0s (p95)
- **Lighthouse Performance**: ≥90
- **RTT**: ≤120ms (p95)
- **Client Memory**: ≤150MB
- **Server Memory**: ≤64MB per room

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `pnpm start`
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for the Aavegotchi community

# Testing auto-deployment

# Auto-deployment test Mon Aug 18 18:27:56 CST 2025

# Testing fixed secrets Mon Aug 18 18:30:00 CST 2025

# Trigger deployment
