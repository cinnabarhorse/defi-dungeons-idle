### Web3 integration (Thirdweb) – Questions for Confirmation

This doc captures decisions needed before implementing wallet connect, signature-based login, and fetching owned Aavegotchis.

### Goals (my understanding)

- **Connect Wallet** on the landing page using Thirdweb.
- **Support wallets**: Rabby, MetaMask, plus a generic option (e.g., WalletConnect). Also **social logins** (Google, Facebook).
- **Sign-in by signature** (no on-chain tx) to prove wallet ownership.
- After successful auth, **fetch owned Aavegotchis** for the connected address.

### Questions

#### SDK, chains, and RPC

- **Thirdweb version**: Use the new unified `thirdweb` v5 SDK (recommended) or `@thirdweb-dev/react` v4?

V5.

- **Supported chain(s)**: Aavegotchi is on Polygon PoS (chainId 137). Should we restrict to Polygon only, or allow other chains and auto-switch? Any testnets (e.g., Amoy) to support?

That is incorrect. We are actually on base chain, chain ID 8453. The subgraph that we're using is configured to use base already.

- **RPC strategy**: Use Thirdweb-managed RPCs or provide our own (Alchemy/Infura/RPCFast)? Any rate-limit considerations?

We can use the third web managed rpc's.

#### Wallets and social login

- **Wallet connectors list**: Confirm required set: Rabby, MetaMask, WalletConnect, Coinbase Wallet? Any others to include/exclude?

Looks good.

- **Social login**: Thirdweb social/email uses Embedded Wallets (OAuth). Which providers: Google, Facebook, Apple, Twitter, Discord, Telegram, Passkeys? Email OTP?

Google Facebook Twitter Discord, Email.

We are also using the third web ecosystem wallet feature. Once you set it up, I will give you the information for our ecosystem wallet ID.

- **Custody model**: For Embedded Wallets, are we OK with Thirdweb’s custodial/semi-custodial model, or do we prefer non-custodial only?

Yes, that's fine.

- **Branding**: Any custom branding, modal theme, or copy for the connect UI?

Just call it DeFi Dungeons.

#### Auth flow (signature) and session

- **Standard**: Use SIWE (EIP-4361) via Thirdweb Auth or a custom `personal_sign`? Preference?

Sign in with Ethereum.

- **Domain and statement**: Desired `domain` (e.g., `gotchiverse.live`), `statement` copy, and session `expirationTime`?

No desired domain yet. Just use aavegotchi.com. As for expiration time, maybe one week.

- **Nonce**: Where should nonce be generated/verified—Next.js API route in `apps/client` or our `apps/server` service?

Probably app server, right?

- **Session storage**: Use Thirdweb Auth session cookies, or integrate with Supabase/Auth helpers? Cookie name, HTTP-only, SameSite, TTL?

I'm not sure. I am planning to implement a Supabase or Neon database though.

- **Session scope**: Should the session also authorize gameplay with our Colyseus server in `apps/server`? If yes, what token format/headers does the server expect today?

I'm not sure. I think the answer is yes, but you can suggest good defaults for the format and headers.

#### Backend placement and validation

- **Verification location**: Verify signatures in `apps/client` (Next.js API route) or `apps/server` (Node/Colyseus service)?

Appserver.

- **API domain(s)**: Which origin(s) will issue signatures and set cookies? Any cross-domain constraints between client and server?

I'm not sure, whatever is standard.

- **Logout**: What is the expected logout behavior—just clear cookie or also revoke server-side session?

Yes, both.

#### Aavegotchi fetching

- **Data source**: The script uses `process.env.SUBGRAPH_CORE_BASE`. Please confirm the exact subgraph endpoint to use for production and staging.

SUBGRAPH_CORE="https://api.goldsky.com/api/public/project_cmh3flagm0001r4p25foufjtt/subgraphs/aavegotchi-core-base/prod/gn"

- **Refactor plan**: Prefer moving `fetchAavegotchisOfOwner(address)` into a reusable TS module and calling it from a Next.js API route (`/api/aavegotchis?owner=`) to avoid client secrets and keep a single source of truth. OK?

Sounds good.

- **Returned fields**: Is the current set sufficient (`id`, `collateral`, `eyeShape`, `eyeColor`, `equippedWearables`)? Any additional fields needed now for sprite gen later?

Yes, I think that's all we need.

- **Caching**: OK to cache responses per `owner` for ~5 minutes (server-side) to reduce subgraph load?

Should be fine.

- **Pagination**: Current limit is 1000 per page—should we hard-cap or stream if a wallet owns >1000?

No one owns more than a thousand.

#### UI/UX

- **Placement**: Confirm Connect Wallet entry point on `apps/client/src/app/page.tsx` (hero/header?). Any layout constraints?

None right now.

- **Post-connect**: After signature, do we immediately fetch and display a minimal “My Aavegotchis” list, or silently store and redirect to another page?

For now, we will silently store.

- **Error states**: What messaging for: no wallet, denied connection, cancelled signature, RPC errors, empty results?

Whatever is default.

- **Toasts**: Use shadcn’s toast for feedback? Any copy or style guidelines?

Sure, no guidelines.

#### Security and privacy

- **Replay protection**: We’ll implement nonce-based SIWE and server-side verification. Any extra constraints (max age, IP binding)?

No.

- **Allowed origins**: Any strict origin checks for SIWE `domain` and `uri`?

No.

- **PII**: Any PII concerns for social login emails/usernames? Should we avoid storing them server-side?

No.

#### DevOps and env

- **Env vars**: Provide `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, `THIRDWEB_SECRET_KEY` (if needed), and `SUBGRAPH_CORE_BASE` values for dev/staging/prod.
- **Secrets location**: Use Vercel project env for client app, and server host env for `apps/server`?
- **Telemetry**: Any analytics or error reporting (PostHog/Sentry) to hook into wallet/auth events?

#### Acceptance criteria for first PR

- **AC1**: Thirdweb connect modal supports Rabby, MetaMask, WalletConnect, and configured social providers.
- **AC2**: Successful SIWE flow creates a session (cookie) and exposes the authenticated address to the app.
- **AC3**: API route returns owned Aavegotchis for the session address.
- **AC4**: Minimal UI feedback shows connect → sign → fetch success path (no sprite generation yet).

#### Timeline and misc

- **Target environment**: Which environment to ship first (staging vs prod)?

That is fine.

- **Cutover**: Remove legacy `window.ethereum` flows entirely in this PR, or keep as fallback?
- **Anything else**: Constraints I should be aware of (SEO, CLS budgets, modal performance, mobile specifics)?
