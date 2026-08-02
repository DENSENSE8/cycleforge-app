'use client';

/**
 * Per-staff column display prefs (`highlight` / `cell`) for one `tableId`.
 * Sibling of {@link useGridFields} — same optimistic staff-preferences write,
 * preserves `hidden` / `shown` / `order` / `widths`.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { TableId } from '@/lib/tables/table-columns';
import type {
  GridColumnCellMode,
  GridColumnDisplayPref,
  GridColumnHighlight,
} from './grid-column-display';

interface GridColumnDisplayApi {
  /** Prefs keyed by `hideKey`. Absent keys → descriptor default (no wash, default cell). */
  displayByKey: Readonly<Record<string, GridColumnDisplayPref>>;
  setHighlight: (hideKey: string, highlight: GridColumnHighlight) => void;
  setCellMode: (hideKey: string, cell: GridColumnCellMode) => void;
  /** Drop display prefs for one key (back to defaults). */
  clearDisplay: (hideKey: string) => void;
}

export function useGridColumnDisplay(tableId: TableId): GridColumnDisplayApi {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();
  const stored = prefs?.tableColumns?.[tableId]?.display;

  const displayKey = useMemo(() => {
    if (!stored) return '';
    return Object.keys(stored)
      .sort()
      .map((k) => `${k}:${stored[k]?.highlight ?? ''}:${stored[k]?.cell ?? ''}`)
      .join('\0');
  }, [stored]);

  const displayByKey = useMemo<Record<string, GridColumnDisplayPref>>(() => {
    if (!displayKey || !stored) return {};
    const out: Record<string, GridColumnDisplayPref> = {};
    for (const [k, v] of Object.entries(stored)) {
      out[k] = { highlight: v.highlight, cell: v.cell };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content
  }, [displayKey]);

  const writeDisplay = useCallback(
    async (next: Record<string, GridColumnDisplayPref>) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      // Drop empty entries so the bag stays lean.
      const cleaned: Record<string, GridColumnDisplayPref> = {};
      for (const [k, v] of Object.entries(next)) {
        const highlight = v.highlight && v.highlight !== 'none' ? v.highlight : undefined;
        const cell = v.cell && v.cell !== 'default' ? v.cell : undefined;
        if (highlight || cell) {
          cleaned[k] = {
            ...(highlight ? { highlight } : {}),
            ...(cell ? { cell } : {}),
          };
        }
      }
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: {
          ...prev.tableColumns?.[tableId],
          display: Object.keys(cleaned).length > 0 ? cleaned : undefined,
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

  const patchKey = useCallback(
    (hideKey: string, patch: GridColumnDisplayPref) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const prevMap = { ...(cur.tableColumns?.[tableId]?.display ?? {}) };
      const merged: GridColumnDisplayPref = { ...prevMap[hideKey], ...patch };
      prevMap[hideKey] = merged;
      void writeDisplay(prevMap);
    },
    [queryClient, tableId, writeDisplay],
  );

  const setHighlight = useCallback(
    (hideKey: string, highlight: GridColumnHighlight) => {
      patchKey(hideKey, { highlight });
    },
    [patchKey],
  );

  const setCellMode = useCallback(
    (hideKey: string, cell: GridColumnCellMode) => {
      patchKey(hideKey, { cell });
    },
    [patchKey],
  );

  const clearDisplay = useCallback(
    (hideKey: string) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const prevMap = { ...(cur.tableColumns?.[tableId]?.display ?? {}) };
      delete prevMap[hideKey];
      void writeDisplay(prevMap);
    },
    [queryClient, tableId, writeDisplay],
  );

  return { displayByKey, setHighlight, setCellMode, clearDisplay };
}
