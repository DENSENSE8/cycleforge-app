import { redirect } from 'next/navigation';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';

/** Bare `/shipping` → the To-ship desk. */
export default function ShippingIndexPage() {
  redirect(SHIPPING_ORDERS_PATH);
}
