import Link from 'next/link';
import { Suspense } from 'react';
import { SplashBackground } from '../../components/SplashBackground';
import { AdminStatsClient } from '../admin/stats/admin-stats-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <SplashBackground as="main" viewportScroll className="text-white pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 backdrop-blur">
        <header className="mb-6">
          <Link href="/" className="text-sm text-white/60 hover:text-white/80">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-white/60">
            Operational analytics across runs, progression, and economy.
          </p>
        </header>
        <Suspense fallback={<div className="text-white/60">Loading…</div>}>
          <AdminStatsClient />
        </Suspense>
      </div>
    </SplashBackground>
  );
}











