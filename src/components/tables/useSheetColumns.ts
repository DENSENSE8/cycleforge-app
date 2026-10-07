'use client';

/**
 * A sheet's column layout the staffer shapes like Google Sheets: drag a
 * header edge to resize, double-click it to fit the widest content, drag a
 * header onto another to move the column there, pin a header to freeze every
 * column up to it. The choices persist per browser
 * (`localStorage[storageKey]`) and come back as the column MODEL — in the
 * staffer's order, widths as px-exact `minmax` tracks, `frozen` as the
 * contiguous leading prefix the table definition requires — so the header,
 * the rows, the sticky offsets and the horizontal-scroll floor all read one
 * source. Hand `columns`, `onResizeColumn`, `onReorderColumn` and
 * `onFreezeColumn` to `DataTable`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';

interface SheetColumnPrefs {
  /** Column key → width in px at 100% zoom. */
  widths: Record<string, number>;
  /** The staffer's column order (keys); [] = the model's own. A key the model lacks is skipped. */
  order: string[];
  /** Freeze every column up to and including this key; '' = none frozen; null = the model's own frozen prefix. */
  frozenThrough: string | null;
  /** The sheet's zoom, a {@link SHEET_ZOOM_STEPS} percentage. */
  zoom: number;
}

/** Zoom rungs, percent — coarse, each one tellable apart across the room. */
export const SHEET_ZOOM_STEPS = [80, 90, 100, 110, 125, 150] as const;
const DEFAULT_ZOOM = 100;

const EMPTY: SheetColumnPrefs = { widths: {}, order: [], frozenThrough: null, zoom: DEFAULT_ZOOM };
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
    const order = Array.isArray(raw.order) ? raw.order.filter((key): key is string => typeof key === 'string') : [];
    return { widths, order, frozenThrough: typeof raw.frozenThrough === 'string' ? raw.frozenThrough : null, zoom };
  } catch {
    return EMPTY;
  }
}

/** A slack-absorbing track (`1fr`) — never moved, last before the trailing pane. */
const isFill = (column: LedgerGridColumnModel): boolean => column.width.includes('1fr');
/** Never moved by the staffer's order: the fill tracks and the right-pinned trailing pane (`frozenEnd`). */
const isFixed = (column: LedgerGridColumnModel): boolean => isFill(column) || column.frozenEnd === true;

/**
 * `base` in the staffer's `order`: the keys it names first, in that order;
 * a column it does not name (newly mounted) right after the column that
 * precedes it in the model; fill tracks, then the trailing pane, last.
 */
export function orderSheetColumns<C extends LedgerGridColumnModel>(base: readonly C[], order: readonly string[]): C[] {
  const byKey = new Map(base.map((column) => [column.key, column]));
  const placed: C[] = [];
  for (const key of order) {
    const column = byKey.get(key);
    if (column && !isFixed(column) && !placed.includes(column)) placed.push(column);
  }
  base.forEach((column, index) => {
    if (isFixed(column) || placed.includes(column)) return;
    // Right after the nearest model predecessor already placed; none = first.
    let before = -1;
    for (let at = index - 1; at >= 0 && before < 0; at -= 1) before = placed.indexOf(base[at]!);
    placed.splice(before + 1, 0, column);
  });
  return [...placed, ...base.filter(isFill), ...base.filter((column) => column.frozenEnd === true && !isFill(column))];
}

/** `keys` with `drag` moved onto `drop`'s place — after it moving right, before it moving left. */
export function moveSheetColumn(keys: readonly string[], drag: string, drop: string): string[] {
  const from = keys.indexOf(drag);
  const to = keys.indexOf(drop);
  if (from < 0 || to < 0 || from === to) return [...keys];
  const next = keys.filter((key) => key !== drag);
  const at = next.indexOf(drop);
  next.splice(from < to ? at + 1 : at, 0, drag);
  return next;
}

export interface SheetColumns<C extends LedgerGridColumnModel> {
  /** The model with the staffer's widths and freeze applied. */
  columns: readonly C[];
  onResizeColumn: (key: string, widthPx: number) => void;
  /** Move the dragged column onto the dropped-on column's place. */
  onReorderColumn: (dragKey: string, dropKey: string) => void;
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
    const ordered = orderSheetColumns(base, prefs.order);
    // The frozen run stays a leading prefix: the staffer's pin, else as many columns as the model freezes.
    const through =
      prefs.frozenThrough === null
        ? base.filter((column) => column.frozen && !isFill(column)).length - 1
        : ordered.findIndex((c) => c.key === prefs.frozenThrough);
    return ordered.map((column, index) => {
      const flex = isFill(column);
      const px = prefs.widths[column.key];
      const rem = px ? `${(px / REM_PX).toFixed(3)}rem` : null;
      return {
        ...column,
        width: rem ? (flex ? `minmax(${rem}, 1fr)` : `minmax(${rem}, ${rem})`) : column.width,
        frozen: index <= through && !flex && column.frozenEnd !== true,
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
  const onReorderColumn = useCallback(
    (dragKey: string, dropKey: string) =>
      setPrefs((current) => {
        const mounted = orderSheetColumns(base, current.order).map((column) => column.key);
        const moved = moveSheetColumn(mounted, dragKey, dropKey);
        // Keys this list does not mount right now keep their place in the remembered order.
        return { ...current, order: [...moved, ...current.order.filter((key) => !mounted.includes(key))] };
      }),
    [base],
  );
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

  return { columns, onResizeColumn, onReorderColumn, onFreezeColumn, zoom: prefs.zoom, setZoom };
}
