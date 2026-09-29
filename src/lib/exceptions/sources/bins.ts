/**
 * `bins` — an OPEN drift alert: `stock_alerts` rows the drift-check cron
 * (`/api/cron/inventory/drift-check`) opened and has not closed, the
 * `?bucket=drift,unresolved` cut of `GET /api/inventory/alerts`.
 */

import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { BinsExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, text, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';

const BINS_FROM = `FROM stock_alerts a
  LEFT JOIN locations l ON l.id = a.bin_id AND l.organization_id = a.organization_id`;
const BINS_WHERE = `WHERE a.organization_id = $1
    AND a.alert_type = 'DRIFT'
    AND a.resolved_at IS NULL`;
const BINS_SELECT = `SELECT a.id, a.sku, a.bin_id, l.barcode AS bin_barcode, a.qty_at_trigger, a.notes, a.triggered_at,
         (SELECT sc.product_title FROM sku_catalog sc
           WHERE sc.organization_id = a.organization_id AND sc.sku = a.sku
           LIMIT 1) AS product_title`;

interface BinsSqlRow {
  id: number | string;
  sku: string;
  bin_id: number | string | null;
  bin_barcode: string | null;
  qty_at_trigger: number | string | null;
  notes: string | null;
  triggered_at: Date | string | null;
  product_title: string | null;
}

function toFacts(row: BinsSqlRow): BinsExceptionFacts {
  return {
    kind: 'bins',
    alert: {
      id: Number(row.id),
      sku: row.sku,
      binId: row.bin_id == null ? null : Number(row.bin_id),
      binBarcode: row.bin_barcode,
      qtyAtTrigger: row.qty_at_trigger == null ? null : Number(row.qty_at_trigger),
      notes: row.notes,
      raisedAt: isoOrNull(row.triggered_at),
      productTitle: row.product_title,
    },
  };
}

export function binsRow(row: BinsSqlRow): ExceptionRow {
  const sourceId = String(row.id);
  const binLabel = text(row.bin_barcode);
  return {
    key: exceptionRowKey('bins', sourceId),
    kind: 'bins',
    domain: 'inventory',
    sourceId,
    tag: { label: 'Stock drift', tone: 'danger' },
    entity: binLabel
      ? { type: 'location', id: String(row.bin_id), label: `${binLabel} · ${row.sku}` }
      : { type: 'sku', id: row.sku, label: row.sku },
    title: text(row.product_title),
    detail: text(row.notes),
    order: null,
    resolveVerb: 'Acknowledge',
    raisedAt: isoOrNull(row.triggered_at),
  };
}

export const binsSource: ExceptionSource<BinsExceptionFacts> = {
  kind: 'bins',
  async list(ctx) {
    const res = await tenantQueryOneTrip<BinsSqlRow>(ctx.orgId, `${BINS_SELECT} ${BINS_FROM} ${BINS_WHERE}`, [ctx.orgId]);
    return res.rows.map(binsRow);
  },
  async count(ctx) {
    const res = await tenantQueryOneTrip<{ n: number }>(ctx.orgId, `SELECT COUNT(*)::int AS n ${BINS_FROM} ${BINS_WHERE}`, [ctx.orgId]);
    return Number(res.rows[0]?.n) || 0;
  },
  async record(ctx, sourceId) {
    const alertId = positiveIntId(sourceId);
    if (alertId == null) return null;
    const res = await tenantQueryOneTrip<BinsSqlRow>(
      ctx.orgId,
      `${BINS_SELECT} ${BINS_FROM} ${BINS_WHERE} AND a.id = $2 LIMIT 1`,
      [ctx.orgId, alertId],
    );
    const row = res.rows[0];
    return row ? { row: binsRow(row), facts: toFacts(row) } : null;
  },
};
