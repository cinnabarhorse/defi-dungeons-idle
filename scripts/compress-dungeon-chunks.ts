/*
 * Compress and normalize floor and wall assets inside a specific chunk's assets array.
 *
 * What this script does now:
 * - Tokenizes the assets array into top-level entries (robust splitter that
 *   respects (), {}, [], strings, and comments)
 * - Detects whether an entry is an object literal or a function call
 * - Converts floor-category object literals into floor(x, y, id[, sprite])
 * - Converts walls-category object literals into wall(x, y, id[, sprite])
 * - Detects pre-existing floor(...) and wall(...) function calls and deduplicates them
 * - Preserves non-floor/non-wall assets and function calls verbatim
 * - Rewrites the assets array with deduped floor(...) and wall(...) calls plus preserved
 *   entries, keeping indentation style intact
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function main(fileName: string, chunkName: string) {
  const FILE = resolve(process.cwd(), fileName);
  const CHUNK_NAME = String(chunkName);

  let src = readFileSync(FILE, 'utf8');

  // Find the target chunk object and its assets array
  const startObj = src.indexOf(`name: '${CHUNK_NAME}'`);
  if (startObj < 0) {
    console.error(`Could not find chunk "${CHUNK_NAME}" in ${fileName}`);
    process.exit(1);
  }
  // Find the 'assets: [' that follows
  const assetsKey = src.indexOf('assets: [', startObj);
  if (assetsKey < 0) {
    console.error(`Could not find assets array for chunk "${CHUNK_NAME}"`);
    process.exit(1);
  }

  // Find the matching closing bracket for this assets array (rudimentary balance)
  let idx = assetsKey + 'assets: ['.length;
  let depth = 1;
  while (idx < src.length && depth > 0) {
    const ch = src[idx++];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
  }
  if (depth !== 0) {
    console.error(`Failed to balance assets array for chunk "${CHUNK_NAME}"`);
    process.exit(1);
  }
  const endAssets = idx; // position right after closing ']'

  const before = src.slice(0, assetsKey);
  const assetsBlock = src.slice(assetsKey, endAssets);

  // Extract the body of the assets array (between '[' and the matching ']')
  const s = assetsBlock.indexOf('[');
  const e = assetsBlock.lastIndexOf(']');
  const body = assetsBlock.slice(s + 1, e);

  // Determine indentation from the 'assets: [' line to preserve style
  const lineStart = src.lastIndexOf('\n', assetsKey) + 1;
  const assetsLineIndent = src.slice(lineStart, assetsKey);
  const entryIndent = assetsLineIndent + '  '; // entries are typically +2 spaces

  // Helpers consistent with constants in the TS file
  const W = 40;
  const H = 40;

  // Split into top-level entries (comma-separated), respecting nesting and strings
  const entries = splitTopLevelEntries(body);

  // Accumulators
  // Deduplicate by coordinate with last-wins semantics
  const floorByCoord = new Map<
    string,
    { x: number; y: number; id: string; sprite?: string; order: number }
  >();
  const wallByCoord = new Map<
    string,
    { x: number; y: number; id: string; sprite?: string; order: number }
  >();
  let seq = 0;
  const preserved: string[] = [];

  for (const rawEntry of entries) {
    const entry = rawEntry.trim();
    if (!entry) continue;

    // Comment-only tokens are dropped from output
    if (isOnlyComment(entry)) {
      continue;
    }

    // floor(...) function call? Deduplicate by coordinate (last wins)
    const floorCall = parseFloorCall(entry);
    if (floorCall) {
      const { x, y, id, sprite } = floorCall;
      const key = `${x}|${y}`;
      floorByCoord.set(key, { x, y, id, sprite, order: seq++ });
      continue;
    }

    // wall(...) function call? Deduplicate by coordinate (last wins)
    const wallCall = parseWallCall(entry);
    if (wallCall) {
      const { x, y, id, sprite } = wallCall;
      const key = `${x}|${y}`;
      wallByCoord.set(key, { x, y, id, sprite, order: seq++ });
      continue;
    }

    // Object literal? Convert floor-category objects into floor(...) calls
    if (entry.startsWith('{')) {
      const category = matchStringProp(entry, 'category');
      if (category === 'floors') {
        const assetId = matchStringProp(entry, 'assetId');
        const sprite = matchStringProp(entry, 'sprite');
        const x = matchNumberProp(entry, 'x');
        const y = matchNumberProp(entry, 'y');
        if (assetId != null && x != null && y != null) {
          const localX = ((x % W) + W) % W;
          const localY = ((y % H) + H) % H;
          const key = `${localX}|${localY}`;
          floorByCoord.set(key, {
            x: localX,
            y: localY,
            id: assetId,
            sprite: sprite ?? undefined,
            order: seq++,
          });
          continue;
        }
      }
      if (category === 'walls') {
        const assetId = matchStringProp(entry, 'assetId');
        const sprite = matchStringProp(entry, 'sprite');
        const x = matchNumberProp(entry, 'x');
        const y = matchNumberProp(entry, 'y');
        if (assetId != null && x != null && y != null) {
          const localX = ((x % W) + W) % W;
          const localY = ((y % H) + H) % H;
          const key = `${localX}|${localY}`;
          wallByCoord.set(key, {
            x: localX,
            y: localY,
            id: assetId,
            sprite: sprite ?? undefined,
            order: seq++,
          });
          continue;
        }
      }
      // Non-floor object or missing fields → preserve as-is
      preserved.push(entry);
      continue;
    }

    // Non-floor functions or spread expressions are preserved
    preserved.push(entry);
  }

  // Build streak-based fillRange/fillRangeWalls for compact output
  const floorEntries = Array.from(floorByCoord.values());
  const wallEntries = Array.from(wallByCoord.values());

  function groupIntoRanges(
    items: { x: number; y: number; id: string; sprite?: string }[],
    isWall: boolean
  ): string[] {
    type Segment = { x0: number; x1: number; stepX: number };
    const byKey = new Map<string, Map<number, number[]>>();
    for (const it of items) {
      const inferred = isWall
        ? inferWallSprite(it.id)
        : `floors/cyberkawaii/${it.id}.png`;
      const sprite = it.sprite && it.sprite !== inferred ? it.sprite : inferred;
      const key = `${it.id}|${sprite}`;
      let rows = byKey.get(key);
      if (!rows) {
        rows = new Map();
        byKey.set(key, rows);
      }
      const xs = rows.get(it.y) || [];
      xs.push(it.x);
      rows.set(it.y, xs);
    }

    const lines: string[] = [];
    byKey.forEach((rows, key) => {
      const [id, sprite] = key.split('|');
      // Build segments per row, allowing constant stepX > 1 (e.g., 0,2,4,...)
      const rowSegments = new Map<number, Segment[]>();
      rows.forEach((xs, y) => {
        xs.sort((a, b) => a - b);
        const segs: Segment[] = [];
        let start = xs[0];
        let prev = xs[0];
        let step: number | null = null;
        for (let i = 1; i < xs.length; i++) {
          const x = xs[i];
          const dx = x - prev;
          if (step === null) {
            step = dx; // initialize step from first gap
            prev = x;
            continue;
          }
          if (dx === step) {
            prev = x;
            continue;
          }
          // close current segment
          segs.push({ x0: start, x1: prev, stepX: Math.max(1, step || 1) });
          // start a new segment
          start = x;
          prev = x;
          step = null;
        }
        segs.push({ x0: start, x1: prev, stepX: Math.max(1, step || 1) });
        rowSegments.set(y, segs);
      });

      // Merge vertically with constant stepY between rows when identical segments repeat
      const sortedYs = Array.from(rowSegments.keys()).sort((a, b) => a - b);
      for (const yStart of sortedYs) {
        const segs = rowSegments.get(yStart);
        if (!segs || segs.length === 0) continue;
        while (segs.length > 0) {
          const seg = segs.shift()!;
          // Determine stepY by finding the next row with the same segment
          let yEnd = yStart;
          let stepY: number | null = null;
          for (const yCandidate of sortedYs) {
            if (yCandidate <= yStart) continue;
            const idx = (rowSegments.get(yCandidate) || []).findIndex(
              (s) => s.x0 === seg.x0 && s.x1 === seg.x1 && s.stepX === seg.stepX
            );
            if (idx !== -1) {
              stepY = yCandidate - yStart;
              break;
            }
          }
          if (stepY) {
            let yCur = yStart + stepY;
            while (true) {
              const list = rowSegments.get(yCur);
              if (!list) break;
              const idx = list.findIndex(
                (s) =>
                  s.x0 === seg.x0 && s.x1 === seg.x1 && s.stepX === seg.stepX
              );
              if (idx === -1) break;
              list.splice(idx, 1);
              yEnd = yCur;
              yCur += stepY;
            }
          }

          if (isWall) {
            const spriteDefault = inferWallSprite(id);
            const opts: string[] = [
              `id: '${id}'`,
              `stepX: ${seg.stepX}`,
              `stepY: ${Math.max(1, stepY || 1)}`,
            ];
            if (sprite && sprite !== spriteDefault)
              opts.push(`sprite: '${sprite}'`);
            lines.push(
              `${entryIndent}...fillRangeWalls(${seg.x0}, ${yStart}, ${seg.x1}, ${yEnd}, { ${opts.join(
                ', '
              )} }),`
            );
          } else {
            const spriteDefault = `floors/cyberkawaii/${id}.png`;
            const opts: string[] = [
              `id: '${id}'`,
              `stepX: ${seg.stepX}`,
              `stepY: ${Math.max(1, stepY || 1)}`,
            ];
            if (sprite && sprite !== spriteDefault)
              opts.push(`sprite: '${sprite}'`);
            lines.push(
              `${entryIndent}...fillRange(${seg.x0}, ${yStart}, ${seg.x1}, ${yEnd}, { ${opts.join(
                ', '
              )} }),`
            );
          }
        }
      }
    });
    return lines;
  }

  const outLines: string[] = [];
  outLines.push(...groupIntoRanges(floorEntries, false));
  outLines.push(...groupIntoRanges(wallEntries, true));
  for (const token of preserved)
    outLines.push(`${entryIndent}${token.replace(/[,\s]*$/, '')},`);

  const assetsReplacement = `assets: [\n${outLines.join('\n')}\n${assetsLineIndent}]`;

  const after = src.slice(endAssets);
  let next = before + assetsReplacement + after;

  // Ensure helpers are imported when used
  const needWall = wallEntries.length > 0;
  const needFillFloors = outLines.some((l) => l.includes('fillRange('));
  const needFillWalls = outLines.some((l) => l.includes('fillRangeWalls('));
  if (needWall || needFillFloors || needFillWalls) {
    const importRegex = /import\s*\{([^}]*)\}\s*from\s*'\.\/chunksHelper';/;
    if (importRegex.test(next)) {
      next = next.replace(importRegex, (m, names) => {
        const items = names
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
        if (needWall && !items.includes('wall')) items.push('wall');
        if (needFillFloors && !items.includes('fillRange'))
          items.push('fillRange');
        if (needFillWalls && !items.includes('fillRangeWalls'))
          items.push('fillRangeWalls');
        const seen = new Set<string>();
        const ordered: string[] = [];
        for (const n of items) {
          if (!seen.has(n)) {
            seen.add(n);
            ordered.push(n);
          }
        }
        return `import { ${ordered.join(', ')} } from './chunksHelper';`;
      });
    } else {
      const imports: string[] = [];
      if (needFillFloors) imports.push('fillRange');
      if (needFillWalls) imports.push('fillRangeWalls');
      if (needWall) imports.push('wall');
      next = `import { ${imports.join(', ')} } from './chunksHelper';\n` + next;
    }
  }

  writeFileSync(FILE, next, 'utf8');
  console.log(
    '✅ Rewrote assets with deduped floor(...) calls and preserved other entries.'
  );
}

// --- Helpers ---

function splitTopLevelEntries(body: string): string[] {
  const out: string[] = [];
  let token = '';
  let brace = 0;
  let bracket = 0;
  let paren = 0;
  let inStr: '"' | "'" | '`' | null = null;
  let esc = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = body[i - 1];
    const next = body[i + 1];

    // Handle line comments
    if (
      !inStr &&
      !inBlockComment &&
      !inLineComment &&
      ch === '/' &&
      next === '/'
    ) {
      inLineComment = true;
      token += ch; // keep comment content
      continue;
    }
    if (inLineComment) {
      token += ch;
      if (ch === '\n') {
        inLineComment = false;
        // If at top-level, treat the comment as its own entry
        if (brace === 0 && bracket === 0 && paren === 0) {
          const trimmed = token.trim();
          if (trimmed) out.push(trimmed);
          token = '';
        }
      }
      continue;
    }

    // Handle block comments
    if (!inStr && !inBlockComment && ch === '/' && next === '*') {
      inBlockComment = true;
      token += ch;
      continue;
    }
    if (inBlockComment) {
      token += ch;
      if (prev === '*' && ch === '/') inBlockComment = false;
      continue;
    }

    // Handle strings
    if (inStr) {
      token += ch;
      if (!esc && ch === inStr) {
        inStr = null;
        esc = false;
        continue;
      }
      esc = !esc && ch === '\\';
      continue;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch as any;
      token += ch;
      esc = false;
      continue;
    }

    // Track nesting
    if (ch === '{') brace++;
    else if (ch === '}') brace--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;

    if (ch === ',' && brace === 0 && bracket === 0 && paren === 0) {
      // top-level separator
      const trimmed = token.trim();
      if (trimmed) out.push(trimmed);
      token = '';
      continue;
    }

    token += ch;
  }
  const trimmed = token.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

function isOnlyComment(s: string): boolean {
  const t = s.trim();
  return t.startsWith('//') || t.startsWith('/*');
}

function matchStringProp(src: string, key: string): string | null {
  const m = new RegExp(`${key}\\s*:\\s*'([^']*)'`).exec(src);
  return m ? m[1] : null;
}

function matchNumberProp(src: string, key: string): number | null {
  const m = new RegExp(`\\b${key}\\s*:\\s*(-?\\d+)`).exec(src);
  return m ? Number(m[1]) : null;
}

function parseFloorCall(
  src: string
): { x: number; y: number; id: string; sprite?: string } | null {
  // Accept optional spread prefix and optional sprite arg
  const m =
    /(?:\.\.\.)?floor\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*\)/.exec(
      src
    );
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  const id = m[3];
  const sprite = m[4];
  return { x, y, id, sprite };
}

function parseWallCall(
  src: string
): { x: number; y: number; id: string; sprite?: string } | null {
  const m =
    /(?:\.\.\.)?wall\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*'([^']+)'(?:\s*,\s*'([^']+)')?\s*\)/.exec(
      src
    );
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  const id = m[3];
  const sprite = m[4];
  return { x, y, id, sprite };
}

function inferWallSprite(id: string): string {
  // Heuristic default; explicit sprite prop is kept when different
  return `walls/${id}.png`;
}

// Deprecated: this script targeted the TS map file and is no longer used.
