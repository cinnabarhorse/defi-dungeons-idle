export const dynamic = 'force-dynamic';

import type { DecodedDeposit } from './types';
import { GoldskyDepositsTable } from './deposits-table';
import { cookies } from 'next/headers';

async function fetchDeposits(limit = 100): Promise<DecodedDeposit[]> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:1999'
  ).replace(/\/$/, '');
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(
    `${baseUrl}/api/admin/goldsky/deposits/recent?limit=${encodeURIComponent(
      String(limit)
    )}`,
    {
      cache: 'no-store',
      // Forward auth cookies for admin verification
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('FORBIDDEN');
    }
    throw new Error('Failed to load Goldsky deposits');
  }
  const json = (await res.json()) as { rows: DecodedDeposit[] };
  return json.rows || [];
}

export default async function GoldskyDepositsPage() {
  let rows: DecodedDeposit[] = [];
  try {
    rows = await fetchDeposits(100);
  } catch (err) {
    if (err instanceof Error && err.message === 'FORBIDDEN') {
      // Render a minimal 403 without leaking details
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100 font-mono p-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white">403</h1>
            <p className="text-sm text-slate-400">Admin access required.</p>
          </div>
        </div>
      );
    }
    throw err;
  }
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono p-8 gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Goldsky Deposits</h1>
        <p className="text-sm text-slate-400">Decoded Deposited events.</p>
      </div>
      <GoldskyDepositsTable rows={rows} />
    </div>
  );
}
