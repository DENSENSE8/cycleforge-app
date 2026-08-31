'use client';

/**
 * Per-staff LedgerGrid row fills (`tableColumns[tableId].rowFills`).
 *
 * Optimistic staff-preferences write: it patches only its own `rowFills` slot
 * and spreads the rest of `tableColumns[tableId]` through untouched, so a
 * legacy key it does not know about survives the round trip.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { TableId } from '@/lib/tables/table-columns';
import type { GridColumnHighlight } from './grid-column-display';
import {
  isPersistedGridColumnHighlight,
  normalizeGridColumnHighlight,
} from './grid-column-display';

interface GridRowFillsApi {
  /** Hex fills keyed by stringified row id. */
  fillsById: Readonly<Record<string, string>>;
  /** Apply or clear a fill for many row ids at once. */
  paintRows: (ids: readonly number[], highlight: GridColumnHighlight | 'none' | null) => void;
  /** Hex for one row, or null. */
  fillFor: (id: number) => string | null;
}

export function useGridRowFills(tableId: TableId): GridRowFillsApi {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();
  const stored = prefs?.tableColumns?.[tableId]?.rowFills;

  const fillsKey = useMemo(() => {
    if (!stored) return '';
    return Object.keys(stored)
      .sort()
      .map((k) => `${k}:${stored[k] ?? ''}`)
      .join('\0');
  }, [stored]);

  const fillsById = useMemo<Record<string, string>>(() => {
    if (!fillsKey || !stored) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(stored)) {
      const hex = normalizeGridColumnHighlight(v);
      if (hex) out[k] = hex;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [fillsKey]);

  const writeFills = useCallback(
    async (next: Record<string, string>) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(next)) {
        const hex = normalizeGridColumnHighlight(v);
        if (hex && isPersistedGridColumnHighlight(hex)) cleaned[k] = hex;
      }
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: {
          ...prev.tableColumns?.[tableId],
          rowFills: Object.keys(cleaned).length > 0 ? cleaned : undefined,
        },
      };
      const optimistic: StaffPreferences = { ...prev, tableColumns: nextTableColumns };
      queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, optimistic);
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

  const paintRows = useCallback(
    (ids: readonly number[], highlight: GridColumnHighlight | 'none' | null) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const prevMap = { ...(cur.tableColumns?.[tableId]?.rowFills ?? {}) };
      const hex = normalizeGridColumnHighlight(highlight);
      for (const id of ids) {
        const key = String(id);
        if (hex) prevMap[key] = hex;
        else delete prevMap[key];
      }
      void writeFills(prevMap);
    },
    [queryClient, tableId, writeFills],
  );

  const fillFor = useCallback(
    (id: number) => normalizeGridColumnHighlight(fillsById[String(id)]),
    [fillsById],
  );

  return { fillsById, paintRows, fillFor };
}
