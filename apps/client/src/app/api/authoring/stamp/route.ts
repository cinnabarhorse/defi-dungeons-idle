import { NextRequest } from 'next/server';

import {
  readAuthoringFile,
  resolveAuthoringAbsolutePath,
  writeAuthoringFileFromCustomPath,
} from '../_lib/files';
import { rewriteStampSource } from '../_lib/stamp-writer';
import { validateStampPayload } from '../_lib/validation';

const errorResponse = (error: unknown, status = 500): Response => {
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: 'Request failed.' }, { status });
};

export const dynamic = 'force-dynamic';

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
    const normalized = validateStampPayload(await request.json());
    const currentSource = await readAuthoringFile('port-stamps');
    const updatedSource = rewriteStampSource(currentSource, normalized);
    const absolutePath = resolveAuthoringAbsolutePath('port-stamps');

    await writeAuthoringFileFromCustomPath(
      'port-stamps',
      updatedSource,
      absolutePath
    );

    return Response.json({ ok: true });
  } catch (error) {
    const status =
      error instanceof Error &&
      (/Stamp id/.test(error.message) ||
        /Orientation/.test(error.message) ||
        /Asset/.test(error.message))
        ? 400
        : 500;
    return errorResponse(error, status);
  }
}
