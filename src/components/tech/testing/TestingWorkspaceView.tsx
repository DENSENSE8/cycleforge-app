'use client';

/**
 * Testing browse workbench — Sheets flush chrome (Unbox recipe): tabs · KPI ·
 * triage in one pinned sheet-chrome stack; grid body is WORKBENCH_SHEET_HOST.
 * Band 2 uses Unbox SoT {@link WorkbenchKpiBand} (snap-collapse).
 */

import { Suspense, useState } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import {
  WorkbenchKpiBand,
  WORKBENCH_KPI_SURFACE,
} from '@/components/dashboard/workbench-kpi-collapse';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { TestingKpiStrip } from '@/components/tech/testing/TestingKpiStrip';
import {
  TestingTriageBand,
  TestingWorkspaceHeader,
} from '@/components/tech/testing/TestingWorkspaceHeader';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import { cn } from '@/utils/_cn';

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
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const { collapsed: kpiCollapsed, setCollapsed: setKpiCollapsed } = useWorkbenchKpiCollapsed(
    WORKBENCH_KPI_SURFACE.testing,
  );
  const parsedTechId = Number(techId);

  return (
    <DashboardScrollShell
      className="h-full bg-transparent"
      chrome={
        <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
          <TestingWorkspaceHeader
            tab={testTab}
            onSelectTab={setTestTab}
            className="rounded-none border-l-0 border-t-0 shadow-sm"
          />
          <WorkbenchKpiBand
            open={!kpiCollapsed}
            onSnapCollapse={() => setKpiCollapsed(true)}
            onSnapExpand={() => setKpiCollapsed(false)}
          >
            <TestingKpiStrip
              mode={testTab}
              techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
            />
          </WorkbenchKpiBand>
          <TestingTriageBand
            tab={testTab}
            controlsSlotRef={setControlsEl}
            kpiOpen={!kpiCollapsed}
            onToggleKpi={() => setKpiCollapsed(!kpiCollapsed)}
          />
        </div>
      }
    >
      <div className={WORKBENCH_SHEET_HOST}>
        <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
          {testTab === 'all' ? (
            <TechAllTriageTable
              scope="testing"
              onOpenTestingLine={onOpenLine}
              columnTriggerPortalTarget={controlsEl}
            />
          ) : (
            <TestingHistoryList
              key={testTab}
              staffId={techId}
              mode={testTab}
              selectMode={selectMode}
              onOpenLine={onOpenLine}
              toolbarPortalTarget={controlsEl}
            />
          )}
        </Suspense>
      </div>
    </DashboardScrollShell>
  );
}
