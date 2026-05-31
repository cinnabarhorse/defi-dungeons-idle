---
name: openclaw-defi-dungeons
description: Use this skill when you need to play or automate DeFi Dungeons via API (REST + Colyseus), including API-key bootstrap (SIWE -> management token -> API key), account/inventory/progression actions, daily systems, and idle-run room control.
---

# Openclaw: DeFi Dungeons API Playbook

## Use This Skill When
- You need autonomous gameplay or account automation through API only.
- You need no-session API-key auth for bots.
- You need room-control commands for idle runs.

## Mission
Operate as a server-authoritative DeFi Dungeons agent: authenticate, inspect player state, join room(s), execute legal actions, and reconcile inventory/progression/economy via API.

## Non-Negotiables
- Never invent endpoints, payload fields, or Colyseus message names.
- Prefer API key auth for automation (`Authorization: Bearer ddk_live_...`).
- Respect server gating:
  - API-key creation gate: SIWE wallet must own at least one Aavegotchi NFT.
  - API-key room-join gate: `USDC >= 1000` and `GHST >= 1000`.
  - Difficulty gate: `normal=0`, `nightmare=100`, `hell=1000` (USDC+GHO total).
  - Competition runs: 3/day across tiers.
- Treat HTTP/WS server responses as source of truth.

## Critical Prerequisites For API Keys
### Key Creation Eligibility
- `POST /api/auth/api-keys` requires ownership of at least one Aavegotchi.
- API-key create errors:
  - `gotchi_ownership_required`
  - `gotchi_ownership_verification_unavailable`
- Admin-allowlisted wallets can be exempt from this create-key gate.

### Gameplay Eligibility With API Key
- Room join (Colyseus `onJoin`) still enforces:
  - `USDC >= 1000`
  - `GHST >= 1000`
- This room-join stake gate is separate from API-key creation.
- Difficulty unlocks remain based on `USDC + GHO total`.

### Staking Runbook (Needed For API-Key Room Play)
1. Authenticate with session cookie or session bearer (`/api/topup/*` does not accept management token).
2. Check current stake using `GET /api/player/staked-balance` and read `usdc`, `ghst`, `gho`, `total`, `accessibleTiers`.
3. Load deposit config with `GET /api/topup/config` (chainId, contractAddress, supported tokens).
4. Optionally quote with `POST /api/topup/quote` and payload `{ tokenSymbol, amountWei }`.
5. Submit on-chain deposit transaction(s) to the GamePoints contract.
6. Register each deposit with `POST /api/topup/deposits` and payload `{ tokenSymbol, txHash, amountWei }`.
7. Poll `GET /api/topup/deposits` and `GET /api/player/staked-balance` until deposits are credited and thresholds are met.
8. For API-key room play, ensure `usdc >= 1000` and `ghst >= 1000`.

## Base URLs
- Local API base: `http://localhost:1999`
- Local Colyseus WS: `ws://localhost:1999`

## Auth Modes
- Session cookie (`dd-session`)
- Session bearer token
- API key bearer token (`ddk_live_*`)
- API key management bearer token (short-lived token from SIWE exchange)

## No-Session API-Key Bootstrap
1. Get nonce
- `POST /api/auth/nonce`
- Response: `{ nonce, statement, chainId }`

2. Build/sign SIWE message client-side
- Domain must be allowed (`aavegotchi.com` and configured allowed domains)
- Chain must be Base (`8453`)

3. Exchange SIWE for management token
- `POST /api/auth/api-keys/siwe-token`
- Body: `{ message, signature, isSmartWallet?, region? }`
- Response: `{ token, expiresAt, playerId, address }`

4. Create API key with management token
- `POST /api/auth/api-keys`
- Header: `Authorization: Bearer <management-token>`
- Body (optional): `{ name }`
- Response (one-time plaintext): `{ key, apiKey }`

5. Use API key for player APIs and room auth
- Header: `Authorization: Bearer ddk_live_...`

## API Key Lifecycle
- `POST /api/auth/api-keys` create
- `GET /api/auth/api-keys` list metadata/counters (no plaintext key)
- `DELETE /api/auth/api-keys/:id` revoke

Counters tracked per key: `authSuccessCount`, `roomJoinCount`, `lastUsedAt`, `lastUsedIp`, `lastUsedUserAgent`.

## HTTP Capability Map (Player/Bot)

### Session / Identity
- `GET /api/auth/session`
- `GET /api/player`
- `GET /api/player/progression`

### Progression
- `POST /api/player/progression/allocate`
  - Body: `{ stats: { energy, aggression, spookiness, brainSize }, allocationHistory? }`
- `POST /api/player/progression/deallocate`
- `POST /api/player/progression/reset`
- `POST /api/player/progression/rebirth`
  - Requires max level for current rebirth band + `1000` Lick Tongues

### Character / Preferences
- `POST /api/player/unlocks/character`
  - Body: `{ characterId }`
- `POST /api/player/character/select`
  - Body: `{ characterId, gotchiSpriteUrl? }`
- `GET /api/player/preferences`
- `PUT /api/player/preferences`
  - Patch fields: `selectedCharacterId`, `selectedDifficultyTier`, `gotchiSpriteUrl`, `avatarId`, `audioSettings`
- `PUT /api/player/username`

### Inventory / Equipment
- `GET /api/player/inventory`
- `POST /api/player/inventory/remove`
  - Single or batch via `{ items: [...] }`
  - Requests support:
    - instance: `{ inventoryItemId }`
    - fungible: `{ itemType, itemName, quantity }`
- `GET /api/player/equipment`
- `POST /api/player/equipment`
  - Single: `{ slot, slug }`
  - Batch: `{ assignments: [{ slot, slug }] }`
- `DELETE /api/player/equipment`
  - Single: query `?slot=...`
  - Batch body: `{ slots: [...] }`

### Shop / Crafting / Economy
- `POST /api/shop/purchase`
  - Body: `{ purchases: [{ itemId, quantity }] }`
  - Constraints: max 10 items, quantity 1..999
  - Current shop ids: `health_potion`, `mana_potion`
- `POST /api/crafting/craft`
  - Body: `{ fromTier, count? }`
  - Recipes: `3x T1 -> 1x T2`, `3x T2 -> 1x T3`
- `POST /api/player/inventory/sell`
  - Sell by instance id or fungible tuple
  - Rate limit: 5 req / 5s
  - Global daily cap: 1000 gold
- `GET /api/economy/equipment-sell-cap`
- `GET /api/player/economy`
- `GET /api/loot/catalog`

### Daily Runs / Competition
- `GET /api/player/daily-runs`
- `GET /api/daily-runs/preview?difficultyId=...`
- `POST /api/daily-runs/attune`
- `GET /api/daily-quest/config`
- `GET /api/daily-quest/leaderboards`
- `GET /api/daily-quest/leaderboard/:tier`
- `GET /api/daily-quest/status`
- `GET /api/daily-quest/history`
- `GET /api/daily-quest/rank/:tier`

### Stake / Topup / Withdrawals
- `GET /api/player/staked-balance`
- `GET /api/topup/config`
- `POST /api/topup/quote`
- `GET /api/topup/deposits`
- `POST /api/topup/deposits`
- `GET /api/tokens/withdrawals`
- `POST /api/tokens/withdraw/:tokenId`
- `POST /api/tokens/withdraw-batch`

Withdrawal rules:
- Minimum per currency: `0.1` (`USDC`, `GHST`)
- Auto-approval:
  - `GHST < 100`
  - `USDC < 10` only when source is daily-quest prize with valid tier

### Rooms / Leaderboards / Gotchis
- `GET /api/rooms`
- `POST /api/rooms`
- `GET /api/rooms/:roomId`
- `GET /api/leaderboard`
- `GET /api/leaderboard/top-runs`
- `GET /api/player/runs`
- `GET /api/aavegotchis`
- `POST /api/gotchis/generate`
- `GET /api/gotchis`
- `GET /api/gotchis/:id`

## Colyseus Gameplay Transport
Gameplay is primarily room-based. Authenticate on join using bearer token.

### Room Join Auth
Pass one of:
- WS header: `Authorization: Bearer <token>`
- Join option field: `authorization: 'Bearer <token>'`

### Typical Join Options
- `difficultyTier`
- `region`
- `leverage`
- `autoAscendFloor`
- `dailyQuestActive` (competition mode)
- `selectedCharacterId` or `characterId` or `gotchiId` (not both gotchi+character)
- `name` (some clients also send `playerName`)

### Client -> Server Messages (Supported)
- `idle_toggle_auto` `{ enabled: boolean }`
- `idle_set_speed_run` `{ enabled: boolean, multiplier?: number }`
- `idle_restart_run` `{}`
- `idle_combat_action` `{ action: 'attack' }`
- `idle_set_target` `{ index: number }`
- `idle_cast_spell` `{ spellId: string }`
- `idle_kite` `{}`
- `idle_grenade` `{}`
- `idle_enter_next_room` `{}`
- `idle_open_victory_chest` `{}`
- `idle_refresh_victory_chest` `{}`
- `chat` `{ text: string }`
- `emote` `{ id: string | number }`
- `ping` `{ timestamp: number }`
- `progression_sync` `{ profile }`

Dev-only (non-production):
- `spawnTestItems`, `clearTestItems`, `debug_toggle_invincibility`, `debug_idle_force_victory_chest`, `debug_idle_force_victory_chest_teaser`, `debug_idle_force_death`

Current spell ids in code:
- `freezing_attack`
- `bounce_attack`

### Key Server Events To Watch
- `room_joined`
- `inventory_updated`, `inventory_removed`, `inventory_remove_error`
- `spell_cast_result`
- `progression:profile`, `progression:xp_awarded`
- `kill_streak:updated`, `kill_streak:reset`
- `victory_chest_opened`, `victory_chest_open_failed`
- `daily_quest:leaderboard_update`
- `staging_*`, `late_join_closed`
- `server_perf`

## Bot Operating Loop
1. Snapshot state:
- `GET /api/player`
- `GET /api/player/inventory`
- `GET /api/player/equipment`
- `GET /api/player/daily-runs`
- `GET /api/player/staked-balance`
2. If no API key exists, run SIWE -> management token -> API key create.
- If create fails with `gotchi_ownership_required`, stop and require an owned Aavegotchi first.
3. If planning API-key room play and `usdc < 1000` or `ghst < 1000`, execute the staking runbook.
4. Pre-run setup:
- Choose valid `difficultyTier` from staked balance.
- If competition run, call `POST /api/daily-runs/attune` first.
5. Join room with bearer auth and options.
6. In-room control loop:
- Track encounter state from room schema/events.
- Set target (`idle_set_target`), attack (`idle_combat_action`), cast spells, kite/grenade as legal.
- Advance rooms (`idle_enter_next_room`), handle victory chest.
7. Post-run reconciliation:
- Refresh inventory/progression/economy and optionally queue withdrawals.
8. Rotate/revoke keys if needed.

## Error Handling Patterns
- Auth: `401 Unauthorized`, `403 Player not linked to session`
- API key eligibility: `gotchi_ownership_required`, `gotchi_ownership_verification_unavailable`, `active_key_limit_reached`, `revoked_key`, `invalid_key`
- Daily limits: `NO_RUNS_REMAINING`, `NO_COMPETITION_RUNS_REMAINING`, `DAILY_RUNS_EXHAUSTED`
- Inventory sell: `ITEM_NOT_SELLABLE`, `ITEM_EQUIPPED`, `GLOBAL_SELL_CAP_REACHED`, `RATE_LIMITED`
- Rebirth: level gate, insufficient tongues, cap reached
- API-key room-join stake failures include entitlement message, e.g. `Insufficient staked balance: requires 1000 USDC and 1000 GHST (...)`

When an operation fails, re-read authoritative state before retrying.

## Admin API (Out Of Scope For Gameplay Bots)
There are extensive `/api/admin/*` routes (withdrawals, cron, stats, player admin, DB admin). Use only when explicitly asked and with admin session.

## Source Map (Scanned)
Primary files used to build this skill:
- `docs/automation-api.md`
- `README.md`
- `AGENTS.md`
- `apps/server/src/index.ts`
- `apps/server/src/routes/api-keys.ts`
- `apps/server/src/routes/api-key-siwe-token.ts`
- `apps/server/src/routes/daily-runs.ts`
- `apps/server/src/routes/daily-quest-competition.ts`
- `apps/server/src/routes/shop.ts`
- `apps/server/src/routes/crafting.ts`
- `apps/server/src/routes/inventory-sell.ts`
- `apps/server/src/routes/player-equipment.ts`
- `apps/server/src/routes/player-staked-balance.ts`
- `apps/server/src/routes/player-progression-rebirth.ts`
- `apps/server/src/routes/token-withdrawals.ts`
- `apps/server/src/lib/auth/principal.ts`
- `apps/server/src/lib/auth/api-keys.ts`
- `apps/server/src/lib/auth/stake-entitlement.ts`
- `apps/server/src/lib/auth/api-key-room-access.ts`
- `apps/server/src/rooms/GameRoom.ts`
- `apps/server/src/rooms/SharedGame.ts`
- `apps/server/src/rooms/IdleMode.ts`
