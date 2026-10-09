/**
 * The location record — one active address, its SKU counts, the licence-plated
 * containers parked at it, and its place in the room's physical walk — as
 * `GET /api/locations/[barcode]` serves it. The scan verify route returns the
 * same payload beside its proof so the phone lands with no second read.
 */

import { getBinContentsByBarcode } from '@/lib/neon/location-queries';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  derivedRoomJoinSql,
  derivedRoomLabelSql,
  derivedRoomSetJoinSql,
  legacyBinWalkOrderSql,
  rackWalkOrderSql,
} from '@/lib/locations/derived-room';
import { photoContentUrl } from '@/lib/photos/display-url';
import { resolveLocationBarcode } from '@/lib/locations/location-lookup';

type HandlingUnitStatus = 'OPEN' | 'STAGED' | 'IN_TEST' | 'CLOSED';

type HandlingUnitRow = {
  id: number;
  code: string;
  status: HandlingUnitStatus;
  created_at: string;
  paired_order_id: number | null;
  total_units: number;
  tested_units: number;
  hold_units: number;
  stock_units: number;
};

type WalkRow = { position: number; total: number; previous: string | null; next: string | null; room: string | null };

export type LocationRecordPayload = {
  location: {
    id: number;
    name: string;
    room: string | null;
    rowLabel: string | null;
    colLabel: string | null;
    barcode: string | null;
    binType: string | null;
    capacity: number | null;
  };
  contents: Array<{
    id: number;
    stockId: number | null;
    sku: string;
    qty: number;
    minQty: number | null;
    maxQty: number | null;
    lastCounted: string | null;
    productTitle: string | undefined;
    isProvisional: boolean;
    displayNameOverride: string | null;
    imageUrl: string | null;
    /** SKU_STOCK photos in display order (`[0]` = cover). */
    photoIds: number[];
    /** Version token for optimistic concurrency on `set` action. */
    updatedAt: string;
  }>;
  handlingUnits: Array<{
    id: number;
    code: string;
    status: HandlingUnitStatus;
    totalUnits: number;
    testedUnits: number;
    holdUnits: number;
    /** Loose stock loaded into the tote's own stock place (`bin_contents` under its code). */
    stockUnits: number;
    pairedOrderId: number | null;
    createdAt: string;
  }>;
  walk: { position: number; total: number; previous: string | null; next: string | null } | null;
};

const HANDLING_UNITS_SQL = `
  SELECT hu.id,
         hu.code,
         hu.status,
         hu.created_at::text AS created_at,
         hu.paired_order_id,
         COUNT(su.id)::int AS total_units,
         COUNT(su.id) FILTER (
           WHERE COALESCE(su.current_status::text, 'UNKNOWN') NOT IN ('UNKNOWN', 'RECEIVED')
         )::int AS tested_units,
         COUNT(su.id) FILTER (WHERE su.current_status::text = 'ON_HOLD')::int AS hold_units,
         (SELECT COALESCE(SUM(bc.qty), 0)::int
            FROM locations tote_place
            JOIN bin_contents bc
              ON bc.location_id = tote_place.id
             AND bc.organization_id = tote_place.organization_id
           WHERE tote_place.organization_id = hu.organization_id
             AND tote_place.barcode = hu.code
             AND bc.qty > 0) AS stock_units
    FROM locations l
    JOIN handling_units hu
      ON hu.location_id = l.id
     AND hu.organization_id = l.organization_id
    LEFT JOIN serial_units su
      ON su.handling_unit_id = hu.id
     AND su.organization_id = hu.organization_id
   WHERE l.organization_id = $1
     AND l.barcode = $2
     AND l.is_active = true
   GROUP BY hu.id, hu.code, hu.status, hu.created_at, hu.paired_order_id
   ORDER BY hu.created_at DESC, hu.id DESC
`;

// The room's physical walk (same order and room as `GET /api/locations?room=`):
// the phone's Previous / Next without downloading the building. The room is
// DERIVED up `parent_id`, so a rack shelf walks with the room its rack stands
// in now; `room` is that derived room for the record.
const WALK_SQL = `
  WITH here AS (
    SELECT ${derivedRoomLabelSql('l', 'room')} AS room
      FROM locations l
      ${derivedRoomJoinSql('l', 'room')}
     WHERE l.organization_id = $1 AND l.barcode = $2 AND l.is_active = true
     LIMIT 1
  ), walk AS (
    SELECT l.barcode,
           ROW_NUMBER() OVER w AS position,
           COUNT(*) OVER () AS total,
           LAG(l.barcode) OVER w AS previous,
           LEAD(l.barcode) OVER w AS next
      FROM locations l
      ${derivedRoomSetJoinSql('l', 'room', '$1')}
      CROSS JOIN here
     WHERE l.organization_id = $1
       AND l.is_active = true
       AND NULLIF(BTRIM(l.barcode), '') IS NOT NULL
       AND ${derivedRoomLabelSql('l', 'room')} IS NOT DISTINCT FROM here.room
    WINDOW w AS (ORDER BY ${rackWalkOrderSql('l.barcode')}, l.sort_order, ${legacyBinWalkOrderSql('l.barcode')}, l.row_label, l.col_label, l.name)
  )
  SELECT walk.position::int, walk.total::int, walk.previous, walk.next, here.room
    FROM walk CROSS JOIN here
   WHERE walk.barcode = $2
`;

/**
 * One active location's record, or null when no active location answers to
 * `code` in this org. A printed barcode reads exactly; on a miss the code is
 * read as typed (`c02094`, `C-2-9-4`, a name) via {@link resolveLocationBarcode},
 * and the record carries the real barcode — callers key on
 * `location.barcode`, never on what was typed.
 */
export async function readLocationRecord(code: string, orgId: OrgId): Promise<LocationRecordPayload | null> {
  const exact = await readLocationRecordExact(code, orgId);
  if (exact) return exact;
  const barcode = await resolveLocationBarcode(code, orgId);
  return barcode && barcode !== code ? readLocationRecordExact(barcode, orgId) : null;
}

/**
 * The record for one exact barcode. A location is an address; LPNs are
 * movable containers parked at it and stay distinct from fungible SKU counts.
 * Every read is keyed by barcode, so all three travel in parallel.
 */
async function readLocationRecordExact(code: string, orgId: OrgId): Promise<LocationRecordPayload | null> {
  const [result, handlingUnits, walk] = await Promise.all([
    getBinContentsByBarcode(code, orgId),
    tenantQueryOneTrip<HandlingUnitRow>(orgId, HANDLING_UNITS_SQL, [orgId, code]),
    tenantQueryOneTrip<WalkRow>(orgId, WALK_SQL, [orgId, code]),
  ]);
  if (!result) return null;
  const step = walk.rows[0] ?? null;

  return {
    location: {
      id: result.location.id,
      name: result.location.name,
      room: step ? step.room : result.location.room,
      rowLabel: result.location.row_label,
      colLabel: result.location.col_label,
      barcode: result.location.barcode,
      binType: result.location.bin_type,
      capacity: result.location.capacity,
    },
    contents: result.contents.map((c) => ({
      id: c.id,
      stockId: c.stock_id == null ? null : Number(c.stock_id),
      sku: c.sku,
      qty: c.qty,
      minQty: c.min_qty,
      maxQty: c.max_qty,
      lastCounted: c.last_counted,
      productTitle: c.product_title,
      isProvisional: Boolean(c.is_provisional),
      displayNameOverride: c.display_name_override ?? null,
      imageUrl: c.cover_photo_id != null
        ? photoContentUrl(Number(c.cover_photo_id), 'thumb')
        : c.catalog_image_url ?? null,
      photoIds: (c.photo_ids ?? []).map(Number),
      updatedAt: c.updated_at,
    })),
    handlingUnits: handlingUnits.rows.map((unit) => ({
      id: Number(unit.id),
      code: unit.code,
      status: unit.status,
      totalUnits: Number(unit.total_units) || 0,
      testedUnits: Number(unit.tested_units) || 0,
      holdUnits: Number(unit.hold_units) || 0,
      stockUnits: Number(unit.stock_units) || 0,
      pairedOrderId: unit.paired_order_id == null ? null : Number(unit.paired_order_id),
      createdAt: unit.created_at,
    })),
    walk: step
      ? { position: step.position, total: step.total, previous: step.previous, next: step.next }
      : null,
  };
}
