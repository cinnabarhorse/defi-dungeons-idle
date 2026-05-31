import { listMapFiles, readMapFileSync, normalizeChunkInput, MapFileError } from '../mapFileIO';

// These tests intentionally exercise the real repo's data/maps directory.
// They should remain stable as long as core authoring files remain present.

describe('mapFileIO', () => {
  test('listMapFiles finds .ts map files and derives human titles', async () => {
    const files = await listMapFiles();

    // Sanity: we should at least find the main chunks export file.
    const chunks = files.find((f) => f.file === 'chunks.ts');
    expect(chunks).toBeTruthy();
    expect(chunks!.title).toBe('Chunks');

    // Prefix stripping: "chunks-cyberkawaii.ts" => "Cyberkawaii"
    const cyber = files.find((f) => f.file === 'chunks-cyberkawaii.ts');
    expect(cyber).toBeTruthy();
    expect(cyber!.title).toBe('Cyberkawaii');
  });

  test('readMapFileSync parses chunk arrays and preserves order', () => {
    const parsed = readMapFileSync('chunks.ts');

    expect(parsed.file).toBe('chunks.ts');
    expect(parsed.filePath).toContain('data/maps');
    expect(Array.isArray(parsed.chunks)).toBe(true);
    expect(parsed.chunks.length).toBeGreaterThan(0);

    // Default export identifier fallback (may be overridden by file)
    expect(typeof parsed.exportIdentifier).toBe('string');
    expect(parsed.order).toEqual(parsed.chunks.map((c) => c.name));

    // Minimal shape checks for the first chunk
    const first = parsed.chunks[0];
    expect(typeof first.name).toBe('string');
    expect(typeof first.width).toBe('number');
    expect(typeof first.height).toBe('number');
    expect(Array.isArray(first.assets)).toBe(true);
  });

  test('readMapFileSync rejects path traversal and non-.ts extensions', () => {
    expect(() => readMapFileSync('../secrets.txt' as any)).toThrow(MapFileError);

    try {
      readMapFileSync('../secrets.txt' as any);
    } catch (err) {
      const e = err as MapFileError;
      expect(e.status).toBe(400);
    }

    expect(() => readMapFileSync('chunks.json' as any)).toThrow(MapFileError);
  });

  test('normalizeChunkInput coerces numeric fields and normalizes enemy asset flags', () => {
    const normalized = normalizeChunkInput({
      name: 'test-chunk',
      width: '12',
      height: '34',
      instances: '2',
      type: 'room',
      meta: {
        orientation: 'h',
        ports: [{ side: 'E', centerOffsetTiles: '5', widthTiles: '4' }],
      },
      assets: [
        {
          assetId: 'slime',
          x: '1',
          y: '2',
          category: 'enemies',
          // intentionally omit isEnemy + enemyType so normalization fills them
        },
      ],
    });

    expect(normalized.width).toBe(12);
    expect(normalized.height).toBe(34);
    expect(normalized.instances).toBe(2);
    expect(normalized.meta?.orientation).toBe('h');
    expect(normalized.meta?.ports?.[0].centerOffsetTiles).toBe(5);

    const enemy = normalized.assets[0] as any;
    expect(enemy.category).toBe('enemies');
    expect(enemy.isEnemy).toBe(true);
    expect(enemy.enemyType).toBe('slime');
    expect(enemy.x).toBe(1);
    expect(enemy.y).toBe(2);
  });
});
