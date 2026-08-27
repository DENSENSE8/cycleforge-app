'use client';

/**
 * Thin sidebar binding over {@link TriageFeedBody}. The Arrival sidebar always
 * shows the combined Triage feed (Unbox keeps a fixed Unboxed rail). Browse
 * tabs (Prioritize / Unfound / Done) live in the right-pane workbench.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { TriageFeedBody } from '@/components/receiving/triage/TriageFeedBody';

export function TriageSidebarBody({
  selectedLineId,
  selectedRow,
  leadingRow = null,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  selectedRow: ReceivingLineRow | null;
  /** Pre-resolve scan stub (tracking #) pinned at the top of the Triage tab. */
  leadingRow?: ReceivingLineRow | null;
  /** Desktop search text from the sidebar SearchBar. */
  filterText?: string;
  /** Client-side facet keep-filter (priority / type / platform). */
  includeRow?: (row: ReceivingLineRow) => boolean;
  /** Hide rail title when workbench chrome owns Select. */
}) {
  return (
    <TriageFeedBody
      view="triage"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      filterText={filterText}
      includeRow={includeRow}
    />
  );
}
