'use client';

/** Testing browse workbench. */

import { Suspense } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/** The desk's modes. */
const TESTING_TABS = [{ id: 'history', label: 'History' }] as const;

/** Ids the strip can light. Anything else is the unlit default body. */
const TESTING_LIT_TABS: ReadonlySet<string> = new Set(TESTING_TABS.map((t) => t.id));

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

  /* The tabs moved to the TOP (operator ruling 2026-08-31). */
  return (
    <DeskPageLayout
      className="h-full"
      tabs={TESTING_TABS.map((t) => ({ id: t.id, label: t.label }))}
      activeTab={TESTING_LIT_TABS.has(testTab) ? testTab : ''}
      onTabChange={(id) => setTestTab((id === testTab ? 'all' : id) as typeof testTab)}
    >
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
