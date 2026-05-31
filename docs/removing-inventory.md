### Removing items from inventory – implementation plan (in-game + me/inventory)

#### Objective

- Enable players to remove items from their inventory with a user-friendly, safe, and performant flow in both contexts:
  - In-game quick actions (mobile + desktop)
  - Me/Inventory bulk management page

#### UX summary

- In-game:
  - Per-item actions via long-press (mobile) and right-click/"…" menu (desktop): Drop or Destroy.
  - No confirmations. Destroy shows an Undo toast (5s). Drop has no toast.
  - If stackable, open a small quantity dialog with input and a "Max" button before executing.
  - Disable actions for equipped/locked items with a clear reason and shortcut to Unequip.
  - Keyboard Delete triggers remove when an item tile/card is focused.

- Me/Inventory page:
  - Edit (selection) mode with checkboxes and a sticky bulk bar offering Remove (Destroy).
  - Quantity dialog for stackables (per-item input with "Max"); immediate execute after setting quantities.
  - Per-item context menu for single removals (no need to enter Edit mode).
  - Undo (5s) for Destroy only; no toast for Drop (Drop not exposed on this page).
  - Use `nuqs` to persist filters and selection across refresh/back.

---

### Architecture and scope

- Client
  - Files touched:
    - `apps/client/src/app/me/inventory/inventory-client.tsx` (selection mode, bulk remove UI, dialogs, undo toast)
    - `apps/client/src/components/Inventory.tsx` (in-game inventory card/menu, long-press + context menu + shortcuts)
    - `apps/client/src/components/Lobby.tsx` (wire up inventory actions if needed in HUD context)
    - `apps/client/src/components/Toast.tsx` (reuse)
    - `apps/client/src/hooks/useInventory.ts` (add remove/drop intents, optimistic helpers)
  - Patterns:
    - Prefer RSC where possible; wrap client components with `Suspense` and small client islands for menus/dialogs.
    - Maintain selection via `nuqs`; URL key e.g. `sel` with compact encoding.
    - Optimistic remove + Undo: update UI state immediately; delay server finalize by TTL.

- Server
  - Files touched:
    - `apps/server/src/index.ts` – add endpoints for removal (and optional drop), with session auth.
    - `apps/server/src/lib/db/repos/inventory.ts` – reuse `decrementInventoryItem`/`removeInventoryItemById`; guard against equipped.
    - `apps/server/src/lib/equipment-service.ts` – check equipped state; block removal of equipped/locked items.
    - `apps/server/src/rooms/GameRoom.ts` – optional: handle world drop via room message (not HTTP) if we support in-run dropping.
  - Events: write `player_inventory_events` with reasons `destroy_user` or `drop_user`.

---

### API design (final)

- HTTP
  - POST `/api/player/inventory/remove`
    - Action: Destroy (used by Inventory page and optionally in-game if outside room).
    - Request (one of):
      - Fungible: `{ itemType: string, itemName: string, quantity: number }`
      - Wearable instance: `{ inventoryItemId: string }`
    - Response: `{ ok: true, removed: { quantity: number } | { inventoryItemId: string } }` or error.
    - Guards: 400 invalid, 403 unauth, 409 equipped/locked, 422 insufficient.

- Realtime (in-game Drop/Destroy)
  - `drop_item` (Drop):
    - Payload: `{ inventoryItemId?: string, itemType?: string, itemName?: string, quantity?: number }`
    - Behavior: validates in-room, equipped/locked guard, decrements inventory, spawns entity, broadcasts.
  - `destroy_item` (Destroy):
    - Same payload structure; decrements inventory and emits event. Used by in-game flow for immediate server auth.

---

### Client flows (final)

- In-game quick remove
  - `Inventory.tsx` item tile: long-press (mobile), right-click, and `DropdownMenu` on "…" with actions: Drop, Destroy.
  - No confirmations.
  - Stackables prompt a small quantity dialog (input + Max) before action.
  - Destroy: optimistic remove locally; show Undo toast (5s). If not undone, call `destroy_item` (or HTTP remove if outside room). Undo cancels the call and restores UI.
  - Drop: send `drop_item` with quantity; optimistically update local; no toast; rely on server broadcast for world entity.

- Me/Inventory bulk remove
  - Add Edit mode toggle in `inventory-client.tsx`.
  - Each item row/card shows a `Checkbox` in Edit mode; sticky bulk bar displays Remove (Destroy) with selected count summary.
  - Clicking Remove opens a quantity dialog/table for stackables (per-item input with Max). No confirm step beyond this dialog.
  - Execute runs optimistic removal for all selected; show consolidated Undo toast (5s). After TTL, batch call HTTP `/api/player/inventory/remove` (group fungibles by key; list instances).

---

### Optimistic + Undo strategy (final)

- Client-delayed finalize (chosen)
  - Destroy only: optimistic UI removal + 5s Undo toast. If not undone, finalize on server (HTTP for inventory page; `destroy_item` or HTTP for in-game depending on context).
  - Drop: immediate server call (live room message); no undo, no toast.
  - Note: other tabs may lag until finalize; acceptable per requirements.

---

### Server logic details (final)

- Removal rules
  - Wearables: remove by `inventoryItemId` (instances). Quantity always 1. Reject if equipped.
  - Fungibles: decrement by requested amount; delete row if reaches 0. Cap per-call max (e.g., 10,000) for safety.
  - Equipped/locked guard: check via equipment repo/service; return 409 `EQUIPPED_OR_LOCKED`.

- Error codes
  - `INSUFFICIENT_QUANTITY`, `EQUIPPED_OR_LOCKED`, `ITEM_NOT_FOUND`, `INVENTORY_INVALID_REQUEST`.

- Events
  - Write `player_inventory_events` with `{ reason: 'destroy_user' | 'drop_user', metadata: { source: 'ui', rarity, quantity } }`.

---

### UI details and components (final)

- Radix/Shadcn UI
  - Menus: `DropdownMenu`, `ContextMenu`.
  - Quantity dialog: small `AlertDialog` variant with numeric input + Max.
  - Feedback: `Toast` with Undo action (Destroy only). No toast for Drop.
  - In-game mobile: `Sheet`/Drawer for actions on long-press.

- Rarity-aware guard rails
  - No confirmations for any action per requirements.
  - Destroy uses Undo (5s). Drop executes immediately.

- Accessibility
  - Keyboard: Delete triggers remove; Escape closes menus/dialogs; focus management on toasts/dialogs.

---

### Data and state (final)

- Types
  - Use existing `InventoryItem` interfaces in `apps/client/src/types/inventory.ts` and `apps/server/src/types/inventory.ts` (generated).

- Client state
  - `useInventory` to expose `requestDestroy`, `requestDrop`, `undoDestroy` helpers with optimistic behavior.
  - Selection state on Inventory page via `nuqs` (key `sel`) with compact encoding for ids and stack keys.

- Batching
  - Group fungible removals by `(itemType,itemName)` key; send one API call with aggregated `quantity`.
  - Send instance removals as an array of `inventoryItemId`s.

---

### Performance

- Virtualized lists already present? If not, ensure grid/list virtualization where relevant.
- Optimistic updates for instant feedback; debounce server finalize for bulk actions.
- Avoid re-render storms: memoize item cards; key by `inventoryItemId` or stack key.

---

### QA and safeguards (final)

- Unit tests (server): decrement logic, equipped guard, error codes, mixed payload validation.
- E2E smoke: remove common potion; undo; wearable removal blocked when equipped; bulk remove handles partial failures; drop spawns entity and reduces inventory with no toast.
- Telemetry: count removals by reason, rarity; error rates.

---

### Rollout (final)

- Feature-guard client UI behind a flag until endpoints land.
- Ship Inventory page Destroy first (HTTP endpoint), then in-game Drop/Destroy (live + HTTP fallback). No server soft-delete.

---

### Final decisions

- Drop vs Destroy: Support both in live runs. Drop via Colyseus `drop_item`; Destroy via Undo-first (5s) and then finalize (`destroy_item` or HTTP).
- Undo window: No undo for Drop. 5s Undo for Destroy (single and bulk).
- Confirmations: None. Execute immediately. Destroy shows Undo toast; Drop shows nothing.
- Stack quantities: Quantity dialog with numeric input and "Max" for stackables (single and bulk).
- Equipped/locked: Only equipped blocks removal; offer Unequip shortcut. No other lock types.
- Consistency: Client-delayed finalize accepted; eventual cross-tab sync is OK.
- Partial failures: Show grouped toast; keep failed items selected.
- Analytics: Not required for now.
- Shortcuts: No additional bindings beyond Delete/context menu.
- Copy: No toast for Drop; use "Destroyed X" for Destroy.

### Acceptance criteria

- In-game: user can remove a common stack item with Undo; wearable shows confirm; equipped wearable cannot be removed and explains why.
- Me/Inventory: selection mode allows multi-remove with quantity control and Undo; URL retains selection/filters; disabled actions for equipped/locked.
- Server: removal endpoints enforce guards; writes inventory events; return clear error codes.
