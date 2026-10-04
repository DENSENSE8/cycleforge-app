import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2PoCsvImport } from '@/components/mobile/v2/inbound/MobileV2PoCsvImport';

/** `/m/receiving/import-csv` — upload a CSV of purchase orders (reached from `/m/receiving/new`). */
export default async function MobilePoCsvImportPage() {
  await requirePermission('receiving.view');
  return <MobileV2PoCsvImport />;
}
