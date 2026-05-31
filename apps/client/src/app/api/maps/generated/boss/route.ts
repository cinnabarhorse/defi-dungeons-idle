import { NextRequest } from 'next/server';

import { CHUNKS as BOSS_CHUNKS } from '../../../../../../../../data/maps/chunks-boss';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    return Response.json({
      file: 'chunks-boss.ts',
      varName: 'CHUNKS',
      chunks: BOSS_CHUNKS,
    });
  } catch (error) {
    console.error('Failed to load boss chunks map file', error);
    return Response.json(
      { error: 'Failed to load boss chunks' },
      { status: 500 }
    );
  }
}
