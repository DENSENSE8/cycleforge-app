'use client';

/**
 * Triage (Arrival) browse workbench — Sheets flush chrome (Unbox recipe): tabs ·
 * KPI · triage in one pinned sheet-chrome stack; feed body is WORKBENCH_SHEET_HOST.
 */

import { useSearchParams } from 'next/navigation';
import {
  WorkbenchSheetView,
  useWorkbenchSheetChrome,
} from '@/components/dashboard/WorkbenchSheetView';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  TriageTriageBand,
  TriageWorkspaceHeader,
} from '@/components/receiving/triage/TriageWorkspaceHeader';
import { TriageFeedBody } from '@/components/receiving/triage/TriageFeedBody';
import { useTriageWorkspaceTab } from '@/hooks/useTriageWorkspaceTab';

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
  const chrome = useWorkbenchSheetChrome('triage');

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
        <WorkbenchSheetView
          chrome={chrome}
          className="h-full bg-transparent"
          tabs={({ className }) => (
            <TriageWorkspaceHeader
              tab={triageView}
              onSelectTab={setTriageView}
              className={className}
            />
          )}
          // Arrival's Band 3 owns no controls portal — its ▦ has no host here.
          triage={() => <TriageTriageBand />}
        >
          {() => (
            <TriageFeedBody
              key={triageView}
              view={triageView}
              selectedLineId={selectedLineId}
              selectedRow={selectedRow}
              leadingRow={triageView === 'triage' ? leadingRow : null}
              filterText={filterText}
            />
          )}
        </WorkbenchSheetView>

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
