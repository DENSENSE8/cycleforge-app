'use client';

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type RefObject,
} from 'react';
import { cn } from '@/utils/_cn';

export type GridStickyXScrollbarMode = 'flex' | 'sticky';

export interface GridStickyXScrollbarProps {
  gutterRef: RefObject<HTMLDivElement | null>;
  /** Content width mirrored from the real h-scroll source (`scrollWidth`). */
  spacerWidth: number;
  /**
   * `flex` — last child of a constrained `h-full` sheet (Unbox / self-scroll).
   * `sticky` — sticks to the bottom of the nearest page scrollport (split-x /
   * ancestor Y) so tall tables do not bury the bar under rows.
   */
  mode?: GridStickyXScrollbarMode;
  className?: string;
  style?: CSSProperties;
}

const THUMB_MIN_PX = 28;

/**
 * Always-on horizontal scrollbar gutter for Workbench spreadsheets.
 *
 * Native / macOS overlay bars only paint while scrolling — triage needs a
 * persistent drag affordance. This keeps an invisible sync scroller (paired
 * with {@link useSyncedHorizontalScrollbar}) and paints a track + thumb that
 * stay visible whenever content overflows. No sunken padding strip behind it.
 */
export function GridStickyXScrollbar({
  gutterRef,
  spacerWidth,
  mode = 'flex',
  className,
  style,
}: GridStickyXScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [clientW, setClientW] = useState(0);
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  const readMetrics = useCallback(() => {
    const el = gutterRef.current;
    if (!el) return;
    setScrollLeft(el.scrollLeft);
    setClientW(el.clientWidth);
  }, [gutterRef]);

  useLayoutEffect(() => {
    const el = gutterRef.current;
    if (!el) return;
    readMetrics();
    el.addEventListener('scroll', readMetrics, { passive: true });
    const ro = new ResizeObserver(readMetrics);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', readMetrics);
      ro.disconnect();
    };
  }, [gutterRef, spacerWidth, readMetrics]);

  const maxScroll = Math.max(0, spacerWidth - clientW);
  const inset = 4;
  const trackW = Math.max(0, clientW - inset * 2);
  const thumbW =
    trackW > 0 && spacerWidth > clientW
      ? Math.max(THUMB_MIN_PX, Math.min(trackW, (clientW / spacerWidth) * trackW))
      : 0;
  const thumbLeft =
    maxScroll > 0 && thumbW > 0 && trackW > thumbW
      ? inset + (scrollLeft / maxScroll) * (trackW - thumbW)
      : inset;

  const setScroll = (next: number) => {
    const el = gutterRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(maxScroll, next));
  };

  const onThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { startX: e.clientX, startScroll: scrollLeft };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onThumbPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || trackW <= thumbW) return;
    const dx = e.clientX - drag.current.startX;
    const trackRange = trackW - thumbW;
    if (trackRange <= 0 || maxScroll <= 0) return;
    setScroll(drag.current.startScroll + (dx / trackRange) * maxScroll);
  };

  const onThumbPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Ignore presses that started on the thumb (it stops propagation).
    if (thumbW <= 0 || trackW <= 0 || maxScroll <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - inset;
    const nextLeft = x - thumbW / 2;
    const trackRange = trackW - thumbW;
    if (trackRange <= 0) return;
    setScroll((nextLeft / trackRange) * maxScroll);
  };

  return (
    <div
      data-grid-sticky-x=""
      data-testid="grid-sticky-x-scrollbar"
      className={cn(
        'relative min-w-0 w-full shrink-0 overflow-hidden overscroll-x-none',
        // Tight strip — no sunken fill (that read as empty padding).
        'h-3 border-t border-border-hairline bg-surface-card',
        mode === 'sticky' && 'sticky bottom-0 z-sticky',
        className,
      )}
      style={style}
      onPointerDown={onTrackPointerDown}
    >
      {/* Sync scroller — owns scrollLeft with the grid body; native bar hidden. */}
      <div
        ref={gutterRef as Ref<HTMLDivElement>}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-x-auto overflow-y-hidden overscroll-x-none no-scrollbar"
      >
        <div style={{ width: Math.max(spacerWidth, 1), height: 1 }} />
      </div>

      {/* Always-visible track */}
      <div
        ref={trackRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-1 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border-soft"
      />

      {/* Always-visible thumb */}
      {thumbW > 0 ? (
        <div
          role="slider"
          aria-valuemin={0}
          aria-valuemax={Math.round(maxScroll)}
          aria-valuenow={Math.round(scrollLeft)}
          aria-label="Scroll columns"
          tabIndex={0}
          className={cn(
            'absolute top-1/2 z-raised h-1.5 -translate-y-1/2 cursor-grab rounded-full',
            'bg-text-soft/55 hover:bg-text-soft/75 active:cursor-grabbing',
            'touch-none',
          )}
          style={{ width: thumbW, left: thumbLeft }}
          onPointerDown={onThumbPointerDown}
          onPointerMove={onThumbPointerMove}
          onPointerUp={onThumbPointerUp}
          onPointerCancel={onThumbPointerUp}
          onKeyDown={(e) => {
            const step = Math.max(40, clientW * 0.2);
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              setScroll(scrollLeft - step);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              setScroll(scrollLeft + step);
            } else if (e.key === 'Home') {
              e.preventDefault();
              setScroll(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              setScroll(maxScroll);
            }
          }}
        />
      ) : null}
    </div>
  );
}
