/**
 * `unmatched` — an open unmatched pack / dock scan: an `orders_exceptions`
 * row matching `sqlOpenUnmatchedScan` (the predicate Fulfilled's unmatched
 * desk and `GET /api/orders-exceptions/unmatched` read), org-scoped
 * explicitly and GUC-wrapped (`tenantQueryOneTrip`) for the RLS backstop.
 */

import { sqlOpenUnmatchedScan, type UnmatchedScanSourceStation } from '@/lib/orders-exceptions';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { UnmatchedScanExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, text, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';

const UNMATCHED_FROM = `FROM orders_exceptions oe
  LEFT JOIN staff s ON s.id = oe.staff_id AND s.organization_id = oe.organization_id`;
const UNMATCHED_WHERE = `WHERE oe.organization_id = $1 AND ${sqlOpenUnmatchedScan('oe')}`;
const UNMATCHED_SELECT = `SELECT oe.id, oe.shipping_tracking_number AS tracking, oe.source_station, oe.notes,
         oe.created_at, COALESCE(s.name, oe.staff_name) AS staff_name`;

interface UnmatchedSqlRow {
  id: number | string;
  tracking: string | null;
  source_station: UnmatchedScanSourceStation;
  notes: string | null;
  created_at: Date | string;
  staff_name: string | null;
}

/** The scan's station, as the floor names it. */
const STATION_LABEL: Readonly<Record<UnmatchedScanSourceStation, string>> = {
  packer: 'Pack scan',
  outbound: 'Dock scan',
};

export function unmatchedScanRow(row: UnmatchedSqlRow): ExceptionRow {
  const sourceId = String(row.id);
  const tracking = text(row.tracking) ?? '';
  return {
    key: exceptionRowKey('unmatched', sourceId),
    kind: 'unmatched',
    domain: 'fulfillment',
    sourceId,
    tag: { label: STATION_LABEL[row.source_station], tone: 'warning' },
    entity: { type: 'tracking', id: sourceId, label: tracking },
    title: null,
    detail: [`${STATION_LABEL[row.source_station]} matched no order`, text(row.staff_name), text(row.notes)].filter(Boolean).join(' · '),
    order: null,
    resolveVerb: 'Open in Fulfilled',
    raisedAt: isoOrNull(row.created_at),
  };
}

function toFacts(row: UnmatchedSqlRow): UnmatchedScanExceptionFacts {
  return {
    kind: 'unmatched',
    scan: {
      id: Number(row.id),
      tracking: text(row.tracking) ?? '',
      sourceStation: row.source_station,
      staffName: text(row.staff_name),
      notes: text(row.notes),
      createdAt: isoOrNull(row.created_at) ?? '',
    },
  };
}

export const unmatchedSource: ExceptionSource<UnmatchedScanExceptionFacts> = {
  kind: 'unmatched',
  async list(ctx) {
    const res = await tenantQueryOneTrip<UnmatchedSqlRow>(
      ctx.orgId,
      `${UNMATCHED_SELECT} ${UNMATCHED_FROM} ${UNMATCHED_WHERE} ORDER BY oe.created_at DESC, oe.id DESC`,
      [ctx.orgId],
    );
    return res.rows.map(unmatchedScanRow);
  },
  async count(ctx) {
    const res = await tenantQueryOneTrip<{ n: number }>(
      ctx.orgId,
      `SELECT COUNT(*)::int AS n FROM orders_exceptions oe ${UNMATCHED_WHERE}`,
      [ctx.orgId],
    );
    return Number(res.rows[0]?.n) || 0;
  },
  async record(ctx, sourceId) {
    const id = positiveIntId(sourceId);
    if (id == null) return null;
    const res = await tenantQueryOneTrip<UnmatchedSqlRow>(
      ctx.orgId,
      `${UNMATCHED_SELECT} ${UNMATCHED_FROM} ${UNMATCHED_WHERE} AND oe.id = $2 LIMIT 1`,
      [ctx.orgId, id],
    );
    const row = res.rows[0];
    return row ? { row: unmatchedScanRow(row), facts: toFacts(row) } : null;
  },
};
