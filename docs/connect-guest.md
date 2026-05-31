## Continue as guest — exploration and proposal

### Goals

- Let players start a session without connecting a wallet.
- Allow connecting a wallet later; no forced modal on first play.
- Preserve server authority for game logic; avoid client-authoritative merges.

### Current auth flow (today)

- SIWE verification on the server issues a session cookie and creates/links a `players` row:

```599:716:apps/server/src/index.ts
app.post('/api/auth/verify', async (req, res) => {
  const { message, signature } = req.body ?? {};
  // ... SIWE parse, nonce/chain/domain checks ...
  const verification = await siweMessage.verify({
    signature,
    domain: siweMessage.domain,
    nonce: siweMessage.nonce,
  });
  // Create/resolve player and auth session; set cookie
  const player = await playersRepo.upsertPlayerByWallet({
    walletAddress: normalizedAddress,
    region: typeof req.body?.region === 'string' ? req.body.region : null,
  });
  const sessionRecord = await authSessionsRepo.createAuthSession({
    playerId: player.id,
    walletAddress: normalizedAddress,
    nonce: siweMessage.nonce,
    expiresAt,
    userAgent: (req.headers['user-agent'] as string) || null,
    ip: getClientIp(req),
  });
  const session = createSessionCookie({ address: normalizedAddress, sessionId: sessionRecord.id, expirationSeconds: SESSION_DURATION_SECONDS });
  res.setHeader('Set-Cookie', session.cookie);
  res.json({ address: normalizedAddress, playerId: player.id, sessionId: sessionRecord.id, token: session.token, isFirstLogin: !hadAnySession });
});
```

- Session cookie is read/verified on requests:

```221:241:apps/server/src/lib/auth/session.ts
const cookies = parse(req.headers.cookie);
const token = cookies[SESSION_COOKIE_NAME];
// ... verify token and return { address, sessionId, token }
```

- WebSocket auth in `GameRoom` tries cookie/bearer; if none, it still allows the socket to connect as anonymous:

```928:934:apps/server/src/rooms/GameRoom.ts
// Allow unauthenticated connections; onJoin will enforce access for
// features (like custom gotchis) that require a signed session.
console.warn('WS auth: no valid session found; allowing anonymous connection');
return true;
```

- Join gating currently requires a linked player/wallet, otherwise throws:

```1204:1216:apps/server/src/rooms/GameRoom.ts
const authData = (client as any).auth || {};
const playerId: string | undefined = authData.playerId;
const walletAddress: string | undefined = authData.address;
const isAuthorized: boolean = Boolean(authData.isAuthorized);
if (!playerId || !walletAddress || !isAuthorized) {
  throw new Error('Unauthorized: missing player identity');
}
```

### Client gating (today)

- Landing “Play Now” is blocked without wallet+session:

```165:168:apps/client/src/app/page.tsx
const hasEffectiveWallet = Boolean(hasActiveWallet);
const canLoadPlayerData = Boolean(hasValidSession && hasEffectiveWallet);
const scopedPlayerId = canLoadPlayerData ? playerId : null;
```

```728:741:apps/client/src/app/page.tsx
const ctaDisabledReason = useMemo(() => {
  if (!isSessionVerified) return 'Checking authentication...';
  if (!hasActiveWallet) return 'Connect your wallet to continue.';
  if (!hasValidSession) return 'Please sign the login message to continue.';
  // ...
  return null;
}, [/* ... */]);
```

- Mobile HUD already shows a “Connect Wallet” button when not connected:

```811:819:apps/client/src/components/MobileGameHUD.tsx
{!isWalletConnected && (
  <Button onClick={onWalletConnect} className="w-full bg-blue-600 hover:bg-blue-700">
    <Wallet className="w-4 h-4 mr-2" />
    Connect Wallet
  </Button>
)}
```

- There is light guest scaffolding on the client: progression hooks fall back to a `guest` namespace for local-only state:

```62:66:apps/client/src/hooks/useProgression.ts
const [lickTongueCount, setLickTongueCount] = useState(0);
const [unlockedCharacters, setUnlockedCharacters] = useState<string[]>([]);
const resolvedId = playerId ?? 'guest';
```

### MVP design: enable guest play without persistence

- Server (no DB changes):
  - Keep `onAuth` as-is (anonymous socket allowed).
  - Update `GameRoom.onJoin` to allow a “guest” branch when no session is present:
    - Do not call DB for progression or inventory.
    - Do not map `sessionId -> playerId` in `sessionPlayerIds` (so all DB writes are skipped by existing guards).
    - Initialize `PlayerSchema` with defaults (level 1, no equipment), and set `player.scoreEligible = false` to keep leaderboards clean.
    - Keep existing wallet-gated checks (e.g., gotchi cosmetics, economy) as-is; they already require a valid session and will no-op or early-return when `playerId` is missing.

- Client:
  - Landing UI: add a secondary CTA “Continue as guest” that bypasses wallet gating and starts Phaser immediately.
    - Relax `ctaDisabledReason` to allow guest play when wallet is absent.
    - Pass `isWalletConnected=false` to `initPhaser` (already supported), which will connect without an Authorization header.
  - Keep “Connect Wallet” entry points in HUD/Lobby; when clicked, run the existing SIWE flow to create the session cookie.
  - Note: the current room connection will remain guest for its lifespan; the wallet session applies on the next room join (no re-auth mid-connection today).

Benefits:

- Minimal changes; no schema/migration.
- Preserves server-authority: guests cannot perform DB-affecting actions due to existing `playerId` guards.

Tradeoffs:

- Guest progress is not persisted; upon wallet connect, current run isn’t linked. Linking mid-run would require additional server work (see v2).

### v2 design: optional guest session and mid-session linking

- New endpoints:
  - `POST /api/guest/start`: issue a signed “guest_session” JWT cookie with a `guestId` (UUID), `issuedAt`, `expiresAt`.
  - `POST /api/guest/link`: after wallet SIWE, atomically link current connection/guest runtime to a wallet player and begin persisting (server-authoritative only).

- Server runtime:
  - Add a `reauth` message in `GameRoom` that verifies a Bearer token mid-connection and attaches `client.auth` with `{ address, playerId, isAuthorized }`.
  - On success, begin hydrating/persisting progression going forward; do not accept client-sourced deltas from before linking.

- Database (optional):
  - If we want to track guest usage safely: a `guest_sessions` table with minimal fields (`id`, `issued_at`, `expires_at`, `ip`, `user_agent`, `valid`). No gameplay data here.

### Implementation checklist (MVP)

- Server
  - `apps/server/src/rooms/GameRoom.ts`: allow guest branch in `onJoin`; set defaults; mark `scoreEligible=false` for guests; skip DB reads/writes when no `playerId`.

- Client
  - `apps/client/src/app/page.tsx`: add “Continue as guest” CTA, relax `ctaDisabledReason` when guest path selected.
  - Ensure existing “Connect Wallet” actions remain available in HUD/Lobby.

No schema, migrations, or new endpoints required for MVP.

### Open questions

1. Should guests be allowed to earn XP/loot during a run? If yes, do we discard at end, or hide awards until linking?
2. Should guests be eligible for leaderboards or scores? Proposal: disable (`scoreEligible=false`) until linked.
3. Do we allow all difficulty tiers for guests or only free tiers? Any credit gating changes for guest?
4. Is mid-session wallet linking required for v1, or is “link on next join” acceptable? (Mid-session linking adds a reauth message and state transition logic.)
5. Any analytics or rate-limiting needed for guest sessions to prevent abuse (e.g., max concurrent guests per IP)?

### Notes

- The client already treats preference/progression state as local when `playerId` is absent (guest), which aligns with the MVP path. Server remains the single source of truth for persistent state.
