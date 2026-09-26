/** READ-ONLY tracking → package resolution for `GET /api/shipments/lookup`. */

import pool from '@/lib/db';
import { looksLikeFnsku } from '@/lib/scan-resolver';
import { lookupShipmentId } from '@/lib/shipping/resolve';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { readVisibleShipment } from './shipment-record';
import type { ShipmentLookupResult } from './shipment-record-types';

export async function lookupShipmentByTrackingKey(
  orgId: OrgId,
  rawTracking: string,
): Promise<ShipmentLookupResult | null> {
  const raw = rawTracking.trim();
  if (!raw || looksLikeFnsku(raw)) return null;

  const exact = await lookupShipmentId(raw, orgId);
  if (exact.shipmentId != null) {
    const stn = await readVisibleShipment(orgId, exact.shipmentId);
    if (stn) return { shipmentId: Number(stn.id), tracking: stn.tracking_number_raw };
  }

  const { key18, last8 } = orderTrackingMatchKeys(raw);
  if (!key18 && !last8) return null;

  const candidates = await pool.query<{ id: string | number; tier: number }>(
    `SELECT stn.id,
            CASE
              WHEN $2::text <> ''
               AND RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $2::text
              THEN 1 ELSE 2
            END AS tier
       FROM shipping_tracking_numbers stn
      WHERE (stn.organization_id = $1 OR stn.organization_id IS NULL)
        AND (
          ($2::text <> ''
           AND RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = $2::text)
          OR ($3::text <> ''
           AND RIGHT(regexp_replace(COALESCE(stn.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = $3::text)
        )
      ORDER BY tier ASC, (stn.organization_id = $1) DESC NULLS LAST, stn.id DESC
      LIMIT 5`,
    [orgId, key18, last8],
  );

  const key18Hits = candidates.rows.filter((c) => Number(c.tier) === 1);
  const pick = key18Hits.length > 0 ? key18Hits : candidates.rows;
  // Ambiguous last-8 (no key18 hit, several packages) is not an answer.
  if (key18Hits.length === 0 && pick.length !== 1) return null;
  for (const c of pick) {
    const stn = await readVisibleShipment(orgId, Number(c.id));
    if (stn) return { shipmentId: Number(stn.id), tracking: stn.tracking_number_raw };
  }
  return null;
}
