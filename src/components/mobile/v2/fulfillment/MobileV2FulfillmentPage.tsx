'use client';

import { Suspense } from 'react';
import { MobileV2FulfillmentOrders } from './MobileV2FulfillmentOrders';

/** One V2 queue root shared by the canonical `/m/orders` route and `/m/work` alias. */
export function MobileV2FulfillmentPage() {
  return (
    <div className="min-h-full bg-surface-canvas">
      <Suspense fallback={<div className="p-4 text-sm text-text-muted">Loading orders…</div>}>
        <MobileV2FulfillmentOrders />
      </Suspense>
    </div>
  );
}
