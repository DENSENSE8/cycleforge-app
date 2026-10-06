import { requirePermission } from '@/lib/auth/page-guard';
import { MobileV2PoCsvImport } from '@/components/mobile/v2/inbound/MobileV2PoCsvImport';

/** `/m/receiving/import-csv` — import an order file, CSV or TSV (reached from `/m/receiving/new`); the phone face of `/purchasing/import`. */
export default async function MobilePoCsvImportPage() {
  await requirePermission('receiving.view');
  return <MobileV2PoCsvImport />;
}
