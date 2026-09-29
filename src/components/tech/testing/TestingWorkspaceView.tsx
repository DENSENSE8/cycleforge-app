'use client';

/** Testing browse workbench. */

import { Suspense } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

export function TestingWorkspaceView({
  techId,
  selectMode,
  onOpenLine,
}: {
  techId: string;
  selectMode: boolean;
  onOpenLine?: () => void;
}) {
  const { testTab } = useTestingWorkspaceTab();

  return (
    <DeskPageLayout className="h-full">
    <DashboardScrollShell className="h-full bg-transparent">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
          {testTab === 'all' ? (
            <TechAllTriageTable scope="testing" onOpenTestingLine={onOpenLine} />
          ) : (
            <TestingHistoryList
              key={testTab}
              staffId={techId}
              mode={testTab}
              selectMode={selectMode}
              onOpenLine={onOpenLine}
            />
          )}
        </Suspense>
      </div>
    </DashboardScrollShell>
    </DeskPageLayout>
  );
}
