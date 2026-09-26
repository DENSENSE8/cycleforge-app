import { tenantQuery } from '@/lib/tenancy/db';
import { photoContentUrl } from '@/lib/photos/display-url';
import { UNIT_PACKING_PHOTO_TYPE, UNIT_TESTING_PHOTO_TYPE } from '@/lib/photos/types';
import {
  RECEIVING_PHOTO_LEGACY_PACKAGE,
  RECEIVING_PHOTO_PACKAGE,
  RECEIVING_PHOTO_UNBOX_CARTON,
} from '@/lib/receiving/photo-intent';

/**
 * Photos for one unit's timeline, in five stage-tagged buckets mirroring the evidence spine (`PHOTO_EVIDENCE_STAGES`,…
 * `WITH (security_invoker = true)`, so a raw-pool read of that family inherits
 */

export type UnitTimelinePhotoSource =
  | 'arrival'
  | 'unbox_carton'
  | 'unbox_item'
  | 'testing'
  | 'packing';

export interface UnitTimelinePhoto {
  photoId: number;
  at: string | null;
  source: UnitTimelinePhotoSource;
  takenByStaffId: number | null;
  thumbUrl: string;
  fullUrl: string;
  /** The unit's serial number (chrome for cross-entity consumers). */
  serial: string | null;
  /** The unit's SKU (chrome for cross-entity consumers). */
  sku: string | null;
}

interface DbRow {
  id: string;
  created_at: string;
  taken_by_staff_id: number | null;
  source: UnitTimelinePhotoSource;
  serial: string | null;
  sku: string | null;
}

/** Entity-wins precedence among the three receiving buckets: */
const RECEIVING_BUCKET_RANK: Partial<Record<UnitTimelinePhotoSource, number>> = {
  unbox_item: 3,
  unbox_carton: 2,
  arrival: 1,
};

export async function listUnitTimelinePhotos(
  organizationId: string,
  serialUnitId: number,
): Promise<UnitTimelinePhoto[]> {
  const res = await tenantQuery<DbRow>(
    organizationId,
    `WITH origin AS (
       SELECT rl.id AS line_id, rl.receiving_id
         FROM serial_unit_provenance sp
         JOIN receiving_line rl ON rl.id = sp.origin_id
        WHERE sp.serial_unit_id = $2
          AND sp.origin_type = 'RECEIVING_LINE'
          AND sp.origin_id IS NOT NULL
          AND sp.organization_id = $1
     ),
     photo_rows AS (
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'testing'::text AS source
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id AND l.organization_id = p.organization_id
        WHERE p.organization_id = $1
          AND l.entity_type = 'SERIAL_UNIT'
          AND l.entity_id = $2
          AND lower(p.photo_type) = lower($3)
       UNION
       -- Arrival: parent-carton PACKAGE shots only (explicit types + untyped
       -- legacy ''). The mis-stamped receiving_item-on-carton rows match no arm.
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'arrival'::text AS source
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id AND l.organization_id = p.organization_id
         JOIN origin o
           ON l.entity_type = 'RECEIVING' AND l.entity_id = o.receiving_id
        WHERE p.organization_id = $1
          AND lower(COALESCE(p.photo_type, '')) IN (lower($5), lower($6), '')
       UNION
       -- Unbox · carton: parent-carton captures stamped by the Unbox header.
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'unbox_carton'::text AS source
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id AND l.organization_id = p.organization_id
         JOIN origin o
           ON l.entity_type = 'RECEIVING' AND l.entity_id = o.receiving_id
        WHERE p.organization_id = $1
          AND lower(COALESCE(p.photo_type, '')) = lower($7)
       UNION
       -- Unbox · item: origin-line links, entity-only (identity law — a
       -- RECEIVING_LINE link is item evidence whatever its legacy photo_type).
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'unbox_item'::text AS source
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id AND l.organization_id = p.organization_id
         JOIN origin o
           ON l.entity_type = 'RECEIVING_LINE' AND l.entity_id = o.line_id
        WHERE p.organization_id = $1
       UNION
       -- Pack captures linked directly to the SERIAL_UNIT (unit QR at pack).
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'packing'::text AS source
         FROM photos p
         JOIN photo_entity_links l
           ON l.photo_id = p.id AND l.organization_id = p.organization_id
        WHERE p.organization_id = $1
          AND l.entity_type = 'SERIAL_UNIT'
          AND l.entity_id = $2
          AND (
            lower(p.photo_type) = lower($4)
            OR lower(COALESCE(p.photo_type, '')) IN ('shipout', 'prepack')
          )
       UNION
       -- Pack captures on PACKER_LOG that are also dual-linked to this unit.
       SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'packing'::text AS source
         FROM photos p
         JOIN photo_entity_links unit_link
           ON unit_link.photo_id = p.id
          AND unit_link.organization_id = p.organization_id
          AND unit_link.entity_type = 'SERIAL_UNIT'
          AND unit_link.entity_id = $2
         JOIN photo_entity_links pack_link
           ON pack_link.photo_id = p.id
          AND pack_link.organization_id = p.organization_id
          AND pack_link.entity_type = 'PACKER_LOG'
        WHERE p.organization_id = $1
     )
     SELECT q.id, q.created_at, q.taken_by_staff_id, q.source,
            su.serial_number AS serial, su.sku
       FROM photo_rows q
       LEFT JOIN serial_units su
         ON su.id = $2 AND su.organization_id = $1
      ORDER BY q.created_at DESC`,
    [
      organizationId,
      serialUnitId,
      UNIT_TESTING_PHOTO_TYPE,
      UNIT_PACKING_PHOTO_TYPE,
      RECEIVING_PHOTO_PACKAGE,
      RECEIVING_PHOTO_LEGACY_PACKAGE,
      RECEIVING_PHOTO_UNBOX_CARTON,
    ],
  );

  // One bucket per photo among the receiving stages (entity-wins precedence).
  const bestReceivingRank = new Map<number, number>();
  for (const r of res.rows) {
    const rank = RECEIVING_BUCKET_RANK[r.source];
    if (rank == null) continue;
    const id = Number(r.id);
    const prev = bestReceivingRank.get(id);
    if (prev == null || rank > prev) bestReceivingRank.set(id, rank);
  }

  return res.rows
    .filter((r) => {
      const rank = RECEIVING_BUCKET_RANK[r.source];
      if (rank == null) return true;
      return rank === bestReceivingRank.get(Number(r.id));
    })
    .map((r) => {
      const id = Number(r.id);
      return {
        photoId: id,
        at: r.created_at,
        source: r.source,
        takenByStaffId: r.taken_by_staff_id != null ? Number(r.taken_by_staff_id) : null,
        thumbUrl: photoContentUrl(id, 'thumb'),
        fullUrl: photoContentUrl(id),
        serial: r.serial ?? null,
        sku: r.sku ?? null,
      };
    });
}

/**
 * Pack evidence belongs to the PACKER_LOG's shipment, including capture
 * drafts: an operator must be able to find photos before final verification.
 * A photo can have multiple entity links; DISTINCT keeps one row per photo.
 */
export async function listOrderPackerTimelinePhotos(
  organizationId: string,
  orderId: number,
): Promise<UnitTimelinePhoto[]> {
  const result = await tenantQuery<Pick<DbRow, 'id' | 'created_at' | 'taken_by_staff_id'>>(
    organizationId,
    `SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id
       FROM orders o
       JOIN packer_logs pl
         ON pl.organization_id = o.organization_id
        AND pl.shipment_id IS NOT NULL
        AND (
          pl.shipment_id = o.shipment_id
          OR EXISTS (
            SELECT 1 FROM shipment_links sl
             WHERE sl.owner_type = 'ORDER'
               AND sl.owner_id = o.id
               AND sl.organization_id = o.organization_id
               AND sl.shipment_id = pl.shipment_id
          )
        )
       JOIN photo_entity_links l
         ON l.entity_type = 'PACKER_LOG'
        AND l.entity_id = pl.id
        AND l.organization_id = o.organization_id
        AND l.link_role = 'primary'
       JOIN photos p
         ON p.id = l.photo_id
        AND p.organization_id = l.organization_id
      WHERE o.id = $2
        AND o.organization_id = $1
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 200`,
    [organizationId, orderId],
  );
  return result.rows.map((row) => {
    const photoId = Number(row.id);
    return {
      photoId,
      at: row.created_at,
      source: 'packing' as const,
      takenByStaffId: row.taken_by_staff_id == null ? null : Number(row.taken_by_staff_id),
      thumbUrl: photoContentUrl(photoId, 'thumb'),
      fullUrl: photoContentUrl(photoId),
      serial: null,
      sku: null,
    };
  });
}
