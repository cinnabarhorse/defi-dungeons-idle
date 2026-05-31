import { NextRequest } from 'next/server';

import { listMapFiles, MapFileError } from './_lib/ts-chunk-utils';

const errorResponse = (error: unknown): Response => {
  if (error instanceof MapFileError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        // Errors should not be cached.
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  console.error('Unhandled error in /api/maps', error);
  return Response.json(
    { error: 'Internal server error' },
    {
      status: 500,
      // Errors should not be cached.
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const files = await listMapFiles();

    // This endpoint is safe to cache briefly because map files only change on deploy.
    // Caching reduces repeat work in serverless and cuts down on chatty client polling.
    return Response.json(
      { files },
      {
        headers: {
          // Allow shared caches; keep TTL short to stay safe.
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
