'use client';

import { useSearchParams } from 'next/navigation';
import { ReplenishmentNeedTable } from '@/components/replenish/ReplenishmentNeedTable';
import { ReplenishmentShippedFifoTab } from '@/components/replenish/ReplenishmentShippedFifoTab';

type ReplenishTab = 'need' | 'fifo';

/** Main-pane content for the Replenish section of `/inventory` (`?section=replenish`). */
export function ReplenishWorkspace() {
  const searchParams = useSearchParams();
  const tab: ReplenishTab = searchParams.get('rtab') === 'fifo' ? 'fifo' : 'need';
  const skuSearch = searchParams.get('rsku') || '';
  const statusFilter = searchParams.get('rstatus') || null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'need' ? (
          <ReplenishmentNeedTable skuSearch={skuSearch} statusFilter={statusFilter} />
        ) : (
          <ReplenishmentShippedFifoTab skuSearch={skuSearch} />
        )}
      </div>
    </div>
  );
}
