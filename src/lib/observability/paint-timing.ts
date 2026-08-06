/**
 * Paint-timing helpers — User Timing marks + web-vitals for dev HUD and
 * optional Speed Insights custom metrics. Safe to call from any client surface;
 * no-ops when `window.performance` is unavailable.
 *
 * Mark vocabulary follows Tier-1 paint content order (P0–P3):
 * `{route}:{chrome|primary|context|trailing}`. Legacy Unbox marks
 * (`unbox:kpi` · `unbox:table` · …) remain accepted aliases.
 */

import { useEffect } from 'react';
import {
  PAINT_PRIORITY_ORDER,
  paintMarkId,
  type PaintPriority,
} from './tier1-paint-order';

/** Canonical P0–P3 marks for every registered Tier-1 route. */
type CanonicalPaintSurface = `${string}:${PaintPriority}`;

/**
 * Legacy Unbox surface marks — still stamped by existing call sites; HUD maps
 * them onto the canonical ladder.
 */
export type LegacyUnboxPaintSurface =
  | 'unbox:chrome'
  | 'unbox:kpi'
  | 'unbox:table'
  | 'unbox:sidebar-rail'
  | 'unbox:workspace';

export type PaintSurface = CanonicalPaintSurface | LegacyUnboxPaintSurface | (string & {});

const MARK_PREFIX = 'cf-paint:';

/** Map legacy Unbox marks → paint priority for order checks. */
const LEGACY_PAINT_PRIORITY: Readonly<Record<LegacyUnboxPaintSurface, PaintPriority>> = {
  'unbox:chrome': 'chrome',
  'unbox:kpi': 'chrome',
  'unbox:table': 'primary',
  'unbox:sidebar-rail': 'context',
  'unbox:workspace': 'primary',
};

function paintPriorityOf(surface: string): PaintPriority | null {
  const legacy = LEGACY_PAINT_PRIORITY[surface as LegacyUnboxPaintSurface];
  if (legacy) return legacy;
  const colon = surface.lastIndexOf(':');
  if (colon < 0) return null;
  const leaf = surface.slice(colon + 1) as PaintPriority;
  return (PAINT_PRIORITY_ORDER as readonly string[]).includes(leaf) ? leaf : null;
}

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
  priority: PaintPriority | null;
}

/** Read all Cycle Forge paint marks for the current navigation. */
export function readPaintMarks(): PaintMarkEntry[] {
  if (typeof window === 'undefined' || !window.performance?.getEntriesByType) return [];
  return window.performance
    .getEntriesByType('mark')
    .filter((e) => e.name.startsWith(MARK_PREFIX))
    .map((e) => {
      const surface = e.name.slice(MARK_PREFIX.length) as PaintSurface;
      return {
        surface,
        at: e.startTime,
        priority: paintPriorityOf(surface),
      };
    })
    .sort((a, b) => a.at - b.at);
}

/**
 * Dev assertion: among marks that carry a known priority, timestamps must be
 * non-decreasing along {@link PAINT_PRIORITY_ORDER}. Returns offender labels.
 */
export function paintOrderViolations(marks: PaintMarkEntry[] = readPaintMarks()): string[] {
  const byPriority = new Map<PaintPriority, number>();
  for (const m of marks) {
    if (!m.priority) continue;
    const prev = byPriority.get(m.priority);
    if (prev == null || m.at < prev) byPriority.set(m.priority, m.at);
  }
  const offenders: string[] = [];
  let lastAt = -Infinity;
  let lastPri: PaintPriority | null = null;
  for (const pri of PAINT_PRIORITY_ORDER) {
    const at = byPriority.get(pri);
    if (at == null) continue;
    if (at + 0.5 < lastAt && lastPri) {
      offenders.push(`${lastPri}@${Math.round(lastAt)} → ${pri}@${Math.round(at)}`);
    }
    lastAt = at;
    lastPri = pri;
  }
  return offenders;
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

/** Canonical mark id helper for call sites that stamp by priority. */
export function markTier1Priority(routeMark: string, priority: PaintPriority): void {
  markSurfacePainted(paintMarkId(routeMark, priority));
}
