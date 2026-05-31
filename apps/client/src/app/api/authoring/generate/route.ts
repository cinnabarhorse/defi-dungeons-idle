import { NextRequest } from 'next/server';
import { generateChunksFromBlueprints } from '../../../../../../../scripts/generate-chunks-from-blueprints';

const errorResponse = (error: unknown, status = 500): Response => {
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: 'Request failed.' }, { status });
};

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest): Promise<Response> {
  if (process.env.VERCEL) {
    return Response.json(
      { error: 'Generator is disabled in this deployment environment.' },
      { status: 503 }
    );
  }

  try {
    const started = process.hrtime.bigint();
    const chunks = generateChunksFromBlueprints();
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

    return Response.json({
      ok: true,
      elapsedMs,
      chunkCount: chunks.length,
      chunks,
    });
  } catch (error) {
    console.error('Failed to run authoring generator', error);
    return errorResponse(error, 500);
  }
}
