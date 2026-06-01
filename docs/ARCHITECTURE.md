# DeFi Dungeons Idle Architecture

DeFi Dungeons Idle is a run-based Aavegotchi dungeon crawler. The client handles wallet/session UX, hero selection, inventory, and run presentation. The server owns run simulation, rewards, persistence, and admin APIs.

## Runtime Shape

```text
Next.js client          Colyseus/Express server          Supabase/Postgres
apps/client     <---->  apps/server               <----> db + edge functions
     |                         |
     |                         +---- Goldsky/deposit indexing
     |
     +---- Farcaster/Base miniapp metadata
```

## Client

`apps/client` is a Next.js 14 App Router app. It includes:

- Lobby and run setup
- Aavegotchi/hero selection
- Idle run screen and summary flows
- Inventory, equipment, crafting, shop, top-up, and withdrawal UI
- Daily quest, leaderboard, stats, admin, simulation, and balancing pages
- Playwright E2E tests under `apps/client/e2e`

## Server

`apps/server` combines Colyseus rooms and Express routes. Important areas:

- `rooms/IdleMode.ts` and room systems for idle run progression
- `lib/idle-sim.ts`, combat, abilities, potions, resources, and reward systems
- API routes for sessions, inventory, crafting, shop, runs, stats, admin, top-ups, and withdrawals
- Jobs for daily snapshots, prize distribution, trade settlement, and summaries
- Jest tests colocated under `__tests__` and `*.test.ts`

## Shared Data

Game data starts in `data` and is generated into both apps:

```bash
pnpm run generate:shared
```

Edit `data` first for characters, enemies, items, weapons, difficulty tiers, maps, abilities, and related balancing data.

## Persistence And Integrations

- Supabase/Postgres stores player, inventory, economy, run, deposit, withdrawal, and admin state.
- SQL migrations live in `db/migrations`.
- Supabase edge functions live in `supabase/functions`.
- Goldsky subgraph code lives in `apps/subgraph`.
- Thirdweb/SIWE support wallet auth and transaction workflows.

## Test Layers

- Root Jest config covers server and shared logic.
- Client Jest covers UI hooks/components.
- Playwright covers browser flows in `apps/client/e2e`.
- Golden run fixtures and simulation scripts protect idle run determinism.
