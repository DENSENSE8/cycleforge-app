/** `fbm` — a queued order held by anything but SKU mapping (out of stock, shipping issue). */

import { getOrderException } from '@/lib/orders/order-exceptions';
import type { FbmExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';
import { countOrderQueue, getOrderQueueRow, listOrderQueue, orderEntity, orderEvidence, orderLine, type OrderQueueRow } from './order-queue';

/** The CTA per `ORDER_EXCEPTION_CATEGORY_SQL` value a non-held queued order can take. */
const FBM_CATEGORY_FACE: Readonly<Record<string, { label: string; tone: 'danger' | 'warning'; verb: string }>> = {
  'Out of Stock': { label: 'Out of stock', tone: 'danger', verb: 'Mark in stock' },
  'Shipping Issue': { label: 'Shipping issue', tone: 'danger', verb: 'Review shipment' },
};
const FBM_FALLBACK_FACE = { label: 'On hold', tone: 'warning' as const, verb: 'Review order' };

export function fbmRow(row: OrderQueueRow): ExceptionRow {
  const face = FBM_CATEGORY_FACE[row.category] ?? FBM_FALLBACK_FACE;
  const sourceId = String(row.id);
  return {
    key: exceptionRowKey('fbm', sourceId),
    kind: 'fbm',
    domain: 'fulfillment',
    sourceId,
    tag: { label: face.label, tone: face.tone },
    entity: orderEntity(row),
    title: row.product_title?.trim() || null,
    detail: orderEvidence(row),
    order: orderLine(row),
    resolveVerb: face.verb,
    raisedAt: isoOrNull(row.created_at),
  };
}

export const fbmSource: ExceptionSource<FbmExceptionFacts> = {
  kind: 'fbm',
  list: async (ctx) => (await listOrderQueue(ctx, 'fbm')).map(fbmRow),
  count: (ctx) => countOrderQueue(ctx, 'fbm'),
  async record(ctx, sourceId) {
    const orderId = positiveIntId(sourceId);
    if (orderId == null) return null;
    const member = await getOrderQueueRow(ctx, 'fbm', orderId);
    if (!member) return null;
    const order = await getOrderException(ctx.orgId, orderId);
    return order ? { row: fbmRow(member), facts: { kind: 'fbm', order } } : null;
  },
};
