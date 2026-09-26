'use client';

/** Shipped desk body — the package archive, mounted under the shared desk chrome at `/shipping/shipped`. */

import { ShippedLedger } from '@/components/shipped/ledger/ShippedLedger';

export function ShippedWorkspace() {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <ShippedLedger />
    </div>
  );
}
