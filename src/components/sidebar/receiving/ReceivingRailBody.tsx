'use client';

/**
 * Rail selector for the receiving sidebar's scrollable body. Picks the right
 * feed for the active mode:
 *   - history → none (the right-pane table is filtered via URL params instead)
 *   - triage  → fixed combined Triage feed (browse tabs live in TriageWorkspaceView)
 *   - unbox   → fixed Unboxed recent dock only (Queue / Viewed / History browse
 *               lives in UnboxWorkspaceView → ReceivingLinesTable)
 *
 * Unbox rails paint a pending `scan:` stub at submit, then reconcile to
 * `carton:{id}` on resolve. Triage uses a pre-resolve leadingRow plus prepend.
 */

import { TriageSidebarBody } from '@/components/sidebar/receiving/TriageSidebarBody';
import { ReceivingFeedRail } from '@/components/sidebar/receiving/ReceivingFeedRail';
import {
  isPendingTriageScanRow,
  type ReceivingMode,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { UnboxView } from '@/components/sidebar/receiving/useReceivingMode';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

interface ReceivingRailBodyProps {
  mode: ReceivingMode;
  /** Kept for call-site compatibility; Unbox sidebar always shows the recent dock. */
  unboxView: UnboxView;
  selectedLine: ReceivingLineRow | null;
  /** Pre-resolve triage scan stub (tracking #) for the combined Triage tab. */
  triageLeadingRow?: ReceivingLineRow | null;
  /** Live filter text for the triage Found/Unfound lists. */
  triageFilterText: string;
}

export function ReceivingRailBody({
  mode,
  unboxView: _unboxView,
  selectedLine,
  triageLeadingRow = null,
  triageFilterText,
}: ReceivingRailBodyProps) {
  const selectedLineId = selectedLine?.id ?? null;
  // Unfound cartons are lineless stubs (negative id) but still open a workspace
  // keyed on receiving_id — pass them through so the rail highlight + pin stay
  // in sync with the right pane. Pending pre-resolve stubs (`scan:…`) likewise.
  const selectedRow =
    selectedLine
    && (selectedLine.id > 0
      || selectedLine.receiving_id != null
      || isPendingTriageScanRow(selectedLine))
      ? selectedLine
      : null;

  if (mode === 'history') return null;

  if (mode === 'triage') {
    return (
      <TriageSidebarBody
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        leadingRow={triageLeadingRow}
        filterText={triageFilterText}
        // Select lives on TriageWorkspaceHeader — hide the rail pencil.
        hideEyebrow
      />
    );
  }

  // Unbox (and any other non-triage/history mode that still mounts this rail):
  // short Unboxed recent dock only — browse tabs are right-pane table.
  return (
    <ReceivingFeedRail
      key="rail-unbox-recent"
      feed="unboxRecent"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      // Select lives on UnboxWorkspaceHeader — hide the rail pencil.
      hideEyebrow
    />
  );
}
