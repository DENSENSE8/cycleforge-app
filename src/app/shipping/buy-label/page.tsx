import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/page-guard';
import { BuyLabelPage } from '@/features/labels-docs/buy/BuyLabelPage';

export const metadata: Metadata = { title: 'Buy a label' };

/**
 * `/shipping/buy-label` — buy ONE ShipStation label outright (owner 2026-09-28):
 * no order required, its own page (outside the Shipping desk frame, so no
 * contextual sidebar). Reached from the Labels view's Buy label CTA.
 */
export default async function ShippingBuyLabelPage() {
  await requirePermission('shipping.buy_label');
  return <BuyLabelPage />;
}
