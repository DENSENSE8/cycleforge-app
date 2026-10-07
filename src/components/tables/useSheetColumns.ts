'use client';

/**
 * A sheet's column layout the staffer shapes like Google Sheets: drag a
 * header edge to resize, double-click it to fit the widest content, pin a
 * header to freeze every column up to it. The choices persist per browser
 * (`localStorage[storageKey]`) and come back as the column MODEL — widths as
 * px-exact `minmax` tracks, `frozen` as the contiguous leading prefix the
 * table definition requires — so the header, the rows, the sticky offsets and
 * the horizontal-scroll floor all read one source. Hand `columns`,
 * `onResizeColumn` and `onFreezeColumn` to `DataTable`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';

interface SheetColumnPrefs {
  /** Column key → width in px at 100% zoom. */
  widths: Record<string, number>;
  /** Freeze every column up to and including this key; '' = none frozen; null = the model's own frozen prefix. */
  frozenThrough: string | null;
  /** The sheet's zoom, a {@link SHEET_ZOOM_STEPS} percentage. */
  zoom: number;
}

/** Zoom rungs, percent — coarse, each one tellable apart across the room. */
export const SHEET_ZOOM_STEPS = [80, 90, 100, 110, 125, 150] as const;
const DEFAULT_ZOOM = 100;

const EMPTY: SheetColumnPrefs = { widths: {}, frozenThrough: null, zoom: DEFAULT_ZOOM };
const REM_PX = 16;

function readPrefs(storageKey: string): SheetColumnPrefs {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as Partial<SheetColumnPrefs> | null;
    if (!raw || typeof raw !== 'object') return EMPTY;
    const widths: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.widths ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) widths[key] = value;
    }
    const zoom = (SHEET_ZOOM_STEPS as readonly number[]).includes(Number(raw.zoom)) ? Number(raw.zoom) : DEFAULT_ZOOM;
    return { widths, frozenThrough: typeof raw.frozenThrough === 'string' ? raw.frozenThrough : null, zoom };
  } catch {
    return EMPTY;
  }
}

export interface SheetColumns<C extends LedgerGridColumnModel> {
  /** The model with the staffer's widths and freeze applied. */
  columns: readonly C[];
  onResizeColumn: (key: string, widthPx: number) => void;
  onFreezeColumn: (key: string) => void;
  /**
   * Zoom, percent. The host sets `--cf-density: zoom / 100` on the grid: type,
   * rem tracks and density-aware padding scale together, and resized widths
   * (kept at 100%) scale with them, so columns stay proportional.
   */
  zoom: number;
  /** Set the zoom to one of {@link SHEET_ZOOM_STEPS}; any other value is ignored. */
  setZoom: (percent: number) => void;
}

export function useSheetColumns<C extends LedgerGridColumnModel>(storageKey: string, base: readonly C[]): SheetColumns<C> {
  const [prefs, setPrefs] = useState<SheetColumnPrefs>(EMPTY);
  // Read after mount: the server renders the model as declared.
  useEffect(() => setPrefs(readPrefs(storageKey)), [storageKey]);
  useEffect(() => {
    if (prefs === EMPTY) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      // Storage full or blocked: the layout still applies for this visit.
    }
  }, [prefs, storageKey]);

  const columns = useMemo(() => {
    const through = prefs.frozenThrough === null ? -1 : base.findIndex((c) => c.key === prefs.frozenThrough);
    return base.map((column, index) => {
      const flex = column.width.includes('1fr');
      const px = prefs.widths[column.key];
      const rem = px ? `${(px / REM_PX).toFixed(3)}rem` : null;
      return {
        ...column,
        width: rem ? (flex ? `minmax(${rem}, 1fr)` : `minmax(${rem}, ${rem})`) : column.width,
        // The right-pinned trailing pane (`frozenEnd`) is never left-frozen.
        frozen: (prefs.frozenThrough === null ? column.frozen : index <= through && !flex) && column.frozenEnd !== true,
      };
    });
  }, [base, prefs]);

  // A drag measures the zoomed grid; widths are kept at 100% so a zoom rescales them.
  const onResizeColumn = useCallback((key: string, widthPx: number) => {
    setPrefs((current) => ({
      ...current,
      widths: { ...current.widths, [key]: Math.round((widthPx * DEFAULT_ZOOM) / current.zoom) },
    }));
  }, []);
  const setZoom = useCallback((percent: number) => {
    if (!SHEET_ZOOM_STEPS.includes(percent as (typeof SHEET_ZOOM_STEPS)[number])) return;
    setPrefs((current) => ({ ...current, zoom: percent }));
  }, []);
  // Pinning the current edge again unfreezes every column.
  const frozenEdge = [...columns].reverse().find((c) => c.frozen)?.key ?? null;
  const onFreezeColumn = useCallback(
    (key: string) => setPrefs((current) => ({ ...current, frozenThrough: key === frozenEdge ? '' : key })),
    [frozenEdge],
  );

  return { columns, onResizeColumn, onFreezeColumn, zoom: prefs.zoom, setZoom };
}
