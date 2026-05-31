## Equipping Characters & Gotchis — Implementation Questions

This document gathers decisions needed to implement player-owned wearable equipment for characters and custom gotchis. Answers should align with a server-authoritative model and live stat updates.

### Scope & Goals

- What player states may equip/unequip? Character select, Staging room – also mid-run or strictly out-of-run?
- Should equipped loadouts persist across sessions and become the default next login?
- Is equipping supported for both built-in characters and wallet gotchis? Any differences in rules?

### Ownership, Inventory, and Source of Truth

- Confirm authoritative inventory: use `player_inventories` (DB) as the single source. Any remaining reliance on `localStorage` for inventory display should be removed?

Yes, no more localStorage.

- Are wearables fungible (quantity > 1 per slug) or unique (each instance distinct)? If fungible, does equipping consume one unit from inventory per slot?

Wearables will be fungible. I'm working on another PR that will make them fungible with slightly different properties depending on rarity.

- Can a single wearable copy be equipped to multiple characters simultaneously (e.g., two different loadouts), or is each inventory unit locked to exactly one equipped slot at a time?

No, one wearable per slot.

- Purchasing flow: when bought from shops (e.g., NPC shops), should we always increment `player_inventories` and optionally auto-equip? Any cooldown or delivery latency?

### Equipment Slots & Rules

- Supported slots: `head`, `body`, `face`, `eyes`, `handLeft`, `handRight`, `hands` (two-handed), `pet`, `background`. Are these final? Any additional slots?

Correvt, final.

- Hands logic: if an item occupies `hands` (two-handed), does it block both `handLeft` and `handRight`? If one-handed is equipped in one hand, can the other hand still equip compatible one-handed items?

No two handed items.

- Max items per slot: strictly one item per slot? Any exceptions (e.g., rings)?

One per slot.

- Level or progression gates: should `minLevel` on items be enforced on equip or only on use? If enforced, which level is used (player level vs. character level)?

Maybe, but not right now.

### Compatibility & Balance

- Compatibility filters: should we enforce wearable compatibility by character class/archetype or gotchi collateral (see `allowedCollaterals`), or keep it open unless a wearable’s slot doesn’t match?

No compatibility enforcing.

- Set bonuses: items include `setId` arrays. Do we implement set bonuses now? If yes, define their effects and stacking rules.

Not yet.

- Trait/rarity implications: should rarity affect drop rates, shop prices, repair, or durability (if any)?

Yes.

### Derived Stats, Abilities, and Stacking

- Confirm stat derivation pipeline: base stats from character → apply equipment aggregation (server) using `aggregateEquipmentStats` and wearable abilities/augments.

Yes.

- Stacking and clamps: confirm clamps such as max armor-derived mitigation (currently 0.8 cap via armor/100) and min movement speed multipliers. Any additional global caps?

Nope.

- Abilities from equipment: confirm we should append equipment abilities (from wearable augments) into the character’s ability list. Any exclusivity or priority rules when duplicates occur?
- Weapons as wearables: some wearables map to weapon profiles. Confirm selection and precedence for active weapon when multiple weapon-capable items are equipped.

### Server Authority, Validation, and Transactions

- Validation: on equip, must the server verify ownership, slot compatibility, and all gates atomically? If validation fails, what should the client display?
- Transactionality: should equip/unequip be atomic DB transactions that adjust both `player_inventories` and `player_equipment` (normalized table) together with an audit entry in `player_inventory_events`?
- Idempotency: should repeat equip requests for the same slot+slug be no-ops and return current state?
- Rate limiting: any rate limits for equip/unequip to mitigate spam?

### Persistence Model

- We currently have both normalized `player_equipment` and JSON `players.equipped_wearables`. Which should be the singular source of truth? Propose: use `player_equipment` as canonical; materialize `players.derived_stats` for quick reads.
- On join/reconnect: should we derive live stats from `player_equipment` and cache to `players.derived_stats`, or always compute on the fly? Any Redis cache desired?

### Realtime Updates & Messaging

- Transport: Colyseus messages for equipment changes and derived stat updates? Any REST endpoints needed for SSR views?
- On equip/unequip success, what payloads should the server broadcast? Propose: `equipment_updated` with current equipment list, and `stats_updated` with full derived stats. Combine into one message?
- Should the client also subscribe to inventory deltas (e.g., Supabase Realtime on `player_inventories`) to reflect owned counts while equipping?

### UI/UX Flows (Next.js + Shadcn)

- Where should the Equip UI live? Options:
  - Separate page (e.g., `/equip`) navigated from character select
  - Modal/dialog launched from character select (and from Staging room)
- Prefer SSR or client-only? RSC for read, client components for interactions? Any URL state via `nuqs` (e.g., `?equip=1&slot=head`)?
- Visuals: show currently equipped items per slot with rarity styling. Show live stat diffs when hovering/selecting alternatives.
- Sorting and filters: by slot, rarity, owned/available, search by name.
- Empty states: what to show for empty inventory or locked slots?

### Staging Room Behavior

- In Staging, equipping is allowed; should it be disallowed once the run starts (except for specific consumables)?
- Should equipping in Staging immediately update the lobby preview stats and the run’s pending configuration?

### Edge Cases & Error Handling

- Missing or deprecated wearable slugs: ignore, soft-fail, or auto-unequip?
- Duplicate equips: if the same slug is selected twice for different compatible slots, is that allowed if inventory quantity supports it?
- Inventory underflow: how to handle late-arriving inventory updates that reduce quantity below equipped count?
- Conflicts between two-handed and one-handed items: specify deterministic resolution (e.g., last-write-wins with auto-unequip of conflicting item).

### Analytics & Telemetry (optional)

- Track equip/unequip events (wearable slug, slot, before/after stats)? Privacy or PII considerations?
- A/B test UI variants (modal vs. page) or sort defaults?

### Acceptance Criteria (to confirm)

- Server-authoritative equip/unequip with validation and atomic persistence.
- Real-time UI updates: equipment and derived stats refresh instantly in character select and Staging room.
- Single source of truth chosen for equipment persistence (`player_equipment` recommended), with inventory audited via `player_inventory_events`.
- Clear UX for slot conflicts, insufficient inventory, and level/compatibility gates.

### Implementation Hook Points (for reference)

- Wearables data and aggregation: `data/wearables.ts`, `apps/server/src/data/wearables.ts`
- Character stat derivation (equipment-aware): `apps/server/src/data/characters.ts` and `apps/server/src/lib/player-stats.ts`
- Equipment persistence: `apps/server/src/lib/db/repos/equipment.ts`
- Inventory persistence and events: `apps/server/src/lib/db/repos/inventory.ts`, `player_inventory_events`
