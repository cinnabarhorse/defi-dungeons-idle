import { NextRequest } from 'next/server';

import {
  AuthoringFileKeyWithStamps,
  MUTABLE_FILE_KEYS,
  getRelativePath,
  statAuthoringFile,
} from '../_lib/files';

const ALL_KEYS: AuthoringFileKeyWithStamps[] = [
  ...MUTABLE_FILE_KEYS,
  'port-stamps',
];

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<Response> {
  try {
    const entries = await Promise.all(
      ALL_KEYS.map(async (key) => {
        const stats = await statAuthoringFile(key);
        return {
          key,
          path: getRelativePath(key),
          writable: key === 'port-stamps' ? 'stamp' : 'file',
          size: stats.size,
          lastModifiedMs: stats.mtimeMs,
          lastModifiedISO: stats.mtime.toISOString(),
        } as const;
      })
    );

    return Response.json({ files: entries });
  } catch (error) {
    console.error('Failed to list authoring files', error);
    return Response.json(
      { error: 'Failed to list authoring files.' },
      { status: 500 }
    );
  }
}
