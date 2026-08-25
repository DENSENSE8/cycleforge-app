/**
 * spine-lookup — the capstone read (00-endgame §8): hand anyone any unit or
 * parts bin, they scan its QR, and the answer about where it is, where it came
 * from, and what's been pulled from it is true.
 *
 * One entry point, two shapes. A scanned value is tried as a LOCATION barcode
 * first (bin labels are the smaller, closed vocabulary), then as a UNIT
 * (unit_uid exact, else normalized serial). Read-only; org-scoped through
 * `withTenantTransaction` (GUC + RLS) with orgId from ctx at the route.
 *
 * Truthfulness note: `location` comes ONLY from the scan-created pointer
 * (`serial_units.location_id`). The legacy `current_location` TEXT is returned
 * separately as `legacyLocationClaim` so a surface can show "last claimed
 * (unverified)" without ever confusing it with the spine's answer.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { PlacementQueryable } from './placements';

export interface SpineLookupDeps {
  withTenantTransaction: <T>(
    orgId: OrgId,
    fn: (db: PlacementQueryable) => Promise<T>,
  ) => Promise<T>;
}

export const defaultSpineLookupDeps: SpineLookupDeps = {
  // Lazy for the same reason as placements.ts — keep the pool out of DB-free tests.
  withTenantTransaction: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, fn);
  },
};

export interface SpineLocationSummary {
  id: number;
  name: string;
  displayName: string | null;
  room: string | null;
  barcode: string | null;
  binRole: string | null;
}

export interface SpineUnitSummary {
  id: number;
  serialNumber: string;
  sku: string | null;
  status: string;
  conditionGrade: string | null;
}

export interface UnitSpine {
  kind: 'unit';
  unit: SpineUnitSummary;
  /** The scan-created truth. Null = never placed since the spine landed. */
  location: SpineLocationSummary | null;
  /** The pre-spine TEXT claim — unverified, shown as such or not at all. */
  legacyLocationClaim: string | null;
  /** Where it came from — the typed origin spine, newest first. */
  provenance: Array<{ originType: string; originId: number | null; occurredAt: string }>;
  /** What's been pulled from it — newest first. */
  pulls: Array<{
    partLabel: string;
    partSku: string | null;
    quantity: number;
    toLocationId: number;
    toLocationName: string | null;
    occurredAt: string;
  }>;
  /** Placement history, newest first (capped). */
  placements: Array<{
    locationId: number;
    locationName: string | null;
    previousLocationId: number | null;
    occurredAt: string;
  }>;
}

export interface LocationSpine {
  kind: 'location';
  location: SpineLocationSummary;
  /** Units whose pointer says they are here right now. */
  units: SpineUnitSummary[];
  /** Parts pulled INTO this bin, newest first (capped). */
  pullsIn: Array<{
    partLabel: string;
    partSku: string | null;
    quantity: number;
    donorSerialUnitId: number;
    occurredAt: string;
  }>;
}

export type SpineAnswer = UnitSpine | LocationSpine;

const HISTORY_CAP = 20;

/* eslint-disable @typescript-eslint/no-explicit-any */
function locationSummary(r: any): SpineLocationSummary {
  return {
    id: r.id,
    name: r.name,
    displayName: r.display_name ?? null,
    room: r.room ?? null,
    barcode: r.barcode ?? null,
    binRole: r.bin_role ?? null,
  };
}

function unitSummary(r: any): SpineUnitSummary {
  return {
    id: r.id,
    serialNumber: r.serial_number,
    sku: r.sku ?? null,
    status: r.current_status,
    conditionGrade: r.condition_grade ?? null,
  };
}

/** Resolve a scanned QR to its spine answer, or null when nothing matches. */
export async function spineLookup(
  orgId: OrgId,
  scanned: string,
  deps: SpineLookupDeps = defaultSpineLookupDeps,
): Promise<SpineAnswer | null> {
  const value = scanned.trim();
  if (!value) return null;

  return deps.withTenantTransaction(orgId, async (db) => {
    // ── Location first: bin barcodes are the closed vocabulary. ─────────────
    const loc = await db.query(
      `SELECT id, name, display_name, room, barcode, bin_role
         FROM locations WHERE barcode = $1 AND is_active LIMIT 1`,
      [value],
    );
    if (loc.rows[0]) {
      const location = locationSummary(loc.rows[0]);
      const [units, pullsIn] = await Promise.all([
        db.query(
          `SELECT id, serial_number, sku, current_status, condition_grade
             FROM serial_units WHERE location_id = $1
             ORDER BY updated_at DESC LIMIT 200`,
          [location.id],
        ),
        db.query(
          `SELECT part_label, part_sku, quantity, donor_serial_unit_id, occurred_at
             FROM part_pulls WHERE to_location_id = $1
             ORDER BY occurred_at DESC LIMIT ${HISTORY_CAP}`,
          [location.id],
        ),
      ]);
      return {
        kind: 'location',
        location,
        units: units.rows.map(unitSummary),
        pullsIn: pullsIn.rows.map((r: any) => ({
          partLabel: r.part_label,
          partSku: r.part_sku ?? null,
          quantity: r.quantity,
          donorSerialUnitId: r.donor_serial_unit_id,
          occurredAt: r.occurred_at,
        })),
      } satisfies LocationSpine;
    }

    // ── Then the unit: unit_uid exact, else normalized serial. ──────────────
    const unitRes = await db.query(
      `SELECT u.id, u.serial_number, u.sku, u.current_status, u.condition_grade,
              u.current_location AS legacy_claim,
              l.id AS l_id, l.name AS l_name, l.display_name AS l_display_name,
              l.room AS l_room, l.barcode AS l_barcode, l.bin_role AS l_bin_role
         FROM serial_units u
         LEFT JOIN locations l ON l.id = u.location_id
        WHERE u.unit_uid = $1
           OR u.normalized_serial = upper(regexp_replace($1, '[^A-Za-z0-9]', '', 'g'))
        LIMIT 1`,
      [value],
    );
    const u = unitRes.rows[0] as any;
    if (!u) return null;

    const [provenance, pulls, placements] = await Promise.all([
      db.query(
        `SELECT origin_type, origin_id, occurred_at
           FROM serial_unit_provenance WHERE serial_unit_id = $1
           ORDER BY occurred_at DESC LIMIT ${HISTORY_CAP}`,
        [u.id],
      ),
      db.query(
        `SELECT p.part_label, p.part_sku, p.quantity, p.to_location_id, p.occurred_at,
                l.name AS to_location_name
           FROM part_pulls p LEFT JOIN locations l ON l.id = p.to_location_id
          WHERE p.donor_serial_unit_id = $1
          ORDER BY p.occurred_at DESC LIMIT ${HISTORY_CAP}`,
        [u.id],
      ),
      db.query(
        `SELECT p.location_id, p.previous_location_id, p.occurred_at,
                l.name AS location_name
           FROM unit_placements p LEFT JOIN locations l ON l.id = p.location_id
          WHERE p.serial_unit_id = $1
          ORDER BY p.occurred_at DESC LIMIT ${HISTORY_CAP}`,
        [u.id],
      ),
    ]);

    return {
      kind: 'unit',
      unit: unitSummary(u),
      location:
        u.l_id != null
          ? locationSummary({
              id: u.l_id,
              name: u.l_name,
              display_name: u.l_display_name,
              room: u.l_room,
              barcode: u.l_barcode,
              bin_role: u.l_bin_role,
            })
          : null,
      legacyLocationClaim: u.legacy_claim ?? null,
      provenance: provenance.rows.map((r: any) => ({
        originType: r.origin_type,
        originId: r.origin_id ?? null,
        occurredAt: r.occurred_at,
      })),
      pulls: pulls.rows.map((r: any) => ({
        partLabel: r.part_label,
        partSku: r.part_sku ?? null,
        quantity: r.quantity,
        toLocationId: r.to_location_id,
        toLocationName: r.to_location_name ?? null,
        occurredAt: r.occurred_at,
      })),
      placements: placements.rows.map((r: any) => ({
        locationId: r.location_id,
        locationName: r.location_name ?? null,
        previousLocationId: r.previous_location_id ?? null,
        occurredAt: r.occurred_at,
      })),
    } satisfies UnitSpine;
  });
}
