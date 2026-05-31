import { headers } from 'next/headers';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import type { TokenWithdrawal } from '../../../types/withdrawals';
import AdminWithdrawalsClient from './withdrawals-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AdminWithdrawalsPageData {
  withdrawals: TokenWithdrawal[];
  status: string;
  error?: string | null;
}

async function fetchAdminWithdrawals(
  statusParam?: string
): Promise<AdminWithdrawalsPageData> {
  const baseUrl = getAppServerBaseUrl();
  const cookie = headers().get('cookie') || '';

  const search = statusParam
    ? `?status=${encodeURIComponent(statusParam)}`
    : '';

  try {
    const res = await fetch(`${baseUrl}/api/admin/withdrawals${search}`, {
      method: 'GET',
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });

    if (res.status === 401) {
      return {
        withdrawals: [],
        status: 'withdrawal_waiting',
        error: 'Unauthorized. Sign in with an admin wallet.',
      };
    }

    if (res.status === 403) {
      return {
        withdrawals: [],
        status: 'withdrawal_waiting',
        error: 'Forbidden. Wallet not on admin allowlist.',
      };
    }

    if (!res.ok) {
      return {
        withdrawals: [],
        status: 'withdrawal_waiting',
        error: 'Failed to load withdrawals.',
      };
    }

    const payload = (await res.json()) as Partial<AdminWithdrawalsPageData>;
    const withdrawals = Array.isArray(payload.withdrawals)
      ? (payload.withdrawals as TokenWithdrawal[])
      : [];
    const status =
      typeof payload.status === 'string'
        ? payload.status
        : 'withdrawal_waiting';

    return { withdrawals, status, error: null };
  } catch {
    return {
      withdrawals: [],
      status: 'withdrawal_waiting',
      error: 'Failed to load withdrawals.',
    };
  }
}

interface AdminWithdrawalsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminWithdrawalsPage({
  searchParams,
}: AdminWithdrawalsPageProps) {
  const params = await searchParams;
  const statusParam = params.status;
  const data = await fetchAdminWithdrawals(statusParam);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono p-8 gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Token Withdrawals</h1>
        <p className="text-sm text-slate-400">
          Review pending withdrawal requests and approve transfers.
        </p>
      </div>
      <AdminWithdrawalsClient
        initialWithdrawals={data.withdrawals}
        initialStatus={data.status}
        initialError={data.error || null}
      />
    </div>
  );
}
