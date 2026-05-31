import { NextRequest } from 'next/server';

import { CHUNKS as STAGING_CHUNKS } from '../../../../../../../../data/maps/chunks-staging';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    return Response.json({
      file: 'chunks-staging.ts',
      varName: 'CHUNKS',
      chunks: STAGING_CHUNKS,
    });
  } catch (error) {
    console.error('Failed to load staging chunks map file', error);
    return Response.json(
      { error: 'Failed to load staging chunks' },
      { status: 500 }
    );
  }
}
