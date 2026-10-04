'use client';

/**
 * FBM — a merchant-fulfilled order held by an order exception other than SKU
 * mapping. The queue only ever holds three categories (ExceptionsData
 * 2026-09-28): Out of Stock clears in place (`isOutOfStock: false`); Buyer
 * Request records the read (the note keeps the row until it is removed on the
 * order); Shipping Issue is the carrier's own exception, shown as evidence with
 * the order one tap away.
 */

import { usePathname, useSearchParams } from 'next/navigation';
import { ClipboardList, MessageSquare, PackageCheck } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailNavRow } from '@/components/mobile/detail/DetailParts';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveFbmException } from '@/hooks/exceptions';
import type { FbmExceptionFacts } from '@/lib/exceptions/facts';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { toast } from '@/lib/toast';
import type { PhoneResolverProps } from './resolver-props';

type FbmVerb = 'in-stock' | 'ack-note';

export function FbmResolver({ facts, onResolved }: PhoneResolverProps<FbmExceptionFacts>) {
  const { has } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const resolve = useResolveFbmException();
  const order = facts.order;
  const category = order.routing.category;
  const orderRef = order.orderNumber || `#${order.id}`;
  const here = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;

  const canEdit = has('orders.create');
  const canAck = has('packing.complete_order') || has('shipping.buy_label');

  const verbs: DetailDockVerb<FbmVerb>[] = [];
  if (category === 'Out of Stock') {
    verbs.push({
      id: 'in-stock',
      label: 'Mark in stock',
      icon: <PackageCheck />,
      primary: true,
      disabled: !canEdit,
      loading: resolve.isPending,
    });
  }
  if (order.buyerNote) {
    verbs.push({
      id: 'ack-note',
      label: 'Acknowledge note',
      icon: <MessageSquare />,
      primary: category === 'Buyer Request',
      disabled: !canAck,
      loading: resolve.isPending && resolve.variables?.action === 'ack-buyer-note',
    });
  }

  const onVerb = (verb: FbmVerb) =>
    verb === 'in-stock'
      ? resolve
          .mutateAsync({ action: 'update-order', orderId: order.id, patch: { isOutOfStock: false } })
          .then(() => onResolved(`${orderRef} is back in stock.`))
          .catch((error: Error) => toast.error(error.message || 'Could not update the order.'))
      : resolve
          .mutateAsync({ action: 'ack-buyer-note', orderId: order.id })
          .then(() => toast.success('Buyer note acknowledged — it stays on the order until it is removed.'))
          .catch((error: Error) => toast.error(error.message || 'Could not acknowledge the note.'));

  const blockedReason =
    category === 'Out of Stock' && !canEdit
      ? 'Your role cannot edit orders, so it cannot clear Out of Stock.'
      : order.buyerNote && !canAck
        ? 'Acknowledging a buyer note needs packing or label-buying access.'
        : category === 'Shipping Issue'
          ? 'The carrier flagged this shipment. It clears when the carrier updates — open the order to act on the label or tracking.'
          : null;

  return (
    <>
      <DetailFacts label="Order">
        <DetailFact label="Category" value={category} />
        <DetailFact label="Next step" value={order.routing.actionRequired} hint={order.routing.owner} />
        <DetailFact label="SKU" value={order.sku} mono copy={order.sku} />
        <DetailFact label="Item #" value={order.itemNumber} mono copy={order.itemNumber} />
        <DetailFact label="Qty" value={order.quantity} />
        <DetailFact label="Tracking" value={order.trackingNumber} mono copy={order.trackingNumber} />
        {order.responsiblePerson ? <DetailFact label="Assigned" value={order.responsiblePerson} /> : null}
      </DetailFacts>
      {order.buyerNote ? (
        <section aria-label="Buyer note" className="bg-surface-warning px-mode-page py-3 text-mode-body text-text-warning">
          <p className="font-semibold">Buyer note</p>
          <p className="mt-0.5 whitespace-pre-wrap">{order.buyerNote}</p>
        </section>
      ) : null}
      {order.internalNote ? (
        <section aria-label="Internal note" className="bg-mode-panel px-mode-page py-3 text-mode-body text-mode-ink">
          <p className="font-semibold">Internal note</p>
          <p className="mt-0.5 whitespace-pre-wrap">{order.internalNote}</p>
        </section>
      ) : null}
      {blockedReason ? <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">{blockedReason}</p> : null}
      <nav aria-label="Order record">
        <DetailNavRow
          href={withJobReturn(`/m/orders/${order.id}?by=id`, here)}
          title="Order"
          meta={`${orderRef} · customer, label, units, activity`}
          icon={<ClipboardList />}
        />
      </nav>
      {verbs.length > 0 ? <DetailDock label="FBM exception actions" verbs={verbs} onVerb={onVerb} /> : null}
    </>
  );
}
