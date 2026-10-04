'use client';

/** Sales hub — front-desk history surface: `?mode=pickup` and `?mode=repairs` (`?mode=sales` is parked → `/counter`). */

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import {
  DEFAULT_SALES_REPAIR_TAB,
  parsePickupTab,
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

const RepairCardList = dynamic(
  () => import('@/components/repair/RepairCardList').then((m) => m.RepairCardList),
  { ssr: false, loading: TableFallback },
);

// The New repair CTA top-right of the page and the intake it opens (Repair service's one Add).
const RepairIntakeHost = dynamic(
  () => import('@/components/repair/RepairIntakeHost').then((m) => m.RepairIntakeHost),
  { ssr: false },
);

export function WalkInHistoryHub() {
  const searchParams = useSearchParams();

  const mode = parseWalkInHistoryMode(searchParams.get('mode'));
  const tabRaw = searchParams.get('tab');
  const isRepairs = mode === 'repairs';

  // The repair cards take every control from the contextual sidebar; the page adds no chrome band.
  if (isRepairs) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
        <RepairCardList defaultTab={DEFAULT_SALES_REPAIR_TAB} />
        <RepairIntakeHost />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-surface-canvas">
      <PickupOrdersTable tab={parsePickupTab(tabRaw)} />
    </div>
  );
}
