import { NextRequest } from 'next/server';

import type { AuthoringFileKey } from '../_lib/files';
import { loadBlueprints } from '../_lib/module-eval';

const BLUEPRINT_KEYS = new Set<AuthoringFileKey>([
  'room-blueprints',
  'connector-blueprints',
]);

const assertBlueprintKey = (key: string | null): AuthoringFileKey => {
  if (!key) {
    throw new Error('Query parameter "key" is required.');
  }
  if (!BLUEPRINT_KEYS.has(key as AuthoringFileKey)) {
    throw new Error(`Unsupported blueprint key "${key}".`);
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
    const key = assertBlueprintKey(request.nextUrl.searchParams.get('key'));
    const blueprints = await loadBlueprints(
      key as 'room-blueprints' | 'connector-blueprints'
    );
    return Response.json({ key, blueprints });
  } catch (error) {
    const status =
      error instanceof Error &&
      (/Unsupported blueprint key/.test(error.message) ||
        /required/.test(error.message))
        ? 400
        : 500;
    return errorResponse(error, status);
  }
}
