import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2NewRackFlow } from '@/components/mobile/v2/racks/MobileV2NewRackFlow';

export const dynamic = 'force-dynamic';

/** `/m/racks/new` — New rack: Place → Shelves → Review → Print (door: `/m/racks` › New rack). */
export default async function MobileNewRackPage() {
  await requirePermission('sku_stock.manage');
  return <MobileV2NewRackFlow />;
}
