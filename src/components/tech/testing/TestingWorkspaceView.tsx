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
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';

/**
 * The desk's modes. Each one mounts a different body over the same bench.
 *
 * No **All** entry: `all` is the absence of a narrowing, so it is the unlit
 * default body rather than a control that means *stop* (`DataTable`'s docblock,
 * § "All" is not a tab). Clicking the lit tab clears back to it.
 */
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

  /*
   * The tabs moved to the TOP (operator ruling 2026-08-31).
   *
   * They used to ride down into whichever body was mounted as a `tabStrip`,
   * because the foot strip belonged to the table and the desk swapped tables.
   * With the frame owning the row, the desk states its own modes once and the
   * bodies stop carrying navigation they never owned — `TechAllTriageTable` and
   * `TestingHistoryList` still foot their own status bar, now for COUNTS only,
   * which is the one thing a table actually knows.
   */
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
