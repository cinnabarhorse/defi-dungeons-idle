# Inventory Architecture - Database Integration

## Current State (Development)

- Client: localStorage for UI/display
- Server: In-memory Map for auto-healing
- Problem: No persistence, no cross-session continuity

## Production Architecture

### Database Schema

```sql
-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY,
  wallet_address VARCHAR(42) UNIQUE,
  username VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Player inventories
CREATE TABLE player_inventories (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  item_type VARCHAR(50) NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  item_data JSONB, -- For wearable stats, sprite IDs, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Composite index for fast lookups
  UNIQUE(player_id, item_type, item_name)
);

-- Difficulty progression (merged into players)
-- Columns now live directly on players:
--   players.level INT DEFAULT 1 NOT NULL
--   players.total_xp BIGINT DEFAULT 0 NOT NULL
--   players.unspent_points INT DEFAULT 0 NOT NULL
--   players.unlocked_tiers TEXT[] DEFAULT '{normal_1}' NOT NULL
--   players.lick_tongue_count INT DEFAULT 0 NOT NULL
--   players.stat_allocations JSONB DEFAULT '{}'::jsonb NOT NULL
--   players.derived_stats JSONB DEFAULT '{}'::jsonb NOT NULL
--   players.equipped_wearables JSONB DEFAULT '[]'::jsonb NOT NULL
```

### Server-Side Implementation

#### 1. Database Service

```typescript
// apps/server/src/services/InventoryService.ts
export class InventoryService {
  async getPlayerInventory(playerId: string): Promise<InventoryItem[]>;
  async addItemToInventory(
    playerId: string,
    item: InventoryItem
  ): Promise<void>;
  async removeItemFromInventory(
    playerId: string,
    itemId: string,
    quantity: number
  ): Promise<void>;
  async updateItemQuantity(
    playerId: string,
    itemId: string,
    quantity: number
  ): Promise<void>;

  // For auto-healing
  async findHealthPotions(playerId: string): Promise<InventoryItem[]>;
  async consumeHealthPotion(playerId: string): Promise<boolean>;
}
```

#### 2. GameRoom Integration

```typescript
// In GameRoom.ts
export class GameRoom extends Room<GameRoomState> {
  private inventoryService = new InventoryService();

  // Load player inventory on join
  async onJoin(client: Client, options: any) {
    // ... existing code ...

    // Load inventory from database
    const inventory = await this.inventoryService.getPlayerInventory(
      client.sessionId
    );

    // Send to client for UI display
    client.send('inventory_loaded', { inventory });
  }

  // Auto-healing with database
  private async tryAutoHeal(player: PlayerSchema): Promise<boolean> {
    const success = await this.inventoryService.consumeHealthPotion(player.id);

    if (success) {
      // Heal player
      player.hp = Math.min(player.maxHp, player.hp + 50);

      // Send updated inventory to client
      const updatedInventory = await this.inventoryService.getPlayerInventory(
        player.id
      );
      const client = this.getClientById(player.id);
      client?.send('inventory_updated', { inventory: updatedInventory });
    }

    return success;
  }

  // Item pickup with database persistence
  private async handleItemPickup(playerId: string, item: InventoryItem) {
    // Save to database
    await this.inventoryService.addItemToInventory(playerId, item);

    // Send to client for UI update
    const client = this.getClientById(playerId);
    client?.send('item_added', { item });
  }
}
```

### Client-Side Changes

#### 1. Remove localStorage, use server data

```typescript
// apps/client/src/hooks/useInventory.ts
export function useInventory() {
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // No more localStorage - inventory comes from server
  useEffect(() => {
    // Listen for server inventory updates
    if (room) {
      room.onMessage('inventory_loaded', (data) => {
        setInventoryItems(data.inventory);
      });

      room.onMessage('inventory_updated', (data) => {
        setInventoryItems(data.inventory);
      });

      room.onMessage('item_added', (data) => {
        setInventoryItems((prev) => addItemToArray(prev, data.item));
      });
    }
  }, [room]);
}
```

#### 2. Item usage requests to server

```typescript
// When player uses item (e.g., potion)
const useItem = (itemId: string) => {
  if (room) {
    room.send('use_item', { itemId });
  }
};
```

### Migration Strategy

#### Phase 1: Dual System

```typescript
// Support both localStorage (dev) and database (prod)
const INVENTORY_MODE = process.env.INVENTORY_MODE || 'localStorage'; // 'database'

if (INVENTORY_MODE === 'database') {
  // Use database service
} else {
  // Use current localStorage system
}
```

#### Phase 2: Database Migration

```typescript
// Migration script to move localStorage data to database
export async function migratePlayerInventories() {
  // Read from localStorage backups
  // Insert into database
  // Validate data integrity
}
```

### Benefits of Database Approach

1. **Persistence**: Inventory survives browser refresh, device changes
2. **Cross-platform**: Same inventory on mobile/desktop
3. **Anti-cheat**: Server-authoritative, can't be manipulated
4. **Analytics**: Track item usage, economy balance
5. **Backup/Recovery**: Professional data management
6. **Scalability**: Handle millions of players

### Performance Considerations

1. **Caching**: Redis cache for frequently accessed inventories
2. **Batch operations**: Group item updates to reduce DB calls
3. **Lazy loading**: Only load inventory when needed
4. **Pagination**: For players with huge inventories

### Security

1. **Authentication**: Verify player ownership
2. **Rate limiting**: Prevent inventory spam
3. **Validation**: Server validates all item operations
4. **Audit logs**: Track all inventory changes

## Implementation Priority

1. ✅ **Immediate**: Fix WebSocket payload issue (already done)
2. 🔄 **Next**: Design database schema
3. 📋 **Soon**: Implement InventoryService
4. 🚀 **Later**: Full migration to database system
