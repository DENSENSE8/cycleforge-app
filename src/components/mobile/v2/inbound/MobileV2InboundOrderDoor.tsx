'use client';

/**
 * The carton record's door to the purchase order(s) behind it: one row per
 * inbound order its lines belong to, opening the phone inbound form on that
 * order to correct a wrong import. Orders that cannot be corrected by hand
 * (Zoho sync, repair drop-off) are not offered.
 */

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pencil } from '@/components/Icons';
import { MobileDataListRow } from '@/design-system/components/MobileDataListRow';
import { fetchCartonInboundOrders } from '@/lib/inbound/inbound-order-client';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { INBOUND_ROW_CLASS, InboundRowText } from './MobileV2InboundParts';

export function MobileV2InboundOrderDoor({ receivingId, returnTo }: { receivingId: number; returnTo: string }) {
  const { data } = useQuery({
    queryKey: ['inbound-orders-for-carton', receivingId],
    queryFn: ({ signal }) => fetchCartonInboundOrders(receivingId, signal),
    enabled: Number.isInteger(receivingId) && receivingId > 0,
    staleTime: 30_000,
  });
  const editable = (data ?? []).filter((order) => order.refusal == null);
  if (editable.length === 0) return null;
  return (
    <nav aria-label="Purchase orders on this carton">
      {editable.map((order) => (
        <MobileDataListRow
          key={order.inboundOrderId}
          href={withJobReturn(`/m/receiving/order?id=${order.inboundOrderId}`, returnTo)}
          ariaLabel={`Fix purchase order ${order.orderNumber}`}
          testId={`m-inbound-fix-${order.inboundOrderId}`}
        >
          <span className={INBOUND_ROW_CLASS}>
            <Pencil aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
            <span className="min-w-0 flex-1">
              <InboundRowText
                title={<>Fix purchase order <span className="font-mono">{order.orderNumber}</span></>}
                meta={`${order.platform} · ${order.lineCount} line${order.lineCount === 1 ? '' : 's'}`}
              />
            </span>
            <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
          </span>
        </MobileDataListRow>
      ))}
    </nav>
  );
}
