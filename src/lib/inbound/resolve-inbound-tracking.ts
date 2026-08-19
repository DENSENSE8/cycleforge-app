/**
 * Door / Unbox tracking → already-imported Incoming carton (Amazon / eBay /
 * manual desk CSV). Complements STN `resolveShipmentForScan` for rows whose
 * tracking lives on inbound_purchase_order_mirror (ingest snapshot) even when
 * carton.shipment_id was not stamped.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { extractCanonicalTracking } from '@/lib/tracking-format';
import type { tenantQuery as TenantQuery } from '@/lib/tenancy/db';

interface InboundTrackingHit {
  receivingId: number;
  receivingLineId: number;
  sourceType: string;
  sourceOrderId: string;
}

export interface ResolveInboundTrackingDeps {
  query: typeof TenantQuery;
}

const defaultDeps: ResolveInboundTrackingDeps = {
  query: async (orgId, sql, params) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    return tenantQuery(orgId, sql, params);
  },
};

/**
 * Exact canonical match on the ingest mirror's tracking_number. Ambiguous
 * (≥2 distinct cartons) returns null — last-8 is not used here.
 */
export async function resolveInboundCartonByTracking(
  orgId: OrgId,
  trackingNumber: string,
  deps: ResolveInboundTrackingDeps = defaultDeps,
): Promise<InboundTrackingHit | null> {
  const canonical = extractCanonicalTracking(trackingNumber) || '';
  if (!canonical) return null;

  const r = await deps.query<{
    receiving_id: number | null;
    receiving_line_id: number;
    source_type: string;
    source_order_id: string;
  }>(
    orgId,
    `SELECT rl.receiving_id,
            rl.id AS receiving_line_id,
            m.source_type,
            m.source_order_id
       FROM inbound_purchase_order_mirror m
       JOIN inbound_purchase_order_links l
         ON l.organization_id = m.organization_id
        AND l.source_type = m.source_type
        AND l.source_order_id = m.source_order_id
       JOIN receiving_line rl
         ON rl.id = l.receiving_line_id
        AND rl.organization_id = m.organization_id
      WHERE m.organization_id = $1::uuid
        AND NULLIF(
              upper(regexp_replace(COALESCE(m.tracking_number, ''), '[^A-Za-z0-9]', '', 'g')),
              ''
            ) = $2
      ORDER BY rl.id DESC
      LIMIT 2`,
    [orgId, canonical],
  );

  if (r.rows.length !== 1) return null;
  const row = r.rows[0];
  if (row.receiving_id == null) return null;
  return {
    receivingId: Number(row.receiving_id),
    receivingLineId: Number(row.receiving_line_id),
    sourceType: row.source_type,
    sourceOrderId: row.source_order_id,
  };
}
