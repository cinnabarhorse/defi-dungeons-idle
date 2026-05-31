import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import InventoryClient from './inventory-client';
import { InventoryBackButton } from './inventory-back-button';
import type { InventoryItem } from '../../../types/inventory';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { SplashBackground } from '../../../components/SplashBackground';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'My Inventory | DeFi Dungeon',
};

export default async function InventoryPage() {
  const initialItems = await fetchInitialInventory();
  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-12 backdrop-blur">
        <header className="mb-6">
          <InventoryBackButton className="text-sm text-white/60 hover:text-white/80" />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            My Inventory
          </h1>
        </header>

        <Suspense fallback={<div className="text-white/60">Loading…</div>}>
          <InventoryClient initialItems={initialItems} />
        </Suspense>
      </div>
    </SplashBackground>
  );
}

async function fetchInitialInventory(): Promise<InventoryItem[]> {
  const baseUrl = getAppServerBaseUrl();
  try {
    const h = headers();
    const cookie = h.get('cookie') || '';
    const res = await fetch(`${baseUrl}/api/player/inventory`, {
      method: 'GET',
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { inventory?: InventoryItem[] } | null;
    return Array.isArray(data?.inventory)
      ? (data!.inventory as InventoryItem[])
      : [];
  } catch {
    return [];
  }
}
