/**
 * `paperwork` — an open To-ship order whose print packet is incomplete: no
 * shipping-label document (G3), or no G2 paperwork without an exemption
 * (order `docs_not_required` or SKU `paperwork_not_required`).
 * The SAME predicate as the To-ship Labels badge (`queue-counts`'
 * `paperworkIncomplete` = `sqlOrderInWarehouseToShip` ∩
 * `PRINT_PACKET_INCOMPLETE_SQL`). Owner 2026-09-28 reversal: paperwork IS an
 * exception (see `order-exception-types.ts`).
 */

import { sqlOrderInWarehouseToShip } from '@/lib/orders/desk-view-sql';
import { G2_DOCUMENT_EXISTS_SQL, G2_SKU_PAPERWORK_NOT_REQUIRED_SQL } from '@/lib/orders/g2-paperwork-sql';
import { PRINT_PACKET_INCOMPLETE_SQL, PRINT_PACKET_LABEL_EXISTS_SQL } from '@/lib/orders/print-packet';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { PaperworkExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, text, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';
import { ORDER_NOTES_SQL, orderEntity, orderEvidence, orderLine } from './order-queue';

const PAPERWORK_FROM = `FROM orders o
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id`;
const PAPERWORK_WHERE = `WHERE o.organization_id = $1
    AND ${sqlOrderInWarehouseToShip('o')}
    AND ${PRINT_PACKET_INCOMPLETE_SQL}`;
const PAPERWORK_SELECT = `SELECT o.id, o.order_id, o.item_number, o.sku, o.product_title, o.account_source, o.created_at,
         ${ORDER_NOTES_SQL},
         COALESCE(o.docs_not_required, false) AS docs_not_required,
         ${G2_SKU_PAPERWORK_NOT_REQUIRED_SQL} AS sku_paperwork_not_required,
         NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking_number,
         ${PRINT_PACKET_LABEL_EXISTS_SQL} AS has_label,
         ${G2_DOCUMENT_EXISTS_SQL} AS has_documents`;

interface PaperworkSqlRow {
  id: number | string;
  order_id: string | null;
  item_number: string | null;
  sku: string | null;
  product_title: string | null;
  account_source: string | null;
  buyer_note: string | null;
  staff_note: string | null;
  created_at: Date | string | null;
  docs_not_required: boolean;
  sku_paperwork_not_required: boolean;
  tracking_number: string | null;
  has_label: boolean;
  has_documents: boolean;
}

function missingOf(row: PaperworkSqlRow): Array<'documents' | 'label'> {
  const missing: Array<'documents' | 'label'> = [];
  const exempt = row.docs_not_required || row.sku_paperwork_not_required;
  if (!exempt && !row.has_documents) missing.push('documents');
  if (!row.has_label) missing.push('label');
  return missing;
}

export function paperworkRow(row: PaperworkSqlRow): ExceptionRow {
  const missing = missingOf(row);
  const sourceId = String(row.id);
  const label =
    missing.length === 2 ? 'Missing label & docs' : missing[0] === 'label' ? 'Missing label' : 'Missing docs';
  return {
    key: exceptionRowKey('paperwork', sourceId),
    kind: 'paperwork',
    domain: 'fulfillment',
    sourceId,
    tag: { label, tone: 'warning' },
    entity: orderEntity(row),
    title: text(row.product_title),
    detail: orderEvidence(row),
    order: orderLine(row),
    resolveVerb: missing.includes('label') ? 'Link label' : 'Link manual',
    raisedAt: isoOrNull(row.created_at),
  };
}

export const paperworkSource: ExceptionSource<PaperworkExceptionFacts> = {
  kind: 'paperwork',
  async list(ctx) {
    const res = await tenantQueryOneTrip<PaperworkSqlRow>(ctx.orgId, `${PAPERWORK_SELECT} ${PAPERWORK_FROM} ${PAPERWORK_WHERE}`, [ctx.orgId]);
    return res.rows.map(paperworkRow);
  },
  async count(ctx) {
    const res = await tenantQueryOneTrip<{ n: number }>(ctx.orgId, `SELECT COUNT(*)::int AS n ${PAPERWORK_FROM} ${PAPERWORK_WHERE}`, [ctx.orgId]);
    return Number(res.rows[0]?.n) || 0;
  },
  async record(ctx, sourceId) {
    const orderId = positiveIntId(sourceId);
    if (orderId == null) return null;
    const res = await tenantQueryOneTrip<PaperworkSqlRow>(
      ctx.orgId,
      `${PAPERWORK_SELECT} ${PAPERWORK_FROM} ${PAPERWORK_WHERE} AND o.id = $2 LIMIT 1`,
      [ctx.orgId, orderId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      row: paperworkRow(row),
      facts: {
        kind: 'paperwork',
        order: {
          id: Number(row.id),
          orderNumber: row.order_id,
          accountSource: row.account_source,
          sku: row.sku,
          itemNumber: row.item_number,
          productTitle: row.product_title,
          trackingNumber: row.tracking_number,
        },
        hasShippingLabelDocument: row.has_label,
        hasDocuments: row.has_documents,
        docsNotRequired: row.docs_not_required,
        skuPaperworkNotRequired: row.sku_paperwork_not_required,
        missing: missingOf(row),
      },
    };
  },
};
