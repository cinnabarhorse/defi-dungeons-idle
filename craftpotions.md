# Potion Crafting Feature - Implementation Plan

## Overview

Implement a potion crafting system that allows players to combine 4 lower-tier potions into 1 higher-tier potion. The crafting UI will be accessible from the lobby via a "Craft" button positioned next to the existing "Open Shop" button.

---

## Potion Tier Definitions

| Tier | Item Type | Name | Heal Formula | Sprite ID |
|------|-----------|------|--------------|-----------|
| 1 | `health_potion` | Health Potion | `max(50 HP, 10% max HP)` | 126 (existing) |
| 2 | `greater_health_potion` | Greater Health Potion | `max(100 HP, 25% max HP)` | TBD |
| 3 | `super_health_potion` | Super Health Potion | `max(250 HP, 50% max HP)` | TBD |

### Crafting Recipes

| Input | Output |
|-------|--------|
| 4× Health Potion | 1× Greater Health Potion |
| 4× Greater Health Potion | 1× Super Health Potion |

---

## Questions / Decisions Needed

### 1. **Sprite IDs for New Potions**
   - **Question:** What sprite IDs should be used for Greater Health Potion and Super Health Potion?
   - **Options:**
     - A) Reuse existing potion sprites (126) with different colors
     - B) Assign new sprite IDs from the sprite sheet
     - C) Use placeholder sprites initially
   - **Recommendation:** Need sprite ID assignments or confirmation of placeholder approach.

### 2. **Mana Potion Crafting**
   - **Question:** Should we also implement tiered mana potions in this feature?
   - **Current scope:** Only health potions mentioned
   - **Options:**
     - A) Health potions only (as specified)
     - B) Also add Greater/Super Mana Potions with same tier structure
   - **Impact:** If yes, doubles the recipe count and requires additional sprites.

### 3. **Where Can Crafting Be Performed?**
   - **Question:** Can players craft potions only in the lobby, or also during gameplay?
   - **Current plan:** Lobby only (next to shop button)
   - **Options:**
     - A) Lobby only (simpler, prevents mid-combat crafting abuse)
     - B) Lobby + in-game inventory panel
   - **Recommendation:** Lobby only for v1.

### 4. **Crafting UI/UX**
   - **Question:** Should crafting be instant or have an animation/delay?
   - **Options:**
     - A) Instant (one click, immediate result)
     - B) Brief animation (500ms-1s) to provide feedback
   - **Recommendation:** Instant with success feedback toast.

### 5. **Auto-Heal Priority**
   - **Question:** When a player takes lethal damage and has multiple potion tiers, which tier should auto-heal consume first?
   - **Options:**
     - A) Highest tier first (most efficient)
     - B) Lowest tier first (save best for emergencies)
     - C) Use the minimum tier needed to survive
   - **Recommendation:** Option C - Use minimum tier needed (server calculates)

### 6. **Potion Selection in Manual Use**
   - **Question:** When player manually uses a health potion (keybind), which tier is consumed?
   - **Options:**
     - A) Always use lowest tier
     - B) Always use highest tier
     - C) Add separate keybinds per tier
     - D) UI to select preferred tier
   - **Recommendation:** Option A for simplicity, or ask user.

### 7. **Greater/Super Potion Acquisition**
   - **Question:** Can Greater/Super Health Potions drop from enemies or chests?
   - **Options:**
     - A) Only obtainable via crafting
     - B) Can also drop from bosses/high-tier enemies
     - C) Can be purchased from shop at higher price
   - **Impact:** Affects loot tables and shop configuration.
   - **Recommendation:** Crafting only for v1 (simplest).

### 8. **Idle Mode Integration**
   - **Question:** How should the idle mode handle tiered potions for auto-heal?
   - **Current behavior:** Uses flat formula `max(maxHp * 0.1, 50)` per potion
   - **New behavior needed:** Use potion tier formula when consuming
   - **Note:** Idle mode currently uses run-collected potions first. Should this remain the same?

---

## Implementation Steps

### Phase 1: Data Layer

1. **Add new potion definitions to `data/items.ts`**
   - Add `greater_health_potion` and `super_health_potion` to `ITEM_TYPES`
   - Define appropriate stats, colors, and sprite IDs

2. **Create crafting recipes data file `data/crafting-recipes.ts`**
   - Define recipe structure with input items, quantities, and output item
   - Export recipes for both client and server use

3. **Update potion healing calculations in `apps/server/src/lib/potion-utils.ts`**
   - Create tier-aware healing functions
   - `computeHealthPotionHealByTier(maxHp: number, potionType: string): number`

### Phase 2: Server-Side

4. **Create crafting API endpoint `apps/server/src/routes/crafting.ts`**
   - POST `/api/crafting/craft` - Execute a crafting recipe
   - Validate player has required materials
   - Use database transaction to atomically consume inputs and grant output
   - Return updated inventory

5. **Update `PotionSystem.ts` to support tiered potions**
   - Modify `handleUseHealthPotion` to find the appropriate potion tier
   - Update `tryAutoHeal` to use minimum sufficient tier

6. **Update potion counting functions in `apps/server/src/lib/db/mappers.ts`**
   - Modify `getHealthPotionCount` to count all health potion tiers
   - Consider adding `getHealthPotionsByTier` for detailed counts

### Phase 3: Client-Side

7. **Create crafting UI component `apps/client/src/components/crafting/crafting-dialog.tsx`**
   - Modal dialog similar to shop dialog
   - Display available recipes
   - Show required materials and owned quantities
   - Craft button (disabled if insufficient materials)
   - Success/failure feedback

8. **Update Lobby component `apps/client/src/components/Lobby.tsx`**
   - Add "Craft" button next to "Open Shop" button
   - Add state for crafting dialog visibility
   - Import and render CraftingDialog component

9. **Update inventory display**
   - Ensure new potion types display correctly in inventory
   - Add appropriate icons/colors for each tier

### Phase 4: Integration

10. **Update idle mode in `apps/server/src/rooms/IdleMode.ts`**
    - Modify auto-heal logic to respect potion tiers

11. **Add crafting data to client-side data sync**
    - Ensure recipes are available to the client

12. **Testing**
    - Unit tests for healing calculations
    - Integration tests for crafting API
    - Manual testing of full flow

---

## Files to Create/Modify

### New Files
| Path | Purpose |
|------|---------|
| `data/crafting-recipes.ts` | Recipe definitions (shared) |
| `apps/server/src/routes/crafting.ts` | Crafting API endpoint |
| `apps/client/src/components/crafting/crafting-dialog.tsx` | Crafting UI |

### Modified Files
| Path | Changes |
|------|---------|
| `data/items.ts` | Add greater/super health potion definitions |
| `apps/server/src/lib/potion-utils.ts` | Add tier-aware healing functions |
| `apps/server/src/rooms/PotionSystem.ts` | Update to use tiered potions |
| `apps/server/src/lib/db/mappers.ts` | Update potion counting |
| `apps/server/src/rooms/IdleMode.ts` | Update auto-heal for tiers |
| `apps/server/src/index.ts` | Register crafting routes |
| `apps/client/src/components/Lobby.tsx` | Add Craft button and dialog |
| `apps/client/src/data/items.ts` | Mirror new potion definitions |

---

## UI Mockup (Text)

```
┌─────────────────────────────────────────┐
│  🧪 Potion Crafting                   ✕ │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🧪 Greater Health Potion        │   │
│  │                                 │   │
│  │ Heals: 25% max HP (min 100 HP)  │   │
│  │                                 │   │
│  │ Requires:                       │   │
│  │ [🧪] Health Potion × 4          │   │
│  │      You have: 12               │   │
│  │                                 │   │
│  │ [    Craft (max: 3)    ]        │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 💎 Super Health Potion          │   │
│  │                                 │   │
│  │ Heals: 50% max HP (min 250 HP)  │   │
│  │                                 │   │
│  │ Requires:                       │   │
│  │ [🧪] Greater Health Potion × 4  │   │
│  │      You have: 0                │   │
│  │                                 │   │
│  │ [   Insufficient Materials   ]  │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Duplication exploit via race condition | Low | High | Use DB transactions with row locking |
| Potion tier confusion for players | Medium | Low | Clear UI with tier indicators |
| Auto-heal consuming wrong tier | Medium | Medium | Test extensively, use minimum-tier logic |
| Idle mode breaks with new tiers | Medium | High | Update idle mode simultaneously |

---

## Estimated Effort

| Phase | Time Estimate |
|-------|---------------|
| Data Layer | 1-2 hours |
| Server-Side | 2-3 hours |
| Client-Side | 2-3 hours |
| Integration & Testing | 1-2 hours |
| **Total** | **6-10 hours** |

---

## Open Questions Summary

1. **Sprite IDs** - What sprites for greater/super potions?
2. **Mana potions** - Include in scope or health-only?
3. **Crafting location** - Lobby only or also in-game?
4. **Auto-heal priority** - Which tier to use first?
5. **Manual use priority** - Which tier when player presses potion key?
6. **Drop sources** - Crafting only or can also drop/purchase?

Please clarify these questions before I proceed with implementation.

