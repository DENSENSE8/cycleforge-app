import { redirect } from 'next/navigation';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';

/**
 * Bare `/shipping` → the To-ship desk.
 *
 * The modes are segments, so there is exactly one canonical URL per view and
 * this hop only ever serves an old bookmark. It used to land on
 * `/shipping/labels`; that route was deleted 2026-08-30 when needing a label
 * became a STATE in the To-ship queue ("Needs label") rather than a place, so
 * the desk's own queue is what a bare `/shipping` means now.
 */
export default function ShippingIndexPage() {
  redirect(SHIPPING_ORDERS_PATH);
}
