'use client';

/**
 * The receiving selection as a triage face port — one adapter for every
 * Inbound card list (On the way, History). The store stays the host's
 * (`useReceivingRowSelection`, scope `receiving`); the face only toggles it,
 * select-alls through the bus, and publishes the ids on screen so "all" means
 * the visible page.
 */

import { useMemo } from 'react';
import type { TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { emitToggleAll } from '@/lib/selection/table-selection';
import { clearSlotTableVisibleIds, publishSlotTableVisibleIds } from '@/lib/tables/slot-table-visible';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export function useReceivingSelectionPort(
  selectedIds: ReadonlySet<number>,
  onToggleRow: (row: ReceivingLineRow) => void,
  rows: readonly ReceivingLineRow[],
): TriageSelectionPort<ReceivingLineRow> {
  return useMemo(
    () => ({
      ids: selectedIds,
      toggle: (row) => onToggleRow(row),
      toggleGroup: (ids, on) => {
        const wanted = new Set(ids);
        for (const row of rows) if (wanted.has(row.id) && selectedIds.has(row.id) !== on) onToggleRow(row);
      },
      setAll: (on) => emitToggleAll(RECEIVING_SELECTION_SCOPE, on ? 'all' : 'none'),
      publishVisible: (ids) => {
        publishSlotTableVisibleIds(RECEIVING_SELECTION_SCOPE, ids);
        return () => clearSlotTableVisibleIds(RECEIVING_SELECTION_SCOPE);
      },
    }),
    [selectedIds, onToggleRow, rows],
  );
}
