import { Room } from 'colyseus';
import { GameRoomState } from '../schemas';

// BaseRoom handles common lifecycle and exposes hooks for subclasses
export abstract class BaseRoom extends Room<GameRoomState> {
  // Override to provide room metadata
  protected getRoomKind(): string {
    return 'base';
  }

  // Hook: initialize state and metadata
  protected onInitState(_options: Record<string, any>): void {}

  // Hook: create map/entities
  protected createMap(): void {}

  // Hook: spawn initial entities (enemies/NPCs/etc.)
  protected spawnInitialEntities(): void {}

  // Hook: register room-specific messages
  protected registerRoomSpecificMessages(): void {}

  onCreate(options: Record<string, any> = {}) {
    this.setState(new GameRoomState());
    this.setMetadata({ kind: this.getRoomKind(), ...(this.metadata || {}) });
    this.onInitState(options);
    this.createMap();
    this.spawnInitialEntities();
    this.registerRoomSpecificMessages();
  }
}
