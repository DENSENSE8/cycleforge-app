/**
 * Serial projection — the read-model denorm behind instant serial display.
 *
 * Plan: docs/todo/receiving-serial-immediate-display-plan.md (Tier B2).
 *
 * Two responsibilities live here:
 *
 *  1. {@link fetchSerialsForLines} — the authoritative "current serials per
 *     receiving line" query (moved verbatim out of the receiving-lines route so
 *     the route, the batch endpoint, the reconcile path, and the projection
 *     writer all share ONE implementation). Candidate set = anything ever touched
 *     by one of the lines (frozen origin OR a later inventory_events attach), then
 *     each candidate's CURRENT line is resolved (most recent inventory_events
 *     touch, falling back to the frozen origin) so a returned-then-re-received
 *     serial lands on the line it's actually on now.
 *
 *  2. {@link refreshLineSerialProjection} — recompute + persist the compact jsonb
 *     projection (`{ id, serial_number, condition_grade }[]`) onto
 *     receiving_line_testing.serial_projection whenever a serial attaches /
 *     detaches / re-grades / auto-sorts. The projection is only the FAST DEFAULT
 *     for first-frame display; `?include=serials` remains the authoritative
 *     reconcile that self-heals any drift on open, so this writer is best-effort
 *     (a failure must never fail the scan — see {@link refreshLineSerialProjectionSafe}).
 *
 * Deps-injected (default real impls) so the writer unit-tests DB-free — same
 * convention as the narrow-facts helpers.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  resolveCurrentReceivingLineIds,
  type SerialUnitRow,
} from '@/lib/neon/serial-units-queries';

/** Full per-line serial display shape returned by the authoritative query. */
export interface LineSerial {
  id: number;
  serial_number: string;
  current_status: string;
  sku_catalog_id: number | null;
  condition_grade: string | null;
  created_at: string;
  /** Handling-unit (H-#### tote) this unit currently sits in, if any. */
  handling_unit_id: number | null;
  /** Minted unit identity; presence = this unit has been labeled at least once. */
  unit_uid: string | null;
}

/** Compact projected shape stored in receiving_line_testing.serial_projection. */
export interface SerialProjectionEntry {
  id: number;
  serial_number: string;
  condition_grade: string | null;
}

/** Injectable collaborators for {@link fetchSerialsForLines} (real impls by default). */
export interface FetchSerialsDeps {
  query: typeof tenantQuery;
  resolveCurrentLines: typeof resolveCurrentReceivingLineIds;
}

const defaultFetchDeps: FetchSerialsDeps = {
  query: tenantQuery,
  resolveCurrentLines: resolveCurrentReceivingLineIds,
};

/**
 * Resolve the CURRENT serials for each of `lineIds`, grouped by line id. Serials
 * are org-owned, so the query org-scopes hard — a cross-tenant line id can never
 * surface another tenant's serials.
 */
export async function fetchSerialsForLines(
  lineIds: number[],
  orgId: OrgId,
  deps: FetchSerialsDeps = defaultFetchDeps,
): Promise<Map<number, LineSerial[]>> {
  const grouped = new Map<number, LineSerial[]>();
  if (lineIds.length === 0) return grouped;

  // Candidate serials: anything EVER touched by one of these lines — either its
  // frozen origin, or a later inventory_events attach (a return re-received under
  // a different PO moves a serial onto a NEW line without ever updating
  // origin_receiving_line_id).
  const result = await deps.query<
    SerialUnitRow & { origin_receiving_line_id: number | null; handling_unit_id: number | null }
  >(
    orgId,
    `SELECT DISTINCT su.id, su.serial_number, su.current_status, su.sku_catalog_id,
            su.condition_grade, su.handling_unit_id, su.unit_uid,
            vo.origin_receiving_line_id, su.created_at
       FROM serial_units su
       JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id
      WHERE su.organization_id = $2
        AND (su.id IN (SELECT p.serial_unit_id FROM serial_unit_provenance p
                        WHERE p.origin_type = 'RECEIVING_LINE' AND p.origin_id = ANY($1::int[])
                          AND p.organization_id = $2)
             OR EXISTS (
               SELECT 1 FROM inventory_events ie
                WHERE ie.serial_unit_id = su.id
                  AND ie.receiving_line_id = ANY($1::int[])
                  AND ie.organization_id = $2
             ))
      ORDER BY su.created_at ASC, su.id ASC`,
    [lineIds, orgId],
  );
  if (result.rows.length === 0) return grouped;

  // Resolve each candidate's CURRENT line — never group by
  // origin_receiving_line_id directly, or a re-received serial keeps showing on
  // its first-ever line.
  const currentLines = await deps.resolveCurrentLines(
    result.rows.map((row) => Number(row.id)),
    orgId,
  );

  for (const row of result.rows) {
    const lineId = currentLines.get(Number(row.id)) ?? row.origin_receiving_line_id;
    if (lineId == null || !lineIds.includes(lineId)) continue;
    const slim: LineSerial = {
      id: Number(row.id),
      serial_number: row.serial_number,
      current_status: row.current_status,
      sku_catalog_id: row.sku_catalog_id,
      condition_grade: row.condition_grade,
      created_at: row.created_at,
      handling_unit_id: row.handling_unit_id ?? null,
      unit_uid: row.unit_uid ?? null,
    };
    const bucket = grouped.get(lineId);
    if (bucket) bucket.push(slim);
    else grouped.set(lineId, [slim]);
  }

  return grouped;
}

/** Project the full serial shape down to the compact stored subset. */
export function toSerialProjection(serials: LineSerial[]): SerialProjectionEntry[] {
  return serials.map((s) => ({
    id: s.id,
    serial_number: s.serial_number,
    condition_grade: s.condition_grade ?? null,
  }));
}

/** Injectable collaborators for {@link refreshLineSerialProjection} (real impls by default). */
export interface RefreshProjectionDeps {
  /** Resolve current serials for the given lines, grouped by line id. */
  fetchSerials: (lineIds: number[], orgId: OrgId) => Promise<Map<number, LineSerial[]>>;
  /** Persist one line's compact projection onto receiving_line_testing. */
  writeProjection: (
    orgId: OrgId,
    lineId: number,
    projection: SerialProjectionEntry[],
  ) => Promise<void>;
}

/**
 * Upsert one line's projection onto receiving_line_testing. Every receiving_line
 * is born with its rlt row (birth invariant), so this is an UPDATE in practice;
 * the INSERT arm is a defensive backstop for a legacy line whose rlt row is
 * somehow missing (keeps the projection from silently no-op'ing).
 */
export async function writeLineSerialProjection(
  orgId: OrgId,
  lineId: number,
  projection: SerialProjectionEntry[],
): Promise<void> {
  await tenantQuery(
    orgId,
    `INSERT INTO receiving_line_testing (receiving_line_id, organization_id, serial_projection)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (receiving_line_id)
       DO UPDATE SET serial_projection = EXCLUDED.serial_projection, updated_at = now()`,
    [lineId, orgId, JSON.stringify(projection)],
  );
}

const defaultRefreshDeps: RefreshProjectionDeps = {
  fetchSerials: (lineIds, orgId) => fetchSerialsForLines(lineIds, orgId),
  writeProjection: writeLineSerialProjection,
};

/**
 * Recompute + persist the serial projection for one or more receiving lines from
 * the authoritative current-serials query. Call after any serial mutation
 * (attach / detach / re-grade / parts auto-sort). When a serial's CURRENT line
 * moves, pass BOTH the old and new line so neither is left stale.
 */
export async function refreshLineSerialProjection(
  orgId: OrgId,
  lineIds: number | number[],
  deps: RefreshProjectionDeps = defaultRefreshDeps,
): Promise<void> {
  const ids = (Array.isArray(lineIds) ? lineIds : [lineIds]).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return;

  const grouped = await deps.fetchSerials(unique, orgId);
  for (const lineId of unique) {
    const projection = toSerialProjection(grouped.get(lineId) ?? []);
    await deps.writeProjection(orgId, lineId, projection);
  }
}

/**
 * Best-effort {@link refreshLineSerialProjection} — a projection refresh must
 * never fail the mutation that triggered it (the authoritative `?include=serials`
 * reconcile on open self-heals any drift). Swallows + logs.
 */
export async function refreshLineSerialProjectionSafe(
  orgId: OrgId,
  lineIds: number | number[],
): Promise<void> {
  try {
    await refreshLineSerialProjection(orgId, lineIds);
  } catch (err) {
    console.warn('[serial-projection] refresh failed (non-fatal)', err);
  }
}
