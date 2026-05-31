### Dead-code and cleanup checklist (2025-10-15)

- **Remove unused Shop modal UI**
  - Deleted `apps/client/src/components/Shop.tsx` (no references found).
  - Kept `handleShopToggle` wiring to show a hint toast redirecting users to trade via Portal Mage.

- **Ignore built artifacts everywhere**
  - Added `**/dist/` to root `.gitignore` to prevent nested dist commits.
  - Remove tracked `apps/server/dist/` from the repo (safe—rebuilt at deploy time).

- **Fix server import alias to avoid runtime resolution issues**
  - Changed `import ... from 'src/data/wearables'` → `../data/wearables` in `apps/server/src/lib/aavegotchi.ts`.

- **Workspace package usage (follow-up refactor)**
  - Found imports of `@gotchiverse/progression` and `@gotchiverse/aavegotchi` in server/scripts. Per rule to avoid workspace packages in apps, plan to inline the small used types/utilities into `apps/server/src/{types,lib}/` and update imports.

- **Map Editor unsafe eval (defer - not dead code)**
  - `new Function(...)` in `apps/client/src/app/map-editor/page.tsx` and `data/lib/mapFileIO.ts` for TS-like JSON parsing. Keep for now; replace with JSON5/object-literal parsing or sandboxed worker in a follow-up.

- **Systems retained (in active use)**
  - Client: `QuestSystem` (used in `app/page.tsx`), `ItemSystem`, `EnvironmentSystem`, `FogOfWarSystem` (wired in `GameScene.ts`).
  - Server: `FogOfWarSystem`, `EnemySystem`, `EnemyDeathSystem`, `WorldTransitionSystem`, `PortalSystem` (referenced by `GameRoom` and transitions).

- **Misc legacy paths**
  - Keep P-key portal dev helper; shop fallback now only shows a hint.
  - Portal sprite manager fallback retained; no action required.

If you want, next pass can inline progression types and remove the unsafe eval usage.
