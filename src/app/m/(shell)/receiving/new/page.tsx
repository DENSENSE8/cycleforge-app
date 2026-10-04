import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2InboundNew } from '@/components/mobile/v2/inbound/MobileV2InboundNew';

/** `/m/receiving/new` — add purchase orders on the phone: type · paste or photo · CSV. */
export default async function MobileAddPurchaseOrdersPage() {
  await requirePermission('receiving.view');
  return <MobileV2InboundNew />;
}
