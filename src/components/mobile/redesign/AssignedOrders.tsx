'use client';

/**
 * Mobile orders queue — canonical `/m/orders`; `/m/work` is a compatibility
 * alias that mounts this same component.
 *
 * This page is the full phone queue, not a shrunk spreadsheet.
 */

import { Suspense } from 'react';
import { MobileV2FulfillmentOrders } from '@/components/mobile/v2/fulfillment/MobileV2FulfillmentOrders';

/**
 * The route's mode comes from src/lib/routing/mode-registry.ts (triage: the
 * orders queue is a reading flow on `/m/orders` and `/m/work`).
 */
export default function RedesignedMobileAssignedOrders() {
  return (
    <div className="min-h-full bg-surface-canvas">
      <Suspense
        fallback={
          <div className="p-4 text-sm text-text-muted">Loading orders…</div>
        }
      >
        <MobileV2FulfillmentOrders />
      </Suspense>
    </div>
  );
}
