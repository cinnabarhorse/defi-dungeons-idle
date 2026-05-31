import Link from 'next/link';
import { Suspense } from 'react';
import { SplashBackground } from '../../../components/SplashBackground';
import { AdminServersClient } from './admin-servers-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminServersPage() {
  return (
    <SplashBackground as="main" className="text-white pb-24">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 backdrop-blur">
        <header className="mb-6">
          <Link
            href="/admin"
            className="text-sm text-white/60 hover:text-white/80"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Server Slots
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Live blue/green PM2 status for each region with per-slot metrics.
          </p>
          <p className="mt-2 text-xs text-white/50">
            “Active” marks the slot new clients connect to. The non‑active slot
            can still show rooms/clients from existing sessions and will drain
            naturally after a flip or deploy.
          </p>
        </header>
        <Suspense fallback={<div className="text-white/70">Loading…</div>}>
          <AdminServersClient />
        </Suspense>
      </div>
    </SplashBackground>
  );
}
