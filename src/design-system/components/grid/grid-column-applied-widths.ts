/**
 * Applied staff column-width prefs — which `--cf-col-*` overrides actually paint.
 *
 * Quiet-display surfaces lock geometry with `resizable: false`. Staff prefs can
 * still hold stale px widths from an earlier resizable era (e.g. Unbox Date at
 * 12rem stamp). Those overrides must not inflate locked tracks.
 */

import type { CSSProperties } from 'react';
import {
  clampColumnWidth,
  resolveColumnWidthClamp,
  type ColumnWidthBound,
} from '@/components/ui/table-column-config/useColumnWidths';
import type { ColumnType } from '@/lib/tables/table-columns';
import { isGridColumnResizable } from './grid-column-editability';
import { gridColVar } from './grid-column-geometry';
import {
  gridTrackRemToPx,
  resolveGridColumnMinTrackRem,
} from './grid-column-type-track';

type AppliedWidthColumn = {
  key: string;
  type?: ColumnType;
  resizable?: boolean;
  dateFace?: 'day' | 'stamp' | 'duration';
  minTrackRem?: number;
};

/**
 * Keep only width prefs that can still drag on this surface: the key must exist
 * on the live column model and {@link isGridColumnResizable} must be true.
 * Retired keys (e.g. Unbox `platform`) and locked tracks drop out.
 */
export function filterAppliedGridColumnWidths(
  widths: Readonly<Record<string, number>>,
  columns: readonly AppliedWidthColumn[],
): Record<string, number> {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out: Record<string, number> = {};
  for (const [key, px] of Object.entries(widths)) {
    if (!Number.isFinite(px) || px <= 0) continue;
    const col = byKey.get(key);
    if (!col) continue;
    if (!isGridColumnResizable(col)) continue;
    out[key] = px;
  }
  return out;
}

/**
 * Load-time clamp: a persisted px pref outside the live floor/ceiling (typed
 * track, staff min/max, or `fontScale`-shifted rem floor) must not paint.
 * Paint-only — does not rewrite staff prefs.
 */
export function clampPersistedGridColumnWidths(
  widths: Readonly<Record<string, number>>,
  columns: readonly AppliedWidthColumn[],
  boundsByKey: Readonly<Record<string, ColumnWidthBound>> = {},
): Record<string, number> {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const out: Record<string, number> = {};
  for (const [key, px] of Object.entries(widths)) {
    if (!Number.isFinite(px) || px <= 0) continue;
    const col = byKey.get(key);
    if (!col) {
      out[key] = px;
      continue;
    }
    const minTrackRem = resolveGridColumnMinTrackRem(col);
    const typedFloorPx = minTrackRem > 0 ? gridTrackRemToPx(minTrackRem) : undefined;
    const b = boundsByKey[key];
    const { minPx, maxPx } = resolveColumnWidthClamp({
      typedFloorPx,
      staffMin: b?.min,
      staffMax: b?.max,
    });
    out[key] = clampColumnWidth(px, minPx, maxPx);
  }
  return out;
}

/** CSS custom properties for the filtered width map. */
export function gridColumnWidthVars(
  widths: Readonly<Record<string, number>>,
): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, px] of Object.entries(widths)) {
    vars[gridColVar(key)] = `${px}px`;
  }
  return vars as CSSProperties;
}
