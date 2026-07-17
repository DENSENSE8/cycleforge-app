'use client';

/**
 * Unbox browse workbench — tabs (Unboxed · Queue · Viewed) + KPI strip + feed
 * list. Mirrors TestingWorkspaceView; feed infra reuses ReceivingFeedRail.
 */

import { Suspense } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { RailEditModeProvider } from '@/components/sidebar/rail-edit-mode';
import { ReceivingBulkActionBar } from '@/components/sidebar/receiving/ReceivingBulkActionBar';
import { ReceivingFeedRail } from '@/components/sidebar/receiving/ReceivingFeedRail';
import { useRailEditMode } from '@/components/sidebar/receiving/useRailEditMode';
import {
  isPendingTriageScanRow,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxKpiStrip } from '@/components/receiving/unbox/UnboxKpiStrip';
import { UnboxWorkspaceHeader } from '@/components/receiving/unbox/UnboxWorkspaceHeader';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';

const EMPTY_COPY: Record<UnboxWorkspaceTab, string> = {
  recent: 'No cartons opened on Unbox yet. Scan a tracking number to start.',
  queue: 'No cartons in the door queue. Triage matched POs land here.',
  viewed: 'Nothing viewed yet. Open a carton to build your recent list.',
};

function UnboxFeedBody({
  unboxView,
  selectedLine,
}: {
  unboxView: UnboxWorkspaceTab;
  selectedLine: ReceivingLineRow | null;
}) {
  const selectedLineId = selectedLine?.id ?? null;
  const selectedRow =
    selectedLine &&
    (selectedLine.id > 0 ||
      selectedLine.receiving_id != null ||
      isPendingTriageScanRow(selectedLine))
      ? selectedLine
      : null;

  if (unboxView === 'queue') {
    return (
      <ReceivingFeedRail
        key="rail-unbox-queue"
        feed="unboxQueue"
        scope="unbox"
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        hideEyebrow
        emptyText={EMPTY_COPY.queue}
      />
    );
  }

  if (unboxView === 'viewed') {
    return (
      <ReceivingFeedRail
        key="rail-unbox-viewed"
        feed="viewed"
        selectedLineId={selectedLineId}
        selectedRow={selectedRow}
        hideEyebrow
        emptyText={EMPTY_COPY.viewed}
      />
    );
  }

  return (
    <ReceivingFeedRail
      key="rail-unbox-recent"
      feed="unboxRecent"
      selectedLineId={selectedLineId}
      selectedRow={selectedRow}
      hideEyebrow
      emptyText={EMPTY_COPY.recent}
    />
  );
}

export function UnboxWorkspaceView({
  selectedLine,
}: {
  selectedLine: ReceivingLineRow | null;
}) {
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
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
    mode: 'receive',
    unboxView,
    triageView: 'triage',
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
          className="h-full bg-surface-canvas"
          chrome={
            <div className={WORKBENCH_CHROME_COLUMN}>
              <UnboxWorkspaceHeader
                tab={unboxView}
                onSelectTab={setUnboxView}
                selectMode={railEditMode}
                onToggleSelectMode={toggleRailEditMode}
              />
            </div>
          }
        >
          <div className={WORKBENCH_BODY_COLUMN}>
            <div className="mb-4">
              <UnboxKpiStrip mode={unboxView} />
            </div>

            <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-sm">
              <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
                <UnboxFeedBody
                  key={unboxView}
                  unboxView={unboxView}
                  selectedLine={selectedLine}
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
