'use client';

/**
 * Per-staff column min/max resize clamps for one `tableId`.
 * Sibling of {@link useGridColumnWidths} — same optimistic staff-preferences
 * write, preserves `hidden` / `shown` / `order` / `widths` / `display`.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import {
  COLUMN_WIDTH_ABSOLUTE_MAX,
  COLUMN_WIDTH_MIN,
  type ColumnWidthBound,
} from './useColumnWidths';

const EMPTY: Record<string, ColumnWidthBound> = {};

type ColumnWidthBoundPatch = {
  min?: number | null;
  max?: number | null;
};

interface UseGridColumnWidthBoundsResult {
  /** Persisted min/max px per column key (empty = house defaults). */
  boundsByKey: Readonly<Record<string, ColumnWidthBound>>;
  /**
   * Set or patch one column's bounds (optimistic + persisted).
   * Pass `null` for a field to clear it back to the house default.
   */
  setBound: (key: string, bound: ColumnWidthBoundPatch) => void;
  /** Drop one column's bounds (back to house defaults). */
  clearBounds: (key: string) => void;
  /** Clear every persisted width bound for this table. */
  resetBounds: () => void;
}

function sanitizeBound(bound: ColumnWidthBound): ColumnWidthBound | null {
  const out: ColumnWidthBound = {};
  if (bound.min != null && Number.isFinite(bound.min)) {
    out.min = Math.max(
      COLUMN_WIDTH_MIN,
      Math.min(COLUMN_WIDTH_ABSOLUTE_MAX, Math.round(bound.min)),
    );
  }
  if (bound.max != null && Number.isFinite(bound.max)) {
    out.max = Math.max(
      COLUMN_WIDTH_MIN,
      Math.min(COLUMN_WIDTH_ABSOLUTE_MAX, Math.round(bound.max)),
    );
  }
  if (out.min != null && out.max != null && out.min > out.max) {
    // Keep the write coherent — raise max to min.
    out.max = out.min;
  }
  return out.min != null || out.max != null ? out : null;
}

/**
 * Per-staff min/max column clamps, persisted to
 * `staff_preferences.tableColumns[tableId].widthBounds`.
 */
export function useGridColumnWidthBounds(
  tableId: string | undefined,
): UseGridColumnWidthBoundsResult {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();

  const stored =
    (tableId ? prefs?.tableColumns?.[tableId]?.widthBounds : undefined) ?? EMPTY;
  const boundsKey = Object.entries(stored)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v?.min ?? ''}:${v?.max ?? ''}`)
    .join('\0');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const boundsByKey = useMemo(() => ({ ...stored }), [boundsKey]);

  const writeBounds = useCallback(
    async (nextBounds: Record<string, ColumnWidthBound>) => {
      if (!tableId) return;
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      // Drop empty entries so the bag stays lean.
      const cleaned: Record<string, ColumnWidthBound> = {};
      for (const [k, v] of Object.entries(nextBounds)) {
        const sanitized = sanitizeBound(v);
        if (sanitized) cleaned[k] = sanitized;
      }
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: {
          ...prev.tableColumns?.[tableId],
          widthBounds: Object.keys(cleaned).length > 0 ? cleaned : undefined,
        },
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

  const setBound = useCallback(
    (key: string, bound: ColumnWidthBoundPatch) => {
      const prev = boundsByKey[key] ?? {};
      const merged: ColumnWidthBound = { ...prev };
      if ('min' in bound) {
        if (bound.min == null) delete merged.min;
        else merged.min = bound.min;
      }
      if ('max' in bound) {
        if (bound.max == null) delete merged.max;
        else merged.max = bound.max;
      }
      const next = { ...boundsByKey };
      const sanitized = sanitizeBound(merged);
      if (sanitized) next[key] = sanitized;
      else delete next[key];
      void writeBounds(next);
    },
    [boundsByKey, writeBounds],
  );

  const clearBounds = useCallback(
    (key: string) => {
      if (!(key in boundsByKey)) return;
      const next = { ...boundsByKey };
      delete next[key];
      void writeBounds(next);
    },
    [boundsByKey, writeBounds],
  );

  const resetBounds = useCallback(() => void writeBounds({}), [writeBounds]);

  return { boundsByKey, setBound, clearBounds, resetBounds };
}
