## Code Review Checklist — 04/11/2025

Scope: recent commits migrating gotchi sprites to Supabase-only, lazy loading, retries, server sanitization, and lobby/game scene integration.

### Completed in this pass

- [x] GameScene: removed legacy `/spritesheets/:id.png` path; resolve via `GET /api/gotchis/:id` with retry.
- [x] GameScene: deduplicated backoff resolver into a single `resolveGotchiSpritesheetUrl()` method.

### Server: Supabase-only enforcement and cleanup

- [ ] gotchi-sprites.ts: drop `filePath` from `SpriteInfo` and internal return objects; keep paths purely internal while API already sanitizes (prevents accidental leakage and confusion).
- [ ] gotchi-sprites.ts: remove unused `ensureSpritesOutputDir` export and any dead FS helpers (`ensureOutputVersion`, stale output-dir logic) that are no longer invoked in Supabase-only flow.
- [ ] gotchi-sprites.ts: audit env usage; prefer a single `GOTCHI_PUBLIC_BASE_URL` and `GOTCHI_SPRITES_BUCKET`, document required vars in README; consider warning (not throwing) if cache-control overrides missing.
- [ ] index.ts: keep `toPublicSprite` sanitization (id,url,hash) enforced in all gotchi endpoints; add a unit test to assert no `filePath` leaks.

### Client: duplication, logging, and caching

- [ ] GotchiPreview + GameScene: extract shared resolver with exponential backoff into `apps/client/src/lib/gotchi-api.ts` (single source of truth for resolving Supabase URL; avoids divergence between lobby UI and Phaser scene).
- [ ] GameScene/initPhaser: gate noisy `console.log` calls behind existing debug guard (or convert to `debugLog`) and remove low-value logs introduced in this branch (players/enemies/npcs dump, DOM button hover logs, etc.).
- [ ] AavegotchiSpriteManager: avoid re-registering animations if the same `textureKey` is already registered (cheap guard to prevent duplicate animation definitions on reconnects).
- [ ] AavegotchiSpriteManager: consider adding a `disposeAll()` call on scene shutdown to clear `spritesheetMeta` and `imageDimensionCache` to bound memory over long sessions.
- [ ] next-pwa runtimeCaching: ensure query param `?v=` does not bust the cache — set `ignoreURLParametersMatching: [/^v$/]` or `matchOptions: { ignoreSearch: true }` for the Supabase spritesheets route.
- [ ] CharacterSelector: on selection, if URL not yet resolved, kick off resolve+persist and disable the play CTA until resolved (prevents entering a room with a missing spritesheet).

### Performance and robustness

- [ ] GotchiPreview: cap retry backoff jitter and add a max total retry window (e.g., 90s) to avoid infinite retries on 404s; surface a small UI hint on persistent failure.
- [ ] AavegotchiSpriteManager: cache resolved Supabase URL by tokenId (Map) to avoid repeated `/api/gotchis/:id` when multiple players use the same gotchi in a session.
- [ ] Server generation: emit structured logs on generation start/finish with request id and gotchi id; add basic metrics around generation time and Supabase upload latency.

### Tests and docs

- [ ] Add an integration test that hits `GET /api/gotchis/:id?debug=1` and asserts: 200 for existing, 404 with debug for missing, and that response shape has no `filePath`.
- [ ] Document client sprite resolution/caching flow in `docs/sprite-storage.md` (source of truth, retry policy, caching TTL, PWA behavior). Update diagrams to remove `/spritesheets` fallback.

### Nice-to-haves (post-merge)

- [ ] Replace magic frame size defaults (100) with a small helper that reads from server-provided metadata when available; fallback to image probing as today.
- [ ] Centralize constants: backoff min/max, frame rows/cols, size map — export from a single module to keep lobby and Phaser aligned.

---

Short summary

- Removed last in-game dependency on the legacy `/spritesheets` path and deduped the backoff resolver inside `GameScene`. Remaining work is mostly cleanup (remove unused FS remnants and `filePath`), consolidating the resolver across components, and tightening logging/caching for performance.














