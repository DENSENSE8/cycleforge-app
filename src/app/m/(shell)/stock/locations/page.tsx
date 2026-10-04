import { requirePermission } from '@/lib/auth/page-guard';
import { MobileLocationDeletionPage } from '@/components/mobile/v2/stock/MobileLocationDeletionPage';

export const dynamic = 'force-dynamic';

export default async function MobileStockLocationsManagementPage() {
  await requirePermission('bin.remove');
  return <MobileLocationDeletionPage />;
}
