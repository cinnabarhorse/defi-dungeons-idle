export interface StripAnimationMeta {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  orientation: 'horizontal' | 'vertical';
  fps: number;
  spacing?: number; // Spacing between frames
  margin?: number; // Margin around sheet
}

export function inferStripMetaFromImage(
  image: {
    naturalWidth: number;
    naturalHeight: number;
    width?: number;
    height?: number;
  },
  fps: number = 8
): StripAnimationMeta {
  const w = Number(image.naturalWidth || (image as any).width || 0);
  const h = Number(image.naturalHeight || (image as any).height || 0);
  return inferStripMetaFromSize(w, h, fps);
}

export function inferStripMetaFromSize(
  width: number,
  height: number,
  fps: number = 8
): StripAnimationMeta {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  const orientation: 'horizontal' | 'vertical' =
    w >= h ? 'horizontal' : 'vertical';

  // Prefer exact divisors near the width/height ratio; avoid assuming square frames
  const primary = orientation === 'horizontal' ? w : h;
  const secondary = orientation === 'horizontal' ? h : w;
  const approxFrames = Math.max(
    1,
    Math.round((orientation === 'horizontal' ? w / h : h / w) || 1)
  );
  const maxCandidates = 24;

  // 1) Consider only exact divisors within range (2..maxCandidates)
  const exactDivisors: number[] = [];
  for (let n = 2; n <= Math.min(maxCandidates, primary); n++) {
    if (primary % n === 0) exactDivisors.push(n);
  }

  let chosen = 1;
  if (exactDivisors.length > 0) {
    // Pick the divisor closest to approxFrames; tie-breaker prefers larger n
    exactDivisors.sort((a, b) => {
      const da = Math.abs(a - approxFrames);
      const db = Math.abs(b - approxFrames);
      if (da !== db) return da - db;
      return b - a;
    });
    chosen = exactDivisors[0];
  } else {
    // 2) Fallback: pick n in range that minimizes remainder, then closeness
    let bestScore = Number.POSITIVE_INFINITY;
    for (let n = 2; n <= maxCandidates; n++) {
      const remainder = primary % n;
      const remainderPenalty = remainder / primary; // 0 for perfect tiling
      const closenessPenalty = Math.abs(n - approxFrames) / maxCandidates;
      const score = remainderPenalty * 10 + closenessPenalty; // strongly prefer clean tiling
      if (score < bestScore) {
        bestScore = score;
        chosen = n;
      }
    }
  }

  const frameW =
    orientation === 'horizontal'
      ? Math.max(1, Math.floor(primary / chosen))
      : secondary;
  const frameH =
    orientation === 'horizontal'
      ? secondary
      : Math.max(1, Math.floor(primary / chosen));

  return {
    frameWidth: frameW,
    frameHeight: frameH,
    frameCount: chosen,
    orientation,
    fps,
  };
}

export function applyAnimationOverrides(
  base: StripAnimationMeta,
  overrides?: Partial<StripAnimationMeta>
): StripAnimationMeta {
  if (!overrides) return base;
  return {
    frameWidth: overrides.frameWidth ?? base.frameWidth,
    frameHeight: overrides.frameHeight ?? base.frameHeight,
    frameCount: overrides.frameCount ?? base.frameCount,
    orientation: overrides.orientation ?? base.orientation,
    fps: overrides.fps ?? base.fps,
    spacing: overrides.spacing ?? base.spacing,
    margin: overrides.margin ?? base.margin,
  };
}

export function computeFrameIndex(
  meta: StripAnimationMeta,
  nowMs: number
): number {
  const frameDuration = 1000 / Math.max(1, meta.fps || 8);
  return Math.floor(nowMs / frameDuration) % Math.max(1, meta.frameCount);
}

export function getFrameSourceRect(
  meta: StripAnimationMeta,
  frameIndex: number
): { sx: number; sy: number; sw: number; sh: number } {
  const index = Math.max(
    0,
    Math.min(meta.frameCount - 1, Math.floor(frameIndex))
  );
  const spacing = meta.spacing || 0;
  const margin = meta.margin || 0;

  const sx =
    meta.orientation === 'horizontal'
      ? margin + index * (meta.frameWidth + spacing)
      : margin;
  const sy =
    meta.orientation === 'vertical'
      ? margin + index * (meta.frameHeight + spacing)
      : margin;
  return { sx, sy, sw: meta.frameWidth, sh: meta.frameHeight };
}

export function drawAnimatedFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  meta: StripAnimationMeta,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  nowMs: number,
  overlap: number = 0
) {
  const frame = computeFrameIndex(meta, nowMs);
  const { sx, sy, sw, sh } = getFrameSourceRect(meta, frame);
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    dx - overlap,
    dy - overlap,
    dw + overlap * 2,
    dh + overlap * 2
  );
}
