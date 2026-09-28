'use client';

/**
 * "For PO" on the order record — the purchase orders bought for this order
 * (`receiving_order_link`, linked from chat). Reads the order timeline entry
 * the record's Timeline card already fetches (same key, no extra request) and
 * paints nothing when the order has no PO.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { orderTimelineQuery } from '@/lib/queries/order-timeline-query';
import { searchHitHref } from '@/lib/search/search-hit';
import { cn } from '@/utils/_cn';

export function OrderPoLinksRow({ orderId }: { orderId: number }) {
  const { data } = useQuery({ ...orderTimelineQuery(orderId), select: (t) => t.poLinks ?? [] });
  if (!data || data.length === 0) return null;
  return (
    <EvidenceFactRow label="For PO">
      <span className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1" data-testid="order-record-po-links">
        {data.map((po) =>
          po.receivingId != null ? (
            <Link
              key={`${po.poNumber}:${po.receivingId}`}
              href={searchHitHref('RECEIVING', po.receivingId)}
              className={cn(RECORD_ID_CLASS, 'underline-offset-2 hover:underline')}
              title={po.vendor ? `PO ${po.poNumber} · ${po.vendor}` : `PO ${po.poNumber}`}
            >
              {po.poNumber}
            </Link>
          ) : (
            <span key={po.poNumber} className={RECORD_ID_CLASS}>
              {po.poNumber}
            </span>
          ),
        )}
      </span>
    </EvidenceFactRow>
  );
}
