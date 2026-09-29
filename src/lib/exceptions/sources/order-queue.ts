/**
 * The order-exception queue, split in two by the SKU-mapping hold (owner
 * 2026-09-28: a row belongs to ONE kind). Membership is
 * `exceptionScopeWhere('actionable')` — the queue the FBM desk, its sidebar
 * count and the nav facets already read; the split is `isExceptionHeld`, the
 * pure twin of `exceptionHeldSql` (caged + unpaired). Held orders are `pairs`
 * — whatever else holds them; every other queued order is `fbm`.
 */

import { exceptionHeldSql, isExceptionHeld } from '@/lib/orders/exception-membership';
import { ORDER_EXCEPTION_CATEGORY_SQL, exceptionScopeWhere } from '@/lib/orders/order-exceptions';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import { memoized, type ExceptionSourceContext } from '../source';
import type { ExceptionRow } from '../types';

/** The buyer's and the team's note on an order row (`orders.buyer_note`, `orders.notes`), blank = null. */
export const ORDER_NOTES_SQL = `NULLIF(TRIM(COALESCE(o.buyer_note, '')), '') AS buyer_note,
         NULLIF(TRIM(COALESCE(o.notes, '')), '') AS staff_note`;

export type OrderQueueKind = 'fbm' | 'pairs';

export interface OrderQueueRow {
  id: number | string;
  order_id: string | null;
  item_number: string | null;
  sku: string | null;
  product_title: string | null;
  account_source: string | null;
  buyer_note: string | null;
  staff_note: string | null;
  created_at: Date | string | null;
  release_state: string | null;
  sku_catalog_id: number | string | null;
  category: string;
}

/** Which kind a queued order belongs to. */
export function orderQueueKind(row: Pick<OrderQueueRow, 'release_state' | 'sku_catalog_id'>): OrderQueueKind {
  const skuCatalogId = row.sku_catalog_id == null ? null : Number(row.sku_catalog_id);
  return isExceptionHeld({ releaseState: row.release_state, skuCatalogId }) ? 'pairs' : 'fbm';
}

const ORDER_QUEUE_SELECT = `SELECT o.id, o.order_id, o.item_number, o.sku, o.product_title, o.account_source, o.created_at,
         ${ORDER_NOTES_SQL},
         o.release_state, o.sku_catalog_id, ${ORDER_EXCEPTION_CATEGORY_SQL} AS category
    FROM orders o
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  ${exceptionScopeWhere('actionable')}`;

/** The whole queue, loaded once per request for both kinds. */
function loadOrderQueue(ctx: ExceptionSourceContext): Promise<OrderQueueRow[]> {
  return memoized(ctx, 'orders:exception-queue', async () =>
    (await tenantQueryOneTrip<OrderQueueRow>(ctx.orgId, ORDER_QUEUE_SELECT, [ctx.orgId])).rows);
}

/** Both halves' sizes in ONE `COUNT` over the same queue predicate, split by `exceptionHeldSql` (the SQL twin of {@link orderQueueKind}). */
function loadOrderQueueCounts(ctx: ExceptionSourceContext): Promise<Record<OrderQueueKind, number>> {
  return memoized(ctx, 'orders:exception-queue-counts', async () => {
    const res = await tenantQueryOneTrip<{ held: boolean; n: number }>(
      ctx.orgId,
      `SELECT ${exceptionHeldSql('o')} AS held, COUNT(*)::int AS n
         FROM orders o
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
       ${exceptionScopeWhere('actionable')}
       GROUP BY 1`,
      [ctx.orgId],
    );
    const counts: Record<OrderQueueKind, number> = { fbm: 0, pairs: 0 };
    for (const row of res.rows) counts[row.held ? 'pairs' : 'fbm'] += Number(row.n) || 0;
    return counts;
  });
}

export async function countOrderQueue(ctx: ExceptionSourceContext, kind: OrderQueueKind): Promise<number> {
  return (await loadOrderQueueCounts(ctx))[kind];
}

export async function listOrderQueue(ctx: ExceptionSourceContext, kind: OrderQueueKind): Promise<OrderQueueRow[]> {
  return (await loadOrderQueue(ctx)).filter((row) => orderQueueKind(row) === kind);
}

/** One order, only while it is queued AND in `kind`. */
export async function getOrderQueueRow(
  ctx: ExceptionSourceContext,
  kind: OrderQueueKind,
  orderId: number,
): Promise<OrderQueueRow | null> {
  const res = await tenantQueryOneTrip<OrderQueueRow>(ctx.orgId, `${ORDER_QUEUE_SELECT} AND o.id = $2 LIMIT 1`, [ctx.orgId, orderId]);
  const row = res.rows[0];
  return row && orderQueueKind(row) === kind ? row : null;
}

/** "Item 1234 · SKU ABC" — the evidence line under an order row (its channel rides line 1, `orderLine`). */
export function orderEvidence(row: Pick<OrderQueueRow, 'item_number' | 'sku'>): string | null {
  const parts = [
    row.item_number?.trim() ? `Item ${row.item_number.trim()}` : null,
    row.sku?.trim() ? `SKU ${row.sku.trim()}` : null,
  ].filter((part): part is string => part != null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function orderEntity(row: Pick<OrderQueueRow, 'id' | 'order_id'>) {
  const id = String(row.id);
  return { type: 'order' as const, id, label: row.order_id?.trim() || `Order #${id}` };
}

/** `ExceptionRow.order` — the Allocate card's line 1: channel and notes. */
export function orderLine(row: Pick<OrderQueueRow, 'account_source' | 'buyer_note' | 'staff_note'>): NonNullable<ExceptionRow['order']> {
  return {
    accountSource: row.account_source?.trim() || null,
    buyerNote: row.buyer_note?.trim() || null,
    staffNote: row.staff_note?.trim() || null,
  };
}
