import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import TokensClient from './tokens-client';
import type { TokenWithdrawal } from '../../../types/withdrawals';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { SplashBackground } from '../../../components/SplashBackground';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Withdraw Tokens | DeFi Dungeon',
};

interface TokensPageData {
  withdrawals: TokenWithdrawal[];
  minWithdrawalAmount: number;
  minWithdrawalAmountByCurrency: Record<string, number>;
}

const DEFAULT_MIN_WITHDRAWAL_MAP: Record<string, number> = {
  USDC: 0.1,
  GHST: 0.1,
};

function normalizeMinWithdrawalMap(
  input: Record<string, unknown> | null | undefined
): Record<string, number> {
  const next: Record<string, number> = { ...DEFAULT_MIN_WITHDRAWAL_MAP };
  if (!input) {
    return next;
  }

  for (const [key, value] of Object.entries(input)) {
    if (typeof key !== 'string') continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    next[key.toUpperCase()] = numeric;
  }

  return next;
}

function formatMinSummary(map: Record<string, number>): string {
  const entries = Object.entries(map);
  if (!entries.length) {
    return '—';
  }
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ≥ ${amount.toFixed(2)}`)
    .join(', ');
}

async function fetchTokensPageData(): Promise<TokensPageData> {
  const baseUrl = getAppServerBaseUrl();
  const cookie = headers().get('cookie') || '';

  try {
    const res = await fetch(`${baseUrl}/api/tokens/withdrawals`, {
      method: 'GET',
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });

    if (!res.ok) {
      return {
        withdrawals: [],
        minWithdrawalAmount: 0.1,
        minWithdrawalAmountByCurrency: { ...DEFAULT_MIN_WITHDRAWAL_MAP },
      };
    }

    const payload = (await res.json()) as
      | (Partial<TokensPageData> & {
          minWithdrawalAmountByCurrency?: Record<string, unknown>;
        })
      | null;
    const withdrawals = Array.isArray(payload?.withdrawals)
      ? (payload!.withdrawals as TokenWithdrawal[])
      : [];
    const minWithdrawalAmount =
      typeof payload?.minWithdrawalAmount === 'number'
        ? payload.minWithdrawalAmount
        : 0.1;
    const minWithdrawalAmountByCurrency = normalizeMinWithdrawalMap(
      payload?.minWithdrawalAmountByCurrency ?? null
    );

    return {
      withdrawals,
      minWithdrawalAmount,
      minWithdrawalAmountByCurrency,
    };
  } catch {
    return {
      withdrawals: [],
      minWithdrawalAmount: 0.1,
      minWithdrawalAmountByCurrency: { ...DEFAULT_MIN_WITHDRAWAL_MAP },
    };
  }
}

export default async function TokensPage() {
  const data = await fetchTokensPageData();
  const summary = formatMinSummary(data.minWithdrawalAmountByCurrency);
  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 py-12 backdrop-blur">
        <header className="mb-6">
          <Link
            href="/me"
            className="text-sm text-white/60 hover:text-white/80"
          >
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Withdraw Tokens
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Withdraw tokens you&apos;ve earned in the dungeon. Minimum
            withdrawals per currency: {summary}.
          </p>
        </header>

        <Suspense fallback={<div className="text-white/60">Loading…</div>}>
          <TokensClient
            initialWithdrawals={data.withdrawals}
            minWithdrawalAmount={data.minWithdrawalAmount}
            minWithdrawalAmountByCurrency={data.minWithdrawalAmountByCurrency}
          />
        </Suspense>
      </div>
    </SplashBackground>
  );
}
