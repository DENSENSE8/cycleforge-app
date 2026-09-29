'use client';

/**
 * Arrival rail feed body. Queue data stays in the contextual sidebar while
 * the station stage remains scan/focus-only.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isPendingTriageScanRow } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TriageCombinedList } from '@/components/sidebar/receiving/TriageCombinedList';

export function TriageFeedBody({
  selectedLineId,
  selectedRow,
  leadingRow = null,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  selectedRow: ReceivingLineRow | null;
  /** Pre-resolve scan stub pinned at the top of the combined Arrival rail. */
  leadingRow?: ReceivingLineRow | null;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  return (
    <TriageCombinedList
      key="rail-triage-combined"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      isRowDisabled={isPendingTriageScanRow}
      filterText={filterText}
      includeRow={includeRow}
    />
  );
}
