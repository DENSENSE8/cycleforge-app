'use client';

/** Fulfilled desk body — the package archive mounted under the shared desk chrome. */

import { ShippedLedger } from '@/components/shipped/ledger/ShippedLedger';
import type { ShippedTypeFilter } from '@/lib/shipping/shipped-filter/shipped-filter-constants';

export function ShippedWorkspace({
  initialShippedFilter,
}: {
  initialShippedFilter: ShippedTypeFilter;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ShippedLedger initialShippedFilter={initialShippedFilter} />
    </div>
  );
}
