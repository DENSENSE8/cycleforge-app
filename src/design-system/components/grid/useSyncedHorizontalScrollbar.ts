'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Bidirectional `scrollLeft` sync between a real h-scroll source (table body)
 * and a visible sticky X gutter. The body keeps `no-scrollbar` so Y stays clean;
 * the gutter is the always-reachable triage drag affordance.
 *
 * Feedback loops are gated with a re-entrancy flag — setting `scrollLeft`
 * fires `scroll` on the other element in every engine we care about.
 *
 * **Measure law:** the scrollport / header *band* border boxes stay viewport-wide
 * when only `--cf-col-*` grows (row `min-width` may still be `max(100%, rem)`).
 * Observe the wide header/row under `[data-grid-col-header]`, re-run when
 * {@link contentMinWidthRem} / {@link contentMinWidthPx} change, watch the
 * `[data-cf-grid]` style attribute for live drag-resize `setProperty`, and
 * floor width from the resolved `grid-template-columns` px sum.
 */
export function useSyncedHorizontalScrollbar(
  sourceRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /**
   * Content-min rem published as `--cf-orders-grid-w`. When it changes, force a
   * remeasure — the scrollport border box does not resize, so ResizeObserver on
   * the port alone would leave `overflowX` stale.
   */
  contentMinWidthRem?: number,
  /**
   * Live content-min px (SoT rem + persisted column overrides). Same measure
   * role as rem — lifts the floor after drag-resize commits.
   */
  contentMinWidthPx?: number,
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
    let mo: MutationObserver | null = null;
    let rafOuter = 0;
    let rafInner = 0;

    const contentRow = (port: HTMLElement): HTMLElement | null => {
      // Prefer the sticky column-header ROW — it carries LEDGER_GRID_WIDTH_VAR
      // and is in-flow (unlike absolutely positioned virtual rows).
      const headerRow = port.querySelector(
        '[data-grid-col-header] [role="row"]',
      );
      if (headerRow instanceof HTMLElement) return headerRow;
      // Split-x: header band sits outside the X port — still on the surface.
      const surface = port.closest('[data-cf-grid]');
      const surfaceHeader =
        surface?.querySelector('[data-grid-col-header] [role="row"]');
      if (surfaceHeader instanceof HTMLElement) return surfaceHeader;
      const anyRow = port.querySelector('[role="row"]');
      if (anyRow instanceof HTMLElement) return anyRow;
      // Dense / DataTable: first wide child (table or content wrapper).
      const first = port.firstElementChild;
      return first instanceof HTMLElement ? first : null;
    };

    /** Sum resolved `Npx` tracks from `grid-template-columns` (live resize). */
    const templateSumPx = (row: HTMLElement): number => {
      const template = getComputedStyle(row).gridTemplateColumns;
      if (!template || template === 'none') return 0;
      let sum = 0;
      for (const part of template.split(/\s+/)) {
        if (part.endsWith('px')) {
          const n = Number.parseFloat(part);
          if (Number.isFinite(n)) sum += n;
        }
      }
      return sum;
    };

    const detach = () => {
      if (source) {
        source.removeEventListener('scroll', onSourceScroll);
      }
      if (gutter) {
        gutter.removeEventListener('scroll', onGutterScroll);
      }
      ro?.disconnect();
      ro = null;
      mo?.disconnect();
      mo = null;
      source = null;
      gutter = null;
    };

    const onSourceScroll = () => {
      // Remeasure on pan — scrollWidth can grow from CSS-var drag without a
      // border-box resize, leaving overflowX stale until the next RO tick.
      measure();
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
      const row = contentRow(source);
      const rowWidth = row
        ? Math.max(row.scrollWidth, row.offsetWidth, templateSumPx(row))
        : 0;
      const remFloor =
        contentMinWidthRem != null && typeof document !== 'undefined'
          ? contentMinWidthRem *
            Number.parseFloat(getComputedStyle(document.documentElement).fontSize || '16')
          : 0;
      const pxFloor =
        contentMinWidthPx != null && Number.isFinite(contentMinWidthPx)
          ? contentMinWidthPx
          : 0;
      const nextWidth = Math.max(
        source.scrollWidth,
        rowWidth,
        remFloor,
        pxFloor,
      );
      const nextOverflow = nextWidth > source.clientWidth + 2;
      setSpacerWidth(nextWidth);
      setOverflowX(nextOverflow);
      if (gutter && !syncing.current && gutter.scrollLeft !== source.scrollLeft) {
        syncing.current = true;
        gutter.scrollLeft = source.scrollLeft;
        syncing.current = false;
      }
    };

    const observeWide = (port: HTMLElement) => {
      if (!ro) return;
      const row = contentRow(port);
      if (row) ro.observe(row);
      // Band still useful for Y/layout changes; row catches width-var growth.
      const band =
        port.querySelector('[data-grid-col-header]')
        ?? port.closest('[data-cf-grid]')?.querySelector('[data-grid-col-header]');
      if (band instanceof Element && band !== row) ro.observe(band);
      // Live drag-resize mutates `--cf-col-*` on the surface with no React
      // commit — RO does not see scrollWidth-only growth, so watch `style`.
      const surface = port.closest('[data-cf-grid]');
      if (surface) {
        mo?.disconnect();
        mo = new MutationObserver(measure);
        mo.observe(surface, { attributes: true, attributeFilter: ['style'] });
      }
    };

    const attach = () => {
      const nextSource = sourceRef.current;
      const nextGutter = gutterRef.current;
      if (!nextSource || !nextGutter) return false;
      if (nextSource === source && nextGutter === gutter) {
        // Content-min / columns may have changed without remounting.
        ro?.disconnect();
        mo?.disconnect();
        mo = null;
        ro = new ResizeObserver(measure);
        ro.observe(nextSource);
        observeWide(nextSource);
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
      observeWide(source);
      measure();
      return true;
    };

    // Double-rAF: first paint may precede the width-var header row layout.
    if (!attach()) {
      rafOuter = requestAnimationFrame(() => {
        rafInner = requestAnimationFrame(() => {
          attach();
        });
      });
      return () => {
        cancelAnimationFrame(rafOuter);
        cancelAnimationFrame(rafInner);
        detach();
      };
    }

    rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(measure);
    });

    return () => {
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafInner);
      detach();
    };
  }, [enabled, sourceRef, contentMinWidthRem, contentMinWidthPx]);

  return { gutterRef, spacerWidth, overflowX };
}
