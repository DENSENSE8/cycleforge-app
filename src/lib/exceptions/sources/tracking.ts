/**
 * `tracking` — an OPEN `tracking_exceptions` row (either domain), the
 * `?status=open` cut of `GET /api/tracking-exceptions`, org-scoped explicitly
 * and GUC-wrapped (`tenantQueryOneTrip`) for the RLS backstop.
 */

import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { TrackingExceptionFacts } from '../facts';
import { isoOrNull, positiveIntId, text, type ExceptionSource } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';

const TRACKING_FROM = `FROM tracking_exceptions te
  LEFT JOIN staff s ON s.id = te.staff_id`;
const TRACKING_WHERE = `WHERE te.organization_id = $1 AND te.status = 'open'`;
const TRACKING_SELECT = `SELECT te.id, te.tracking_number, te.domain, te.source_station, te.exception_reason, te.notes,
         te.status, te.shipment_id, te.receiving_id, te.last_zoho_check_at, te.zoho_check_count, te.last_error,
         te.created_at, te.updated_at, COALESCE(s.name, te.staff_name) AS staff_name`;

interface TrackingSqlRow {
  id: number | string;
  tracking_number: string;
  domain: 'orders' | 'receiving';
  source_station: string | null;
  exception_reason: string | null;
  notes: string | null;
  status: 'open' | 'resolved' | 'discarded';
  shipment_id: number | string | null;
  receiving_id: number | string | null;
  last_zoho_check_at: Date | string | null;
  zoho_check_count: number | string | null;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  staff_name: string | null;
}

/** `exception_reason` → tag. Anything unmapped reads as its own words. */
const TRACKING_REASON_LABEL: Readonly<Record<string, string>> = {
  not_found: 'Tracking not found',
  zoho_unreachable: 'Zoho unreachable',
};

/** An open tracking exception's tag: its reason's words. */
export function trackingExceptionTagLabel(reason: string | null): string {
  return (reason && TRACKING_REASON_LABEL[reason]) ?? (reason ? reason.replace(/_/g, ' ') : 'Tracking exception');
}

export function trackingRow(row: TrackingSqlRow): ExceptionRow {
  const sourceId = String(row.id);
  const reason = text(row.exception_reason);
  return {
    key: exceptionRowKey('tracking', sourceId),
    kind: 'tracking',
    domain: 'inventory',
    sourceId,
    tag: {
      label: trackingExceptionTagLabel(reason),
      tone: 'warning',
    },
    entity: { type: 'tracking', id: sourceId, label: row.tracking_number },
    title: null,
    detail:
      [row.domain === 'orders' ? 'Outbound' : 'Receiving', text(row.source_station), text(row.staff_name), text(row.notes)]
        .filter(Boolean)
        .join(' · ') || null,
    order: null,
    resolveVerb: 'Recheck',
    raisedAt: isoOrNull(row.created_at),
  };
}

function toFacts(row: TrackingSqlRow): TrackingExceptionFacts {
  return {
    kind: 'tracking',
    exception: {
      id: Number(row.id),
      trackingNumber: row.tracking_number,
      domain: row.domain,
      sourceStation: row.source_station,
      staffName: row.staff_name,
      exceptionReason: row.exception_reason,
      notes: row.notes,
      status: row.status,
      shipmentId: row.shipment_id == null ? null : Number(row.shipment_id),
      receivingId: row.receiving_id == null ? null : Number(row.receiving_id),
      lastZohoCheckAt: isoOrNull(row.last_zoho_check_at),
      zohoCheckCount: Number(row.zoho_check_count) || 0,
      lastError: row.last_error,
      createdAt: isoOrNull(row.created_at) ?? '',
      updatedAt: isoOrNull(row.updated_at) ?? '',
    },
  };
}

export const trackingSource: ExceptionSource<TrackingExceptionFacts> = {
  kind: 'tracking',
  async list(ctx) {
    const res = await tenantQueryOneTrip<TrackingSqlRow>(ctx.orgId, `${TRACKING_SELECT} ${TRACKING_FROM} ${TRACKING_WHERE}`, [ctx.orgId]);
    return res.rows.map(trackingRow);
  },
  async count(ctx) {
    const res = await tenantQueryOneTrip<{ n: number }>(ctx.orgId, `SELECT COUNT(*)::int AS n ${TRACKING_FROM} ${TRACKING_WHERE}`, [ctx.orgId]);
    return Number(res.rows[0]?.n) || 0;
  },
  async record(ctx, sourceId) {
    const id = positiveIntId(sourceId);
    if (id == null) return null;
    const res = await tenantQueryOneTrip<TrackingSqlRow>(
      ctx.orgId,
      `${TRACKING_SELECT} ${TRACKING_FROM} ${TRACKING_WHERE} AND te.id = $2 LIMIT 1`,
      [ctx.orgId, id],
    );
    const row = res.rows[0];
    return row ? { row: trackingRow(row), facts: toFacts(row) } : null;
  },
};
