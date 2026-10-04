import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2InboundOrderComposer } from '@/components/mobile/v2/inbound/MobileV2InboundOrderComposer';

/**
 * `/m/receiving/order` — the inbound-order form on the phone (the desk's is
 * `/incoming/new`). `?fill=1` opens Paste or photo; `?id=<inbound_order_id>`
 * reopens a landed order to correct it through the same writer.
 */
export default async function MobileInboundOrderPage() {
  await requirePermission('receiving.view');
  return <MobileV2InboundOrderComposer />;
}
