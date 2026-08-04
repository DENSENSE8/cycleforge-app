'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Bidirectional `scrollLeft` sync between a real h-scroll source (table body)
 * and a visible sticky X gutter. The body keeps `no-scrollbar` so Y stays clean;
 * the gutter is the always-reachable triage drag affordance.
 *
 * Feedback loops are gated with a re-entrancy flag — setting `scrollLeft`
 * fires `scroll` on the other element in every engine we care about.
 */
export function useSyncedHorizontalScrollbar(
  sourceRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): {
  gutterRef: RefObject<HTMLDivElement | null>;
  spacerWidth: number;
  /** True when content is wider than the source port (gutter should render). */
  overflowX: boolean;
} {
  const gutterRef = useRef<HTMLDivElement>(null);
  const [spacerWidth, setSpacerWidth] = useState(0);
  const [overflowX, setOverflowX] = useState(false);
  const syncing = useRef(false);

  useLayoutEffect(() => {
    if (!enabled) {
      setSpacerWidth(0);
      setOverflowX(false);
      return;
    }

    let source: HTMLElement | null = null;
    let gutter: HTMLDivElement | null = null;
    let ro: ResizeObserver | null = null;

    const detach = () => {
      if (source) {
        source.removeEventListener('scroll', onSourceScroll);
      }
      if (gutter) {
        gutter.removeEventListener('scroll', onGutterScroll);
      }
      ro?.disconnect();
      ro = null;
      source = null;
      gutter = null;
    };

    const onSourceScroll = () => {
      if (!gutter || syncing.current) return;
      syncing.current = true;
      gutter.scrollLeft = source!.scrollLeft;
      syncing.current = false;
    };

    const onGutterScroll = () => {
      if (!source || syncing.current) return;
      syncing.current = true;
      source.scrollLeft = gutter!.scrollLeft;
      syncing.current = false;
    };

    const measure = () => {
      if (!source) return;
      const nextWidth = source.scrollWidth;
      const nextOverflow = nextWidth > source.clientWidth + 2;
      setSpacerWidth(nextWidth);
      setOverflowX(nextOverflow);
      if (gutter && !syncing.current && gutter.scrollLeft !== source.scrollLeft) {
        syncing.current = true;
        gutter.scrollLeft = source.scrollLeft;
        syncing.current = false;
      }
    };

    const attach = () => {
      const nextSource = sourceRef.current;
      const nextGutter = gutterRef.current;
      if (!nextSource || !nextGutter) return false;
      if (nextSource === source && nextGutter === gutter) {
        measure();
        return true;
      }
      detach();
      source = nextSource;
      gutter = nextGutter;
      source.addEventListener('scroll', onSourceScroll, { passive: true });
      gutter.addEventListener('scroll', onGutterScroll, { passive: true });
      ro = new ResizeObserver(measure);
      ro.observe(source);
      if (source.firstElementChild instanceof Element) {
        ro.observe(source.firstElementChild);
      }
      measure();
      return true;
    };

    // Source / gutter may mount a frame after enable flips (empty → rows).
    if (!attach()) {
      const raf = requestAnimationFrame(() => {
        attach();
      });
      return () => {
        cancelAnimationFrame(raf);
        detach();
      };
    }

    return detach;
  }, [enabled, sourceRef]);

  return { gutterRef, spacerWidth, overflowX };
}
