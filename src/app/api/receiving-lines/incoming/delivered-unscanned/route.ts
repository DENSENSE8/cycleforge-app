/** GET /api/receiving-lines/incoming/delivered-unscanned */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  deliveredUnscannedBaseSql,
  DELIVERED_UNSCANNED_WINDOW_DAYS as WINDOW_DAYS,
  DELIVERED_UNSCANNED_CAP as CAP,
  type DeliveredUnscannedAgeBand,
} from '@/lib/receiving/delivered-unscanned';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  // 60s-polled Incoming "delivered · not scanned" lane. Cached org-scoped;
  // every receiving write busts receiving-lines (org-scoped).
  const payload = await getOrSet(
    CACHE_NS.receivingIncomingLanes,
    ctx.organizationId,
    'delivered-unscanned',
    CACHE_TTL.rollup,
    [CACHE_TAGS.receivingLines],
    async () => {
  // SKU/PO enrichment always joins via receiving_line.shipment_id when a line is stamped (unified inbound model is always-on for this read…
  const { rows } = await tenantQuery<{
    shipment_id: number;
    carrier: string;
    tracking_number_raw: string;
    tracking_number_normalized: string;
    delivered_at: string | null;
    source_system: string | null;
    age_band: DeliveredUnscannedAgeBand;
    zoho_purchaseorder_id: string | null;
    zoho_status: string | null;
    po_number: string | null;
    vendor_name: string | null;
    expected_delivery_date: string | null;
    po_date: string | null;
    first_item_name: string | null;
    first_sku: string | null;
    item_count: number | null;
  }>(
    ctx.organizationId,
    // `base` is the canonical delivered-unscanned set — identical to the
    // count's, so count === list length. PO context is resolved in the outer
    // query (adding columns can't change the row count).
    `WITH base AS (
         ${deliveredUnscannedBaseSql('$1')}
       ),
       enriched AS (
         SELECT base.*,
                COALESCE(
                  (SELECT rz.zoho_purchaseorder_id
                     FROM receiving_line rl
                     JOIN receiving_line_zoho rz
                       ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
                    WHERE rl.shipment_id = base.shipment_id
                      AND rz.zoho_purchaseorder_id IS NOT NULL
                      AND rl.organization_id = $2
                    ORDER BY rl.id LIMIT 1),
                  (SELECT r.zoho_purchaseorder_id
                     FROM receiving_carton r
                    WHERE r.shipment_id = base.shipment_id
                      AND r.zoho_purchaseorder_id IS NOT NULL
                      AND r.organization_id = $2
                    ORDER BY r.id LIMIT 1),
                  (SELECT m.zoho_purchaseorder_id
                     FROM zoho_po_mirror m
                    WHERE COALESCE(m.reference_number, '') <> ''
                      AND regexp_replace(upper(m.reference_number), '[^A-Z0-9]', '', 'g')
                          = base.tracking_number_normalized
                    LIMIT 1)
                )                            AS zoho_purchaseorder_id
           FROM base
       )
       SELECT enriched.*,
              COALESCE(
                m.zoho_purchaseorder_number,
                (SELECT r.zoho_purchaseorder_number
                   FROM receiving_carton r
                  WHERE r.shipment_id = enriched.shipment_id
                    AND r.zoho_purchaseorder_number IS NOT NULL
                    AND r.organization_id = $2
                  ORDER BY r.id LIMIT 1)
              )                              AS po_number,
              m.status                       AS zoho_status,
              m.vendor_name,
              m.expected_delivery_date::text AS expected_delivery_date,
              m.po_date::text                AS po_date,
              agg.first_item_name,
              agg.first_sku,
              agg.item_count
         FROM enriched
         LEFT JOIN zoho_po_mirror m ON m.zoho_purchaseorder_id = enriched.zoho_purchaseorder_id
         LEFT JOIN LATERAL (
           -- Wave-2 reader cutover: PO-id match reads receiving_line_zoho rz
           -- (LEFT JOIN — the shipment_id arm can match lines with no zoho
           -- fields at all). 1:1 PK join, so the aggs can't multiply.
           SELECT (array_agg(rl.item_name ORDER BY rl.id))[1] AS first_item_name,
                  (array_agg(rl.sku       ORDER BY rl.id))[1] AS first_sku,
                  COUNT(*)::int                                AS item_count
             FROM receiving_line rl
             LEFT JOIN receiving_line_zoho rz
               ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
            WHERE (rz.zoho_purchaseorder_id = enriched.zoho_purchaseorder_id
                   OR rl.shipment_id = enriched.shipment_id)
              AND rl.organization_id = $2
              AND COALESCE(rl.item_name, '') <> ''
         ) agg ON TRUE`,
    [String(WINDOW_DAYS), ctx.organizationId],
  );

  // Oldest-first burn-down (claims clock); cap defensively.
  const items = rows
    .sort((a, b) => (a.delivered_at ?? '').localeCompare(b.delivered_at ?? ''))
    .slice(0, CAP);

      return {
        count: items.length,
        window_days: WINDOW_DAYS,
        claims_count: items.filter((i) => i.age_band === 'gt_48h').length,
        items,
      };
    },
  );

  return NextResponse.json({ success: true, ...payload });
}, { permission: 'receiving.view' });
