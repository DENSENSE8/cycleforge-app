import { tenantQuery } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';

/**
 * What to offer an operator standing at an EMPTY location.
 *
 * The honest default is not "type something". A bay is filled with like items
 * — a person putting away a pallet pairs the same handful of products across a
 * whole run of bins — so the products already stocked in THIS ROOM are the
 * likeliest next pairing by a wide margin, and offering them turns the common
 * case into one tap with no keyboard at all.
 *
 * Derived from `bin_contents` + `locations.room`; no new table and no history
 * log, because "what is stocked near here, most recently touched" is already a
 * fact the warehouse records.
 */

export interface PairCandidate {
  sku: string;
  productTitle: string | null;
  imageUrl: string | null;
  isProvisional: boolean;
  /** Bins in this room currently holding it. Context for "is this the right one". */
  binCount: number;
}

/**
 * Products stocked elsewhere in the same room as `locationId`, most recently
 * touched first.
 *
 * `DISTINCT ON (bc.sku)` collapses a product stocked in six bins to one row —
 * this is a pick-a-product list, not a stock report. The scanned location is
 * excluded: it is empty, which is why we are here.
 *
 * A room of `NULL` (locations seeded before rooms existed) matches other
 * NULL-room locations via `IS NOT DISTINCT FROM` rather than returning
 * nothing, so the feature degrades to "the rest of the unroomed warehouse"
 * instead of to an empty screen.
 */
export async function listRoomPairCandidates(
  input: { locationId: number; room: string | null; limit?: number },
  orgId: OrgId,
): Promise<PairCandidate[]> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
  const result = await tenantQuery<{
    sku: string;
    product_title: string | null;
    image_url: string | null;
    is_provisional: boolean | null;
    bin_count: string;
  }>(
    orgId,
    `WITH room_stock AS (
       SELECT DISTINCT ON (bc.sku)
              bc.sku,
              bc.updated_at,
              COUNT(*) OVER (PARTITION BY bc.sku) AS bin_count
         FROM bin_contents bc
         JOIN locations l ON l.id = bc.location_id
        WHERE bc.organization_id = $1
          AND bc.qty > 0
          AND bc.location_id <> $2
          AND l.room IS NOT DISTINCT FROM $3
        ORDER BY bc.sku, bc.updated_at DESC NULLS LAST
     )
     SELECT rs.sku,
            COALESCE(
              NULLIF(ss.display_name_override, ''),
              NULLIF(ss.product_title, ''),
              NULLIF(sc.product_title, '')
            ) AS product_title,
            sc.image_url,
            COALESCE(ss.is_provisional, false) AS is_provisional,
            rs.bin_count::text AS bin_count
       FROM room_stock rs
       LEFT JOIN sku_stock ss
              ON ss.sku = rs.sku AND ss.organization_id = $1
       LEFT JOIN sku_catalog sc
              ON sc.sku = rs.sku AND sc.organization_id = $1
      ORDER BY rs.updated_at DESC NULLS LAST
      LIMIT $4`,
    [orgId, input.locationId, input.room, limit],
  );

  return result.rows.map((row) => ({
    sku: row.sku,
    productTitle: row.product_title,
    imageUrl: row.image_url,
    isProvisional: row.is_provisional === true,
    binCount: Number(row.bin_count) || 0,
  }));
}

export interface SkuStockedAt {
  locationId: number;
  barcode: string | null;
  locationName: string;
  room: string | null;
  qty: number;
}

/**
 * Where else this product already lives, for the detail sheet.
 *
 * The question it answers at pairing time is "am I about to scatter this
 * across a third bin when two already hold it" — which is the one fact that
 * changes the decision, and the reason the detail view exists at all.
 */
export async function listSkuStockedAt(
  sku: string,
  orgId: OrgId,
  limit = 20,
): Promise<SkuStockedAt[]> {
  const result = await tenantQuery<{
    location_id: number;
    barcode: string | null;
    name: string;
    room: string | null;
    qty: number;
  }>(
    orgId,
    `SELECT bc.location_id, l.barcode, l.name, l.room, bc.qty
       FROM bin_contents bc
       JOIN locations l ON l.id = bc.location_id
      WHERE bc.organization_id = $1 AND bc.sku = $2 AND bc.qty > 0
      ORDER BY bc.qty DESC, l.name
      LIMIT $3`,
    [orgId, sku.trim(), limit],
  );

  return result.rows.map((row) => ({
    locationId: row.location_id,
    barcode: row.barcode,
    locationName: row.name,
    room: row.room,
    qty: Number(row.qty) || 0,
  }));
}
