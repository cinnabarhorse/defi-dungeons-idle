'use client';

import { IdleDungeonScreen } from '../idle/IdleDungeonScreen';
import type { Room } from 'colyseus.js';
import type { InventoryItem } from '../../types/inventory';

interface IdleGameContainerProps {
  room: Room;
  characterId?: string;
  onLeave: () => void;
  dailyQuestActive: boolean;
  dailyQuestRequiredScore: number | null;
  inventoryItems?: InventoryItem[];
}

export function IdleGameContainer({
  room,
  characterId,
  onLeave,
  dailyQuestActive,
  inventoryItems,
}: IdleGameContainerProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <IdleDungeonScreen
        room={room}
        characterId={characterId}
        onLeave={onLeave}
        dailyQuestActive={dailyQuestActive}
        inventoryItems={inventoryItems}
      />
    </div>
  );
}
