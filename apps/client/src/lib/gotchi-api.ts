'use client';

import { getAppServerBaseUrl } from './server-url';

export async function resolveGotchiSpritesheetUrl(
  gotchiId: string | number,
  serverBaseUrl?: string,
  opts?: { maxAttempts?: number; initialDelayMs?: number }
): Promise<string | null> {
  const base = (serverBaseUrl || getAppServerBaseUrl()).trim();
  const SERVER_BASE_URL = base.length
    ? base.replace(/\/$/, '')
    : getAppServerBaseUrl().replace(/\/$/, '');
  const apiUrl = `${SERVER_BASE_URL}/api/gotchis/${String(gotchiId)}`;

  let delay = Math.max(0, opts?.initialDelayMs ?? 1000);
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 5);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(apiUrl, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const rawUrl: unknown = (data as any)?.sprite?.url;
        if (typeof rawUrl === 'string' && rawUrl.length > 0) {
          return /^https?:\/\//i.test(rawUrl)
            ? rawUrl
            : `${SERVER_BASE_URL}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
        }
      }
    } catch {}
    // Backoff before next attempt
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 15000);
  }

  return null;
}


