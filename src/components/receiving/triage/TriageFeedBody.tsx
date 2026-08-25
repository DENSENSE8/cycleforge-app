'use client';

/**
 * Shared triage feed switcher — used by the thin sidebar rail (always combined
 * Triage) and the right-pane TriageWorkspaceView (all four ?triview= tabs).
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { isPendingTriageScanRow } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TriageCombinedList } from '@/components/sidebar/receiving/TriageCombinedList';
import { TriageRecentRail } from '@/components/sidebar/receiving/TriageRecentRail';
import { TriageUnfoundList } from '@/components/sidebar/receiving/TriageUnfoundList';
import { TriageDoneList } from '@/components/sidebar/receiving/TriageDoneList';
import type { TriageWorkspaceTab } from '@/utils/triage-workspace-state';

export function TriageFeedBody({
  view,
  selectedLineId,
  selectedRow,
  leadingRow = null,
  filterText = '',
  includeRow,
}: {
  view: TriageWorkspaceTab;
  selectedLineId: number | null;
  selectedRow: ReceivingLineRow | null;
  /** Pre-resolve scan stub pinned at the top of the combined Triage tab. */
  leadingRow?: ReceivingLineRow | null;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  if (view === 'unfound') {
    return (
      <TriageUnfoundList
        key="rail-triage-unfound"
        selectedLineId={selectedLineId}
        filterText={filterText}
        includeRow={includeRow}
      />
    );
  }
  if (view === 'done') {
    return (
      <TriageDoneList
        key="rail-triage-done"
        selectedLineId={selectedLineId}
        filterText={filterText}
        includeRow={includeRow}
      />
    );
  }
  if (view === 'found') {
    return (
      <TriageRecentRail
        key="rail-triage-prioritize"
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        filterText={filterText}
        includeRow={includeRow}
      />
    );
  }
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
