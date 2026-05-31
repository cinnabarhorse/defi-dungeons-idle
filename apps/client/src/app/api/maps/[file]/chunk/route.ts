import { NextRequest } from 'next/server';

import {
  MapFileError,
  normalizeChunkInput,
  persistMapFile,
  readMapFile,
} from '../../_lib/ts-chunk-utils';

const errorResponse = (error: unknown): Response => {
  if (error instanceof MapFileError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error('Unhandled error in /api/maps/[file]/chunk', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { file: string } }
): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    if (!name) {
      throw new MapFileError(400, 'Query parameter "name" is required.');
    }

    const parsed = await readMapFile(params.file);
    const chunk = parsed.chunks.find((entry) => entry.name === name);
    if (!chunk) {
      throw new MapFileError(
        404,
        `Chunk "${name}" was not found in ${params.file}.`
      );
    }

    return Response.json({ chunk });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { file: string } }
): Promise<Response> {
  if (process.env.VERCEL) {
    return Response.json(
      {
        ok: false,
        error: 'Saving chunks is not supported in this deployment environment.',
      },
      { status: 503 }
    );
  }

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object' || !payload.chunk) {
      throw new MapFileError(
        400,
        'Request body must include a "chunk" object.'
      );
    }

    const incomingChunk = normalizeChunkInput(payload.chunk);
    const previousName =
      typeof payload.previousName === 'string' &&
      payload.previousName.trim() !== ''
        ? payload.previousName.trim()
        : undefined;

    const parsed = await readMapFile(params.file);
    const chunkMap = new Map(parsed.chunks.map((chunk) => [chunk.name, chunk]));

    let updated = false;

    if (previousName && previousName !== incomingChunk.name) {
      if (chunkMap.delete(previousName)) {
        updated = true;
      }
      parsed.order = parsed.order.filter((name) => name !== previousName);
    }

    if (chunkMap.has(incomingChunk.name)) {
      updated = true;
    }

    chunkMap.set(incomingChunk.name, incomingChunk);

    const order: string[] = [];
    for (const name of parsed.order) {
      if (name === previousName) continue;
      if (!chunkMap.has(name)) continue;
      order.push(name);
    }
    if (!order.includes(incomingChunk.name)) {
      order.push(incomingChunk.name);
    }

    const orderedChunks = order
      .map((name) => chunkMap.get(name))
      .filter((chunk): chunk is typeof incomingChunk => Boolean(chunk));

    for (const [name, chunk] of chunkMap) {
      if (!order.includes(name)) {
        order.push(name);
        orderedChunks.push(chunk);
      }
    }

    await persistMapFile({
      file: parsed.file,
      exportIdentifier: parsed.exportIdentifier,
      chunks: orderedChunks,
      order,
    });

    return Response.json({ ok: true, updated });
  } catch (error) {
    return errorResponse(error);
  }
}
