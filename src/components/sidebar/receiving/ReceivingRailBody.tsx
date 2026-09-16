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
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

interface ReceivingRailBodyProps {
  mode: ReceivingMode;
  selectedLine: ReceivingLineRow | null;
  /** Pre-resolve triage scan stub (tracking #) for the combined Triage tab. */
  triageLeadingRow?: ReceivingLineRow | null;
  /** Live filter text for the triage Found/Unfound lists. */
  triageFilterText: string;
  /** Facet keep-filter for the Triage combined dock. */
  triageIncludeRow?: (row: ReceivingLineRow) => boolean;
  /** Live filter text for the Unboxed recent dock (`feed=unboxRecent`). */
  unboxFilterText?: string;
  /** Facet keep-filter for the Unboxed recent dock. */
  unboxIncludeRow?: (row: ReceivingLineRow) => boolean;
}

export function ReceivingRailBody({
  mode,
  selectedLine,
  triageLeadingRow = null,
  triageFilterText,
  triageIncludeRow,
  unboxFilterText = '',
  unboxIncludeRow,
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
    // Bulk dismiss enters via the row ⋮ menu's Select verb, matching Unbox rail chrome.
    // Right-pane table left-gutter owns multi-select, not rail dismiss.
    return (
      <TriageSidebarBody
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        leadingRow={triageLeadingRow}
        filterText={triageFilterText}
        includeRow={triageIncludeRow}
      />
    );
  }

  // Unbox (and any other non-triage/history mode that still mounts this rail):
  // short Unboxed recent dock only — browse tabs are right-pane table.
  // Bulk dismiss (row ⋮ menu Select) stays on the sidebar rail; the
  // right-pane table left-gutter owns multi-select, not rail dismiss.
  return (
    <ReceivingFeedRail
      key="rail-unbox-recent"
      feed="unboxRecent"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      filterText={unboxFilterText}
      includeRow={unboxIncludeRow}
    />
  );
}
