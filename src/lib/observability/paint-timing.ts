/**
 * Paint-timing helpers — User Timing marks + web-vitals for dev HUD and
 * optional Speed Insights custom metrics. Safe to call from any client surface;
 * no-ops when `window.performance` is unavailable.
 */

import { useEffect } from 'react';

export type PaintSurface =
  | 'unbox:chrome'
  | 'unbox:kpi'
  | 'unbox:table'
  | 'unbox:sidebar-rail'
  | 'unbox:workspace';

const MARK_PREFIX = 'cf-paint:';

/** Stamp a one-shot paint milestone (deduped per surface per navigation). */
export function markSurfacePainted(surface: PaintSurface): void {
  if (typeof window === 'undefined' || !window.performance?.mark) return;
  const markName = `${MARK_PREFIX}${surface}`;
  const entries = window.performance.getEntriesByName(markName, 'mark');
  if (entries.length > 0) return;
  window.performance.mark(markName);
  window.dispatchEvent(
    new CustomEvent('cf-paint-mark', { detail: { surface, at: performance.now() } }),
  );
}

export interface PaintMarkEntry {
  surface: PaintSurface;
  /** ms since timeOrigin */
  at: number;
}

/** Read all Cycle Forge paint marks for the current navigation. */
export function readPaintMarks(): PaintMarkEntry[] {
  if (typeof window === 'undefined' || !window.performance?.getEntriesByType) return [];
  return window.performance
    .getEntriesByType('mark')
    .filter((e) => e.name.startsWith(MARK_PREFIX))
    .map((e) => ({
      surface: e.name.slice(MARK_PREFIX.length) as PaintSurface,
      at: e.startTime,
    }))
    .sort((a, b) => a.at - b.at);
}

export function isPaintTimingHudEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAINT_TIMING_HUD === 'true';
}

/** Stamp a paint mark once `ready` flips true (e.g. query settled, rows rendered). */
export function useSurfacePaintMark(surface: PaintSurface, ready: boolean): void {
  useEffect(() => {
    if (ready) markSurfacePainted(surface);
  }, [surface, ready]);
}
