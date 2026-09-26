'use client';

/** Per-staff industrial-ledger row zoom (`tableColumns[tableId].rowZoom`). */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { TableId } from '@/lib/tables/table-columns';
import { LEDGER_DEFAULT_ZOOM, isLedgerRowZoom, type LedgerRowZoom } from './outbound-orders-ledger-geometry';

export function useLedgerRowZoom(tableId: TableId): {
  zoom: LedgerRowZoom;
  setZoom: (next: LedgerRowZoom) => void;
} {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();
  const stored = prefs?.tableColumns?.[tableId]?.rowZoom;
  const zoom = isLedgerRowZoom(stored) ? stored : LEDGER_DEFAULT_ZOOM;

  const setZoom = useCallback(
    (next: LedgerRowZoom) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      if (prev.tableColumns?.[tableId]?.rowZoom === next) return;
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: { ...prev.tableColumns?.[tableId], rowZoom: next },
      };
      queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, { ...prev, tableColumns: nextTableColumns });
      void fetch('/api/staff-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableColumns: nextTableColumns }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`staff-preferences PUT ${res.status}`);
        })
        .catch(() => {
          queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, prev);
        });
    },
    [queryClient, tableId],
  );

  return { zoom, setZoom };
}
