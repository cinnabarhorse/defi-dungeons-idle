import { NextRequest } from 'next/server';

import { generateChunksFromBlueprints } from '../../../../../../../../scripts/generate-chunks-from-blueprints';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const chunks = generateChunksFromBlueprints();
    return Response.json({ chunks });
  } catch (error) {
    console.error('Failed to generate dungeon chunks from blueprints', error);
    return Response.json(
      { error: 'Failed to generate chunks' },
      { status: 500 }
    );
  }
}
