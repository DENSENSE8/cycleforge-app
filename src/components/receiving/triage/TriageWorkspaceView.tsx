'use client';

/**
 * Triage (Arrival) browse workbench — tabs (Triage · Prioritize · Unfound · Done)
 * + KPI strip + feed list. Mirrors UnboxWorkspaceView; feeds reuse TriageFeedBody.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { TriageKpiStrip } from '@/components/receiving/triage/TriageKpiStrip';
import { TriageWorkspaceHeader } from '@/components/receiving/triage/TriageWorkspaceHeader';
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
    unboxView: 'recent',
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
            <div className={WORKBENCH_CHROME_COLUMN}>
              <TriageWorkspaceHeader
                tab={triageView}
                onSelectTab={setTriageView}
              />
            </div>
          }
        >
          <div className={WORKBENCH_BODY_COLUMN}>
            <div className="mb-4">
              <TriageKpiStrip />
            </div>

            {/* Feed sits inside TriageLineWorkspace’s elevated host — no second
                full-pane rounded well (depth-1 is the shell, not nested cards). */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
