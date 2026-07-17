'use client';

import { Suspense, useState } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TestingKpiStrip } from '@/components/tech/testing/TestingKpiStrip';
import { TestingWorkspaceHeader } from '@/components/tech/testing/TestingWorkspaceHeader';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';

export function TestingWorkspaceView({
  techId,
  selectMode,
  onToggleSelectMode,
  onOpenLine,
}: {
  techId: string;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  onOpenLine?: () => void;
}) {
  const { testTab, setTestTab } = useTestingWorkspaceTab();
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const parsedTechId = Number(techId);

  return (
    <DashboardScrollShell
      className="h-full bg-surface-canvas"
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <TestingWorkspaceHeader
            tab={testTab}
            onSelectTab={setTestTab}
            controlsSlotRef={setControlsEl}
            selectMode={selectMode}
            onToggleSelectMode={onToggleSelectMode}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <TestingKpiStrip
            mode={testTab}
            techId={Number.isFinite(parsedTechId) ? parsedTechId : undefined}
          />
        </div>

        <div className="relative flex min-w-0 flex-col">
          <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
            <TestingHistoryList
              key={testTab}
              staffId={techId}
              mode={testTab}
              selectMode={selectMode}
              onOpenLine={onOpenLine}
              toolbarPortalTarget={controlsEl}
            />
          </Suspense>
        </div>
      </div>
    </DashboardScrollShell>
  );
}
