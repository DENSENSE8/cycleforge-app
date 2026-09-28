import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { NewSalesOrderCheckout } from '@/components/orders/new/NewSalesOrderCheckout';

export const metadata: Metadata = { title: 'New sales order' };

/** `/orders/new` — take a sales order and set its team (header `+`, `C`). */
export default async function NewSalesOrderPage() {
  await requirePermission('orders.create');
  return <NewSalesOrderCheckout />;
}
