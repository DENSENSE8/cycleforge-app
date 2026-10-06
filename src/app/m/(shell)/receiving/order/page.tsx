import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2InboundOrderComposer } from '@/components/mobile/v2/inbound/MobileV2InboundOrderComposer';

/**
 * `/m/receiving/order` — the inbound-order form on the phone (route node
 * `purchase-new-mobile`; the desk's is `/purchasing/new`). `?type=RETURN`
 * opens a return; `?fill=1` opens Paste or photo; `?id=<inbound_order_id>`
 * reopens a landed order to correct it through the same writer.
 */
export default async function MobileInboundOrderPage() {
  await requirePermission('receiving.view');
  return <MobileV2InboundOrderComposer />;
}
