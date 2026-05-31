import type { Metadata } from 'next';
import AllocateStatsClient from './view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Allocate Stats | DeFi Dungeon',
};

export default function AllocateStatsPage() {
  return <AllocateStatsClient />;
}
