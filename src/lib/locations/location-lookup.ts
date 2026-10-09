/**
 * Typed-location lookup: what a hand-typed or misread location code means
 * among the locations that exist, and the nearest real ones when it means none.
 *
 * Exact barcode reads stay the fast path (`readLocationRecord`); this runs only
 * after an exact miss, so a printed label never pays for it.
 */

import { locationCodeCandidates, pad2, parseLocationCodeFlat, unwrapScannedLocation } from '@/lib/barcode-routing';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { LocationSuggestion } from './location-miss';

/** Spellings to try, most faithful first: as typed, unwrapped, then every address it could mean. */
export function locationLookupKeys(raw: string): string[] {
  const typed = String(raw ?? '').trim().toUpperCase();
  const keys = [typed, unwrapScannedLocation(raw).toUpperCase(), ...locationCodeCandidates(raw)];
  return [...new Set(keys.filter(Boolean))];
}

/**
 * The barcode of the active location `raw` names — matched case-insensitively
 * on barcode, name or display name, the earliest spelling winning — or null.
 */
export async function resolveLocationBarcode(raw: string, orgId: OrgId): Promise<string | null> {
  const keys = locationLookupKeys(raw);
  if (keys.length === 0) return null;
  const result = await tenantQueryOneTrip<{ barcode: string }>(
    orgId,
    `SELECT barcode
       FROM locations
      WHERE organization_id = $1 AND is_active = true AND NULLIF(BTRIM(barcode), '') IS NOT NULL
        AND (UPPER(barcode) = ANY($2::text[]) OR UPPER(name) = ANY($2::text[]) OR UPPER(display_name) = ANY($2::text[]))
      ORDER BY LEAST(
                 array_position($2::text[], UPPER(barcode)),
                 array_position($2::text[], UPPER(name)),
                 array_position($2::text[], UPPER(display_name))
               ),
               barcode
      LIMIT 1`,
    [orgId, keys],
  );
  return result.rows[0]?.barcode ?? null;
}

/**
 * Up to `limit` real locations near a code that matched nothing: the same
 * bay, else the same aisle, else barcodes starting with what was typed.
 */
export async function suggestLocations(raw: string, orgId: OrgId, limit = 5): Promise<LocationSuggestion[]> {
  const parsed = locationLookupKeys(raw).map((key) => parseLocationCodeFlat(key)).find((segs) => segs != null) ?? null;
  const typed = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prefixes = parsed
    ? [`${parsed.zone}${pad2(parsed.aisle)}${pad2(parsed.bay)}`, `${parsed.zone}${pad2(parsed.aisle)}`]
    : typed.length >= 2 ? [typed] : [];
  if (prefixes.length === 0) return [];
  // A more specific prefix ranks first; within one, the nearest bay, then the
  // nearest level (flat `ZAABBL(L)PP` barcodes), then barcode order.
  const result = await tenantQueryOneTrip<{ barcode: string; face: string }>(
    orgId,
    `SELECT l.barcode, COALESCE(NULLIF(BTRIM(l.name), ''), l.barcode) AS face
       FROM locations l
       JOIN LATERAL (
         SELECT MIN(p.ord) AS rank
           FROM unnest($2::text[]) WITH ORDINALITY AS p(prefix, ord)
          WHERE REGEXP_REPLACE(UPPER(l.barcode), '[^A-Z0-9]', '', 'g') LIKE p.prefix || '%'
       ) hit ON hit.rank IS NOT NULL
      WHERE l.organization_id = $1 AND l.is_active = true AND NULLIF(BTRIM(l.barcode), '') IS NOT NULL
      ORDER BY hit.rank,
               CASE WHEN l.barcode ~ '^[A-Z][0-9]{7,8}$' AND $4::int IS NOT NULL
                    THEN ABS(SUBSTRING(l.barcode FROM 4 FOR 2)::int - $4::int) END NULLS LAST,
               CASE WHEN l.barcode ~ '^[A-Z][0-9]{7,8}$' AND $5::int IS NOT NULL
                    THEN ABS(SUBSTRING(l.barcode FROM 6 FOR LENGTH(l.barcode) - 7)::int - $5::int) END NULLS LAST,
               l.barcode
      LIMIT $3`,
    [orgId, prefixes, limit, parsed ? Number(parsed.bay) : null, parsed ? Number(parsed.level) : null],
  );
  return result.rows.map((row) => ({ code: row.barcode, face: row.face }));
}
