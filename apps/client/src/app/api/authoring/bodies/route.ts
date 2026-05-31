import { NextRequest } from 'next/server';

import type { AuthoringFileKey } from '../_lib/files';
import { getRelativePath } from '../_lib/files';
import { loadBodyRecipes } from '../_lib/module-eval';

// Derive allowed authoring keys dynamically: include only files under /bodies/
// to avoid drift with the central file map.
const BODY_KEYS: Set<AuthoringFileKey> = new Set(
  (
    ['room-base', 'connector-base', 'custom-bodies'] as AuthoringFileKey[]
  ).filter((key) => /\/maps\/bodies\//.test(getRelativePath(key)))
);

const assertBodyKey = (key: string | null): AuthoringFileKey => {
  if (!key) {
    throw new Error('Query parameter "key" is required.');
  }
  if (!BODY_KEYS.has(key as AuthoringFileKey)) {
    throw new Error(`Unsupported body key "${key}".`);
  }
  return key as AuthoringFileKey;
};

const errorResponse = (error: unknown, status = 500): Response => {
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: 'Request failed.' }, { status });
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const key = assertBodyKey(request.nextUrl.searchParams.get('key'));
    const bodies = await loadBodyRecipes(key);
    return Response.json({ key, bodies });
  } catch (error) {
    const status =
      error instanceof Error &&
      (/Unsupported body key/.test(error.message) ||
        /required/.test(error.message))
        ? 400
        : 500;
    return errorResponse(error, status);
  }
}
