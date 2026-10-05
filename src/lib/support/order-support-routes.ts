import { shippingOrdersHref } from '@/lib/shipping/orders-desk';

/** Open an order in the shared To-ship desk with support context. */
export function supportOrdersHref(orderPk: number): string {
  const id = Number(orderPk);
  return Number.isFinite(id) && id > 0
    ? shippingOrdersHref({ context: 'support', openOrderId: id })
    : shippingOrdersHref({ context: 'support' });
}

/** Open the order-anchored New ticket form in the shared To-ship desk. */
export function supportCreateTicketHref(orderPk: number): string {
  const id = Number(orderPk);
  return Number.isFinite(id) && id > 0
    ? shippingOrdersHref({ context: 'support', openOrderId: id, createTicket: true })
    : shippingOrdersHref({ context: 'support', createTicket: true });
}

/** Escape hatch from support context to the ordinary To-ship order detail. */
export function dashboardOrderHref(orderPk: number): string {
  const id = Number(orderPk);
  return Number.isFinite(id) && id > 0
    ? shippingOrdersHref({ openOrderId: id })
    : shippingOrdersHref();
}
