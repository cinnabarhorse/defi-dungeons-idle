## Portal Mage Shopkeeper – Implementation Plan

### Goals

- Replace the floating “Shop” UI with trading via the `Portal Mage` NPC in the Staging room.
- Make purchases server-authoritative using gold (the `coin` item, name `Gold`).
- Preserve proximity-based interaction (click/tap NPC within range) and use the existing dialogue UI to surface trade options and results.

### Current State (what we’ll hook into)

- NPC click flows: client sends `npc_interact` → server `handleNPCInteraction` validates proximity → client receives `npc_dialogue` and renders via `DialogueBox`.
  - Files: `apps/client/src/app/helpers.ts` (`renderNPCSprite`), `apps/server/src/lib/systems/NPCSystem.ts`, `apps/client/src/app/initPhaser.ts`, `apps/client/src/hooks/useDialogue.ts`.
- Dialogue content: served from `apps/server/src/data/npc-dialogues/*.json` through `apps/client/src/app/api/npc-dialogue/[dialogueId]/route.ts`.
- Gold and inventory: client has local inventory for UI; server persists authoritative inventory and exposes helpers in `GameRoom` (`applyInventoryDelta`) and DB repos in `apps/server/src/lib/db/repos/inventory.ts`.
- Staging room has the `portalmage` character in `data/maps/chunks-staging.ts` and server-side spawn uses `dialogueId = characterId` by default.
- The current modal `Shop` UI is opened from HUD and completes purchases fully client-side (not anti-cheat) in `apps/client/src/app/page.tsx` and `apps/client/src/components/Shop.tsx`.

### High-Level Changes

1. Dialogue-driven shop UX

- Add a “Trade” entry to `portalmage.json` that opens a `shop_menu` dialogue listing wares.
- Each item response performs a server-validated purchase instead of directly mutating client inventory.
- Results (success/insufficient gold/inventory full/stock out) are returned and rendered in `DialogueBox` and as a toast.

2. Server-authoritative purchase path

- Add a Colyseus message `npc_purchase` handled in `GameRoom` that:
  - Validates proximity to the same `portalmage` NPC used for the dialogue.
  - Looks up the requested item in a server-side `PORTAL_MAGE_SHOP` catalog.
  - Decrements `Gold` by price and increments the purchased item atomically.
  - Emits `npc_purchase_result` to the requesting client with result metadata and optionally `item_added` for UI sync.

3. Retire the floating Shop modal

- Remove/disable the HUD “Shop” button and the client-only purchase logic. All buying happens via Portal Mage dialogue.
- Keep the `Inventory` modal unchanged.

### Detailed Plan

#### A. Data and Dialogue

- Update `apps/server/src/data/npc-dialogues/portalmage.json`:
  - Add a new response under the greeting: “Show me your wares.” → `shop_menu`.
  - Add a `shop_menu` dialogue listing purchasable items. Each response points to a pseudo-action key, e.g., `action:shop:buy:health_potion` (no content page to fetch).
  - Add lightweight confirmation/feedback dialogues `purchase_ok` / `purchase_fail` to keep the conversation flow cohesive when we receive server results.

- Add a new catalog file (server-only), e.g. `apps/server/src/data/npc-shops/portalmage.ts`:
  - Export `PORTAL_MAGE_SHOP` as an in-memory array with stable IDs and prices, e.g. `{ id: 'health_potion', price: 1, grant: { itemType: 'potion', itemName: 'Health Potion', quantity: 1 } }`.
  - Use `itemType: 'coin', itemName: 'Gold'` for currency.
  - Optional: provide `stock` and cooldown fields for future daily limits.

#### B. Server – purchase handler (authoritative)

- In `apps/server/src/rooms/GameRoom.ts`:
  - Register a new Colyseus message: `this.onMessage('npc_purchase', (client, data) => this.handleNpcPurchase(client, data));`.
  - Implement `private async handleNpcPurchase(client, data)` where `data` is `{ npcId: string; itemId: string }`.
    - Validate player/session; find the NPC by `npcId` and verify proximity (reuse `handleNPCInteraction` range logic).
    - Ensure the NPC is the `portalmage` (by `dialogueId` or `characterId`).
    - Lookup the item in `PORTAL_MAGE_SHOP`; if not found, return error.
    - Atomically: decrement `Gold` by `price`, then grant the item. Prefer calling `applyInventoryDelta(sessionId, { type: 'coin', name: 'Gold' }, -price)` then `applyInventoryDelta(sessionId, { type: grant.itemType, name: grant.itemName }, grant.quantity)`.
      - If coin decrement fails (insufficient funds), abort and return `insufficient_funds`.
    - `client.send('npc_purchase_result', { ok: true, item: { ... }, price, currency: 'Gold' })` on success, otherwise `{ ok: false, reason: '...' }`.
    - Log with existing economy telemetry; record negative coin spend.

- Optional later: introduce per-run/day stock limits and cooldowns stored in Room or DB.

#### C. Client – dialogue action bridge

- In `apps/client/src/hooks/useDialogue.ts`:
  - Enhance `selectResponse(nextDialogue)` to detect `action:shop:...` keys.
    - For `action:shop:buy:<id>`, call into the Phaser scene room: `scene.room?.send('npc_purchase', { npcId: dialogueState.npcId, itemId })` and temporarily show a “processing…” state.
    - Do not fetch a dialogue JSON page for `action:*` keys.

- In `apps/client/src/app/initPhaser.ts`:
  - Add a handler for `npc_purchase_result` to (a) show a toast, (b) update the dialogue with a short success/fail message by calling `startDialogue(...)` with a dedicated dialogue key (e.g., `purchase_ok`/`purchase_fail`) or by injecting ephemeral text into the `DialogueBox`.
  - When `ok` and `item.type !== 'coin'`, also emit `item_added` UX message and rely on existing inventory sync hooks (we already pass `addItemToInventory` from the app to the scene for pickup flow; for purchases we should follow the same UX path but treat server as source of truth).

- Retire the floating Shop modal:
  - Remove the `onShopToggle` button wiring in `GameHUD` and `MobileGameHUD` and the `<Shop />` component usage in `page.tsx`.
  - Keep the component file around (for future reuse) or delete after a grace period; plan to remove in a subsequent cleanup PR.

#### D. Anti-cheat and validation

- Server-only mutations: client never modifies gold or grants items locally for purchases.
- Proximity gate: server checks player distance to the specific `npcId` on every purchase.
- Catalog whitelist: only items defined in `PORTAL_MAGE_SHOP` may be purchased.
- Single-source-of-truth inventory: use `applyInventoryDelta` which persists and logs; do not trust client inventory state.
- Idempotency: include a server-side guard to drop duplicate rapid requests from the same session (simple per-session cooldown, e.g., 200–300ms).

#### E. Telemetry & UX

- Economy logging: record negative coin spend with source `npc_shop:portalmage`.
- Toasts: success (`Purchased X for Y gold`) and error (`Not enough gold`).
- Dialogue text: short `purchase_ok`/`purchase_fail` nodes for immersive feedback.

### Rollout Steps

1. Ship server catalog + `npc_purchase` handler and `npc_purchase_result` messaging.
2. Update `portalmage.json` with `shop_menu` and purchase result keys.
3. Bridge `action:*` in `useDialogue` and add client message handler in `initPhaser.ts`.
4. Remove HUD Shop button and `<Shop />` modal wiring in `page.tsx`.
5. Verify in Staging room: proximity required, gold deducted, item granted, UI feedback correct.

### Open Questions

- Items & pricing: Confirm initial wares and costs. Proposal: `Health Potion` for 1 gold to start. Any others (e.g., `Mana Potion`, bombs, limited-use buffs)?

HP potion should cost 5 gold. And let's sell MK2 Grenades for 20 gold.

- Currency: Use `itemType: 'coin', itemName: 'Gold'` as the gold source of truth? Any alternate names or multiple coin types?

Yes, let's just call it "Gold" everywhere.

- Stock limits: Unlimited for now, or should we add a per-run cap (e.g., 3 potions before the portal)?

The stock limit will be global across all players. We'll implement that later. For now, no cap.

- Scope: Trading only available in Staging, or should the same NPC/shopkeeper appear in safe rooms mid-run later?

Just in staging for now. But could possibly appear in other rooms later.

- UX: Keep the Shop button hidden entirely, or show a tooltip hinting “Talk to the Portal Mage to buy items” for a while?

Get rid of the shop button.

### Acceptance Criteria

- Clicking Portal Mage in Staging shows a Trade option; selecting items results in server-validated purchase.
- Purchases fail gracefully when the player lacks gold; no client-side inventory edits.
- Gold balance and granted items persist and are reflected in subsequent sessions.
- No floating Shop modal is accessible; all buying is via Portal Mage.
