import { requirePermission } from '@/lib/auth/page-guard';
import { MobileSalesOrderCheckout } from '@/components/mobile/orders/new/MobileSalesOrderCheckout';

/**
 * `/m/orders/new` — take a sales order on the phone (a call on the business
 * line, a walk-in at the counter). Same job and step machine as the desk's
 * `/orders/new` (`useSalesOrderCheckout`); this is its thumb-first face.
 */
export default async function MobileNewSalesOrderPage() {
  await requirePermission('orders.create');
  return <MobileSalesOrderCheckout />;
}
