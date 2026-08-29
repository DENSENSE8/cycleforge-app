'use client';

/**
 * Testing browse workbench.
 *
 * The desk draws no chrome. It resolves which BODY the `?testTab=` mode wants
 * and hands that body the tab strip as data; the table draws the strip on its
 * own bottom bar (`DataTable`). The three-band Sheets stack that used to sit
 * above the grid was deleted on 2026-08-29 with the rest of the display layer.
 */

import { Suspense } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';
import type { DataTableTabStrip } from '@/components/tables/DataTable';

/** The desk's modes. Each one mounts a different body over the same bench. */
const TESTING_TABS = [
  { id: 'all', label: 'All' },
  { id: 'history', label: 'History' },
] as const;

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

  const tabStrip: DataTableTabStrip = {
    tabs: TESTING_TABS.map((t) => ({ id: t.id, label: t.label })),
    activeTab: testTab,
    onTabChange: (id) => setTestTab(id as typeof testTab),
  };

  return (
    <DashboardScrollShell className="h-full bg-transparent">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="min-h-[240px] bg-surface-canvas" aria-hidden />}>
          {testTab === 'all' ? (
            <TechAllTriageTable
              scope="testing"
              onOpenTestingLine={onOpenLine}
              tabStrip={tabStrip}
            />
          ) : (
            <TestingHistoryList
              key={testTab}
              staffId={techId}
              mode={testTab}
              selectMode={selectMode}
              onOpenLine={onOpenLine}
              tabStrip={tabStrip}
            />
          )}
        </Suspense>
      </div>
    </DashboardScrollShell>
  );
}
