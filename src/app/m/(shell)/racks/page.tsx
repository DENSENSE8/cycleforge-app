import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2RackList } from '@/components/mobile/v2/racks/MobileV2RackList';

export const dynamic = 'force-dynamic';

/** `/m/racks` — movable racks (door: the phone menu › Inventory › Racks); a card opens the rack record `/m/loc/RK12`. */
export default async function MobileRacksPage() {
  await requirePermission('sku_stock.view');
  return <MobileV2RackList />;
}
