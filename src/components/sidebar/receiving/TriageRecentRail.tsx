'use client';

/** Triage "Prioritize" feed — cartons door-scanned and physically in but NOT yet unboxed, priority-sorted (unfound/untagged first, then… */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ReceivingFeedRail } from './ReceivingFeedRail';
import { useTriageStagingMap } from './useTriageStagingMap';
import { TriageStagingChips } from './TriageStagingChips';

export function TriageRecentRail({
  selectedLineId,
  selectedRow = null,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  /** Desktop search text from the sidebar SearchBar (filters the list). */
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  const stagingMap = useTriageStagingMap();
  return (
    <ReceivingFeedRail
      feed="scanned"
      scope="triage"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      filterText={filterText}
      includeRow={includeRow}
      renderPopoverContext={(row) => (
        <TriageStagingChips
          ctx={row.receiving_id != null ? stagingMap.get(row.receiving_id) : undefined}
        />
      )}
    />
  );
}
