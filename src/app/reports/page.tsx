'use client';

import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { SessionsReportTable } from '@/features/reports/sessions/SessionsReportTable';
import { BinUtilizationTable } from '@/features/reports/metrics/BinUtilizationTable';
import { SkuVelocityTable } from '@/features/reports/metrics/SkuVelocityTable';
import { DeadStockTable } from '@/features/reports/metrics/DeadStockTable';

type Tab = 'sessions' | 'utilization' | 'velocity' | 'dead';

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'utilization', label: 'Bin Utilization' },
  { id: 'velocity', label: 'Velocity (30d)' },
  { id: 'dead', label: 'Dead Stock (90d+)' },
];

function parseTab(raw: string | null): Tab {
  return raw === 'utilization' || raw === 'velocity' || raw === 'dead' ? raw : 'sessions';
}

function ReportsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const [refreshNonce, setRefreshNonce] = useState(0);

  const setTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams();
      next.set('tab', id);
      const qs = next.toString();
      router.replace(qs ? `/reports?${qs}` : '/reports');
    },
    [router],
  );

  return (
    <DeskPageLayout
      title="Reports"
      tabs={TABS}
      activeTab={tab}
      onTabChange={(id) => setTab(id)}
      className="h-full"
    >
      {tab === 'sessions' ? null : (
        <DeskActionSlotRegistrar>
          <DeskHeaderAction
            variant="secondary"
            size="md"
            type="button"
            onClick={() => setRefreshNonce((n) => n + 1)}
          >
            Refresh
          </DeskHeaderAction>
        </DeskActionSlotRegistrar>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'sessions' ? (
          <SessionsReportTable />
        ) : tab === 'utilization' ? (
          <BinUtilizationTable key={refreshNonce} />
        ) : tab === 'velocity' ? (
          <SkuVelocityTable key={refreshNonce} />
        ) : (
          <DeadStockTable key={refreshNonce} />
        )}
      </div>
    </DeskPageLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-canvas">
          <LoadingSpinner size="lg" className="text-blue-600" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
