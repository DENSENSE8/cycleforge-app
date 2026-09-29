import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { FulfillmentExceptionsDoor } from '@/components/outbound/orders/exceptions/FulfillmentExceptionsDoor';
import { getCurrentUser } from '@/lib/auth/current-user';
import { getExceptionRecord, type ExceptionCaller } from '@/lib/exceptions/hub';
import {
  EXCEPTIONS_PATH,
  EXCEPTION_KIND_SPEC,
  EXCEPTION_RECORD_PARAM,
  exceptionRowKey,
  type ExceptionKind,
} from '@/lib/exceptions/types';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';

/** `/shipping/exceptions` — FBM › Exceptions: the Exceptions hub list locked to Fulfillment. */
export const dynamic = 'force-dynamic';

/** The kinds an order id can be an exception under, in the order a legacy link most likely meant. */
const ORDER_KINDS: readonly ExceptionKind[] = ['fbm', 'paperwork', 'labels', 'pairs'];

/**
 * A legacy `?order=<id>` link (search dossier, To-ship row menu, bookmarks)
 * opens that order's exception: this door when it is a Fulfillment kind, the
 * hub when it is a Missing pair; nothing open when the order is no longer an
 * exception.
 */
async function legacyOrderRecordHref(orderId: number): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return SHIPPING_EXCEPTIONS_PATH;
  const caller: ExceptionCaller = { orgId: user.organizationId, has: (permission) => user.permissions.has(permission) };
  for (const kind of ORDER_KINDS) {
    const key = exceptionRowKey(kind, String(orderId));
    const found = await getExceptionRecord(caller, key);
    if (!found.ok) continue;
    const base = EXCEPTION_KIND_SPEC[kind].domain === 'fulfillment' ? SHIPPING_EXCEPTIONS_PATH : EXCEPTIONS_PATH;
    return `${base}?${new URLSearchParams({ [EXCEPTION_RECORD_PARAM]: key })}`;
  }
  return SHIPPING_EXCEPTIONS_PATH;
}

export default async function ShippingExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const orderId = Number(order);
  if (order !== undefined) redirect(Number.isInteger(orderId) && orderId > 0 ? await legacyOrderRecordHref(orderId) : SHIPPING_EXCEPTIONS_PATH);
  return (
    <Suspense fallback={null}>
      <FulfillmentExceptionsDoor />
    </Suspense>
  );
}
