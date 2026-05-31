## Admin impersonation — implementation plan

### Goals

- Allow an admin to view and operate the app exactly as a target wallet would, across HTTP API and WebSocket gameplay.
- Do not weaken SIWE; impersonation must be a privileged, auditable, time-limited override.
- Keep the change low-risk for existing clients; minimize API surface changes.

### Non-goals

- No permanent role transfer or player data editing beyond what the target user could do.
- No bypass for gameplay-locked flows that still require server authorization checks.

## Design overview

- Introduce the concept of two identities per request:
  - actor identity: the authenticated admin’s wallet derived from the SIWE session.
  - effective identity: the wallet being impersonated (defaults to actor if not impersonating).
- Impersonation is activated by an admin-only signed, HTTP-only cookie. Server derives effective identity on every request/socket using the cookie and the SIWE-backed actor session.

### Security model

- Only wallets on `ADMIN_WALLET_ALLOWLIST` may set/clear impersonation.
- Impersonation token is a JWT signed with the same `SESSION_SECRET`, HTTP-only, SameSite-aware, domain-scoped, with short TTL (default 30 minutes), renewable by re-setting.
- All access checks use the effective identity, but logs always include both actor and effective addresses.

## Server changes

### New module

- `apps/server/src/lib/auth/impersonation.ts`
  - create/verify/clear impersonation cookie (name: `dd-impersonate`, configurable via `IMPERSONATION_COOKIE_NAME`).
  - `resolveEffectiveIdentity(req, resolvedSession)` → `{ actorAddress, actorPlayerId, effectiveAddress, effectivePlayerId, isImpersonating }`.
  - `getEffectivePlayer(req, resolvedSession)` utility.

### Admin endpoints

- `POST /api/admin/impersonate` (admin-only):
  - body: `{ address: string }` (must be `0x...` 40 hex, case-insensitive).
  - sets impersonation cookie; returns `{ success, address, playerId }`.
- `POST /api/admin/impersonate/clear` (admin-only):
  - clears impersonation cookie; returns `{ success: true }`.
- `GET /api/admin/impersonation` (admin-only):
  - returns `{ impersonating: boolean, address?: string, playerId?: string | null }`.

### Existing endpoints

- `GET /api/auth/session`
  - Keep backwards compatibility while exposing impersonation state.
  - Response shape (proposed):
    - `address`: effective address (what the app should operate as).
    - `playerId`: effective player id (or null if not linked).
    - `token`: existing session token (unchanged).
    - `impersonating`: boolean.
    - `actorAddress`: the admin wallet actually signed in.
  - Rationale: existing clients that simply use `address` keep working; admin UI can read `impersonating` and `actorAddress`.

- Player-backed endpoints (read + write): `GET /api/player`, `/api/player/*`, economy/inventory/progression/preferences, etc.
  - Use `resolveEffectiveIdentity` to load the effective player and authorize using effective identity.
  - Preserve current rate limits and authorization rules.

### WebSocket (gameplay)

- `GameRoom.onAuth` should read impersonation cookie during the HTTP upgrade.
  - If the actor is admin and an impersonation cookie exists, assign auth as the target wallet (`client.auth.address` = effective address) and carry `client.auth.actorAddress` for logging.
  - Ensure existing bearer/session flows remain unchanged.

### Observability

- HTTP request logs: include `actorAddress`, `effectiveAddress`, and `impersonating` flag.
- Admin actions:
  - Log structured events on impersonate set/clear with request id and admin wallet.

## Client changes (admin-only UI)

- `apps/client/src/app/admin/players/page.tsx`
  - Add input + buttons: “Impersonate” (POST `/api/admin/impersonate`) and “Stop Impersonating” (POST `/api/admin/impersonate/clear`).
  - Display impersonation status banner: shows target wallet/ENS and a quick “clear” action.
  - After set/clear, re-fetch `/api/auth/session` and refresh current page state.

- Session provider / display
  - Read `impersonating` and `actorAddress` from `/api/auth/session` to show an admin-only banner in app shell when applicable.
  - No change to gameplay or wallet connect UI required; the backend returns effective identity.

## Configuration

- `ADMIN_WALLET_ALLOWLIST`: comma-separated admin wallets (checksummed or lowercase; stored/compared lowercase).
- `IMPERSONATION_COOKIE_NAME` (default: `dd-impersonate`).
- `IMPERSONATION_DURATION_SECONDS` (default: `1800`).
- Optional feature flag: `IMPERSONATION_ENABLED` (default on in non-prod, opt-in in prod) if you want a kill switch.

## Testing plan

- Unit
  - JWT sign/verify for impersonation token; cookie attributes (domain, SameSite, Secure) in prod/dev.

- Integration (HTTP)
  - Admin can set/clear and read status; non-admin receives 403.
  - `/api/auth/session` returns effective identity and `impersonating` flag; behavior when target player does not exist.
  - Endpoints like `/api/player` operate using effective identity.

- WebSocket
  - Connect as admin, set impersonation, then open WS; server assigns effective address for gameplay auth.
  - Clear impersonation and ensure subsequent connections revert to actor.

## Rollout & ops

- Ship behind `IMPERSONATION_ENABLED` in prod; enable for a single admin wallet first.
- Add dashboards/alerts for impersonation events (count, active duration, admin wallets involved).
- Document incident rollback: clear cookies + disable flag.

## Risks & mitigations

- Cookie scope/bleed across subdomains: compute top-domain carefully (prefers apex; configurable via `SESSION_COOKIE_DOMAIN`).
- Silent client behavior changes: keep `address` as effective but expose `actorAddress` and `impersonating` so admin UI is explicit.
- Token exfiltration: HTTP-only cookie; short TTL; admin-only endpoints.

## Milestones

1. Server basics: cookie utils + admin endpoints.
2. `/api/auth/session` effective identity response.
3. Apply effective identity to player endpoints.
4. WebSocket onAuth impersonation support.
5. Admin UI controls and banner.
6. Tests + observability.

## Open questions

1. API response contract: okay to keep `address` as effective and add `actorAddress`? Or should we instead add `effectiveAddress` and keep `address` as actor to avoid any behavioral surprises?
2. Default TTL: is 30 minutes appropriate, or should we use a shorter/longer duration?
3. Should impersonation persist across browser restarts (cookie max-age) or be session-only (until browser close)?
4. Do we want a global on/off flag for prod (`IMPERSONATION_ENABLED`) or rely solely on the allowlist?
5. Any endpoints that must explicitly opt-out of impersonation (e.g., payouts/financial actions)?
6. Should the WS layer expose `actorAddress` to the client for debugging (admin-only) or keep it server-side only?














