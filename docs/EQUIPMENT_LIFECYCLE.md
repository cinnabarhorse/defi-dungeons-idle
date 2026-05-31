# Equipment Lifecycle Documentation

This document traces the complete lifecycle of how wearables/equipment are stored, loaded, and persisted across the Gotchiverse Live application.

## Overview

Equipment persistence involves **three main database tables**:

1. **`player_equipment`** - Per-character equipment overrides (granular storage)
2. **`players.derived_stats`** - JSONB snapshot of computed stats including equipment
3. **`players.equipped_wearables`** - JSONB snapshot of equipped wearables list

## Database Tables

### 1. `player_equipment` Table

**Purpose**: Stores individual equipped items per player and character.

**Schema**:

```sql
create table player_equipment (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  character_id text,  -- Added in migration 20251015_000021_per_character_equipment.sql
  slot text not null,
  wearable_slug text not null,
  source text not null default 'inventory',  -- 'base' or 'override'
  inventory_item_id uuid references player_inventories(id),
  updated_at timestamptz default now(),
  unique (player_id, character_id, slot)
);
```

**Key Points**:

- **Unique constraint**: `(player_id, character_id, slot)` - ensures one item per slot per character
- **`character_id`**: Allows per-character equipment (added in migration `20251015_000021_per_character_equipment.sql`)
- **`source`**: Either `'base'` (character default) or `'override'` (player-chosen)
- **`inventory_item_id`**: Links to specific inventory instance for non-fungible wearables

**Repository Functions** (`apps/server/src/lib/db/repos/equipment.ts`):

- `setEquipment()` - Insert/update equipment record (uses `ON CONFLICT` for upsert)
- `clearEquipment()` - Delete all equipment for a player/character
- `removeEquipment()` - Delete equipment from specific slot(s)
- `getEquippedWithInstances()` - Get equipment with quality from `player_inventories` join

### 2. `players.derived_stats` Column

**Purpose**: JSONB snapshot of computed character stats including equipment bonuses.

**Content**: Full `CharacterDerivedStats` object including:

- Base stats (HP, attack, defense, etc.)
- Equipment bonuses
- Quality multipliers
- Complete equipment information

**Updated When**:

- Character selection (`/api/player/character/select`)
- Equipment changes (`/api/player/equipment` endpoints)

**NOT Updated During**: Gameplay (equipment doesn't change mid-match)

### 3. `players.equipped_wearables` Column

**Purpose**: JSONB snapshot of equipped wearables list for quick access.

**Format**: Array of serialized strings: `["slot::slug", "slot::slug::quality", ...]`

**Example**:

```json
["head::gotchi_hood", "body::armor_suit::godlike", "handLeft::sword"]
```

**Updated When**:

- Character selection (`/api/player/character/select`)
- Equipment changes (`/api/player/equipment` endpoints)

**NOT Updated During**: Gameplay

## Equipment Lifecycle Flow

### Phase 1: Character Selection

**Endpoint**: `POST /api/player/character/select`  
**Location**: `apps/server/src/index.ts` (lines 2311-2569)

**Flow**:

1. **Update player preferences**:

   ```typescript
   await playerPreferencesRepo.updatePreferences(resolved.playerId, {
     selectedCharacterId: normalizedCharacterId,
     // ... other preferences
   });
   ```

2. **Load existing equipment overrides**:

   ```typescript
   const existing = await equipmentRepo.getEquippedWithInstances(
     playerIdForTx,
     characterIdForSnapshot,
     client
   );
   ```

3. **Build complete equipment state**:

   ```typescript
   const nextState = buildEquipmentStateForCharacter(
     characterIdForSnapshot,
     overrides // Existing overrides + base equipment
   );
   ```

   `buildEquipmentStateForCharacter()` combines:
   - **Base equipment**: From character definition (`getCharacterStats(characterId).equipment.items`)
   - **Overrides**: From `player_equipment` table
   - Result: Complete `EquipmentState` with all slots filled

4. **Clear and repopulate `player_equipment` table**:

   ```typescript
   // Clear existing equipment for this character
   await equipmentRepo.clearEquipment(
     playerIdForTx,
     characterIdForSnapshot,
     client
   );

   // Persist ALL equipment (base + overrides) to player_equipment
   for (const assignment of nextState.equipment) {
     await equipmentRepo.setEquipment({
       playerId: playerIdForTx,
       characterId: characterIdForSnapshot,
       slot: assignment.slot,
       wearableSlug: assignment.slug,
       source: assignment.source === 'override' ? 'override' : 'base',
       inventoryItemId: assignment.inventoryItemId ?? null,
       client,
     });
   }
   ```

5. **Update snapshot in `players` table**:
   ```typescript
   await client.query(
     `update players
         set derived_stats = $2::jsonb,
             equipped_wearables = $3::jsonb,
             updated_at = now()
       where id = $1`,
     [
       playerIdForTx,
       JSON.stringify(nextState.derivedStats),
       JSON.stringify(nextState.equippedWearables),
     ]
   );
   ```

**Why This Approach**:

- Ensures `player_equipment` always contains the complete equipment set (base + overrides)
- Allows `getEquippedWithInstances()` to return full equipment state
- Handles cases where base equipment might change (character updates)

### Phase 2: Equipment Changes (Equip/Unequip)

**Endpoints**:

- `POST /api/player/equipment` - Equip/unequip wearables
- `POST /api/player/equipment/batch` - Batch equip/unequip

**Location**: `apps/server/src/lib/equipment-service.ts`

**Flow** (using `equipWearable()` as example):

1. **Validate and rate limit**:

   ```typescript
   enforceRateLimit(playerId);
   await ensurePlayerCanModifyEquipment(playerId); // Checks if player is in active game
   ```

2. **Load current equipment state**:

   ```typescript
   const overridesRaw = await equipmentRepo.getEquippedWithInstances(
     playerId,
     characterId,
     client
   );
   ```

3. **Perform equipment change**:

   ```typescript
   await equipmentRepo.setEquipment({
     playerId,
     characterId,
     slot: targetSlot,
     wearableSlug: wearable.slug,
     inventoryItemId: chosenRecord?.id ?? null,
     client,
   });
   ```

4. **Rebuild equipment state**:

   ```typescript
   const nextState = buildEquipmentState({
     characterId,
     overrides: nextOverrides,
   });
   ```

5. **Update snapshot in `players` table**:

   ```typescript
   await persistEquipmentSnapshot(playerId, nextState, client);
   ```

   `persistEquipmentSnapshot()` updates:
   - `players.derived_stats` = `nextState.derivedStats`
   - `players.equipped_wearables` = `nextState.equippedWearables`

6. **Broadcast update to active game rooms**:
   ```typescript
   await broadcastEquipmentUpdate(playerId, state);
   ```

**Note**: Equipment changes are **blocked** during active gameplay (`ensurePlayerCanModifyEquipment()` checks for active game rooms).

### Phase 3: Game Room Join

**Location**: `apps/server/src/rooms/GameRoom.ts` - `onJoin()` method (lines 1045-1391)

**Flow**:

1. **Load equipment from `player_equipment` table**:

   ```typescript
   const equipmentRecords = await equipmentRepo.getEquippedWithInstances(
     playerId,
     player.characterId || null
   );
   ```

2. **Convert to `EquipmentOverride[]` format**:

   ```typescript
   const equipmentOverrides: EquipmentOverride[] = [];
   for (const record of equipmentRecords) {
     equipmentOverrides.push({
       slot: normalizeEquipmentSlotName(record.slot),
       slug: record.wearableSlug,
       inventoryItemId: record.inventoryItemId ?? null,
       quality: normalizeQualityTier(record.quality),
     });
   }
   ```

3. **Build complete equipment state**:

   ```typescript
   const equipmentState = buildEquipmentStateForCharacter(
     player.characterId || 'coderdan',
     equipmentOverrides
   );
   ```

4. **Use for runtime player state**:
   ```typescript
   player.derivedStats = JSON.stringify(equipmentState.derivedStats);
   player.equippedWearables = JSON.stringify(runtimeWearables);
   ```

**Why Load from `player_equipment`**:

- Ensures we have the most up-to-date equipment state
- Combines base equipment (from character definition) with overrides (from database)
- Handles per-character equipment correctly

### Phase 4: During Gameplay

**Important**: Equipment does **NOT** change during gameplay.

- Equipment is read-only during matches
- `persistProgression()` explicitly **omits** equipment fields:
  ```typescript
  await progressionRepo.updateProgression(playerId, {
    level: profile.level,
    totalXp: profile.totalXp,
    // ... other progression fields
    // Explicitly omit derivedStats and equippedWearables
  });
  ```

**Rationale**: Equipment is managed separately via `/api/player/equipment` endpoints and doesn't change mid-game.

### Phase 5: Game Room Leave/Dispose

**Location**: `apps/server/src/rooms/GameRoom.ts`

**Methods**:

- `onLeave()` - Called when player disconnects (lines 1393-1506)
- `onDispose()` - Called when room is destroyed (e.g., server shutdown)

**Flow**:

1. **`onLeave()` calls persistence operations**:

   ```typescript
   const persistencePromises = [
     this.persistProgression(client.sessionId).catch(...),
     this.persistInventory(client.sessionId).catch(...),
     this.flushGamePlayerStats(client.sessionId, { markLeft: true }).catch(...),
   ];
   await Promise.all(persistencePromises);
   ```

2. **`persistProgression()` only updates progression fields**:
   - Level, XP, stats, etc.
   - **Does NOT update** `derivedStats` or `equippedWearables`

3. **Equipment is NOT persisted on leave**:
   - Equipment is already persisted in `player_equipment` table
   - Snapshots in `players` table are already up-to-date
   - No need to rewrite equipment data

**Why Equipment Isn't Persisted on Leave**:

- Equipment doesn't change during gameplay
- All equipment changes are already persisted via `/api/player/equipment` endpoints
- Persisting equipment on leave would risk overwriting with stale runtime data

### Phase 6: Refresh/Reload

**API Endpoint**: `GET /api/player/equipment`  
**Location**: `apps/server/src/index.ts` (lines 2748-2767)

**Flow**:

1. **Load equipment state**:

   ```typescript
   const state = await getPlayerEquipmentState(resolved.playerId);
   ```

2. **`getPlayerEquipmentState()` flow**:

   ```typescript
   // Resolve effective character ID
   const characterId = await resolveEffectiveCharacterId(playerId);

   // Load overrides from player_equipment
   const overridesRaw = await equipmentRepo.getEquippedWithInstances(
     playerId,
     characterId
   );

   // Build complete state (base + overrides)
   return buildEquipmentState({ characterId, overrides });
   ```

3. **Return serialized response**:
   ```typescript
   res.json(serializeEquipmentResponse(resolved.playerId, state));
   ```

**Client Usage**: `apps/client/src/hooks/useEquipment.ts` fetches equipment on mount and when `playerId` changes.

## Equipment State Building

**Function**: `buildEquipmentState()`  
**Location**: `apps/server/src/lib/equipment-service.ts` (lines 767-851)

**Process**:

1. **Start with base equipment** (from character definition):

   ```typescript
   const baseStats = getCharacterStats(characterId);
   for (const item of baseStats.equipment.items) {
     slotAssignments.set(slot, {
       slot,
       slug: item.slug,
       source: 'base',
       inventoryItemId: null,
       quality: DEFAULT_QUALITY_TIER,
     });
   }
   ```

2. **Apply overrides** (from `player_equipment` table):

   ```typescript
   overrides.forEach((entry) => {
     slotAssignments.set(entry.slot, {
       slot: entry.slot,
       slug: entry.slug,
       source: 'override',
       inventoryItemId: entry.inventoryItemId ?? null,
       quality: normalizeQualityTier(entry.quality),
     });
   });
   ```

3. **Build ordered assignments**:

   ```typescript
   const orderedAssignments: EquipmentAssignment[] = [];
   for (const slot of EQUIPMENT_SLOTS) {
     const assignment = slotAssignments.get(slot);
     if (assignment) {
       orderedAssignments.push(assignment);
     }
   }
   ```

4. **Calculate derived stats**:

   ```typescript
   const derivedStats = getCharacterStats(characterId, {
     equippedWearablesWithQuality,
   });
   ```

5. **Serialize for storage**:
   ```typescript
   const equippedWearables = storedAssignments.map(serializeStoredWearable);
   // Format: ["slot::slug", "slot::slug::quality", ...]
   ```

## Key Design Decisions

### 1. Why Store Base Equipment in `player_equipment`?

**Reason**: Ensures `getEquippedWithInstances()` returns complete equipment set.

- Base equipment is stored with `source: 'base'`
- Overrides are stored with `source: 'override'`
- Allows single query to get all equipment
- Handles character updates gracefully

### 2. Why Two Storage Mechanisms?

**Reason**: Different use cases.

- **`player_equipment`**: Granular, queryable, supports per-character equipment
- **`players.derived_stats` & `players.equipped_wearables`**: Fast snapshot for quick access, used for:
  - Entry cost calculation (`getMaxEquippedRarityForPlayer()`)
  - Quick stats lookups
  - Compatibility with existing code

### 3. Why Not Persist Equipment During `persistProgression()`?

**Reason**: Equipment doesn't change during gameplay.

- Equipment changes are managed via dedicated endpoints
- Persisting equipment during `persistProgression()` would risk overwriting with stale runtime data
- Explicit separation of concerns

### 4. Why Clear and Repopulate on Character Selection?

**Reason**: Ensures consistency and handles character updates.

- Clears old equipment for the character
- Repopulates with current base equipment + any existing overrides
- Handles cases where base equipment might change (character updates)

## Migration History

### `20251015_000021_per_character_equipment.sql`

**Changes**:

- Added `character_id` column to `player_equipment`
- Changed unique constraint from `(player_id, slot)` to `(player_id, character_id, slot)`
- Added index for `(player_id, character_id)` lookups

**Impact**: Enables per-character equipment storage, allowing players to have different equipment for different characters.

## Error Handling

### Equipment Modification During Gameplay

**Protection**: `ensurePlayerCanModifyEquipment()` checks for active game rooms:

```typescript
const rooms = await matchMaker.query({ name: 'game_room' });
// If player is in active game, equipment changes are blocked
```

### Transaction Safety

- All equipment operations use database transactions
- `runTransaction()` ensures atomicity
- Failures roll back all changes

### Rate Limiting

- Equipment changes are rate-limited (`EQUIPMENT_RATE_LIMIT = 5` per `EQUIPMENT_RATE_WINDOW_MS = 5000ms`)
- Prevents spam and abuse

## Summary

The equipment lifecycle follows this pattern:

1. **Character Selection**: Store complete equipment (base + overrides) in `player_equipment` + snapshot in `players`
2. **Equipment Changes**: Update `player_equipment` + snapshot in `players` (blocked during gameplay)
3. **Game Join**: Load from `player_equipment` and build runtime state
4. **During Gameplay**: Equipment is read-only, no persistence
5. **Game Leave**: Only progression is persisted, equipment is NOT touched
6. **Refresh**: Load from `player_equipment` and rebuild state

This design ensures:

- ✅ Equipment persistence across sessions
- ✅ Per-character equipment support
- ✅ Consistency between storage mechanisms
- ✅ No stale data overwrites
- ✅ Atomic operations via transactions













