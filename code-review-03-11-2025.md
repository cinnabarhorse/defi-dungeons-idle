# Code Review Checklist — 03/11/2025

- [ ] Verify Jest module resolution updates (`jest.config.ts`) work with monorepo imports (`@gotchiverse/*`).
- [ ] Confirm `apps/server/src/index.ts` sprite serving behavior:
  - [ ] FS backend: static mount at `/spritesheets` works.
  - [ ] Supabase backend: redirect shim `/spritesheets/:asset` → `GOTCHI_PUBLIC_BASE_URL` works.
  - [ ] Required env present when `GOTCHI_SPRITES_BACKEND=supabase` (`GOTCHI_PUBLIC_BASE_URL`, optional `GOTCHI_SPRITES_BUCKET`).
- [ ] Validate new `/api/gotchis/:id` endpoint (sprite on-demand): returns existing or generates new; includes error handling and request id header.
- [ ] Confirm equipment response now includes `equippedWearablesWithQuality` and client usage is updated where needed.
- [ ] Slot model migration away from `hands`:
  - [ ] Client: `wearableSupportsSlot` simplified to direct `includes(slot)`; no implicit hand mapping remains.
  - [ ] Server: `normalizeSlot` no longer maps `hands`; errors on invalid slot.
  - [ ] Data: `apps/*/data/characters.ts` migrated to slot maps; summary building uses explicit assignments.
  - [ ] DB: migration `20251103_150000_convert_hands_slots.sql` ready; plan rollout order (deploy code first, then run migration).
  - [ ] Tests: `scripts/equipment-state.spec.ts` passes (no `hands` appears in results).
- [ ] Remove duplicate `getPrimarySlot` implementations; centralize via `apps/client/src/lib/wearable-utils.ts` (done for inventory, wearables page, API route).
- [ ] Admin top-ups wiring:
  - [ ] Server registers `registerAdminTopUpRoutes` exposing `GET /api/admin/topups/health`.
  - [ ] Client `topups-client.tsx` fetches `/api/admin/top-ups` (dash vs no dash): align route or client before enabling.
  - [ ] `apps/client/src/app/admin/topups/page.tsx` intentionally disabled (message only) until API completes.
- [ ] Sprite backend refactor (`apps/server/src/lib/gotchi-sprites.ts`):
  - [ ] FS flow computes PNG hash, writes meta with `pngHash`, cache bust via `?v=`.
  - [ ] Supabase flow downloads meta/PNG, backfills `pngHash` if missing, uploads with cache control.
  - [ ] `getExistingSpriteInfo` returns info without regeneration when possible.
- [ ] Equipment service triggers sprite regeneration after equip/unequip/batch ops; backgrounded, with guarded error logs.
- [ ] Review console warnings for noise levels; keep actionable messages; avoid excessive logs in hot paths.
- [ ] Re-run `pnpm generate:shared` after item-type changes via the API route and verify no TS drifts.
- [ ] Sanity-check large data file edits (`wearables.ts`, `weapons.ts`) for accidental `any` casts or slop.
- [ ] Verify e2e/dev server ports remain 3001 (client) and 1999 (server) per workspace conventions.

Follow-ups

- [ ] Align API route path for admin top-ups (`/api/admin/topups` vs `/api/admin/top-ups`).
- [ ] Add light integration test for `/api/gotchis/:id` covering existing vs generate flows.
- [ ] Consider rate limiting sprite generation endpoints to prevent abuse.
- [ ] Document Supabase envs in README; add health page to verify storage access.
- [ ] Optional: move `getPrimarySlot` to a shared package if needed server-side.




























