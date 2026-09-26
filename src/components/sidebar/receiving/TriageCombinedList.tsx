'use client';

/** Triage "Triage" list — the combined working feed: */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ReceivingFeedRail } from './ReceivingFeedRail';
import { useTriageStagingMap } from './useTriageStagingMap';
import { TriageStagingChips } from './TriageStagingChips';

export function TriageCombinedList({
  selectedLineId,
  selectedRow = null,
  leadingRow = null,
  isRowDisabled,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  selectedRow?: ReceivingLineRow | null;
  /** Optimistic "importing" stub pinned at the top until its real row lands. */
  leadingRow?: ReceivingLineRow | null;
  /** Suppress clicks on in-flight importing rows so the right pane stays usable. */
  isRowDisabled?: (row: ReceivingLineRow) => boolean;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  // E10 — a carton that finished triage stays in this combined list (re-sorted,
  // never hidden); this adds the "Staged" badge + a shelf/lane chip (A3),
  // mirroring the B3 Zoho-sync exception dot's side-channel annotation pattern.
  const stagingMap = useTriageStagingMap();

  return (
    <ReceivingFeedRail
      feed="triageCombined"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      getRowDisabled={isRowDisabled}
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
