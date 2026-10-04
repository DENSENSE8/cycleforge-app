import { requirePermission } from '@/lib/auth/page-guard';
import { MobilePackerReport } from '@/components/mobile/reports/MobilePackerReport';

export const dynamic = 'force-dynamic';

export default async function MobileActivityPage() {
  await requirePermission('operations.view');
  return <MobilePackerReport surface="activity" />;
}
