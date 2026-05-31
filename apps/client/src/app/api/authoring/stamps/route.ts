import { NextRequest } from 'next/server';

import { loadStampedPorts } from '../_lib/module-eval';

const errorResponse = (error: unknown, status = 500): Response => {
  if (error instanceof Error) {
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ error: 'Request failed.' }, { status });
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const stamps = await loadStampedPorts();
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    const filtered = id
      ? stamps.filter((stamp) =>
          stamp && typeof stamp === 'object'
            ? (stamp as { id?: unknown }).id === id
            : false
        )
      : stamps;

    return Response.json({
      stamps: filtered,
    });
  } catch (error) {
    return errorResponse(error, 500);
  }
}
