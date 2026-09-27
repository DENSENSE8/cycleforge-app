/** Pack placement SoT — labeled outbound orders at packing DESK / STAGING locations on the warehouse `locations` map. */

import type { PoolClient } from 'pg';
import { sqlOrderHasPackScan } from '@/lib/orders/order-grain-sql';
import { sqlOrderInWarehouseToShip } from '@/lib/orders/desk-view-sql';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import {
  PACK_PLACEABLE_KINDS,
  locationDisplayNameSql,
  type PackPlaceableKind,
  type PackPlacementSource,
} from '@/lib/packing/pack-placement-constants';

export type { PackPlaceableKind, PackPlacementSource } from '@/lib/packing/pack-placement-constants';

export interface PackPlaceableLocation {
  id: number;
  /** Warehouse-map identity — globally unique, referenced by seeds and rooms. */
  name: string;
  /** Operator nickname (`locations.display_name`); null = read {@link name}. */
  displayName: string | null;
  barcode: string | null;
  locationKind: PackPlaceableKind;
  room: string | null;
  sortOrder: number;
}

export interface OrderPackPlacement {
  orderId: number;
  locationId: number;
  locationName: string;
  locationBarcode: string | null;
  locationKind: PackPlaceableKind;
  placedAt: string;
  placedByStaffId: number | null;
  source: PackPlacementSource;
}

export interface PackPlacementCountRow {
  locationId: number;
  locationName: string;
  locationBarcode: string | null;
  locationKind: PackPlaceableKind;
  count: number;
}

type PackPlacementErrorCode =
  | 'ORDER_NOT_FOUND'
  | 'LOCATION_NOT_FOUND'
  | 'LOCATION_NOT_PLACEABLE'
  | 'ORDER_NOT_PREPACK'
  | 'SAME_LOCATION';

export class PackPlacementError extends Error {
  constructor(
    public readonly code: PackPlacementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PackPlacementError';
  }
}

/** Open pre-pack membership: the To-ship scope queue-counts and the desk list use, not yet packed. */
function prepackMembershipSql(orderAlias = 'o'): string {
  return `
    ${orderAlias}.organization_id = $1
    AND ${sqlOrderInWarehouseToShip(orderAlias)}
    AND NOT ${sqlOrderHasPackScan(orderAlias)}
  `;
}

export async function resolvePackPlaceableLocations(
  orgId: OrgId,
): Promise<PackPlaceableLocation[]> {
  return withTenantTransaction(orgId, async (client) => {
    const result = await client.query<{
      id: number;
      name: string;
      display_name: string | null;
      barcode: string | null;
      location_kind: string;
      room: string | null;
      sort_order: number;
    }>(
      // Both names, unresolved: Settings → Packing benches shows the canonical
      // `name` beside the editable nickname, so it cannot COALESCE here.
      `SELECT id, name, display_name, barcode, location_kind, room, sort_order
         FROM locations
        WHERE organization_id = $1
          AND is_active = true
          AND location_kind = ANY($2::text[])
        ORDER BY sort_order ASC, name ASC`,
      [orgId, [...PACK_PLACEABLE_KINDS]],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      displayName: row.display_name,
      barcode: row.barcode,
      locationKind: row.location_kind as PackPlaceableKind,
      room: row.room,
      sortOrder: Number(row.sort_order) || 0,
    }));
  });
}

export async function resolvePackPlaceableLocation(
  orgId: OrgId,
  args: { locationId?: number | null; barcode?: string | null },
  client?: PoolClient,
): Promise<PackPlaceableLocation | null> {
  const run = async (c: PoolClient) => {
    const locationId = args.locationId != null ? Number(args.locationId) : null;
    const barcode = args.barcode?.trim() || null;
    if ((!locationId || !Number.isFinite(locationId)) && !barcode) return null;

    const result = await c.query<{
      id: number;
      name: string;
      display_name: string | null;
      barcode: string | null;
      location_kind: string;
      room: string | null;
      sort_order: number;
    }>(
      `SELECT id, name, display_name, barcode, location_kind, room, sort_order
         FROM locations
        WHERE organization_id = $1
          AND is_active = true
          AND location_kind = ANY($2::text[])
          AND (
            ($3::int IS NOT NULL AND id = $3)
            OR ($4::text IS NOT NULL AND barcode = $4)
          )
        LIMIT 1`,
      [orgId, [...PACK_PLACEABLE_KINDS], locationId, barcode],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      name: row.name,
      displayName: row.display_name,
      barcode: row.barcode,
      locationKind: row.location_kind as PackPlaceableKind,
      room: row.room,
      sortOrder: Number(row.sort_order) || 0,
    };
  };

  if (client) return run(client);
  return withTenantTransaction(orgId, run);
}

async function assertOrderInPrepack(
  client: PoolClient,
  orgId: OrgId,
  orderId: number,
): Promise<void> {
  const result = await client.query(
    `SELECT o.id
       FROM orders o
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE o.id = $2
        AND ${prepackMembershipSql('o')}
      LIMIT 1`,
    [orgId, orderId],
  );
  if (!result.rows[0]) {
    const exists = await client.query(
      `SELECT id FROM orders WHERE organization_id = $1 AND id = $2 LIMIT 1`,
      [orgId, orderId],
    );
    if (!exists.rows[0]) {
      throw new PackPlacementError('ORDER_NOT_FOUND', 'Order not found');
    }
    throw new PackPlacementError(
      'ORDER_NOT_PREPACK',
      'Order is not on the ready-to-pack board',
    );
  }
}

interface PlaceOrderAtLocationArgs {
  orderId: number;
  locationId?: number | null;
  barcode?: string | null;
  staffId: number | null;
  source: PackPlacementSource;
  reason?: string | null;
}

export async function placeOrderAtLocation(
  orgId: OrgId,
  args: PlaceOrderAtLocationArgs,
  client?: PoolClient,
): Promise<OrderPackPlacement> {
  const run = async (c: PoolClient) => {
    const orderId = Number(args.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      throw new PackPlacementError('ORDER_NOT_FOUND', 'Invalid order id');
    }

    await assertOrderInPrepack(c, orgId, orderId);

    const location = await resolvePackPlaceableLocation(
      orgId,
      { locationId: args.locationId, barcode: args.barcode },
      c,
    );
    if (!location) {
      throw new PackPlacementError(
        'LOCATION_NOT_PLACEABLE',
        'Packing station or staging location not found',
      );
    }

    const existing = await c.query<{ location_id: number }>(
      `SELECT location_id
         FROM order_pack_placements
        WHERE organization_id = $1 AND order_id = $2
        LIMIT 1`,
      [orgId, orderId],
    );
    const fromLocationId = existing.rows[0]
      ? Number(existing.rows[0].location_id)
      : null;

    if (fromLocationId === location.id && args.source === 'move') {
      throw new PackPlacementError('SAME_LOCATION', 'Already at that station');
    }

    await c.query(
      `INSERT INTO order_pack_placements (
         organization_id, order_id, location_id,
         placed_at, placed_by_staff_id, source, updated_at
       ) VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
       ON CONFLICT (organization_id, order_id) DO UPDATE SET
         location_id = EXCLUDED.location_id,
         placed_at = EXCLUDED.placed_at,
         placed_by_staff_id = EXCLUDED.placed_by_staff_id,
         source = EXCLUDED.source,
         updated_at = NOW()`,
      [orgId, orderId, location.id, args.staffId, args.source],
    );

    await c.query(
      `INSERT INTO order_pack_placement_events (
         organization_id, order_id, from_location_id, to_location_id,
         staff_id, source, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orgId,
        orderId,
        fromLocationId,
        location.id,
        args.staffId,
        args.source,
        args.reason ?? null,
      ],
    );

    return {
      orderId,
      locationId: location.id,
      locationName: location.displayName?.trim() || location.name,
      locationBarcode: location.barcode,
      locationKind: location.locationKind,
      placedAt: new Date().toISOString(),
      placedByStaffId: args.staffId,
      source: args.source,
    };
  };

  if (client) return run(client);
  return withTenantTransaction(orgId, run);
}

export async function moveOrderPackPlacement(
  orgId: OrgId,
  args: PlaceOrderAtLocationArgs,
): Promise<OrderPackPlacement> {
  return placeOrderAtLocation(orgId, { ...args, source: args.source || 'move' });
}

export async function clearOrderPackPlacement(
  orgId: OrgId,
  args: { orderId: number; staffId: number | null; reason?: string | null },
  client?: PoolClient,
): Promise<boolean> {
  const run = async (c: PoolClient) => {
    const orderId = Number(args.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) return false;

    const existing = await c.query<{ location_id: number }>(
      `SELECT location_id
         FROM order_pack_placements
        WHERE organization_id = $1 AND order_id = $2
        LIMIT 1`,
      [orgId, orderId],
    );
    if (!existing.rows[0]) return false;

    const fromLocationId = Number(existing.rows[0].location_id);
    await c.query(
      `DELETE FROM order_pack_placements
        WHERE organization_id = $1 AND order_id = $2`,
      [orgId, orderId],
    );
    await c.query(
      `INSERT INTO order_pack_placement_events (
         organization_id, order_id, from_location_id, to_location_id,
         staff_id, source, reason
       ) VALUES ($1, $2, $3, $3, $4, 'clear', $5)`,
      [orgId, orderId, fromLocationId, args.staffId, args.reason ?? 'pack_complete'],
    );
    return true;
  };

  if (client) return run(client);
  return withTenantTransaction(orgId, run);
}

/**
 * Counts of open pre-pack orders currently placed at each packing DESK/STAGING.
 * Locations with zero open placements still appear (capacity / empty benches).
 */
export async function countOpenPlacementsByLocation(
  orgId: OrgId,
): Promise<PackPlacementCountRow[]> {
  return withTenantTransaction(orgId, async (client) => {
    const result = await client.query<{
      location_id: number;
      location_name: string;
      location_barcode: string | null;
      location_kind: string;
      n: number;
    }>(
      `SELECT l.id AS location_id, ${locationDisplayNameSql('l')} AS location_name,
              l.barcode AS location_barcode,
              l.location_kind, COALESCE(c.n, 0)::int AS n
         FROM locations l
         LEFT JOIN (
           SELECT p.location_id, COUNT(*)::int AS n
             FROM order_pack_placements p
             JOIN orders o ON o.id = p.order_id AND o.organization_id = p.organization_id
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
            WHERE p.organization_id = $1
              AND ${prepackMembershipSql('o')}
            GROUP BY p.location_id
         ) c ON c.location_id = l.id
        WHERE l.organization_id = $1
          AND l.is_active = true
          AND l.location_kind = ANY($2::text[])
        ORDER BY l.sort_order ASC, l.name ASC`,
      [orgId, [...PACK_PLACEABLE_KINDS]],
    );
    return result.rows.map((row) => ({
      locationId: Number(row.location_id),
      locationName: row.location_name,
      locationBarcode: row.location_barcode,
      locationKind: row.location_kind as PackPlaceableKind,
      count: Number(row.n) || 0,
    }));
  });
}

export interface RecentPackPlacement {
  locationId: number;
  /** Bench face as {@link packBenchShortLabel} would read it. */
  locationName: string;
  locationKind: PackPlaceableKind;
  placedAt: string | null;
}

/** The desk this operator last put an order on — the Ready-to-Pack twin of Unbox's Last entry. */
export async function fetchRecentPackPlacement(
  orgId: OrgId,
  args: { excludeOrderId?: number | null; staffId?: number | null } = {},
): Promise<RecentPackPlacement | null> {
  const excludeOrderId =
    args.excludeOrderId != null && Number.isFinite(args.excludeOrderId)
      ? Number(args.excludeOrderId)
      : null;
  const staffId =
    args.staffId != null && Number.isFinite(args.staffId) ? Number(args.staffId) : null;

  return withTenantTransaction(orgId, async (client) => {
    const run = async (byStaff: boolean) => {
      const result = await client.query<{
        location_id: number;
        location_name: string;
        location_kind: string;
        placed_at: string | null;
      }>(
        `SELECT e.to_location_id AS location_id,
                ${locationDisplayNameSql('l')} AS location_name,
                l.location_kind,
                e.created_at AS placed_at
           FROM order_pack_placement_events e
           JOIN locations l
             ON l.id = e.to_location_id
            AND l.organization_id = e.organization_id
          WHERE e.organization_id = $1
            AND e.source <> 'clear'
            AND l.is_active = true
            AND l.location_kind = ANY($2::text[])
            AND ($3::int IS NULL OR e.order_id <> $3)
            AND ($4::int IS NULL OR e.staff_id = $4)
          ORDER BY e.created_at DESC
          LIMIT 1`,
        [orgId, [...PACK_PLACEABLE_KINDS], excludeOrderId, byStaff ? staffId : null],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        locationId: Number(row.location_id),
        locationName: row.location_name,
        locationKind: row.location_kind as PackPlaceableKind,
        placedAt: row.placed_at ?? null,
      };
    };

    if (staffId != null) {
      const mine = await run(true);
      if (mine) return mine;
    }
    return run(false);
  });
}

/**
 * Seed packing room + desks + staging for an org (idempotent).
 * `locations.name` / `barcode` are still globally unique (legacy) — pass a
 * distinct `barcodePrefix` / `namePrefix` for non-dogfood tenants (e.g. `QA-`).
 */
export async function seedPackingStationsForOrg(
  client: PoolClient,
  orgId: OrgId,
  opts?: { barcodePrefix?: string; namePrefix?: string },
): Promise<void> {
  const barcodePrefix = opts?.barcodePrefix ?? '';
  const namePrefix = opts?.namePrefix ?? '';
  const roomBarcode = `${barcodePrefix}PACK-ROOM`;
  const roomName = `${namePrefix}Pack Floor`;

  await client.query(
    `INSERT INTO locations (
       name, room, barcode, is_active, sort_order,
       bin_role, locked_for_count, warehouse_id, zone_letter,
       location_kind, organization_id, description
     )
     SELECT
       $2, $2, $3,
       TRUE,
       200,
       'RESERVE',
       FALSE,
       1,
       NULL,
       'ROOM',
       $1::uuid,
       'Outbound packing room — desks and staging for ready-to-pack cartons'
     WHERE NOT EXISTS (
       SELECT 1 FROM locations
        WHERE barcode = $3 AND organization_id = $1::uuid
     )`,
    [orgId, roomName, roomBarcode],
  );

  await client.query(
    `INSERT INTO locations (
       name, room, barcode, is_active, sort_order,
       bin_role, locked_for_count, warehouse_id, zone_letter,
       location_kind, parent_id, organization_id, description
     )
     SELECT
       v.name,
       $2,
       v.barcode,
       TRUE,
       v.sort_order,
       'STAGING'::bin_role_enum,
       FALSE,
       1,
       NULL,
       v.kind,
       (SELECT id FROM locations WHERE barcode = $3 AND organization_id = $1::uuid LIMIT 1),
       $1::uuid,
       v.description
     FROM (VALUES
       ($5 || 'Pack Desk 1', $4 || 'PACK-DESK-01', 210, 'DESK',    'Packing bench 1 — ready-to-pack cartons'),
       ($5 || 'Pack Desk 2', $4 || 'PACK-DESK-02', 220, 'DESK',    'Packing bench 2 — ready-to-pack cartons'),
       ($5 || 'Pack Desk 3', $4 || 'PACK-DESK-03', 230, 'DESK',    'Packing bench 3 — ready-to-pack cartons'),
       ($5 || 'Pack Staging', $4 || 'PACK-STAGING', 240, 'STAGING', 'Packing-room overflow staging before pack')
     ) AS v(name, barcode, sort_order, kind, description)
     WHERE NOT EXISTS (
       SELECT 1 FROM locations l
        WHERE l.barcode = v.barcode AND l.organization_id = $1::uuid
     )
     AND EXISTS (
       SELECT 1 FROM locations
        WHERE barcode = $3 AND organization_id = $1::uuid
     )`,
    [orgId, roomName, roomBarcode, barcodePrefix, namePrefix],
  );
}
