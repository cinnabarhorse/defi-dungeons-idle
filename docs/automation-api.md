# Automation API (API Key, No Session)

This document describes how to use the no-session automation lane with API keys.

## Feature Flags And Env

- `ENABLE_STAKED_API_KEYS=1`
- `API_KEY_HASH_SECRET=<required>`
- `API_KEY_MAX_ACTIVE_PER_PLAYER=5` (default)
- `API_KEY_MGMT_TOKEN_TTL_SECONDS=900` (default)
- `API_KEY_MGMT_TOKEN_SECRET=<optional>` (falls back to `SESSION_SECRET`)
- `AAVEGOTCHI_OWNERSHIP_CONTRACT_ADDRESS=<required for RPC ownership fallback>`
- `AAVEGOTCHI_OWNERSHIP_RPC_URL=<optional>` (falls back to `BASE_RPC_URL`, then public Base RPC)

## API Key Eligibility

API key creation requires wallet ownership of at least one Aavegotchi NFT.

Room join with API key still enforces stake entitlement:

- `USDC >= 1000`
- `GHST >= 1000`

Stake is not rechecked on every HTTP request in this version.

## Authentication Modes

The server now accepts these principals on supported player routes:

- Session cookie
- Session bearer token
- API key bearer token (`ddk_live_...`)
- API key management bearer token (short-lived token from SIWE)

CSRF protection is required only for mutating requests that use a session cookie.

## Bootstrap Flow (No Session)

1. Request nonce:
   - `POST /api/auth/nonce`
2. Build and sign SIWE message client-side.
3. Exchange SIWE signature for a short-lived management token:
   - `POST /api/auth/api-keys/siwe-token`
   - body: `{ "message": "...", "signature": "...", "isSmartWallet": false }`
   - response: `{ "token", "expiresAt", "playerId", "address" }`
4. Create API key with management bearer token:
   - `POST /api/auth/api-keys`
   - `Authorization: Bearer <management-token>`
   - requires at least one owned Aavegotchi
   - response includes plaintext `apiKey` once.
5. Use API key on gameplay/account APIs:
   - `Authorization: Bearer ddk_live_...`

## API Key Lifecycle Endpoints

- `POST /api/auth/api-keys`
  - Auth: session cookie/bearer, management bearer, or API key bearer.
  - Creates a key and returns plaintext key once.
- `GET /api/auth/api-keys`
  - Auth: session cookie/bearer, management bearer, or API key bearer.
  - Returns metadata and counters (never plaintext key).
- `DELETE /api/auth/api-keys/:id`
  - Auth: session cookie/bearer, management bearer, or API key bearer.
  - Soft-revokes the key.

## Basic Telemetry (Per Key)

Tracked on each API key:

- `authSuccessCount` (incremented on successful HTTP/WS API-key auth)
- `roomJoinCount` (incremented on successful API-key room join)
- `lastUsedAt`
- `lastUsedIp`
- `lastUsedUserAgent`

## Representative Gameplay And Account Endpoints

All of the following accept `Authorization: Bearer ddk_live_...`:

- Player/account:
  - `GET /api/player`
  - `GET /api/player/progression`
  - `POST /api/player/character/select`
  - `GET /api/player/inventory`
- Equipment/inventory:
  - `GET /api/player/equipment`
  - `POST /api/player/equipment`
  - `DELETE /api/player/equipment`
  - `POST /api/player/inventory/sell`
- Shop/crafting:
  - `POST /api/shop/purchase`
  - `POST /api/crafting/craft`
- Daily systems:
  - `GET /api/player/daily-runs`
  - `POST /api/daily-runs/attune`
  - `GET /api/daily-quest/status`
- Payments/withdrawals:
  - `GET /api/tokens/withdrawals`
  - `POST /api/tokens/withdraw/:tokenId`
  - `POST /api/tokens/withdraw-batch`

## Colyseus Gameplay

Gameplay transport remains Colyseus. To play by API key:

- Pass `Authorization: Bearer ddk_live_...` in room join/auth request.
- On successful API-key auth, telemetry updates.
- On API-key `onJoin`, stake entitlement is enforced and `roomJoinCount` increments.

## Error Patterns

Common API key errors:

- `gotchi_ownership_required`
- `gotchi_ownership_verification_unavailable`
- `active_key_limit_reached`
- `revoked_key`
- `invalid_key`
- `csrf_validation_failed` (cookie-session mutating requests only)
