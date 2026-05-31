import dynamic from 'next/dynamic';
import { Suspense } from 'react';

import {
  EQUIPMENT_STAT_LABELS,
  EQUIPMENT_STATS,
  ITEM_TYPE_EFFECTS,
  ITEM_TYPES_BY_SLOT,
  WEARABLE_RARITIES,
} from '../../data/wearables';

const ItemTypeEffectsEditor = dynamic(
  () => import('./editor-client'),
  {
    ssr: false,
    loading: () => (
      <div className="px-6 py-10 text-sm text-slate-400">
        Loading wearable item type editor…
      </div>
    ),
  }
);

export default function ItemTypesPage() {
  return (
    <div className="font-mono">
      <Suspense
        fallback={
          <div className="px-6 py-10 text-sm text-slate-400">
            Preparing item type effects…
          </div>
        }
      >
        <ItemTypeEffectsEditor
          slotTypes={ITEM_TYPES_BY_SLOT}
          initialEffects={ITEM_TYPE_EFFECTS}
          statLabels={EQUIPMENT_STAT_LABELS}
          statOrder={EQUIPMENT_STATS}
          rarities={WEARABLE_RARITIES}
          isReadOnly={process.env.NODE_ENV === 'production'}
        />
      </Suspense>
    </div>
  );
}
