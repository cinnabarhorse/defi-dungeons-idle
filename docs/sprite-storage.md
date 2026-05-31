## Sprite Storage and Delivery (Supabase)

### Goal

Centralize custom Aavegotchi spritesheet storage on Supabase Storage (bucket: `aavegotchi-sprites`) with a CDN-backed public URL so every game region loads the same asset, eliminating per-region drift and the “green square” placeholder when a region lacks a local file.

### TL;DR

- Generate sprites server-side, upload to Supabase Storage, and always return the Supabase CDN URL to clients.
- Keep an immutable cache policy on PNGs and add `?v=<sha8>` for cache-busting when attributes change.
- Maintain a small `.meta.json` per sprite to decide whether to regenerate.
- Dev keeps FS backend; Prod uses Supabase backend.

---

## Current State (Problems)

- Client builds URL like `<region>/spritesheets/<gotchiId>.png`; if that region has not generated the sheet yet, Phaser load fails and the green placeholder rectangle remains.
- Sprite generation is tied to owner sessions and the local region’s disk; other regions can miss assets.
- Extra complexity mounting static folders per region and keeping them in sync.

## Proposed Architecture

- Server still performs generation (using `gotchi-sprites.ts`) but writes the finalized PNG (and `.meta.json`) to Supabase Storage bucket `aavegotchi-sprites` under key: `spritesheets/<id>.png`.
- Public read via Supabase CDN URL, e.g.:
  - `https://<project>.supabase.co/storage/v1/object/public/aavegotchi-sprites/spritesheets/<id>.png?v=<sha8>`
  - `.meta.json` lives alongside each PNG for regeneration checks.
- Client never references the region’s local `/spritesheets`; it requests a server API that resolves and returns the Supabase URL.
- FS backend remains available for development (`GOTCHI_SPRITES_BACKEND=fs`).

### Decisions Applied

- Bucket policy: public-read assets (OK).
- Rollout: flip directly to Supabase in production (no dual-write). Optional redirect retained only if needed temporarily.
- Pre-generation: not required.
- Frame size: fixed to 100×100 frames; no dynamic detection.
- Metadata storage: JSON file alongside PNG is sufficient; no DB snapshot needed.
- Regeneration trigger: handled by the equipWearable flow on server.
- CDN: keep Supabase public URL for now (no custom edge).
- Cost controls: no lifecycle policy changes for now.

### Storage Layout (Supabase)

- Bucket: `aavegotchi-sprites`
- Keys:
  - `spritesheets/{id}.png`
  - `spritesheets/{id}.meta.json`

### Versioning / Caching

- PNGs: `cacheControl: 31536000, immutable` and request URL includes `?v=<sha8>` of PNG content.
- Meta JSON: `cacheControl: no-cache` to ensure regeneration checks use fresh metadata.

---

## Server Changes

### Environment Variables

- `GOTCHI_SPRITES_BACKEND=supabase` | `fs` (default `fs` for dev)
- `GOTCHI_SPRITES_BUCKET=aavegotchi-sprites`
- `GOTCHI_PUBLIC_BASE_URL=https://<project>.supabase.co/storage/v1/object/public/aavegotchi-sprites/spritesheets`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already wired in `getSupabaseAdminClient()`; ensure present in runtime.

### gotchi-sprites.ts (add Supabase backend)

- Add a small adapter layer:
  - `usingSupabase()`: checks backend mode.
  - `supaUpload(key, buffer, contentType, cacheControl)`
  - `supaDownloadJSON(key)` and `supaFileExists(key)`
- In `generateOne(gotchi)`:
  - Compute current attributes hash (already present).
  - If Supabase backend:
    - Read `spritesheets/<id>.meta.json` from Supabase.
    - If meta missing or hash/version mismatch: generate PNG locally, upload PNG + new meta JSON.
    - Compute SHA256 of PNG bytes (either from local buffer or by downloading object) and return public URL with `?v=<sha8>`.
  - If FS backend: keep current flow.

Implementation details honoring decisions:

- Always use `frameWidth = 100`, `frameHeight = 100` in returned config; generator expected to output 100×100.
- Keep `.meta.json` only (no DB writes).

Notes:

- Maintain the existing versioning gate (`ensureOutputVersion`) so bulk invalidation can be forced when generator updates.
- Keep `generateMany` unchanged other than using the updated `generateOne`.

### index.ts (static mount / redirect)

- If `GOTCHI_SPRITES_BACKEND=fs`: keep static mount of `/spritesheets`.
- If `supabase`: prefer direct Supabase URL usage. Optionally add a short-lived compatibility redirect:
  - `GET /spritesheets/:id.png -> 302 -> ${GOTCHI_PUBLIC_BASE_URL}/:id.png` (only if we need to bridge older clients briefly).

### New/Adjusted APIs

- Owner-scoped endpoints (`POST /api/gotchis/generate`, `GET /api/gotchis`): return Supabase URLs in `sprites[].url`.
- Add a public single-gotchi resolver:
  - `GET /api/gotchis/:id`
    - Fetch gotchi by id (via subgraph), `generateOne(normalizeForGenerator(raw))`, return `{ sprite: { id, url, hash } }`.
    - No wallet ownership requirement; read-only.

### Regeneration via Equipment Changes

- On `equipWearable` / `unequipWearable` server flows, trigger spritesheet regeneration for dynamic gotchis:
  - After equipment state is persisted, assemble the effective equipped wearable slugs from server state and invoke `generateOne` with a `GeneratorGotchi` built from these assignments (100×100 frame expectation).
  - This keeps visual sprites in sync with in-game equipment without requiring a user-owned on-chain change.

### Security

- Bucket is public-read; uploads only from server using Service Role key.
- Never expose the Service Role key to clients.
- Optional: add size guardrails and content-type checks before upload.

---

## Client Changes

### GameScene custom gotchi loading

- Replace hardcoded `.../spritesheets/${gotchiId}.png` with server API lookup:
  1. Build base URL from selected region (already passed as `serverUrl`).
  2. `GET ${serverUrl}/api/gotchis/${gotchiId}`
  3. Use `sprite.url` for `imagePath` when loading the spritesheet.
  4. On failure, fallback to legacy Aavegotchi SVG renderer to avoid the green placeholder.

### Home page hydration

- Use selected region base URL (not `localhost`) when calling `/api/gotchis` for the connected wallet; update `setCharacterSpriteOverride` with the returned Supabase URL.

---

## Rollout Plan

1. Server: implement Supabase backend in `gotchi-sprites.ts` and keep FS as default for dev.
2. Configure env in staging (Service Role key, bucket name, public base URL).
3. Verify owner endpoints return Supabase URLs.
4. Add `GET /api/gotchis/:id` and test one-off resolution for non-owner viewers.
5. Wire equipment flows to trigger regeneration for dynamic gotchis after equip/unequip changes.
6. Client: update GameScene + Home hydration to use API URLs.
7. Flip production to Supabase (no dual-write). Optional short-lived redirect to bridge older clients if needed.
8. Observe 404s/5xx, asset load timing, and error logs; keep FS mount only in dev.

### Observability & KPIs

- Metrics/logs to monitor:
  - Sprite API success rate and latency.
  - Supabase upload/download failures.
  - Client load failures (Phaser loaderror events) count.
  - % sessions with placeholder visible > N seconds (should trend to ~0).
  - Cache hit ratio (via CDN logs if available).

---

## Testing Checklist

- Unit-ish:
  - Hashing and `?v=` changes when attributes change.
  - Meta JSON read/write and regeneration decision matrix.
  - Supabase upload content types and cache control headers.
- Integration:
  - Generate for a wallet with M gotchis; confirm M PNGs and metas present.
  - Fetch `/api/gotchis/:id` without wallet; URL resolves and loads in Phaser.
  - Switch regions; existing gotchi loads immediately (no green placeholder).
  - Fallback path: simulate spritesheet load error; verify SVG-based renderer kicks in.
- Perf:
  - First-view latency vs local FS; ensure CDN global perf is acceptable.

---

## Configuration Examples

```env
# Server (prod)
GOTCHI_SPRITES_BACKEND=supabase
GOTCHI_SPRITES_BUCKET=aavegotchi-sprites
GOTCHI_PUBLIC_BASE_URL=https://<project>.supabase.co/storage/v1/object/public/aavegotchi-sprites/spritesheets
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***

# Server (dev)
GOTCHI_SPRITES_BACKEND=fs
```

---

## Failure Modes & Handling

- Supabase upload fails: log and bubble 5xx; client still has SVG fallback renderer.
- Subgraph fetch fails for `GET /api/gotchis/:id`: return 404; client should fallback.
- Cache mismatch: PNG uploaded but `?v=` not updated -> force compute SHA from the uploaded object.
- Accidental bucket privacy change: loads fail (403); alarms on load error rates.

---

## Open Questions

1. Bucket policy: confirm public-read is acceptable for these assets, or should we use signed URLs? (Public-read recommended for simplicity + CDN caching.)

Public read.

2. Do we need to dual-write (FS + Supabase) for a deprecation period, or flip directly to Supabase in prod?

Flip to Supabase in prod.

3. Do we want a bulk pre-generation job for “popular” gotchis to reduce first-load latency?

Not needed.

4. Max sprite size & frame size: keep `100x100` frames, or detect per-generated size and store in meta?

100x100 is fine.

5. Should we snapshot meta (attributes + generator version) in DB as well for analytics/queries, or is JSON sufficient?

JSON is probably OK.

6. Do we need an admin endpoint to force-regenerate a specific gotchi ID (e.g., when wearables update)?

The equipWearable endpoint should probably handle that.

7. CDN domain: keep Supabase public URL, or front with our own CDN/edge domain for better control?

Keep supabase url for now until we create a dedicated API.

8. Cost controls: set lifecycle policy for old versions? (We currently upsert same key; CDN is immutable per `?v=`.)

Nope.

---

## Implementation Pointers

- Server files to touch:
  - `apps/server/src/lib/gotchi-sprites.ts` (add Supabase adapter and backend switch)
  - `apps/server/src/index.ts` (conditionally mount static or redirect; add `GET /api/gotchis/:id`)
- Client files to touch:
  - `apps/client/src/game/GameScene.ts` (resolve URL via API, fallback to SVG on error)
  - `apps/client/src/app/page.tsx` hydration effect (use selected region base URL + API’s returned URL)

This plan keeps minimal surface area, provides a safe migration path, and directly addresses the green placeholder issue by making the sprites globally available through a single CDN-backed source of truth.
