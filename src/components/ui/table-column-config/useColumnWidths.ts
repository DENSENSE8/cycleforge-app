'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';

/** Clamp any drag-resized column to a sane px range.
 *  64px floor keeps short labels (Qty / Cond / Age / Order) readable — the old
 *  44px floor crushed headers to "C…" / "# OR…" under persisted prefs. */
export const COLUMN_WIDTH_MIN = 64;
const COLUMN_WIDTH_MAX = 720;

export function clampColumnWidth(px: number): number {
  return Math.max(COLUMN_WIDTH_MIN, Math.min(COLUMN_WIDTH_MAX, Math.round(px)));
}

interface UseColumnWidthsResult {
  /** Persisted px widths for the table, keyed by column key (empty = all default). */
  widths: Readonly<Record<string, number>>;
  /** Commit a column's width (optimistic + clamped). Call on resize-drop, not per-move. */
  setWidth: (key: string, px: number) => void;
  /** Clear one column's width back to its default track. */
  resetWidth: (key: string) => void;
  /** Clear every resized width for the table. */
  resetAll: () => void;
}

const EMPTY: Record<string, number> = {};

/**
 * Per-staff resized column widths for a shared list table, persisted to
 * `staff_preferences.tableColumns[tableId].widths` (px). Mirrors
 * {@link TableColumnConfig}'s optimistic-write pattern exactly: write the cache
 * once (instant, one render), PUT in the background, roll back on failure — and
 * preserve the sibling `hidden` set so a width write never drops hidden columns.
 *
 * The widths drive the grid through CSS custom properties (see
 * `ordersQueueColumnVars`), so a live resize drag mutates only the container var
 * (zero React re-render across rows); this hook is called only to COMMIT the
 * final width on drop / keyboard nudge / resize-to-fit. Durable + cross-device,
 * exactly like hidden columns.
 */
export function useColumnWidths(tableId: string): UseColumnWidthsResult {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();

  const stored = prefs?.tableColumns?.[tableId]?.widths ?? EMPTY;
  const widthsKey = JSON.stringify(stored);
  // Re-clamp on read so legacy prefs stored under the old 44px floor (which
  // truncated Cond / Platform / Order headers) lift to the new minimum.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const widths = useMemo(() => {
    const next: Record<string, number> = {};
    for (const [key, px] of Object.entries(stored)) {
      if (Number.isFinite(px)) next[key] = clampColumnWidth(px);
    }
    return next;
  }, [widthsKey]);

  const writeWidths = useCallback(
    async (nextWidths: Record<string, number>) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      // Shallow JSONB merge at `tableColumns`: carry the whole map forward AND
      // preserve this table's `hidden` set (TableColumnConfig owns those).
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
        queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, prev); // rollback
      }
    },
    [queryClient, tableId],
  );

  const setWidth = useCallback(
    (key: string, px: number) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const curWidths = cur.tableColumns?.[tableId]?.widths ?? {};
      void writeWidths({ ...curWidths, [key]: clampColumnWidth(px) });
    },
    [queryClient, tableId, writeWidths],
  );

  const resetWidth = useCallback(
    (key: string) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const curWidths = { ...(cur.tableColumns?.[tableId]?.widths ?? {}) };
      if (!(key in curWidths)) return;
      delete curWidths[key];
      void writeWidths(curWidths);
    },
    [queryClient, tableId, writeWidths],
  );

  const resetAll = useCallback(() => void writeWidths({}), [writeWidths]);

  return { widths, setWidth, resetWidth, resetAll };
}
