/** GET /api/receiving-lines/incoming/summary */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';
import {
  getDeliveredUnscannedCount,
  getDeliveredUnscannedClaimsCount,
  NOT_ZOHO_RECEIVED_PREDICATE,
  CARRIER_MISMATCH_PREDICATE,
  SHIPMENT_SCANNED_PREDICATE,
} from '@/lib/receiving/delivered-unscanned';
import { getDeliveredNotUnboxedCount } from '@/lib/receiving/delivered-not-unboxed';
import { isIncomingUniversal } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_request: NextRequest, ctx) => {
  const orgId = ctx.organizationId;
  // 30s-polled Incoming attention filter counts. Cache the composed
  // aggregate org-scoped; every receiving write busts receiving-lines.
  const payload = await getOrSet(
    CACHE_NS.receivingIncomingSummary,
    orgId,
    'summary',
    CACHE_TTL.rollup,
    [CACHE_TAGS.receivingLines],
    async () => {
  const r = await tenantQuery<{
    issued: number;
    delivered_unopened: number;
    arriving_today: number;
    stalled: number;
    in_transit: number;
    pending_carrier: number;
    carrier_mismatch: number;
    tracking_unavailable: number;
    awaiting_tracking: number;
    expected_today: number;
  }>(
    orgId,
    // Wave-2 reader cutover:
    `SELECT
         COUNT(DISTINCT rz.zoho_purchaseorder_id)::int AS issued,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.is_delivered = true
             AND NOT EXISTS (
               SELECT 1 FROM receiving_scans rs WHERE rs.receiving_id = r.id
             )
         )::int AS delivered_unopened,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.latest_status_category = 'OUT_FOR_DELIVERY'
         )::int AS arriving_today,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.id IS NOT NULL
             AND COALESCE(stn.is_terminal, false) = false
             AND COALESCE(stn.is_delivered, false) = false
             AND (
               stn.has_exception = true
               OR (stn.latest_event_at IS NOT NULL
                   AND stn.latest_event_at < (NOW() - interval '72 hours'))
             )
         )::int AS stalled,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.latest_status_category IN ('IN_TRANSIT','ACCEPTED','LABEL_CREATED')
         )::int AS in_transit,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.id IS NOT NULL
             AND stn.tracking_blocked_reason IS NULL
             AND (stn.latest_status_category IS NULL OR stn.latest_status_category = 'UNKNOWN')
             AND NOT ${CARRIER_MISMATCH_PREDICATE}
         )::int AS pending_carrier,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE ${CARRIER_MISMATCH_PREDICATE}
         )::int AS carrier_mismatch,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.tracking_blocked_reason IS NOT NULL
             AND COALESCE(stn.is_delivered, false) = false
         )::int AS tracking_unavailable,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE stn.id IS NULL
         )::int AS awaiting_tracking,
         COUNT(DISTINCT rz.zoho_purchaseorder_id) FILTER (
           WHERE mirror.expected_delivery_date = (NOW() AT TIME ZONE 'America/Los_Angeles')::date
         )::int AS expected_today
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
       LEFT JOIN receiving_carton r ON (
            r.id = rl.receiving_id
         OR (rl.receiving_id IS NULL
             AND r.source = 'zoho_po'
             AND r.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
             -- String-key join (PO id) collides across tenants; pin to same org.
             AND r.organization_id = rl.organization_id)
       )
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       LEFT JOIN zoho_po_mirror mirror ON mirror.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
       WHERE rl.workflow_status = 'EXPECTED'
         AND COALESCE(rl.quantity_received, 0) = 0
         AND rz.zoho_purchaseorder_id IS NOT NULL
         -- Tenant ownership: only this org's incoming PO lines.
         AND rl.organization_id = $1
         -- Drop POs Zoho now reports received/closed/cancelled, so a
         -- received order leaves Incoming after a Refresh-Zoho mirror sync.
         AND ${NOT_ZOHO_RECEIVED_PREDICATE}
         -- A scanned box has left Incoming (it shows in the scanned view now), so
         -- exclude it here too — keeps these chip counts in sync with the list's
         -- view=incoming rows, which now apply the same scan guard.
         AND NOT ${SHIPMENT_SCANNED_PREDICATE}`,
    [orgId],
  );

  const row = r.rows[0] ?? {
    issued: 0,
    delivered_unopened: 0,
    arriving_today: 0,
    stalled: 0,
    in_transit: 0,
    pending_carrier: 0,
    carrier_mismatch: 0,
    tracking_unavailable: 0,
    awaiting_tracking: 0,
    expected_today: 0,
  };

  // `delivered_unopened` is shipment-anchored, not PO-line-anchored:
  row.delivered_unopened = await getDeliveredUnscannedCount(pool, undefined, orgId);
  const delivered_not_unboxed = await getDeliveredNotUnboxedCount(orgId);
  // Claims-attention sub-band of the hunt queue (>48h since delivered, still unscanned).
  const delivered_unscanned_claims = await getDeliveredUnscannedClaimsCount(pool, undefined, orgId);

  // Universal Incoming (flag-gated): eBay buyer lines still awaiting their Zoho
  // PO — the "Needs Zoho link (n)" pill (plan §6.2/§8.2). 0 when the flag is off
  // so the response shape and the legacy Zoho-only tiles are unchanged.
  let ebay_pending = 0;
  let ebay_incoming = 0;
  // `universal_incoming` gates the eBay purchasing-source search filter + KPI on the incoming workbench:
  const universal_incoming = await isIncomingUniversal(orgId);
  if (universal_incoming) {
    const er = await tenantQuery<{ ebay_pending: number; ebay_incoming: number }>(
      orgId,
      `SELECT
                COUNT(*) FILTER (
                  WHERE rl.inbound_source_type = 'ebay' AND rz.zoho_purchaseorder_id IS NULL
                )::int AS ebay_pending,
                COUNT(*) FILTER (
                  WHERE rl.inbound_source_type = 'ebay'
                )::int AS ebay_incoming
           FROM receiving_line rl
           LEFT JOIN receiving_line_zoho rz
             ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
          WHERE rl.organization_id = $1
            AND rl.workflow_status = 'EXPECTED'
            AND COALESCE(rl.quantity_received, 0) = 0`,
      [orgId],
    );
    ebay_pending = er.rows[0]?.ebay_pending ?? 0;
    ebay_incoming = er.rows[0]?.ebay_incoming ?? 0;
  }

  return {
    ...row,
    delivered_not_unboxed,
    delivered_unscanned_claims,
    ebay_pending,
    ebay_incoming,
    universal_incoming,
  };
    },
  );

  return NextResponse.json({ success: true, ...payload });
}, { permission: 'receiving.view' });
