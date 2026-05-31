'use client';

import { useMemo } from 'react';
import { Toast } from './Toast';

export interface ToastQueueItem {
  id: string;
  // one of item or notification
  item?: any | null;
  notification?: {
    id: string;
    type:
      | 'pickup'
      | 'auto_heal'
      | 'portal_guardian_spawn'
      | 'portals_opened'
      | 'treasure_chest'
      | 'error'
      | 'success'
      | 'info';
    message: string;
  } | null;
}

interface ToastStackProps {
  items: ToastQueueItem[];
  onRemove: (id: string) => void;
  maxVisible?: number;
  onViewInventory?: () => void;
}

export function ToastStack({
  items,
  onRemove,
  maxVisible = 5,
  onViewInventory,
}: ToastStackProps) {
  const visible = useMemo(
    () => items.slice(0, maxVisible),
    [items, maxVisible]
  );

  return (
    <div
      className="fixed top-20 right-4 z-[60] flex flex-col gap-2 items-end pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {visible.map((entry) => (
        <div key={entry.id} className="pointer-events-auto">
          <Toast
            item={(entry as any).item ?? null}
            notification={(entry as any).notification ?? null}
            onClose={() => onRemove(entry.id)}
            onViewInventory={onViewInventory}
            durationMs={3200}
            inline
          />
        </div>
      ))}
    </div>
  );
}
