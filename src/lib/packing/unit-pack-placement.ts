/**
 * Unit pack placement SoT — loose serialized UNITS staged at packing DESK /
 * STAGING benches (Phase 2 sibling of order pack placement).
 *
 * Shares the same `locations` DESK/STAGING benches as order placement but keeps
 * its OWN ledger (`unit_pack_placements`) so order vs unit per-bench counts stay
 * distinct (no double-count when a unit's parent order is also on a bench).
 *
 * This is WIP staging, NOT stock putaway: `serial_units.current_location` +
 * `inventory_events(MOVED)` remain the bin-putaway path and are untouched here.
 */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import {
  PACK_PLACEABLE_KINDS,
  locationDisplayNameSql,
  type PackPlaceableKind,
  type PackPlacementSource,
} from '@/lib/packing/pack-placement-constants';
import { resolvePackPlaceableLocation } from '@/lib/packing/pack-placement';

export type { PackPlaceableKind, PackPlacementSource } from '@/lib/packing/pack-placement-constants';

/** Serial-unit statuses that are OFF the pack floor — never counted at a bench. */
const OFF_FLOOR_UNIT_STATUSES = ['SHIPPED', 'SCRAPPED', 'RETURNED', 'RMA'] as const;

export interface UnitPackPlacement {
  unitId: number;
  locationId: number;
  locationName: string;
  locationBarcode: string | null;
  locationKind: PackPlaceableKind;
  placedAt: string;
  placedByStaffId: number | null;
  source: PackPlacementSource;
}

export interface UnitPackPlacementCountRow {
  locationId: number;
  locationName: string;
  locationBarcode: string | null;
  locationKind: PackPlaceableKind;
  count: number;
}

type UnitPackPlacementErrorCode =
  | 'UNIT_NOT_FOUND'
  | 'LOCATION_NOT_PLACEABLE'
  | 'SAME_LOCATION';

export class UnitPackPlacementError extends Error {
  constructor(
    public readonly code: UnitPackPlacementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UnitPackPlacementError';
  }
}

async function assertUnitExists(
  client: PoolClient,
  orgId: OrgId,
  unitId: number,
): Promise<void> {
  const result = await client.query(
    `SELECT id FROM serial_units WHERE organization_id = $1 AND id = $2 LIMIT 1`,
    [orgId, unitId],
  );
  if (!result.rows[0]) {
    throw new UnitPackPlacementError('UNIT_NOT_FOUND', 'Unit not found');
  }
}

interface PlaceUnitAtLocationArgs {
  unitId: number;
  locationId?: number | null;
  barcode?: string | null;
  staffId: number | null;
  source: PackPlacementSource;
  reason?: string | null;
}

export async function placeUnitAtLocation(
  orgId: OrgId,
  args: PlaceUnitAtLocationArgs,
  client?: PoolClient,
): Promise<UnitPackPlacement> {
  const run = async (c: PoolClient) => {
    const unitId = Number(args.unitId);
    if (!Number.isFinite(unitId) || unitId <= 0) {
      throw new UnitPackPlacementError('UNIT_NOT_FOUND', 'Invalid unit id');
    }

    await assertUnitExists(c, orgId, unitId);

    const location = await resolvePackPlaceableLocation(
      orgId,
      { locationId: args.locationId, barcode: args.barcode },
      c,
    );
    if (!location) {
      throw new UnitPackPlacementError(
        'LOCATION_NOT_PLACEABLE',
        'Packing station or staging location not found',
      );
    }

    const existing = await c.query<{ location_id: number }>(
      `SELECT location_id
         FROM unit_pack_placements
        WHERE organization_id = $1 AND unit_id = $2
        LIMIT 1`,
      [orgId, unitId],
    );
    const fromLocationId = existing.rows[0]
      ? Number(existing.rows[0].location_id)
      : null;

    if (fromLocationId === location.id && args.source === 'move') {
      throw new UnitPackPlacementError('SAME_LOCATION', 'Already at that station');
    }

    await c.query(
      `INSERT INTO unit_pack_placements (
         organization_id, unit_id, location_id,
         placed_at, placed_by_staff_id, source, updated_at
       ) VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
       ON CONFLICT (organization_id, unit_id) DO UPDATE SET
         location_id = EXCLUDED.location_id,
         placed_at = EXCLUDED.placed_at,
         placed_by_staff_id = EXCLUDED.placed_by_staff_id,
         source = EXCLUDED.source,
         updated_at = NOW()`,
      [orgId, unitId, location.id, args.staffId, args.source],
    );

    await c.query(
      `INSERT INTO unit_pack_placement_events (
         organization_id, unit_id, from_location_id, to_location_id,
         staff_id, source, reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orgId,
        unitId,
        fromLocationId,
        location.id,
        args.staffId,
        args.source,
        args.reason ?? null,
      ],
    );

    return {
      unitId,
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

export async function moveUnitPackPlacement(
  orgId: OrgId,
  args: PlaceUnitAtLocationArgs,
): Promise<UnitPackPlacement> {
  return placeUnitAtLocation(orgId, { ...args, source: args.source || 'move' });
}

/**
 * Clear a loose unit's bench placement when it leaves the pack floor (pack
 * complete / ship). Sibling of `clearOrderPackPlacement` — deletes the current
 * row and appends a `'clear'` placement event (from = to = the bench it left,
 * `to_location_id` is NOT NULL). Returns false when there was nothing to clear.
 */
export async function clearUnitPackPlacement(
  orgId: OrgId,
  args: { unitId: number; staffId: number | null; reason?: string | null },
  client?: PoolClient,
): Promise<boolean> {
  const run = async (c: PoolClient) => {
    const unitId = Number(args.unitId);
    if (!Number.isFinite(unitId) || unitId <= 0) return false;

    const existing = await c.query<{ location_id: number }>(
      `SELECT location_id
         FROM unit_pack_placements
        WHERE organization_id = $1 AND unit_id = $2
        LIMIT 1`,
      [orgId, unitId],
    );
    if (!existing.rows[0]) return false;

    const fromLocationId = Number(existing.rows[0].location_id);
    await c.query(
      `DELETE FROM unit_pack_placements
        WHERE organization_id = $1 AND unit_id = $2`,
      [orgId, unitId],
    );
    await c.query(
      `INSERT INTO unit_pack_placement_events (
         organization_id, unit_id, from_location_id, to_location_id,
         staff_id, source, reason
       ) VALUES ($1, $2, $3, $3, $4, 'clear', $5)`,
      [orgId, unitId, fromLocationId, args.staffId, args.reason ?? 'pack_complete'],
    );
    return true;
  };

  if (client) return run(client);
  return withTenantTransaction(orgId, run);
}

/**
 * Counts of loose units currently staged at each packing DESK/STAGING.
 * Locations with zero staged units still appear (capacity / empty benches).
 * Units that have left the pack floor (SHIPPED / SCRAPPED / …) are excluded so
 * a lingering placement row cannot inflate the count.
 */
export async function countOpenUnitPlacementsByLocation(
  orgId: OrgId,
): Promise<UnitPackPlacementCountRow[]> {
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
             FROM unit_pack_placements p
             JOIN serial_units u ON u.id = p.unit_id AND u.organization_id = p.organization_id
            WHERE p.organization_id = $1
              AND u.current_status::text <> ALL($3::text[])
            GROUP BY p.location_id
         ) c ON c.location_id = l.id
        WHERE l.organization_id = $1
          AND l.is_active = true
          AND l.location_kind = ANY($2::text[])
        ORDER BY l.sort_order ASC, l.name ASC`,
      [orgId, [...PACK_PLACEABLE_KINDS], [...OFF_FLOOR_UNIT_STATUSES]],
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
