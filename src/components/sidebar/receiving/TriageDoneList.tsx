'use client';

/** Triage "Done" list — cartons already staged + saved for unbox (`receiving.triage_complete = true`, §3.1/E10). */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ReceivingFeedRail } from './ReceivingFeedRail';
import { useTriageStagingMap } from './useTriageStagingMap';
import { TriageStagingChips } from './TriageStagingChips';

export function TriageDoneList({
  selectedLineId,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  const stagingMap = useTriageStagingMap();
  return (
    <ReceivingFeedRail
      feed="triageDone"
      selectedLineId={selectedLineId}
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
