'use client';

/**
 * Triage (Arrival) browse workbench.
 *
 * The desk draws no header. Its four bodies are rail lists rather than tables,
 * so the one thing it still owns is which body is on screen — and that strip is
 * the same {@link TableStatusBar} every table foots itself with, minus a row
 * count it has no honest way to know.
 */

import { useSearchParams } from 'next/navigation';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { TriageFeedBody } from '@/components/receiving/triage/TriageFeedBody';
import { useTriageWorkspaceTab } from '@/hooks/useTriageWorkspaceTab';
import {
  TRIAGE_WORKSPACE_TAB_LABEL,
  type TriageWorkspaceTab,
} from '@/utils/triage-workspace-state';
import {
  TableStatusBar,
  type DataTableTabStrip,
} from '@/components/tables/TableStatusBar';

export function TriageWorkspaceView({
  selectedLine,
  leadingRow = null,
}: {
  selectedLine: ReceivingLineRow | null;
  /** Pre-resolve scan stub from the sidebar scan path. */
  leadingRow?: ReceivingLineRow | null;
}) {
  const { triageView, setTriageView } = useTriageWorkspaceTab();
  const searchParams = useSearchParams();
  const filterText = searchParams.get('triq') ?? '';

  // `triage` is the default view, so it IS the unfiltered body and lights no
  // tab — the same rule every other strip follows.
  const tabStrip: DataTableTabStrip = {
    tabs: (['found', 'unfound', 'done'] as const).map((id) => ({
      id,
      label: TRIAGE_WORKSPACE_TAB_LABEL[id],
    })),
    activeTab: triageView === 'triage' ? undefined : triageView,
    onTabChange: (id) =>
      setTriageView(id === triageView ? 'triage' : (id as TriageWorkspaceTab)),
  };

  const selectedLineId = selectedLine?.id ?? null;
  const selectedRow =
    selectedLine &&
    (selectedLine.id > 0 ||
      selectedLine.receiving_id != null ||
      isPendingTriageScanRow(selectedLine))
      ? selectedLine
      : null;

  const {
    railEditMode,
    railSelectedIds,
    railSelectedIdList,
    railBulkDismissing,
    toggleRailEditMode,
    toggleRailSelected,
    setManyRailSelected,
    handleRailBulkDismiss,
  } = useRailEditMode({
    isScanSurface: true,
    mode: 'triage',
    unboxView: 'history',
    triageView,
  });

  return (
    <RailEditModeProvider
      active={railEditMode}
      selectedIds={railSelectedIds}
      toggle={toggleRailSelected}
      setMany={setManyRailSelected}
      toggleActive={toggleRailEditMode}
    >
      <div className="relative flex h-full min-h-0 w-full flex-col">
        <TriageFeedBody
          key={triageView}
          view={triageView}
          selectedLineId={selectedLineId}
          selectedRow={selectedRow}
          leadingRow={triageView === 'triage' ? leadingRow : null}
          filterText={filterText}
        />
        {/* The bodies here are rails, not tables, so the desk draws the strip
            its tabs belong to. There is no row count to print. */}
        <TableStatusBar {...tabStrip} />

        {railEditMode ? (
          <ReceivingBulkActionBar
            selectedIds={railSelectedIdList}
            onDismiss={handleRailBulkDismiss}
            busy={railBulkDismissing}
          />
        ) : null}
      </div>
    </RailEditModeProvider>
  );
}
