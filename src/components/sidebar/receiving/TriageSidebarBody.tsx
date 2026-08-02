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
  hideEyebrow = false,
}: {
  selectedLineId: number | null;
  selectedRow: ReceivingLineRow | null;
  /** Pre-resolve scan stub (tracking #) pinned at the top of the Triage tab. */
  leadingRow?: ReceivingLineRow | null;
  /** Desktop search text from the sidebar SearchBar. */
  filterText?: string;
  /** Hide rail title + pencil when workbench chrome owns Select. */
  hideEyebrow?: boolean;
}) {
  return (
    <TriageFeedBody
      view="triage"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      leadingRow={leadingRow}
      filterText={filterText}
      hideEyebrow={hideEyebrow}
    />
  );
}
