import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { InboundOrderFormPage } from '@/components/receiving/purchases/order-form/InboundOrderFormPage';

export const metadata: Metadata = { title: 'Add purchase order' };

/**
 * `/purchasing/new?type=PO|RETURN` — add a purchase order or a return;
 * `?id=<inbound order id>` reopens a landed order to fix it (route node
 * `purchase-new`; opened from Add, top right on Purchasing and Deliveries).
 */
export default async function AddPurchaseOrderPage() {
  await requirePermission('receiving.view');
  return (
    <Suspense>
      <InboundOrderFormPage />
    </Suspense>
  );
}
