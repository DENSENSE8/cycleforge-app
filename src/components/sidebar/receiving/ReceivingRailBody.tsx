'use client';

/**
 * The receiving scan stations' Recent rail. Arrival shows the combined door
 * feed (`triageCombined`: Prioritize ∪ Unfound, one row per carton — a scanned
 * carton never leaves it); Unbox shows the cartons it opened (`unboxRecent`).
 */

import { ReceivingFeedRail } from '@/components/sidebar/receiving/ReceivingFeedRail';
import {
  isPendingScanRow,
  type ReceivingMode,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { useTriageStagingMap } from '@/components/sidebar/receiving/useTriageStagingMap';
import { TriageStagingChips } from '@/components/sidebar/receiving/TriageStagingChips';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export function ReceivingRailBody({
  mode,
  selectedLine,
}: {
  mode: Extract<ReceivingMode, 'triage' | 'receive'>;
  selectedLine: ReceivingLineRow | null;
}) {
  // Selection follows the REAL carton / line only — a scan still resolving
  // (the pending row) never highlights or pins a rail row. Unfound cartons are
  // lineless stubs (negative id) but carry receiving_id, so they still select.
  const selectedRow =
    selectedLine && !isPendingScanRow(selectedLine)
    && (selectedLine.id > 0 || selectedLine.receiving_id != null)
      ? selectedLine
      : null;
  const selectedLineId = selectedRow?.id ?? null;

  if (mode === 'triage') {
    return <ArrivalRail selectedLineId={selectedLineId} selectedRow={selectedRow} />;
  }
  return (
    <ReceivingFeedRail
      key="rail-unbox-recent"
      feed="unboxRecent"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      getRowDisabled={isPendingScanRow}
    />
  );
}

function ArrivalRail({
  selectedLineId,
  selectedRow,
}: {
  selectedLineId: number | null;
  selectedRow: ReceivingLineRow | null;
}) {
  // E10 — a carton that finished triage stays here (re-sorted, never hidden);
  // the staging map adds its "Staged" badge + shelf/lane chip.
  const stagingMap = useTriageStagingMap();
  return (
    <ReceivingFeedRail
      key="rail-triage-combined"
      feed="triageCombined"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      renderPopoverContext={(row) => (
        <TriageStagingChips ctx={row.receiving_id != null ? stagingMap.get(row.receiving_id) : undefined} />
      )}
    />
  );
}
