'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';

interface UseColumnOrderResult {
  /** Persisted column-key order for the table (empty = canonical defaults). */
  order: readonly string[];
  /** Commit a new column-key order (optimistic + persisted). */
  setOrder: (next: readonly string[]) => void;
  /** Clear persisted order back to the table's canonical defaults. */
  resetOrder: () => void;
}

const EMPTY: string[] = [];

/**
 * Per-staff drag-reordered column order for a shared list table, persisted to
 * `staff_preferences.tableColumns[tableId].order`. Mirrors
 * {@link useColumnWidths}' optimistic-write pattern: cache write once, PUT in
 * the background, roll back on failure — and preserve sibling `hidden` /
 * `widths` so an order write never drops other prefs.
 *
 * The consumer sanitizes on read (e.g. `sanitizeOrdersQueueColumnOrder`), so a
 * stale persisted list can never desync the rendered grid from the SoT columns.
 */
export function useColumnOrder(tableId: string): UseColumnOrderResult {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();

  const stored = prefs?.tableColumns?.[tableId]?.order ?? EMPTY;
  const orderKey = stored.join('\0');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  const order = useMemo(() => [...stored], [orderKey]);

  const writeOrder = useCallback(
    async (nextOrder: string[]) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: { ...prev.tableColumns?.[tableId], order: [...nextOrder] },
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

  const setOrder = useCallback(
    (next: readonly string[]) => void writeOrder([...next]),
    [writeOrder],
  );

  const resetOrder = useCallback(() => void writeOrder([]), [writeOrder]);

  return { order, setOrder, resetOrder };
}
