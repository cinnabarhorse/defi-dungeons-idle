import { cookies } from 'next/headers';
import StoreSalesClient from './store-sales-client';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import type { StoreSalesPayload } from './store-sales-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getTodayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default async function AdminStoreSalesPage() {
  const baseUrl = getAppServerBaseUrl();
  const cookieHeader = cookies().toString();
  const initialDate = getTodayUtc();

  let initialData: StoreSalesPayload | null = null;
  let initialError: string | null = null;

  try {
    const res = await fetch(
      `${baseUrl}/api/admin/store-sales?date=${encodeURIComponent(initialDate)}`,
      {
        method: 'GET',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        cache: 'no-store',
      }
    );
    const payload = (await res.json().catch(() => null)) as
      | StoreSalesPayload
      | { error?: string }
      | null;
    if (!res.ok || !payload || 'error' in payload) {
      initialError =
        payload && 'error' in payload
          ? (payload as { error: string }).error
          : 'Failed to load store sales.';
    } else {
      initialData = payload as StoreSalesPayload;
    }
  } catch {
    initialError = 'Failed to load store sales.';
  }

  return (
    <main className="min-h-screen-safe bg-slate-950 text-slate-100 font-mono p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Admin · Store sales
          </h1>
          <p className="text-sm text-slate-400">
            Wearables and equipment sold to the store, and daily gold allocation
            per day.
          </p>
        </div>
        <StoreSalesClient
          initialDate={initialDate}
          initialData={initialData}
          initialError={initialError}
        />
      </div>
    </main>
  );
}
