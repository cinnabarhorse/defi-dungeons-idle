# DeFi Dungeons Idle

DeFi Dungeons Idle is an Aavegotchi dungeon crawler built around asynchronous idle runs. Players connect a wallet, pick a Gotchi or hero, choose a dungeon difficulty, and let the run resolve through server-authoritative encounters for loot, XP, gold, potions, wearables, daily quest score, and token-linked rewards.

The current game is idle-first. The original real-time top-down multiplayer prototype has been replaced by a run-based Colyseus game server with a Next.js lobby, inventory, crafting, shop, leaderboard, admin, and simulation tools.

## Stack

- Next.js 14 App Router client in `apps/client`
- Colyseus and Express game server in `apps/server`
- Shared generated game data from `data`
- Supabase Postgres for player, inventory, economy, run, and admin data
- Goldsky/Supabase edge functions for deposit and scheduled reward workflows
- pnpm workspaces with Turborepo

## Repository Layout

```text
apps/
  client/      Next.js app, lobby, idle run UI, admin tools, Playwright E2E
  server/      Colyseus rooms, Express API, jobs, game systems
  subgraph/    Goldsky subgraph for deposit indexing
data/          Source-of-truth game data copied into client and server
db/            SQL migrations for Supabase/Postgres
docs/          Architecture, systems, and feature notes
packages/      Small shared domain packages
scripts/       Data generation, simulation, migration, and ops helpers
supabase/      Edge functions and Supabase configuration
```

## Local Setup

Use Node 20 and pnpm.

```bash
pnpm install
pnpm run generate:shared
```

For local development, create environment files as needed:

- `.env.test` from `.env.test.example` for test runs
- `apps/client/.env.local` for browser-facing values
- server environment variables in your shell or deployment provider

The most common local values are:

```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:1999
NEXT_PUBLIC_APP_SERVER_URL=http://localhost:1999
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=your-thirdweb-client-id
```

Server/API features that touch live data also need Supabase credentials:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgres://...
```

## Development

```bash
pnpm dev
```

By default:

- Client: `http://localhost:3001`
- Server: `http://localhost:1999`
- Server health: `http://localhost:1999/health`

Useful commands:

```bash
pnpm build              # Build the client
pnpm build:server       # Build the server bundle
pnpm type-check         # TypeScript checks through Turbo
pnpm lint               # Lint packages that define lint scripts
pnpm test               # Unit/integration tests through Turbo
pnpm test:fast          # Main Jest suite, excluding E2E/agent-browser tests
pnpm test:e2e           # Playwright E2E suite
pnpm test:agent         # Snapshot and focused client agent tests
pnpm test:scripts:non-idle
```

Game data is generated from `data` into both app workspaces. Edit the source file under `data`, then run:

```bash
pnpm run generate:shared
```

## Current Game Systems

- Idle dungeon runs with combat, encounter, portal, boss, victory, and death states
- Difficulty tiers gated by USDC/GHO stake entitlement
- Practice and competitive daily quest run flows
- Daily run limits, leaderboard scoring, and scheduled prize distribution
- Aavegotchi ownership/session auth with SIWE and smart wallet support
- Character and Gotchi selection, sprite caching, and wearable previewing
- Inventory, equipment durability, potion use, crafting, shop, and sell flows
- Run levels, XP, rebirth, kill streaks, abilities, spells, elite enemies, and boss mechanics
- Token top-ups, deposit indexing, withdrawal batching, and admin reconciliation tools
- Simulation, map/editor, item, wearable, enemy, and admin dashboards for balancing

## Testing

Run the fast suite before opening a PR:

```bash
pnpm test:fast
pnpm type-check
```

Run E2E when touching the lobby, wallet/session flow, idle run UI, inventory, daily runs, or routing:

```bash
pnpm test:e2e
```

Some tests require `.env.test` with Supabase and Thirdweb values. The Playwright E2E suite also expects the local Supabase/Postgres stack to be reachable because dev login and daily-run flows persist data through the server. Start Docker, then run:

```bash
supabase start
pnpm test:e2e
```

Tests that should not hit external services use `GOTCHI_SPRITES_BACKEND=mock` and deterministic seeds from `.env.test.example`.

## Deployment

The client builds through Vercel/Next.js. The server build script creates a deployable server bundle:

```bash
pnpm build
pnpm build:server
```

Supabase functions deploy from tags through `.github/workflows/deploy-functions.yml`. The Goldsky subgraph deploys from tags through `.github/workflows/deploy-subgraph.yml`.

## Contributing

Keep changes scoped and update tests or docs for behavior changes. Prefer editing source-of-truth files under `data` instead of generated copies under `apps/client/src/data` or `apps/server/src/data`.

Before submitting changes, run the narrowest relevant test plus the fast gate when practical:

```bash
./scripts/fast-check.sh
```
