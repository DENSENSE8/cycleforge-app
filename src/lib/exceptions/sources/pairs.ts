/**
 * `pairs` — two populations, one kind: queued orders held for SKU mapping
 * (sourceId = order row id) and on-hold `TMP-` placeholder products
 * (sourceId = the TMP SKU; Inventory Stock `?status=on-hold`, the SKU
 * Exceptions view, reads the same `listProvisionalSkus`).
 */

import {
  countProvisionalSkus,
  getProvisionalSkuDetail,
  listProvisionalSkus,
  type ProvisionalSku,
} from '@/lib/neon/provisional-sku-queries';
import { ORDER_EXCEPTION_BLOCKER_LABEL, deriveOrderExceptionBlockers } from '@/lib/orders/order-exception-types';
import { getOrderException } from '@/lib/orders/order-exceptions';
import type { PairsExceptionFacts } from '../facts';
import { isoOrNull, memoized, positiveIntId, type ExceptionSource, type ExceptionSourceContext } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';
import { countOrderQueue, getOrderQueueRow, listOrderQueue, orderEntity, orderEvidence, orderLine, type OrderQueueRow } from './order-queue';

const PLACEHOLDER_PREFIX = 'TMP-';

export function pairsOrderRow(row: OrderQueueRow): ExceptionRow {
  // A held order is unpaired by definition; a missing item number blocks the pairing itself.
  const noItemNumber = deriveOrderExceptionBlockers({ itemNumber: row.item_number, skuCatalogId: null }).includes('no_item_number');
  const sourceId = String(row.id);
  return {
    key: exceptionRowKey('pairs', sourceId),
    kind: 'pairs',
    domain: 'inventory',
    sourceId,
    tag: {
      label: ORDER_EXCEPTION_BLOCKER_LABEL[noItemNumber ? 'no_item_number' : 'unpaired'],
      tone: 'danger',
    },
    entity: orderEntity(row),
    title: row.product_title?.trim() || null,
    detail: orderEvidence(row),
    order: orderLine(row),
    resolveVerb: noItemNumber ? 'Add item number' : 'Pair SKU',
    raisedAt: isoOrNull(row.created_at),
  };
}

export function pairsPlaceholderRow(item: ProvisionalSku): ExceptionRow {
  const bins = item.locations.map((location) => location.barcode).filter(Boolean);
  const detail = [
    `${item.stock} in stock`,
    bins.length > 0 ? bins.join(', ') : null,
    item.createdByName ? `Minted by ${item.createdByName}` : null,
  ].filter((part): part is string => part != null);
  return {
    key: exceptionRowKey('pairs', item.sku),
    kind: 'pairs',
    domain: 'inventory',
    sourceId: item.sku,
    tag: { label: 'On-hold SKU', tone: 'warning' },
    entity: { type: 'sku', id: item.sku, label: item.sku },
    title: item.productTitle?.trim() || null,
    detail: detail.join(' · '),
    order: null,
    resolveVerb: 'Pair SKU',
    raisedAt: isoOrNull(item.createdAt),
  };
}

const listPlaceholders = (ctx: ExceptionSourceContext) =>
  memoized(ctx, 'pairs:placeholders', () => listProvisionalSkus(ctx.orgId));

export const pairsSource: ExceptionSource<PairsExceptionFacts> = {
  kind: 'pairs',
  async list(ctx) {
    const [orders, placeholders] = await Promise.all([listOrderQueue(ctx, 'pairs'), listPlaceholders(ctx)]);
    return [...orders.map(pairsOrderRow), ...placeholders.map(pairsPlaceholderRow)];
  },
  async count(ctx) {
    const [orders, placeholders] = await Promise.all([countOrderQueue(ctx, 'pairs'), countProvisionalSkus(ctx.orgId)]);
    return orders + placeholders;
  },
  async record(ctx, sourceId) {
    if (sourceId.startsWith(PLACEHOLDER_PREFIX)) {
      const placeholder = await getProvisionalSkuDetail(sourceId, ctx.orgId);
      return placeholder
        ? { row: pairsPlaceholderRow(placeholder), facts: { kind: 'pairs', source: 'placeholder', placeholder } }
        : null;
    }
    const orderId = positiveIntId(sourceId);
    if (orderId == null) return null;
    const member = await getOrderQueueRow(ctx, 'pairs', orderId);
    if (!member) return null;
    const order = await getOrderException(ctx.orgId, orderId);
    return order ? { row: pairsOrderRow(member), facts: { kind: 'pairs', source: 'order', order } } : null;
  },
};
