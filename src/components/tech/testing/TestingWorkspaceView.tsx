'use client';

/**
 * Testing browse workbench — Sheets flush chrome (Unbox recipe): tabs · KPI ·
 * triage in one pinned sheet-chrome stack; grid body is WORKBENCH_SHEET_HOST.
 */

import { Suspense, useState } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import {
  TestingTriageBand,
  TestingWorkspaceHeader,
} from '@/components/tech/testing/TestingWorkspaceHeader';
import { useTestingWorkspaceTab } from '@/hooks/useTestingWorkspaceTab';
import { SheetChromeProvider } from '@/components/sheet/sheet-chrome-context';
import { StationDeck } from '@/components/station/StationDeck';
import { ShippingHistoryDock } from '@/components/station/ShippingHistoryDock';
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
  const parsedTechId = Number(techId);

  return (
    // Same bench, same feed as Shipping — the tech logs. See `StationDeck`.
    <StationDeck history={<ShippingHistoryDock station="Testing" />}>
    {/*
      The sheet chrome, so Testing's Band 3 offers zoom and fullscreen like every
      other spreadsheet. This is also what retires the ⋮ menu's row-density
      toggle: density was the only way to make this desk denser, and zoom does
      it better (it scales the TYPE with the track through `--cf-density`, where
      density only ever changed padding).
    */}
    <SheetChromeProvider tableId="testing">
    <DashboardScrollShell
      className="h-full bg-transparent"
      chrome={
        <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
          <TestingWorkspaceHeader
            tab={testTab}
            onSelectTab={setTestTab}
            className="rounded-none border-l-0 border-t-0 shadow-sm"
          />
          <TestingTriageBand
            tab={testTab}
            controlsSlotRef={setControlsEl}
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
    </SheetChromeProvider>
    </StationDeck>
  );
}
