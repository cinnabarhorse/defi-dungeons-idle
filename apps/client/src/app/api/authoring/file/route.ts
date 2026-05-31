import { NextRequest } from 'next/server';

import {
  AuthoringFileKey,
  MUTABLE_FILE_KEYS,
  readAuthoringFile,
  writeAuthoringFile,
} from '../_lib/files';
import { validateAuthoringContents } from '../_lib/validation';

const ALLOWED_KEYS = new Set<AuthoringFileKey>(MUTABLE_FILE_KEYS);

const assertKey = (key: string | null): AuthoringFileKey => {
  if (!key) {
    throw new Error('Query parameter "key" is required.');
  }
  if (!ALLOWED_KEYS.has(key as AuthoringFileKey)) {
    throw new Error(`Unsupported file key "${key}".`);
  }
  return key as AuthoringFileKey;
};

const normalizeContents = (contents: string): string =>
  contents.endsWith('\n') ? contents : `${contents}\n`;

const errorResponse = (error: unknown, status = 500): Response => {
  if (error instanceof Error) {
    const message = error.message || 'Request failed.';
    return Response.json({ error: message }, { status });
  }
  return Response.json({ error: 'Request failed.' }, { status });
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const key = assertKey(request.nextUrl.searchParams.get('key'));
    const contents = await readAuthoringFile(key);
    return Response.json({ key, contents });
  } catch (error) {
    const status =
      error instanceof Error &&
      (/Unsupported file key/.test(error.message) ||
        /required/.test(error.message))
        ? 400
        : 500;
    return errorResponse(error, status);
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  if (process.env.VERCEL) {
    return Response.json(
      {
        error: 'Authoring writes are disabled in this deployment environment.',
      },
      { status: 503 }
    );
  }

  try {
    const payload = (await request.json()) as {
      key?: unknown;
      contents?: unknown;
    };

    const key = assertKey(
      typeof payload.key === 'string' ? payload.key : null
    );

    if (typeof payload.contents !== 'string') {
      throw new Error('Payload must include a string `contents` property.');
    }

    validateAuthoringContents(key, payload.contents);
    await writeAuthoringFile(key, normalizeContents(payload.contents));

    return Response.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof Error &&
      (/Unsupported file key/.test(error.message) ||
        /required/.test(error.message) ||
        /must/.test(error.message))
        ? 400
        : 500;
    return errorResponse(error, status);
  }
}
