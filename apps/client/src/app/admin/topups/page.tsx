import { cookies } from 'next/headers';
import AdminTopupsClient from './topups-client';
import { getAppServerBaseUrl } from '../../../lib/server-url';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminTopUpsPage() {
  const baseUrl = getAppServerBaseUrl();
  const cookieHeader = cookies().toString();

  let initialTopUps: unknown[] = [];
  let initialError: string | null = null;
  const initialStatus = 'credited';
  const initialCurrency = 'ALL';

  try {
    const params = new URLSearchParams({ status: initialStatus, type: 'deposits' });
    if (initialCurrency !== 'ALL') {
      params.set('tokenSymbol', initialCurrency);
    }
    const res = await fetch(`${baseUrl}/api/admin/top-ups?${params.toString()}`,
      {
        method: 'GET',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        cache: 'no-store',
        // We do not set credentials on RSC fetch; cookies are forwarded via header above
      }
    );
    const payload = (await res.json().catch(() => null)) as { topUps?: unknown[]; error?: string } | null;
    if (!res.ok || !payload) {
      initialError = payload?.error || 'Failed to load top-ups.';
    } else {
      initialTopUps = Array.isArray(payload.topUps) ? payload.topUps : [];
    }
  } catch {
    initialError = 'Failed to load top-ups.';
  }

  return (
    <main className="min-h-screen-safe bg-slate-950 text-slate-100 font-mono p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Admin · Top-ups</h1>
          <p className="text-sm text-slate-400">On-chain deposits with unlock dates</p>
        </div>
        <AdminTopupsClient
          initialTopUps={initialTopUps as any}
          initialStatus={initialStatus}
          initialCurrency={initialCurrency}
          initialError={initialError}
        />
      </div>
    </main>
  );
}
