# Gotchi owners–only access (closed alpha expansion)

Goal: keep the game **closed alpha**, but allow **unrestricted access for Aavegotchi owners**, while preventing obvious farming vectors introduced by **transferability** and **lending**.

## Summary recommendation

- **Access**: allow gameplay if the wallet **currently owns ≥1 Aavegotchi**.
- **Rewards**: require stronger conditions than access to prevent “pass-the-gotchi” farming:
  - Wallet must **own a non-borrowed gotchi** at reward time, and
  - Wallet must have **held eligibility continuously** for a minimum window (recommended below).

This keeps the “owners-only” experience simple while protecting emissions as population scales.

## Threat model (why this matters)

- **Sybil resistance improves** vs fully open alpha because a gotchi has real acquisition friction (total supply ~25,000).
- **But transfer/lending enable farming**:
  - **Pass-the-gotchi**: transfer a gotchi into many wallets sequentially to multiply per-wallet daily rewards.
  - **Borrow-only access**: lend a gotchi to many wallets if borrowers qualify.

Blocking “borrow-only” wallets helps, but **transfer-farming remains** unless you define when/how eligibility is checked.

## Policy choices (recommended defaults)

### 1) Access gate (owners-only)

- **Rule**: wallet must currently **own ≥1 gotchi**.
- **Lending rule**: disallow wallets whose only gotchis are **borrowed**.
  - In other words, qualify only if the wallet has **at least one gotchi it owns** (not merely uses via lending).

### 2) Rewards gate (anti-farm)

Recommended: separate **access** from **rewards**.

- **Rule**: to receive any rewards (gold/potions/wearables/runs/claims), wallet must:
  - currently own ≥1 **non-borrowed** gotchi, **and**
  - satisfy a **holding window** to prevent just-in-time transfers.

Holding window options (pick one):

- **Option A (simple, effective)**: “Held since daily reset”
  - Wallet must have been eligible continuously since **00:00 UTC** (or your configured reset hour).
  - Pros: aligns with daily runs/claims.
  - Cons: still allows farming across days if transfers happen right after reset (but materially reduces abuse).

- **Option B (stronger)**: “24h cooldown”
  - Wallet becomes reward-eligible only after holding a non-borrowed gotchi for **24 hours**.
  - Pros: robust against transfer farming.
  - Cons: slightly higher friction for legitimate new owners.

- **Option C (hybrid)**: “Held since reset OR 24h after first eligible”
  - Start with Option A for early alpha, upgrade to Option B when opening further.

### 3) Define reward scope explicitly

- **Per-wallet-per-day** (recommended):
  - Rewards/claims/daily allowances are limited per wallet per day.
  - Prevents a single wallet with many gotchis from multiplying emission unless you explicitly want that.

If you *do* want gotchi-count scaling later, make it explicit and cap it (e.g., “up to 3 gotchis count”).

## Where to enforce eligibility (don’t rely on UI)

Enforce on the server at **reward time**, not just at login:

- **Run start / room join** (progression + competition)
- **Daily claim endpoints** (e.g., daily chest, topups, etc.)
- **Leaderboard submission / prize allocation**
- Any endpoint that increments inventory or entitlements

Rationale: “owners-only” is an access policy; **economy safety** depends on server-side reward gates.

## Additional “must not break economy” guardrails

These are independent of gotchi ownership gating but become critical as access scales:

- **Rate-limit reward-affecting endpoints** (per wallet + per IP)
- **Harden inventory deltas** (caps + idempotency + source validation)
  - Ensure a modified client cannot manufacture large positive deltas.
- **Add anomaly logging/alerts**:
  - unusually high gold/potion inflow per hour
  - unusually high number of runs consumed per day

## Suggested “alpha-safe” rollout

- Phase 1: **Owners-only access** + **borrow-only disallowed** + **rewards require “held since reset”**
- Phase 2: If farming appears: upgrade to **24h cooldown** for rewards
- Phase 3: If you open further (non-owners): introduce stake-based or account-age based reward gating

## Open questions to decide tomorrow

- What exact definition of “borrowed” do we enforce (contract/state source)?
- Do we want **access-only** for owners, or owners also get “full rewards”?
- Which holding window (since reset vs 24h) fits your tolerance for friction vs abuse?

