import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2InboundNew } from '@/components/mobile/v2/inbound/MobileV2InboundNew';

/** `/m/receiving/new` — add inbound orders on the phone: purchase order · return · paste or photo · import orders. */
export default async function MobileAddPurchaseOrdersPage() {
  await requirePermission('receiving.view');
  return <MobileV2InboundNew />;
}
