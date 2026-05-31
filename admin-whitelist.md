## Admin pre-authorization allowlist (whitelist) — end-to-end strategy

### Objective

Enable admins to pre-authorize player wallets so first-time verified logins are automatically granted access (`is_authorized=true` with `access_granted_at=now()`), eliminating the current manual authorize step on the Admin Players page. Keep gameplay and security semantics unchanged for everyone else.

### Non-goals

- Do not automatically deauthorize players if their wallet is later removed from the allowlist.
- Do not change gameplay gating beyond the initial authorization step (WebSocket and API require authorized player as today).

## Current flow (for reference)

- On SIWE verify, server upserts `players` with `is_authorized=false` for new wallets.
- Admin visits `/admin/players` to manually authorize by `playerId`.
- WebSocket join and some API endpoints check `players.is_authorized` and block if false.

## Proposed design

1. Introduce a small allowlist table (`player_allowlist`) to store normalized wallet addresses an admin has pre-authorized.
2. Update the server upsert logic to atomically check this allowlist:
   - New player: set `is_authorized=true` and `access_granted_at=now()` if wallet is allowlisted.
   - Existing player: if currently unauthorized and wallet is allowlisted, flip to authorized on the next verified login.
3. Provide admin APIs and a minimal UI to manage the allowlist (bulk add/remove, search/list).
4. Keep WebSocket and API authorization gates unchanged; they continue to enforce `players.is_authorized`.

## Data model

Table: `public.player_allowlist`

- `wallet_address text primary key` (normalized lowercase `0x...` 40-hex format)
- `note text` (optional, short description/context)
- `added_by_address text not null` (admin wallet that added the entry, normalized lowercase)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes/constraints:

- Primary key on `wallet_address` provides uniqueness and lookup performance.
- Decision: no DB CHECK constraint; rely on app-side normalization and validation initially.

Notes:

- A `note` column may exist for future use, but the initial UI/API will not require or send notes.

Example migration (idempotent):

```sql
create table if not exists public.player_allowlist (
  wallet_address text primary key,
  note text,
  added_by_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_allowlist_wallet on public.player_allowlist (wallet_address);

-- Optional: trigger to maintain updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists player_allowlist_set_updated_at on public.player_allowlist;
create trigger player_allowlist_set_updated_at
before update on public.player_allowlist
for each row execute function set_updated_at();
```

## Server changes

### 1) DB repo for allowlist (new module)

Add `apps/server/src/lib/db/repos/player-allowlist.ts`:

- `normalizeWallet(address: string): string` → lowercase, trim.
- `add({ walletAddress, addedByAddress })` → upsert by primary key.
- `remove(walletAddress)` → delete by pk.
- `isAllowlisted(walletAddress): Promise<boolean>` → `select 1 from player_allowlist where wallet_address=$1`.
- `get(walletAddress)` → fetch single (for UI/validation).
- `list({ limit, offset, query })` → paginate; if `query`, filter by `wallet_address ilike '%...%'`.

Security:

- All writes are admin-only via existing admin session gating.
- Always normalize to lowercase before storing and comparing.

### 2) Upsert behavior in `players` repo (no behavior change for non-allowlisted)

Update `upsertPlayerByWallet` insert and update paths so they atomically consult the allowlist in SQL:

- Insert path: set `is_authorized = exists(select 1 from public.player_allowlist where wallet_address = $1)` and `access_granted_at = case when exists(...) then now() else null end`.
- Update path: if row exists and `is_authorized=false`, flip to `true` (and set `access_granted_at=now()`) iff `exists(select 1 from public.player_allowlist where wallet_address = $1)` at the time of update. Otherwise leave unchanged. Always update `last_seen`/`updated_at`.

Rationale:

- Avoids a race between a read and write; keeps logic in a single statement on each path.
- Idempotent: repeat logins won’t continually reset timestamps.

### 3) Admin API (additive, admin-gated)

Add routes (can live alongside `admin-players` routes):

- `GET /api/admin/player-allowlist?limit=&offset=&query=`
  - Returns `{ entries: Array<{ walletAddress, note, addedByAddress, createdAt, updatedAt }>, pagination: { limit, offset, total } }`

- `GET /api/admin/player-allowlist/:wallet`
  - Returns `{ entry }` or 404 if not found

- `POST /api/admin/player-allowlist`
  - Body: `{ addresses: string[] }`
  - Validates entries, normalizes lowercase, dedupes, inserts or no-ops on duplicates
  - Records `added_by_address` from the admin session (`requireAdminSession` provides the wallet)
  - Returns `{ addedCount, skippedCount }`

- `DELETE /api/admin/player-allowlist/:wallet`
  - Removes entry if present, returns `{ success: true }` or `{ success: false }` if not found

All return 401/403 for non-admin, matching existing admin route patterns. Log admin actions with the admin wallet and counts for auditing.

## Client (Admin UI) changes

Create a dedicated admin page at `/admin/allowlist`:

1. “Pre-authorize wallets” (bulk add)
   - Textarea to paste one or many addresses (comma/newline separated).
   - Submit button calls `POST /api/admin/player-allowlist` and surfaces summary (`addedCount`, `skippedCount`).
   - Normalize to lowercase client-side before POST; basic validation (`0x` + 40 hex) with helpful inline error.

2. “Allowlist” (list and manage)
   - Paginated table of allowlisted wallets with `wallet`, `addedBy`, `createdAt`.
   - “Remove” action per row calls `DELETE /api/admin/player-allowlist/:wallet` (confirm before delete).
   - Optional search box wired to `?query=` to filter server-side (wallet substring).
   - Optionally show ENS names alongside wallet for readability (existing `useEnsNames` can be reused).

Notes:

- Link `/admin/allowlist` from the Admin index page; optionally add a link from `/admin/players`.
- This UI is additive and non-invasive; existing “Authorize” per-player button remains for ad-hoc authorizations, and a “Deauthorize” action will be added for parity.
- No client logic needs to change in gameplay or session flows.

## Security and normalization

- Normalize all addresses to lowercase at boundaries (server: API and DB; client: UI convenience only).
- All admin endpoints are gated by existing admin wallet allowlist/session middleware.
- Do not send any service keys to client; all management via server API.

## Logging and observability

- Log events:
  - `allowlist_add` with `{ actorAddress, count, sampleAddresses }`.
  - `allowlist_remove` with `{ actorAddress, wallet }`.
  - Upsert auth promotions: optionally an info-level log when an allowlisted wallet auto-authorizes on insert/update (rate-limited).

- Metrics (optional):
  - Counter for auto-authorized on insert vs on update.
  - Gauge for allowlist size.

Decisions:

- Server logging is sufficient; no separate audit table at this time.

## Rollout plan

1. Ship migration to create `player_allowlist` table.
2. Deploy server changes:
   - New repo module and admin routes.
   - Modified `upsertPlayerByWallet` logic (insert/update `exists(...)`).
3. Deploy client changes to `/admin/allowlist` (new page).
4. Manually smoke test (see test plan).
5. Optionally bulk-import an initial CSV via the `POST /api/admin/player-allowlist` endpoint in batches.

No environment variables required beyond existing admin wallet allowlist for admin access.

## Test plan (happy paths and edge cases)

1. First login, on allowlist → player row created with `is_authorized=true`, `access_granted_at=now()`, WebSocket join succeeds.
2. First login, not on allowlist → player row created with `is_authorized=false`, cannot join; manual admin “Authorize” still works.
3. Existing unauthorized player, admin adds wallet to allowlist, next verified login → flips to authorized on update; join succeeds.
4. Remove wallet from allowlist → already authorized player remains authorized (by design).
5. Admin API auth:
   - Non-admin calls return 401/403.
   - Admin CRUD works; idempotent add behaves as expected; delete of missing entry is safe.
6. Input validation:
   - Mixed-case addresses normalized.
   - Bad strings rejected with clear error.
7. Performance:
   - Insert/update uses `exists(select 1 ...)` with pk index → O(1) check; no measurable impact.
8. Concurrency:
   - Simultaneous logins for the same address: both paths land on the same row; statements are idempotent and safe.

## Risks and mitigations

- Risk: Accidental bulk add of bad addresses.
  - Mitigation: Validation + confirmation in UI; server-side validation; allow easy removal; keep logs.
- Risk: Admin credential compromise could add many wallets.
  - Mitigation: Keep server-side admin allowlist, log and review, consider 2FA/opsec for admin wallet.
- Risk: Confusion about removing allowlist not removing authorization.
  - Mitigation: Document behavior in UI; provide “Deauthorize” capability remains via existing admin player action.

## Future extensions (optional)

- CSV upload with server-side parsing and dry-run preview.
- “Authorized via” provenance (e.g., a column or audit table noting `admin_manual` vs `allowlist_auto`).
- Bulk deauthorize action (admin-only) if a mass revoke is ever needed.
- Rate-limited public endpoint to check if a wallet is pre-authorized (for UX messaging prior to SIWE).

## Decisions

1. Bulk size: Tens expected; plan for small batches (e.g., 25–50) in UI.
2. Notes: No note required or needed; initial UI/API will not include a note field.
3. Deauthorization: Add an explicit “Deauthorize” action on the Players page (parity with “Authorize”).
4. Audit: Server logging is sufficient; no dedicated `admin_actions` table for now.
5. UI placement: Create a dedicated `/admin/allowlist` tool (link it from Admin index and optionally from Players).
6. Address format checks: App-side normalization/validation only; no DB CHECK constraint initially.
7. Visibility: Players page should continue to show Authorized status and `access_granted_at` as it currently does.

## Summary

This adds a minimal, safe allowlist that integrates directly into player upsert. New or existing players on the allowlist are automatically authorized without changing downstream gates. Admins get straightforward tools to manage the list, and we keep full backward compatibility with the existing manual authorize flow.
