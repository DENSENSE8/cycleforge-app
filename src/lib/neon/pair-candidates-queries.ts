import { tenantQuery, tenantQueryOneTrip } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import { photoContentUrl } from '../photos/display-url';
import { derivedRoomJoinSql, derivedRoomLabelSql, derivedRoomSetJoinSql } from '../locations/derived-room';

/** What to offer an operator standing at an EMPTY location. */

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
 * touched first, plus that room. The room is DERIVED up `parent_id` on both
 * sides, so a movable rack's shelf draws neighbours from the room the rack
 * stands in now.
 */
export async function listRoomPairCandidates(
  input: { locationId: number; limit?: number },
  orgId: OrgId,
): Promise<{ room: string | null; candidates: PairCandidate[] }> {
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
  const result = await tenantQuery<{
    room: string | null;
    sku: string | null;
    product_title: string | null;
    image_url: string | null;
    cover_photo_id: number | null;
    is_provisional: boolean | null;
    bin_count: string | null;
  }>(
    orgId,
    `WITH here AS (
       SELECT ${derivedRoomLabelSql('a', 'aroom')} AS room
         FROM locations a
         ${derivedRoomJoinSql('a', 'aroom')}
        WHERE a.organization_id = $1 AND a.id = $2
     ),
     room_mates AS (
       SELECT l.id
         FROM locations l
         ${derivedRoomSetJoinSql('l', 'lroom', '$1')}
         CROSS JOIN here
        WHERE l.organization_id = $1
          AND l.id <> $2
          AND ${derivedRoomLabelSql('l', 'lroom')} IS NOT DISTINCT FROM here.room
     ),
     room_stock AS (
       SELECT DISTINCT ON (bc.sku)
              bc.sku,
              bc.updated_at,
              COUNT(*) OVER (PARTITION BY bc.sku) AS bin_count
         FROM bin_contents bc
         JOIN room_mates m ON m.id = bc.location_id
        WHERE bc.organization_id = $1
          AND bc.qty > 0
        ORDER BY bc.sku, bc.updated_at DESC NULLS LAST
     ),
     picked AS (
       SELECT rs.sku,
              rs.updated_at,
              COALESCE(
                NULLIF(ss.display_name_override, ''),
                NULLIF(ss.product_title, ''),
                NULLIF(sc.product_title, '')
              ) AS product_title,
              sc.image_url,
              ph.cover_photo_id,
              COALESCE(ss.is_provisional, false) AS is_provisional,
              rs.bin_count::text AS bin_count
         FROM room_stock rs
         LEFT JOIN sku_stock ss
                ON ss.sku = rs.sku AND ss.organization_id = $1
         LEFT JOIN sku_catalog sc
                ON sc.sku = rs.sku AND sc.organization_id = $1
         LEFT JOIN LATERAL (
           SELECT pel.photo_id AS cover_photo_id
             FROM photo_entity_links pel
            WHERE pel.organization_id = $1
              AND pel.entity_type = 'SKU_STOCK'
              AND pel.entity_id = ss.id
              AND pel.link_role = 'primary'
            ORDER BY pel.sort_order ASC NULLS LAST, pel.photo_id ASC
            LIMIT 1
         ) ph ON true
        ORDER BY rs.updated_at DESC NULLS LAST
        LIMIT $3
     )
     SELECT here.room, p.sku, p.product_title, p.image_url, p.cover_photo_id, p.is_provisional, p.bin_count
       FROM here
       LEFT JOIN picked p ON true
      ORDER BY p.updated_at DESC NULLS LAST`,
    [orgId, input.locationId, limit],
  );

  return {
    room: result.rows[0]?.room ?? null,
    candidates: result.rows
      .filter((row): row is typeof row & { sku: string } => row.sku != null)
      .map((row) => ({
        sku: row.sku,
        productTitle: row.product_title,
        imageUrl: row.cover_photo_id != null
          ? photoContentUrl(Number(row.cover_photo_id), 'thumb')
          : row.image_url,
        isProvisional: row.is_provisional === true,
        binCount: Number(row.bin_count) || 0,
      })),
  };
}

export interface SkuStockedAt {
  locationId: number;
  barcode: string | null;
  locationName: string;
  room: string | null;
  qty: number;
}

/** Where else this product already lives, for the detail sheet. */
export async function listSkuStockedAt(
  sku: string,
  orgId: OrgId,
  limit = 20,
): Promise<SkuStockedAt[]> {
  const result = await tenantQueryOneTrip<{
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

/** The SKU's SKU_STOCK photos in display order (`[0]` = cover) — the evidence preview's ids. */
export async function listSkuStockPhotoIds(sku: string, orgId: OrgId): Promise<number[]> {
  const result = await tenantQueryOneTrip<{ photo_id: number }>(
    orgId,
    `SELECT pel.photo_id
       FROM sku_stock ss
       JOIN photo_entity_links pel
         ON pel.organization_id = ss.organization_id
        AND pel.entity_type = 'SKU_STOCK'
        AND pel.entity_id = ss.id
        AND pel.link_role = 'primary'
      WHERE ss.organization_id = $1 AND ss.sku = $2
      ORDER BY pel.sort_order ASC NULLS LAST, pel.photo_id ASC`,
    [orgId, sku.trim()],
  );
  return result.rows.map((row) => Number(row.photo_id));
}
