import pool from '@/lib/db';
import { photoContentUrl } from '@/lib/photos/display-url';
import { UNIT_PACKING_PHOTO_TYPE, UNIT_TESTING_PHOTO_TYPE } from '@/lib/photos/types';

/**
 * Photos for one unit's timeline, in three tagged buckets:
 *   • `testing` — SERIAL_UNIT photos with photo_type='testing_photo'
 *     (testing-station Pass+Print / unit-label scan captures).
 *   • `unbox`   — the unit's ORIGIN receiving line + parent carton photos,
 *     via `serial_unit_provenance` (origin_type='RECEIVING_LINE').
 *   • `packing` — SERIAL_UNIT photos with photo_type='packer_photo' (pack
 *     station captures on the unit QR) UNION photos dual-linked to a
 *     PACKER_LOG that also links this SERIAL_UNIT (order-pack photos).
 *
 * Same `pool` + explicit `organization_id` predicate convention as the other
 * photo query helpers (tenant boundary is the predicate). Newest-first.
 */

export type UnitTimelinePhotoSource = 'testing' | 'unbox' | 'packing';

export interface UnitTimelinePhoto {
  photoId: number;
  at: string | null;
  source: UnitTimelinePhotoSource;
  takenByStaffId: number | null;
  thumbUrl: string;
  fullUrl: string;
}

interface DbRow {
  id: string;
  created_at: string;
  taken_by_staff_id: number | null;
  source: UnitTimelinePhotoSource;
}

export async function listUnitTimelinePhotos(
  organizationId: string,
  serialUnitId: number,
): Promise<UnitTimelinePhoto[]> {
  const res = await pool.query<DbRow>(
    `SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'testing'::text AS source
       FROM photos p
       JOIN photo_entity_links l
         ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'SERIAL_UNIT'
        AND l.entity_id = $2
        AND lower(p.photo_type) = lower($3)
     UNION
     SELECT DISTINCT p.id, p.created_at, p.taken_by_staff_id, 'unbox'::text AS source
       FROM photos p
       JOIN photo_entity_links l
         ON l.photo_id = p.id AND l.organization_id = p.organization_id
       JOIN serial_unit_provenance sp
         ON sp.serial_unit_id = $2
        AND sp.origin_type = 'RECEIVING_LINE'
        AND sp.origin_id IS NOT NULL
        AND sp.organization_id = $1
       JOIN receiving_line rl ON rl.id = sp.origin_id
      WHERE p.organization_id = $1
        AND (
          (l.entity_type = 'RECEIVING_LINE' AND l.entity_id = rl.id)
          OR (l.entity_type = 'RECEIVING' AND l.entity_id = rl.receiving_id)
        )
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
      ORDER BY created_at DESC`,
    [organizationId, serialUnitId, UNIT_TESTING_PHOTO_TYPE, UNIT_PACKING_PHOTO_TYPE],
  );

  return res.rows.map((r) => {
    const id = Number(r.id);
    return {
      photoId: id,
      at: r.created_at,
      source: r.source,
      takenByStaffId: r.taken_by_staff_id != null ? Number(r.taken_by_staff_id) : null,
      thumbUrl: photoContentUrl(id, 'thumb'),
      fullUrl: photoContentUrl(id),
    };
  });
}
