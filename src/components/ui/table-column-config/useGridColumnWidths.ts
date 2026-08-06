'use client';

import { useCallback, useMemo, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gridColVar } from '@/design-system/components/grid/grid-column-geometry';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import {
  clampColumnWidth,
  resolveColumnWidthClamp,
  type ColumnWidthBound,
} from './useColumnWidths';

interface UseGridColumnWidthsResult {
  /** Persisted px width per column key (empty = the SoT's declared tracks). */
  widths: Readonly<Record<string, number>>;
  /**
   * `--cf-col-*` custom properties for the grid surface. Pass to `LedgerGrid`'s
   * `columnVars`: header, rows, group summaries and the frozen pane's
   * sticky-left `calc()` all read the same vars, so one style object keeps the
   * three in sync by construction.
   */
  columnVars: CSSProperties;
  /**
   * Commit a drag-resized / panel width (optimistic + persisted).
   * Clamps with staff `widthBounds` for the key; pass `typedFloorPx` when the
   * caller knows the column's typed track floor.
   */
  setWidth: (key: string, px: number, opts?: { typedFloorPx?: number }) => void;
  /** Drop one column's persisted width (back to SoT track). */
  clearWidth: (key: string) => void;
  /** Clear every persisted width back to the SoT tracks. */
  resetWidths: () => void;
}

const EMPTY: Record<string, number> = {};
const EMPTY_BOUNDS: Record<string, ColumnWidthBound> = {};

/**
 * Per-staff drag-resized column widths for a LedgerGrid surface, persisted to
 * `staff_preferences.tableColumns[tableId].widths`.
 *
 * Optimistic-write pattern: write the cache once, PUT in the background, roll
 * back on failure — and **preserve the sibling `hidden` / `shown` / `order` /
 * `display` / `widthBounds` fields**, because the whole `tableColumns` map is
 * sent and a width write that dropped them would silently reset a staffer's
 * curated columns.
 *
 * During the drag itself nothing here runs: `ColumnResizeHandle` mutates the CSS
 * var directly so the grid reflows without a React render, and calls `setWidth`
 * once on drop. That split is why a resize feels like a spreadsheet rather than
 * like a re-render per pointer move.
 *
 * A persisted px pref narrower/wider than the current effective clamp (typed
 * floor, staff min/max, or `fontScale`-shifted rem floor) is clamped on LOAD
 * by the surface before painting `--cf-col-*` — see
 * {@link clampPersistedGridColumnWidths}.
 */
export function useGridColumnWidths(tableId: string | undefined): UseGridColumnWidthsResult {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();

  const stored = (tableId ? prefs?.tableColumns?.[tableId]?.widths : undefined) ?? EMPTY;
  const storedBounds =
    (tableId ? prefs?.tableColumns?.[tableId]?.widthBounds : undefined) ?? EMPTY_BOUNDS;
  // Keyed on CONTENT, not identity: the prefs object is a fresh literal on every
  // query settle, so an identity dep would rebuild the style object (and reflow
  // every track) on each refetch.
  const widthsKey = Object.entries(stored)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('\0');
  const boundsKey = Object.entries(storedBounds)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v?.min ?? ''}:${v?.max ?? ''}`)
    .join('\0');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const widths = useMemo(() => ({ ...stored }), [widthsKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const boundsByKey = useMemo(() => ({ ...storedBounds }), [boundsKey]);
  const columnVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, px] of Object.entries(widths)) {
      if (Number.isFinite(px)) vars[gridColVar(key)] = `${px}px`;
    }
    return vars as CSSProperties;
  }, [widths]);

  const writeWidths = useCallback(
    async (nextWidths: Record<string, number>) => {
      if (!tableId) return;
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: { ...prev.tableColumns?.[tableId], widths: nextWidths },
      };
      const next: StaffPreferences = { ...prev, tableColumns: nextTableColumns };
      queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, next);
      try {
        const res = await fetch('/api/staff-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableColumns: nextTableColumns }),
        });
        if (!res.ok) throw new Error(`staff-preferences PUT ${res.status}`);
        await res.json().catch(() => null);
      } catch {
        queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, prev);
      }
    },
    [queryClient, tableId],
  );

  const setWidth = useCallback(
    (key: string, px: number, opts?: { typedFloorPx?: number }) => {
      const b = boundsByKey[key];
      const { minPx, maxPx } = resolveColumnWidthClamp({
        typedFloorPx: opts?.typedFloorPx,
        staffMin: b?.min,
        staffMax: b?.max,
      });
      void writeWidths({ ...widths, [key]: clampColumnWidth(px, minPx, maxPx) });
    },
    [widths, writeWidths, boundsByKey],
  );

  const clearWidth = useCallback(
    (key: string) => {
      if (!(key in widths)) return;
      const next = { ...widths };
      delete next[key];
      void writeWidths(next);
    },
    [widths, writeWidths],
  );

  const resetWidths = useCallback(() => void writeWidths({}), [writeWidths]);

  return { widths, columnVars, setWidth, clearWidth, resetWidths };
}
