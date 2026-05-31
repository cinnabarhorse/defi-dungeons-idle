import { NextRequest } from 'next/server';

import { MapFileError, readMapFile } from '../_lib/ts-chunk-utils';

const errorResponse = (error: unknown): Response => {
  if (error instanceof MapFileError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error('Unhandled error in /api/maps/[file]', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { file: string } }
): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const includeFull = searchParams.get('full') === '1';

    const parsed = await readMapFile(params.file);
    const payload = includeFull
      ? parsed.chunks
      : parsed.chunks.map((chunk) => ({
          name: chunk.name,
          width: chunk.width,
          height: chunk.height,
          type: chunk.type,
        }));

    return Response.json({
      file: parsed.file,
      varName: parsed.exportIdentifier,
      chunks: payload,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
