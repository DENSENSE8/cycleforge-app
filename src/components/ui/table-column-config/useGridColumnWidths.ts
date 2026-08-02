'use client';

import { useCallback, useMemo, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gridColVar } from '@/design-system/components/grid/grid-column-geometry';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import { clampColumnWidth } from './useColumnWidths';

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
  /** Commit a drag-resized width (optimistic + persisted). */
  setWidth: (key: string, px: number) => void;
  /** Clear every persisted width back to the SoT tracks. */
  resetWidths: () => void;
}

const EMPTY: Record<string, number> = {};

/**
 * Per-staff drag-resized column widths for a LedgerGrid surface, persisted to
 * `staff_preferences.tableColumns[tableId].widths`.
 *
 * Mirrors {@link useColumnOrder}'s optimistic-write pattern exactly: write the
 * cache once, PUT in the background, roll back on failure — and **preserve the
 * sibling `hidden` / `shown` / `order` / `display` fields**, because the whole
 * `tableColumns` map is sent and a width write that dropped them would silently
 * reset a staffer's curated columns.
 *
 * During the drag itself nothing here runs: `ColumnResizeHandle` mutates the CSS
 * var directly so the grid reflows without a React render, and calls `setWidth`
 * once on drop. That split is why a resize feels like a spreadsheet rather than
 * like a re-render per pointer move.
 */
export function useGridColumnWidths(tableId: string | undefined): UseGridColumnWidthsResult {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();

  const stored = (tableId ? prefs?.tableColumns?.[tableId]?.widths : undefined) ?? EMPTY;
  // Keyed on CONTENT, not identity: the prefs object is a fresh literal on every
  // query settle, so an identity dep would rebuild the style object (and reflow
  // every track) on each refetch.
  const widthsKey = Object.entries(stored)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('\0');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const widths = useMemo(() => ({ ...stored }), [widthsKey]);
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
    (key: string, px: number) => void writeWidths({ ...widths, [key]: clampColumnWidth(px) }),
    [widths, writeWidths],
  );

  const resetWidths = useCallback(() => void writeWidths({}), [writeWidths]);

  return { widths, columnVars, setWidth, resetWidths };
}
