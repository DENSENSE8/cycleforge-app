'use client';

/**
 * Search order detail shell — identity bookmark over the shared
 * `OrderRecordBody` (Week 1, D2/D3).
 *
 * Was: eight section tabs, each a read-only fact list, with Customer showing a
 * raw `customer_id`. Now: the same single scroll the `/o/[orderId]` record
 * renders, so a searcher and a deep-linker see one surface — that is the whole
 * point of D2 (no capability may exist on one order surface and not another).
 *
 * This surface stays READ-ONLY: it passes no editing props, so the record's
 * inline editors render as plain facts. Editing lives on `/o/[orderId]` and the
 * dashboard slide-over, which own the CRUD chrome (action bar + editor dock).
 */

import type { ShippedOrder } from '@/types/orders';
import { SearchOrderContextBar } from '@/components/dashboard/search/SearchOrderContextBar';
import { SearchOrderDetailHeader } from '@/components/dashboard/search/SearchOrderDetailHeader';
import { OrderRecordBody } from '@/components/order-record/OrderRecordBody';

export function SearchOrderDetailShell({ order }: { order: ShippedOrder }) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-canvas">
      {/* One padded lane sized to the record width. Order identity hangs from the
          top as a bookmark (station entity-context chrome), then the record. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6">
          <SearchOrderContextBar identity={<SearchOrderDetailHeader order={order} />} />
          <div className="py-6">
            <OrderRecordBody order={order} density="full" documentsReadOnly />
          </div>
        </div>
      </div>
    </div>
  );
}
