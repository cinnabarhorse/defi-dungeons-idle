import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { SplashBackground } from '../../../components/SplashBackground';
import { getAppServerBaseUrl } from '../../../lib/server-url';
import { ADMIN_ADDRESS } from '../../../lib/constants';
import ApiKeysClient, { type ApiKeyListItem } from './api-keys-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'API Keys | DeFi Dungeon',
};

interface ApiKeyPageData {
  keys: ApiKeyListItem[];
  featureEnabled: boolean;
  error: string | null;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const raw = value.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function isApiKeysUiEnabled(): boolean {
  return parseBooleanEnv(process.env.ENABLE_STAKED_API_KEYS_UI);
}

function isAdminAddress(address: unknown): boolean {
  if (typeof address !== 'string') return false;
  return address.trim().toLowerCase() === ADMIN_ADDRESS.toLowerCase();
}

async function canCurrentSessionAccessApiKeysUi(): Promise<boolean> {
  if (isApiKeysUiEnabled()) {
    return true;
  }

  const baseUrl = getAppServerBaseUrl();
  const cookie = headers().get('cookie') || '';
  if (!cookie) {
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/player`, {
      method: 'GET',
      cache: 'no-store',
      headers: { cookie },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return false;
      }
      return true;
    }
    const payload = await response.json().catch(() => ({}));
    if (isAdminAddress(payload?.address)) {
      return true;
    }
    if (typeof payload?.address === 'string') {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function isFeatureDisabledPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const asRecord = payload as Record<string, unknown>;
  const error = typeof asRecord.error === 'string'
    ? asRecord.error.trim().toLowerCase()
    : '';
  const message = typeof asRecord.message === 'string'
    ? asRecord.message.trim().toLowerCase()
    : '';
  return (
    error === 'feature disabled' ||
    error === 'feature_disabled' ||
    message.includes('feature disabled')
  );
}

async function fetchInitialData(): Promise<ApiKeyPageData> {
  const baseUrl = getAppServerBaseUrl();
  const cookie = headers().get('cookie') || '';
  try {
    const response = await fetch(`${baseUrl}/api/auth/api-keys`, {
      method: 'GET',
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
    });
    if (!response.ok) {
      const payload = await response
        .json()
        .catch(() => ({ error: 'Failed to load API keys' }));
      if (response.status === 404 && isFeatureDisabledPayload(payload)) {
        return {
          keys: [],
          featureEnabled: false,
          error: null,
        };
      }
      return {
        keys: [],
        featureEnabled: true,
        error:
          typeof payload?.error === 'string'
            ? payload.error
            : 'Failed to load API keys',
      };
    }

    const payload = await response
      .json()
      .catch(() => ({ keys: [] as ApiKeyListItem[] }));
    return {
      keys: Array.isArray(payload?.keys)
        ? (payload.keys as ApiKeyListItem[])
        : [],
      featureEnabled: true,
      error: null,
    };
  } catch {
    return {
      keys: [],
      featureEnabled: true,
      error: 'Failed to load API keys',
    };
  }
}

export default async function ApiKeysPage() {
  const canAccessUi = await canCurrentSessionAccessApiKeysUi();
  if (!canAccessUi) {
    notFound();
  }
  const data = await fetchInitialData();

  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto w-full max-w-4xl px-4 py-12">
        <header className="mb-6">
          <Link href="/me" className="text-sm text-white/60 hover:text-white/80">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="mt-1 text-sm text-white/60">
            Manage Aavegotchi ownership-gated API keys for automation access.
          </p>
        </header>

        <ApiKeysClient
          initialKeys={data.keys}
          featureEnabled={data.featureEnabled}
          initialError={data.error}
        />
      </div>
    </SplashBackground>
  );
}
