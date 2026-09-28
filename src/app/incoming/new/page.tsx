import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { NewInboundOrderPage } from '@/components/receiving/incoming/order-composer/NewInboundOrderPage';

export const metadata: Metadata = { title: 'New inbound order' };

/** `/incoming/new?type=PO|RETURN|TRADE_IN|PICKUP` — add an inbound order (header `+`, Incoming Add). */
export default async function NewInboundOrderRoute() {
  await requirePermission('receiving.view');
  return <NewInboundOrderPage />;
}
