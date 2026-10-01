import { redirect } from 'next/navigation';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';

/** `/shipping/shipped` — permanent door onto `/fulfilled`. */
export default async function ShippingShippedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);
  }
  const qs = next.toString();
  redirect(qs ? `${SHIPPING_SHIPPED_PATH}?${qs}` : SHIPPING_SHIPPED_PATH);
}
