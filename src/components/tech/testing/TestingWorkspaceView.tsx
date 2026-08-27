'use client';

/**
 * Testing browse workbench — the three-band Sheets flush stack, composed from
 * {@link WorkbenchSheetView} (tabs · KPI · triage over a flush sheet host).
 */

import { WorkbenchSheetView, useWorkbenchSheetChrome } from '@/components/dashboard/WorkbenchSheetView';
import { WORKBENCH_KPI_SURFACE } from '@/components/dashboard/workbench-kpi-collapse';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TableRebuildPlaceholder } from '@/components/tables/TableRebuildPlaceholder';
import { TestingKpiStrip } from '@/components/tech/testing/TestingKpiStrip';
import {
  TestingTriageBand,
  TestingWorkspaceHeader,
} from '@/components/tech/testing/TestingWorkspaceHeader';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';

export function TestingWorkspaceView({
  techId,
  selectMode,
  onOpenLine,
}: {
  techId: string;
  selectMode: boolean;
  onOpenLine?: () => void;
}) {
  const { testTab, setTestTab } = useTestingWorkspaceTab();
  const chrome = useWorkbenchSheetChrome(WORKBENCH_KPI_SURFACE.testing);
  const parsedTechId = Number(techId);

  return (
    <WorkbenchSheetView
      chrome={chrome}
      className="h-full bg-transparent"
      tabs={({ className }) => (
        <TestingWorkspaceHeader tab={testTab} onSelectTab={setTestTab} className={className} />
      )}
      kpi={
        <TestingKpiStrip
          mode={testTab}
          techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
        />
      }
      triage={(p) => <TestingTriageBand tab={testTab} {...p} />}
    >
      {({ controlsEl }) =>
        testTab === 'all' ? (
          <TableRebuildPlaceholder surface="Testing · All" />
        ) : (
          <TestingHistoryList
            key={testTab}
            staffId={techId}
            mode={testTab}
            selectMode={selectMode}
            onOpenLine={onOpenLine}
            toolbarPortalTarget={controlsEl}
          />
        )
      }
    </WorkbenchSheetView>
  );
}
