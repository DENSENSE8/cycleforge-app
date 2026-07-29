import pool from '@/lib/db';
import { photoContentUrl } from '@/lib/photos/display-url';
import { UNIT_PACKING_PHOTO_TYPE, UNIT_TESTING_PHOTO_TYPE } from '@/lib/photos/types';
import {
  RECEIVING_PHOTO_LEGACY_PACKAGE,
  RECEIVING_PHOTO_PACKAGE,
  RECEIVING_PHOTO_UNBOX_CARTON,
} from '@/lib/receiving/photo-intent';

/**
 * Photos for one unit's timeline, in five stage-tagged buckets mirroring the
 * evidence spine (`PHOTO_EVIDENCE_STAGES`, `src/lib/photos/stages.ts`):
 *
 *   • `arrival`      — the unit's ORIGIN parent carton (`RECEIVING` via
 *     `serial_unit_provenance` → receiving line) with an explicit PACKAGE
 *     photo_type: `receiving_package`, the legacy `receiving` alias, or the
 *     untyped '' legacy carton rows. Stage: `arrival_package`.
 *   • `unbox_carton` — the same parent carton with
 *     photo_type=`receiving_unbox_carton` (Unbox header captures).
 *   • `unbox_item`   — photos primary-linked to the ORIGIN `RECEIVING_LINE`.
 *     Entity-only by the identity law (`receivingStageFromPhotoType`): a line
 *     link IS item evidence regardless of a stale legacy photo_type, matching
 *     `receivingPhotoIntentSql('item')`.
 *   • `testing`      — SERIAL_UNIT photos with photo_type='testing_photo'
 *     (testing-station Pass+Print / unit-label scan captures).
 *   • `packing`      — SERIAL_UNIT photos with photo_type='packer_photo'
 *     (+ legacy 'shipout'/'prepack') UNION photos dual-linked to a PACKER_LOG
 *     that also links this SERIAL_UNIT (order-pack photos).
 *
 * Mis-stamped legacy rows — `receiving_item` typed on a RECEIVING carton link
 * (the pre-SoT desktop bug) — match NO bucket on purpose: they are
 * unclassifiable as stage evidence (mirrors `receivingStageFromPhotoType`
 * returning null), so they never masquerade as arrival insurance.
 *
 * Each row also carries the unit's `serial` / `sku` (one cheap join against
 * the unit's own row) so cross-entity consumers (order timeline groups,
 * station journey chrome) can label media without a second lookup.
 *
 * Same `pool` + explicit `organization_id` predicate convention as the other
 * photo query helpers (tenant boundary is the predicate). Newest-first.
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

/**
 * Entity-wins precedence among the three receiving buckets: a photo carrying
 * BOTH a line link and a carton link (legacy dual-link rows that predate the
 * `remapReceivingPhotoTypeOnMove` waist) is item evidence — it must appear in
 * exactly one bucket, and the RECEIVING_LINE link wins. Testing / packing rows
 * are disjoint by photo_type and are never deduped against receiving buckets.
 */
const RECEIVING_BUCKET_RANK: Partial<Record<UnitTimelinePhotoSource, number>> = {
  unbox_item: 3,
  unbox_carton: 2,
  arrival: 1,
};

export async function listUnitTimelinePhotos(
  organizationId: string,
  serialUnitId: number,
): Promise<UnitTimelinePhoto[]> {
  const res = await pool.query<DbRow>(
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
