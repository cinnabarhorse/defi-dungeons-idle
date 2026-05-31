### Owned Aavegotchis – Implementation Questions

These questions will help finalize the design so we can implement playing as an owned Aavegotchi while keeping `data/characters.ts` for static characters.

- **Identity and IDs**
  - Should each owned Aavegotchi become a distinct playable character entry at runtime? (e.g., ID format `gotchi:<id>` like `gotchi:6018`)

Yes.

- Do you want the dynamic ID to persist across sessions (saved in `localStorage`)?

Probably not needed. They will be loaded dynamically on each load of the game.

- For server join, should we:
  - Send a separate `gotchiId` join option, keeping `characterId` for static picks, or
  - Reuse `characterId` with a namespaced value (`gotchi:<id>`)?

  Probably best to use gotchiId as a separate option. Or maybe a gotchiId | characterId, so you can only pass one.

- **Server authority and verification**
  - Confirm: the server will be the single source of truth for stats and validation (anti-cheat). If a client requests `gotchi:<id>`, the server should verify ownership against the session wallet. OK?

Yes, always.

- On verification failure (not owned/missing): should we reject join, or silently fall back to a default static character (e.g., `coderdan`)?

Reject join with an error.

- **Stats and equipment mapping**
  - For owned Aavegotchis, should we derive stats from equipped wearables using the existing server-side aggregator in `data/wearables`? (Preferred to avoid duplication.)

Yes. Owned Aavegotchis also have equipped wearables. They are all using the same wearables. But we will need to continue extending data/wearables with new abilities.

- The subgraph returns `equippedWearables` as numeric `svgId`s. Our aggregator consumes wearable slugs. Do you want us to map `svgId -> slug` on the server for dynamic characters?

Yes we can add a mapping.

- If a wearable is unknown/missing in our local table, should we:
  - Ignore it and continue, logging once,
  - Or hard-fail the character build?

Ignore it and continue, with logging. But that should not happen.

- Baseline for “naked” gotchi (no weapon): do we apply default melee defaults (damage/attack speed/range), or force a minimal starter weapon profile?

Melee defaults.

- Abilities: derive from the selected weapon(s) exactly as static characters do? OK?

Yes.

- **Sprites and animations**
  - We will use server-generated spritesheets (`/spritesheets/<id>.png`) with 100×100 frames and existing `BASE_ANIMATIONS`. Any per-gotchi animation overrides desired?

No, we will continue extending the gotchi spritesheets later.

- Generation trigger: current flow calls `POST /api/gotchis/generate` when wallet connects (idempotent). Keep this behavior?

Yes.

- If sprite generation fails, what’s the fallback? (block selection vs. use a static character)

It shouldn't fail. But if it does, then block selection.

- **UI/UX in selector**
  - Owned list: show only in the “My Aavegotchis” block, not in “All Characters”? (Recommended.)
  - Display name for each gotchi: use `#<id>` and collateral badge (e.g., `aDAI`), or do you want the on-chain `name` fetched as well? (Current `RawAavegotchi` type omits `name`.)
  - Selector stats preview: should we show derived stats/abilities for a gotchi in the list? If yes, prefer fetching a small server preview endpoint vs. duplicating stat logic on the client?

- **Networking payload and state sync**
  - Confirm desired join payload structure (pick one):
    - `characterId: 'gotchi:<id>'` and the server infers/validates via session wallet, or
    - `characterId` for static | `gotchiId` for dynamic (two fields)
  - On the server, we’ll compute `PlayerSchema.characterId` and all derived stats via `syncPlayerCharacterStats`. Do you want any server-side caching per `(wallet, gotchiId)` for the computed profile during room lifetime?

- **Persistence and caching**
  - Sprites are file-cached by `gotchi-sprites.ts` (content-hashed). Any TTL/cleanup preference for generated PNGs in production?
  - Do you want to persist the player’s last selected `gotchi:<id>` locally and auto-select it on next visit?

- **Edge cases**
  - No wallet connected → hide owned block (current behavior). OK?
  - Wallet connected but owns zero gotchis → show an empty-state message? Preferred copy?
  - Selected gotchi removed/sold between sessions → behavior on join? (fallback vs. error)
  - Reconnection (Colyseus): should we lock the dynamic selection for the session once the room starts?

- **Security**
  - Confirm: the server must reject any `gotchi:<id>` not owned by the connected wallet, and must sanitize arbitrary `characterId` inputs.
  - Any rate limits needed around sprite generation per wallet/session?

- **Rollout plan**
  - Phase 1: sprite-only override using `gotchi:<id>` while keeping default static stats, or go straight to full dynamic stats + sprite?
  - If phased, which environments (dev/staging/prod) should each phase hit, and in what order?

- **Telemetry and logging**
  - Any analytics/logging desired for: owned gotchis fetched, selections made, generation errors, or server validation failures?

### Implementation Overview

This section explains how the owned Aavegotchi integration works end-to-end, choices we made for stability, and how to extend it.

#### Identity and Join Contract

- Dynamic character IDs are `gotchi:<id>` (e.g., `gotchi:6741`).
- Client room options send exactly one of:
  - `gotchiId: '<id>'` (preferred for owned gotchis), or
  - `characterId: '<static-id>'` (for static characters)
- The server verifies `gotchiId` ownership using the current SIWE session and assigns `player.characterId = gotchi:<id>`.

#### Sprite Generation and Serving (Server)

- `POST /api/gotchis/generate`: idempotently generates sprites for the session’s gotchis.
- `GET /api/gotchis`: returns `{ wallet, sprites: [{ id, url, hash }] }`.
- Default output: `apps/server/public/spritesheets`. Override via `GOTCHI_SPRITES_OUTPUT` and `GOTCHI_PUBLIC_BASE_URL`.

#### Client Selection UX

- CharacterSelector now has a segmented control with two tabs:
  - Characters (static list)
  - My Aavegotchis (N) where N is the count from `useGotchiSprites`.
- Owned gotchi list is preloaded when the selector opens; switching tabs is instant.
- Clicking a gotchi:
  - Sets `selectedCharacterId = 'gotchi:<id>'`.
  - Applies a runtime sprite override with the server spritesheet URL.
  - Persists `selectedCharacterId` and the exact spritesheet URL (`selectedGotchiSpriteUrl`) in localStorage.
  - Visual selection uses the same purple ring style as the Characters list.

#### No Fallback Character

- Removed all Coderdan fallbacks. If a sprite is unavailable, we show a neutral 1×1 transparent PNG (avoids misleading visuals and flicker).
- Texture keys include a gotchi ID suffix so Phaser treats each gotchi as a unique texture.

#### Flicker-Free Rendering

- GotchiPreview: keeps the current image visible until the new image is decoded; then cross-fades over ~120ms (no blank frames). Adds a cache-busting param to avoid stale-frame flashes.
- CharacterPreview: caches and only restarts the animation loop when an image actually changes; precomputes the attack animation profile.
- A tiny pub/sub (`onSpriteOverridesChange`) notifies views of new overrides so they can refresh cleanly.

#### Hydration and Persistence

- On page load:
  - Read `selectedCharacterId` from localStorage.
  - If it’s a gotchi ID, immediately apply `selectedGotchiSpriteUrl` so the image appears instantly (no network dependency), then refresh from `/api/gotchis` and update the stored URL if it changed.
- This ensures refresh is seamless and resilient.

#### Caching

- useGotchiSprites caches results in-memory for the session and deduplicates concurrent loads. Cache resets on full refresh to avoid staleness.

#### Server Authority

- Server validates ownership and is strictly authoritative for stats and combat. The client only controls visuals and selection.

#### Extensibility

- To add more dynamic metadata to the owned gotchi tiles (e.g., collateral badges, weapon summaries), prefer adding a minimal server DTO to `/api/gotchis` rather than duplicating stat logic on the client.
