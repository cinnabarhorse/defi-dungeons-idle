'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import {
  GOTCHI_MAX_COLS,
  GOTCHI_ROW_FRAME_COUNTS,
} from '../lib/gotchi-spritesheet';
import { getAppServerBaseUrl } from '../lib/server-url';
import { resolveGotchiSpritesheetUrl } from '../lib/gotchi-api';

interface GotchiPreviewProps {
  url: string; // may be empty if gotchiId is provided
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  demoAllAnimations?: boolean;
  hasPanelBackground?: boolean;
  gotchiId?: number | string; // optional: enable server resolution
  serverBaseUrl?: string;
  lazyResolve?: boolean; // default true
  onResolvedUrl?: (url: string) => void;
  onLoadStateChange?: (loaded: boolean) => void;
}

type ImageMeta = {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
};

const SIZE_MAP = {
  sm: { width: 80, height: 80 },
  md: { width: 120, height: 120 },
  lg: { width: 160, height: 160 },
} as const;

const DEATH_HOLD_MS = 500;
const DEFAULT_FRAME_SIZE = 64;
const ZOOM_FACTOR = 1.3;

export function GotchiPreview({
  url,
  size = 'md',
  className,
  demoAllAnimations = false,
  hasPanelBackground = true,
  gotchiId,
  serverBaseUrl,
  lazyResolve = true,
  onResolvedUrl,
  onLoadStateChange,
}: GotchiPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [imageMeta, setImageMeta] = useState<ImageMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string>(url || '');
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef<boolean>(false);
  const fetchAttemptRef = useRef<number>(0);
  const fetchTimerRef = useRef<number | null>(null);
  const imgAttemptRef = useRef<number>(0);
  const imgTimerRef = useRef<number | null>(null);

  const { width, height } = SIZE_MAP[size];

  // Keep local URL in sync with prop changes
  useEffect(() => {
    if (url && url !== resolvedUrl) {
      setResolvedUrl(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Resolve sprite URL from server when visible (or immediately if not lazy)
  useEffect(() => {
    if (!gotchiId) return;
    const el = rootRef.current;
    if (!el) return;

    const base = (serverBaseUrl || getAppServerBaseUrl()).trim();
    const SERVER_BASE_URL = base.length ? base.replace(/\/$/, '') : '';

    const clearFetchTimer = () => {
      if (fetchTimerRef.current) {
        window.clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = null;
      }
    };

    const scheduleFetchRetry = () => {
      if (!visibleRef.current || resolvedUrl) return;
      const attempt = fetchAttemptRef.current;
      const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
      fetchTimerRef.current = window.setTimeout(() => {
        if (!visibleRef.current || resolvedUrl) return;
        void tryResolve();
      }, delay);
    };

    const tryResolve = async (): Promise<void> => {
      if (!visibleRef.current && lazyResolve) return;
      const abs = await resolveGotchiSpritesheetUrl(
        String(gotchiId),
        SERVER_BASE_URL
      );
      if (abs && abs.length > 0) {
        setResolvedUrl(abs);
        onResolvedUrl?.(abs);
        clearFetchTimer();
      } else {
        fetchAttemptRef.current += 1;
        scheduleFetchRetry();
      }
    };

    function onVisible(entries: IntersectionObserverEntry[]) {
      for (const e of entries) {
        if (e.target !== el) continue;
        visibleRef.current = e.isIntersecting || !lazyResolve;
        if (visibleRef.current) {
          clearFetchTimer();
          void tryResolve();
        } else if (!visibleRef.current) {
          clearFetchTimer();
        }
      }
    }

    const observer = new IntersectionObserver(onVisible, {
      root: null,
      rootMargin: '200px',
      threshold: 0.01,
    });
    observer.observe(el);

    if (!lazyResolve) {
      visibleRef.current = true;
      void tryResolve();
    }

    return () => {
      clearFetchTimer();
      observer.disconnect();
    };
  }, [gotchiId, serverBaseUrl, lazyResolve, resolvedUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
  }, [width, height]);

  const clearImgTimer = () => {
    if (imgTimerRef.current) {
      window.clearTimeout(imgTimerRef.current);
      imgTimerRef.current = null;
    }
  };

  useEffect(() => {
    setLoaded(false);
    setError(null);
    onLoadStateChange?.(false);

    let canceled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (canceled) return;

      const imageWidth = img.naturalWidth || img.width;
      const imageHeight = img.naturalHeight || img.height;
      const cols = GOTCHI_MAX_COLS || 1;
      const rows = GOTCHI_ROW_FRAME_COUNTS.length || 1;

      const frameWidth =
        Math.max(1, Math.floor(imageWidth / cols)) || DEFAULT_FRAME_SIZE;
      const frameHeight =
        Math.max(1, Math.floor(imageHeight / rows)) || DEFAULT_FRAME_SIZE;

      setImageMeta({
        image: img,
        frameWidth,
        frameHeight,
      });
      setLoaded(true);
      imgAttemptRef.current = 0;
      clearImgTimer();
      onLoadStateChange?.(true);
    };

    img.onerror = () => {
      if (canceled) return;
      // Log the actual attempted URL for better diagnostics
      const attempted =
        (img as any).currentSrc || img.src || resolvedUrl || url || '(empty)';
      console.warn(
        `⚠️ Failed to load gotchi spritesheet preview from ${attempted}`
      );
      setError('Failed to load');
      setImageMeta(null);
      setLoaded(false);
      onLoadStateChange?.(false);
      // Retry image load with backoff to handle eventual consistency after generation
      const baseSrc =
        (resolvedUrl && resolvedUrl.length > 0 ? resolvedUrl : url) || '';
      if (baseSrc) {
        const attempt = imgAttemptRef.current;
        const delay = Math.min(10000, 500 * Math.pow(2, attempt));
        imgAttemptRef.current = attempt + 1;
        imgTimerRef.current = window.setTimeout(() => {
          if (canceled) return;
          setError(null);
          setLoaded(false);
          // Explicitly retry by reassigning img.src with a cache-buster so the request is reissued
          const buster = Date.now();
          const next = baseSrc.includes('?')
            ? `${baseSrc}&t=${buster}`
            : `${baseSrc}?t=${buster}`;
          try {
            img.src = next;
          } catch {}
        }, delay);
      }
    };

    const cacheBuster = Date.now();
    const src =
      (resolvedUrl && resolvedUrl.length > 0 ? resolvedUrl : url) || '';
    if (src) {
      img.src = src.includes('?')
        ? `${src}&v=${cacheBuster}`
        : `${src}?v=${cacheBuster}`;
    }

    return () => {
      canceled = true;
      img.onload = null;
      img.onerror = null;
      clearImgTimer();
    };
  }, [resolvedUrl, url]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const meta = imageMeta;
    if (!canvas || !meta) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fps = 12;
    const interval = 1000 / fps;
    const cycleOrder = demoAllAnimations
      ? GOTCHI_ROW_FRAME_COUNTS.map((_, idx) => idx)
      : [0];

    let frameIndex = 0;
    let orderIndex = 0;
    let rowIndex = cycleOrder[orderIndex] ?? 0;
    let last = 0;
    let holdUntil = 0;

    const drawFrame = (frame: number, row: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;

      // Contain-fit the sprite frame inside the 64x64 canvas (object-contain equivalent)
      const scale = Math.min(
        width / meta.frameWidth,
        height / meta.frameHeight
      );
      const destW = Math.floor(meta.frameWidth * scale * ZOOM_FACTOR);
      const destH = Math.floor(meta.frameHeight * scale * ZOOM_FACTOR);
      const destX = Math.floor((width - destW) / 2);
      const destY = Math.floor((height - destH) / 2);

      ctx.drawImage(
        meta.image,
        frame * meta.frameWidth,
        row * meta.frameHeight,
        meta.frameWidth,
        meta.frameHeight,
        destX,
        destY,
        destW,
        destH
      );
    };

    const step = (time: number) => {
      if (time < holdUntil) {
        animationRef.current = requestAnimationFrame(step);
        return;
      }

      if (time - last >= interval) {
        const rawFrameCount =
          GOTCHI_ROW_FRAME_COUNTS[rowIndex] ?? GOTCHI_MAX_COLS;
        const frameCount = Math.max(1, rawFrameCount);
        const safeFrame = Math.min(frameIndex, frameCount - 1);

        drawFrame(safeFrame, rowIndex);

        frameIndex += 1;
        if (frameIndex >= frameCount) {
          frameIndex = 0;

          if (demoAllAnimations) {
            orderIndex = (orderIndex + 1) % cycleOrder.length;
            rowIndex = cycleOrder[orderIndex];
            holdUntil = rowIndex === 5 ? time + DEATH_HOLD_MS : 0;
          }
        }

        last = time;
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [imageMeta, width, height, demoAllAnimations]);

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'rounded transition-opacity duration-150 bg-white/10',
          // hasPanelBackground ? 'bg-white/10' : 'bg-transparent',
          loaded ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated' as const,
        }}
      />
      {!loaded && !error && (
        <div
          className={cn('absolute inset-0 rounded animate-pulse bg-white/10')}
        />
      )}
    </div>
  );
}
