import { requirePermission } from '@/lib/auth/page-guard';
import { CustomersScreen } from '@/components/mobile/customers/CustomersScreen';

export const dynamic = 'force-dynamic';

export default async function MobileCustomersPage() {
  await requirePermission('orders.view');
  return <CustomersScreen />;
}
