'use client';

/**
 * Triage (Arrival) browse workbench — Sheets flush chrome (Unbox recipe): tabs ·
 * KPI · triage in one pinned sheet-chrome stack; feed body is WORKBENCH_SHEET_HOST.
 * Band 2 uses Unbox SoT {@link WorkbenchKpiBand} (snap-collapse).
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchKpiBand,
  WORKBENCH_KPI_SURFACE,
} from '@/components/dashboard/workbench-kpi-collapse';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { TriageKpiStrip } from '@/components/receiving/triage/TriageKpiStrip';
import {
  TriageTriageBand,
  TriageWorkspaceHeader,
} from '@/components/receiving/triage/TriageWorkspaceHeader';
import { TriageFeedBody } from '@/components/receiving/triage/TriageFeedBody';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import { cn } from '@/utils/_cn';
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
  const { collapsed: kpiCollapsed, setCollapsed: setKpiCollapsed, toggleCollapsed: toggleKpiCollapsed } =
    useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.triage);

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
        <DashboardScrollShell
          className="h-full bg-transparent"
          chrome={
            <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
              <TriageWorkspaceHeader
                tab={triageView}
                onSelectTab={setTriageView}
                className="rounded-none border-l-0 border-t-0 shadow-sm"
              />
              <WorkbenchKpiBand
                open={!kpiCollapsed}
                onSnapCollapse={() => setKpiCollapsed(true)}
                onSnapExpand={() => setKpiCollapsed(false)}
              >
                <TriageKpiStrip />
              </WorkbenchKpiBand>
              <TriageTriageBand
                kpiOpen={!kpiCollapsed}
                onToggleKpi={toggleKpiCollapsed}
              />
            </div>
          }
        >
          <div className={WORKBENCH_SHEET_HOST}>
            <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
              <TriageFeedBody
                key={triageView}
                view={triageView}
                selectedLineId={selectedLineId}
                selectedRow={selectedRow}
                leadingRow={triageView === 'triage' ? leadingRow : null}
                filterText={filterText}
                hideEyebrow
              />
            </Suspense>
          </div>
        </DashboardScrollShell>

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
