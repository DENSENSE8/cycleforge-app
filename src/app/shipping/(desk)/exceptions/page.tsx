import { redirect } from 'next/navigation';
import { EXCEPTIONS_PATH } from '@/lib/exceptions/types';

/** `/shipping/exceptions` — compatibility redirect to the one Exceptions hub. */
export const dynamic = 'force-dynamic';

export default async function ShippingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const orderId = Number(order);
  redirect(order !== undefined && Number.isInteger(orderId) && orderId > 0
    ? `${EXCEPTIONS_PATH}?${new URLSearchParams({ order: String(orderId) })}`
    : EXCEPTIONS_PATH);
}
