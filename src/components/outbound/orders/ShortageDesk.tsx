'use client';

/**
 * Shortage desk — BLOCKED orders on the shared Unshipped DataTable, plus CSV
 * coverage staging (`?import=csv`) that attaches coverage without minting.
 */

import { Suspense, useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { BootGate } from '@/components/boot/BootGate';
import { BootSplash } from '@/components/boot/BootSplash';
import { consumeBootSplash } from '@/lib/boot-flag';
import { warmActiveView } from '@/lib/queries/dashboard-warm';
import { UnshippedTable } from '@/components/unshipped/UnshippedTable';
import { OrdersViewChromeProvider } from '@/components/outbound/orders/orders-view-chrome-context';
import { ShortageCoverageStagingHost } from '@/components/outbound/orders/ShortageCoverageStagingHost';
import { ShortageDeskImportAction } from '@/components/outbound/orders/ShortageDeskImportAction';
import { SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR } from '@/lib/orders/shortage-coverage-import-descriptor';
import {
  clearTableImportDraft,
  useTableImportDraft,
} from '@/lib/tables/import/staging-store';
import { useTableImportParam } from '@/hooks/useTableImportParam';
import { useOrderRailSelection } from '@/hooks/useOrderRailSelection';
import { useDashboardRealtime } from '@/hooks/useDashboardRealtime';

function ShortageDeskContent({
  onPrimaryPainted,
}: {
  onPrimaryPainted?: () => void;
}) {
  const csvDraft = useTableImportDraft(SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.surfaceId);
  const { active: importCsvActive, setActive: setImportCsvActive } = useTableImportParam(
    SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR,
  );
  const showCsvStaging = importCsvActive && Boolean(csvDraft);
  const { selectMode, selectionEnabled, selectionOverlays } = useOrderRailSelection('unshipped');

  useDashboardRealtime();

  useEffect(() => {
    if (!importCsvActive || csvDraft) return;
    setImportCsvActive(false);
  }, [csvDraft, importCsvActive, setImportCsvActive]);

  const stagingWasOpen = useRef(false);
  useEffect(() => {
    if (!csvDraft) {
      stagingWasOpen.current = false;
      return;
    }
    if (importCsvActive) {
      stagingWasOpen.current = true;
      return;
    }
    if (!stagingWasOpen.current) return;
    stagingWasOpen.current = false;
    clearTableImportDraft(SHORTAGE_COVERAGE_IMPORT_DESCRIPTOR.surfaceId);
  }, [csvDraft, importCsvActive]);

  return (
    <OrdersViewChromeProvider>
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {showCsvStaging ? (
          <ShortageCoverageStagingHost />
        ) : (
          <UnshippedTable
            strictSearchScope
            selectMode={selectMode}
            railSelection={selectionEnabled}
            onPrimaryPainted={onPrimaryPainted}
          />
        )}
        {showCsvStaging ? null : selectionOverlays}
      </div>
        {showCsvStaging ? null : <ShortageDeskImportAction />}
    </OrdersViewChromeProvider>
  );
}

export function ShortageDesk({
  onPrimaryPainted,
}: {
  onPrimaryPainted?: () => void;
} = {}) {
  const prefetch = useCallback(
    (queryClient: QueryClient) => warmActiveView(queryClient, window.location.search),
    [],
  );
  return (
    <Suspense fallback={<BootSplash />}>
      <BootGate prefetch={prefetch} shouldHold={consumeBootSplash} splash={<BootSplash />}>
        <ShortageDeskContent onPrimaryPainted={onPrimaryPainted} />
      </BootGate>
    </Suspense>
  );
}
