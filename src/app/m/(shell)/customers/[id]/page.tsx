import { requirePermission } from '@/lib/auth/page-guard';
import { CustomerProfileScreen } from '@/components/mobile/customers/CustomerProfileScreen';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MobileCustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('orders.view');
  const { id: rawId } = await params;
  const customerId = Number(rawId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) notFound();
  return <CustomerProfileScreen customerId={customerId} />;
}
