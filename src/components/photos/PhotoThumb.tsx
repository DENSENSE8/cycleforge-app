'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Image as ImageIcon } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

/** Prefetch GCS thumbnails shortly before they enter the scrollport. */
const THUMB_PREFETCH_MARGIN = '400px 0px';

/** Decoded thumbnails stay warm when list/grid view trees remount. */
const loadedPhotoUrls = new Set<string>();

/**
 * The single image primitive for every photo-library tile.
 *
 * Thumbnails use stable same-origin content URLs. Unknown images defer their
 * request until the tile is near the viewport; previously loaded images render
 * immediately when list/grid view trees remount.
 *
 * ## It does not animate (2026-08-09)
 *
 * This was a `motion.div` carrying a `layoutId` hero morph paired with
 * `PhotoViewerModal`'s main image, plus a 500ms opacity fade-in and a pulsing
 * gradient placeholder. All three are gone, and the file imports no motion at
 * all. Three reasons, in the order they matter:
 *
 *  1. **`layoutId` for list → detail is banned by house law**
 *     (`display/motion-crossfade.md`): opening the viewer is a *replace*, not a
 *     *move*, and shared-layout there produces a morphing artifact rather than
 *     continuity. The tile side was the only thing keeping the pair alive.
 *  2. **It leaked geometry into unrelated surfaces.** The morph's projected box
 *     overshot the tile's own grid cell, so the file had to raise `z-index` for
 *     the duration, `PhotoCard` had to refuse `overflow-hidden`, and the page's
 *     sheet plane had to refuse `TABLE_SURFACE_SHEET_CLASS` — three unrelated
 *     files carrying a constraint for one animation.
 *  3. **A 500ms fade on a contact sheet is 48 fades.** At library density the
 *     stagger reads as the page failing to settle, which is the opposite of what
 *     a fade is for.
 *
 * Loading is now an honest static placeholder. The other four consumers
 * (pickers, folder covers, claim attachments) never passed `heroId` and are
 * unaffected. SoT:.
 */
export function PhotoThumb({
  src,
  alt,
  ratio = 'square',
  damage = false,
  className,
}: {
  src: string;
  alt: string;
  /**
   * `square` 1:1 crop · `portrait` phone 9:16 frame, full image (object-contain) ·
   * `natural` self-sizing masonry · `fill` fills its box.
   */
  ratio?: 'square' | 'portrait' | 'natural' | 'fill';
  /** Surfaces a small damage dot — the one status worth flagging on the tile. */
  damage?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const initiallyLoaded = loadedPhotoUrls.has(src);
  const [shouldLoad, setShouldLoad] = useState(initiallyLoaded);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    initiallyLoaded ? 'loaded' : 'loading',
  );
  const cover = ratio === 'square' || ratio === 'fill';

  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldLoad) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: THUMB_PREFETCH_MARGIN, threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  useEffect(() => {
    if (loadedPhotoUrls.has(src)) {
      setShouldLoad(true);
      setStatus('loaded');
      return;
    }
    if (!shouldLoad) return;

    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      loadedPhotoUrls.add(src);
      setStatus('loaded');
      return;
    }
    setStatus('loading');
  }, [shouldLoad, src]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden bg-surface-sunken',
        ratio === 'square' ? 'aspect-square'
          : ratio === 'portrait' ? 'aspect-[9/16]'
          : ratio === 'fill' ? 'h-full w-full'
          : ratio === 'natural'
            ? status === 'loaded' ? '' : 'aspect-[4/3]'
            : status === 'loaded' ? '' : 'aspect-[4/5]',
        className,
      )}
    >
      {/* Static placeholder — the tile's own `bg-surface-sunken` at the real
          geometry. A pulsing gradient here was 48 things breathing at once on a
          contact sheet; reserving the box is the honest half of that signal and
          the only half the operator reads. */}
      {status === 'loading' ? (
        <div aria-hidden="true" className="absolute inset-0 bg-surface-sunken" />
      ) : null}

      {status === 'error' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-canvas text-text-faint">
          <ImageIcon className="h-5 w-5" />
          <span className="text-role-micro uppercase tracking-widest">Unavailable</span>
        </div>
      ) : shouldLoad ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => {
            loadedPhotoUrls.add(src);
            setStatus('loaded');
          }}
          onError={() => {
            loadedPhotoUrls.delete(src);
            setStatus('error');
          }}
          className={cn(
            ratio === 'portrait'
              ? 'h-full w-full object-contain'
              : cover
                ? 'h-full w-full object-cover'
                : 'block h-auto w-full',
            // No fade — the image replaces the placeholder on the frame it
            // decodes. Both boxes are the same size, so there is nothing to
            // smooth over.
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}

      {damage ? (
        <HoverTooltip label="Damage detected" focusable={false}>
          <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm ring-2 ring-white">
            <AlertTriangle className="h-2.5 w-2.5" />
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
