'use client';

export interface TierBadgeProps {
  tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4';
}

export function getTierStyles(tier?: 'tier1' | 'tier2' | 'tier3' | 'tier4') {
  switch (tier) {
    case 'tier1':
      return {
        label: 'T1',
        text: 'text-green-400',
        border: 'border-green-400/30',
        bg: 'bg-green-400',
      } as const;
    case 'tier2':
      return {
        label: 'T2',
        text: 'text-blue-400',
        border: 'border-blue-400/30',
        bg: 'bg-blue-400',
      } as const;
    case 'tier3':
      return {
        label: 'T3',
        text: 'text-yellow-400',
        border: 'border-yellow-400/30',
        bg: 'bg-yellow-400',
      } as const;
    case 'tier4':
      return {
        label: 'T4',
        text: 'text-red-400',
        border: 'border-red-400/30',
        bg: 'bg-red-400',
      } as const;
    default:
      return {
        label: 'T?',
        text: 'text-gray-400',
        border: 'border-gray-400/30',
        bg: 'bg-gray-400',
      } as const;
  }
}

export function TierBadge({ tier }: TierBadgeProps) {
  const styles = getTierStyles(tier);
  return (
    <span
      className={
        'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ' +
        styles.text +
        ' ' +
        styles.border
      }
      title={tier || 'unknown'}
    >
      <span className={`w-2 h-2 rounded-full ${styles.bg}`} />
      {styles.label}
    </span>
  );
}
