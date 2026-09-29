'use client';

/** Sales hub — front-desk history surface: */

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { SalesHistoryTable } from '@/components/walk-in/SalesHistoryTable';
import {
  DEFAULT_SALES_REPAIR_TAB,
  parsePickupTab,
  parseRepairTab,
  parseSalesTab,
  parseWalkInHistoryMode,
} from '@/lib/walk-in/history-modes';

function TableFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

// Non-default tables are code-split so their chunks load only on mode switch.
const PickupOrdersTable = dynamic(
  () => import('@/components/walk-in/PickupOrdersTable').then((m) => m.PickupOrdersTable),
  { ssr: false, loading: TableFallback },
);

const RepairTable = dynamic(
  () => import('@/components/repair/RepairTable').then((m) => m.RepairTable),
  { ssr: false, loading: TableFallback },
);

export function WalkInHistoryHub() {
  const searchParams = useSearchParams();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));
  const tabRaw = searchParams.get('tab');
  const isRepairs = mode === 'repairs';
  const feedMode: 'pickup' | 'sales' = mode === 'pickup' ? 'pickup' : 'sales';

  // RepairTable keeps its own table controls; the page adds no second chrome band.
  if (isRepairs) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
        <RepairTable filter={parseRepairTab(tabRaw, DEFAULT_SALES_REPAIR_TAB)} />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      {feedMode === 'pickup' ? (
        <PickupOrdersTable tab={parsePickupTab(tabRaw)} />
      ) : (
        <SalesHistoryTable tab={parseSalesTab(tabRaw)} />
      )}
    </div>
  );
}
