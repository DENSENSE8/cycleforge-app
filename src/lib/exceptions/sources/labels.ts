/**
 * `labels` — an order whose LATEST label ingestion is quarantined or failed:
 * `LATEST_LABEL_LATERAL_SQL`, the lateral the outbound work projection's
 * `exceptions` saved view reads (`work-projection.ts`).
 */

import { getLabelIngestion } from '@/lib/label-ingestions/ingestion-service';
import { LATEST_LABEL_LATERAL_SQL } from '@/lib/outbound/work-material';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { LabelsExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, text, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';
import { orderEntity } from './order-queue';

const LABELS_FROM = `FROM orders o
  ${LATEST_LABEL_LATERAL_SQL}
  JOIN label_ingestions li ON li.id = latest_label.id AND li.organization_id = o.organization_id
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id AND stn.organization_id = o.organization_id`;
const LABELS_WHERE = `WHERE o.organization_id = $1
    AND latest_label.state IN ('QUARANTINED', 'FAILED')`;
const LABELS_SELECT = `SELECT o.id, o.order_id, o.item_number, o.sku, o.product_title, o.account_source,
         NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking_number,
         li.id AS ingestion_id, li.state, li.quarantine_reason_code, li.error_code,
         li.file_basename, li.tracking_number_raw AS label_tracking, li.updated_at`;

interface LabelsSqlRow {
  id: number | string;
  order_id: string | null;
  item_number: string | null;
  sku: string | null;
  product_title: string | null;
  account_source: string | null;
  tracking_number: string | null;
  ingestion_id: number | string;
  state: 'QUARANTINED' | 'FAILED';
  quarantine_reason_code: string | null;
  error_code: string | null;
  file_basename: string | null;
  label_tracking: string | null;
  updated_at: Date | string | null;
}

/** `ORDER_NOT_FOUND` → "order not found". */
function humanCode(code: string | null): string | null {
  return code ? code.toLowerCase().replace(/_/g, ' ') : null;
}

export function labelsRow(row: LabelsSqlRow): ExceptionRow {
  const sourceId = String(row.id);
  const quarantined = row.state === 'QUARANTINED';
  const reason = humanCode(quarantined ? row.quarantine_reason_code : row.error_code);
  return {
    key: exceptionRowKey('labels', sourceId),
    kind: 'labels',
    domain: 'fulfillment',
    sourceId,
    tag: { label: quarantined ? 'Label quarantined' : 'Label failed', tone: 'danger' },
    entity: orderEntity(row),
    title: text(row.product_title),
    detail: [reason, text(row.label_tracking), text(row.file_basename)].filter(Boolean).join(' · ') || null,
    order: null,
    resolveVerb: 'Retry label',
    raisedAt: isoOrNull(row.updated_at),
  };
}

export const labelsSource: ExceptionSource<LabelsExceptionFacts> = {
  kind: 'labels',
  async list(ctx) {
    const res = await tenantQueryOneTrip<LabelsSqlRow>(ctx.orgId, `${LABELS_SELECT} ${LABELS_FROM} ${LABELS_WHERE}`, [ctx.orgId]);
    return res.rows.map(labelsRow);
  },
  async count(ctx) {
    const res = await tenantQueryOneTrip<{ n: number }>(ctx.orgId, `SELECT COUNT(*)::int AS n ${LABELS_FROM} ${LABELS_WHERE}`, [ctx.orgId]);
    return Number(res.rows[0]?.n) || 0;
  },
  async record(ctx, sourceId) {
    const orderId = positiveIntId(sourceId);
    if (orderId == null) return null;
    const res = await tenantQueryOneTrip<LabelsSqlRow>(
      ctx.orgId,
      `${LABELS_SELECT} ${LABELS_FROM} ${LABELS_WHERE} AND o.id = $2 LIMIT 1`,
      [ctx.orgId, orderId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const ingestion = await getLabelIngestion(ctx.orgId, Number(row.ingestion_id));
    return {
      row: labelsRow(row),
      facts: {
        kind: 'labels',
        order: {
          id: Number(row.id),
          orderNumber: row.order_id,
          accountSource: row.account_source,
          sku: row.sku,
          itemNumber: row.item_number,
          productTitle: row.product_title,
          trackingNumber: row.tracking_number,
        },
        ingestion,
      },
    };
  },
};
