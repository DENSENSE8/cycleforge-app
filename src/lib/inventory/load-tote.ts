/**
 * Load a location's loose stock into a tote — the Zone-style "this shelf's
 * items go into H-12" move, one SKU or every SKU at once.
 *
 * Stock in a tote lives in `bin_contents` under the tote's own stock location
 * ({@link ensureToteStockLocation}), so this is a many-SKU bin transfer:
 * shelf → tote place, one TRANSFER_OUT / TRANSFER_IN ledger pair per SKU,
 * all in ONE transaction. Every requested line must still be on the shelf in
 * the requested quantity or nothing moves — a half-loaded tote is never left
 * behind. Parking the physical tote at the shelf (`handling_units.location_id`)
 * is optional and rides the same transaction.
 */

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ensureToteStockLocation } from './stock-places';

export interface LoadToteLine {
  sku: string;
  qty: number;
}

export interface LoadToteInput {
  toteId: number;
  /** The shelf the stock leaves (its scanned barcode). */
  locationCode: string;
  lines: LoadToteLine[];
  /** Also set the tote's physical place to this shelf. */
  park: boolean;
  staffId: number | null;
}

export interface LoadToteLedgerRow {
  id: number;
  sku: string;
  delta: number;
  reason: 'TRANSFER_OUT' | 'TRANSFER_IN';
}

export type LoadToteResult =
  | {
      kind: 'ok';
      tote: { id: number; code: string; stockLocationId: number };
      location: { id: number; code: string; name: string };
      moved: LoadToteLine[];
      units: number;
      parked: boolean;
      previousLocationId: number | null;
      ledger: LoadToteLedgerRow[];
    }
  | { kind: 'tote_not_found' }
  | { kind: 'tote_closed'; code: string }
  | { kind: 'tote_code_taken'; code: string }
  | { kind: 'location_not_found' }
  | { kind: 'short'; short: Array<{ sku: string; requested: number; available: number }> };

/** Same-SKU lines summed; blank SKUs and non-positive quantities dropped. */
export function normalizeLoadLines(lines: LoadToteLine[]): LoadToteLine[] {
  const bySku = new Map<string, number>();
  for (const line of lines) {
    const sku = line.sku.trim();
    const qty = Math.floor(Number(line.qty));
    if (!sku || !Number.isSafeInteger(qty) || qty <= 0) continue;
    bySku.set(sku, (bySku.get(sku) ?? 0) + qty);
  }
  return [...bySku].map(([sku, qty]) => ({ sku, qty }));
}

/** Thrown inside the transaction so a short line rolls every other line back. */
class ShortStock extends Error {
  constructor(readonly short: Array<{ sku: string; requested: number; available: number }>) {
    super('short');
  }
}

export async function loadLocationIntoToteTx(
  db: Pick<PoolClient, 'query'>,
  orgId: OrgId,
  input: LoadToteInput,
): Promise<Exclude<LoadToteResult, { kind: 'short' }>> {
  const lines = normalizeLoadLines(input.lines);

  const tote = (await db.query<{ id: string | number; code: string; closed_at: string | null; location_id: string | number | null }>(
    `SELECT id, code, closed_at, location_id
       FROM handling_units
      WHERE organization_id = $1 AND id = $2
      FOR UPDATE`,
    [orgId, input.toteId],
  )).rows[0];
  if (!tote || !tote.code?.trim()) return { kind: 'tote_not_found' };
  if (tote.closed_at != null) return { kind: 'tote_closed', code: tote.code };

  const shelf = (await db.query<{ id: string | number; barcode: string; name: string }>(
    `SELECT id, barcode, COALESCE(display_name, name, barcode) AS name
       FROM locations
      WHERE organization_id = $1 AND is_active = true AND UPPER(barcode) = UPPER($2)
      LIMIT 1`,
    [orgId, input.locationCode.trim()],
  )).rows[0];
  if (!shelf) return { kind: 'location_not_found' };

  const place = await ensureToteStockLocation(db, orgId, String(input.toteId));
  if (place.kind === 'not_found') return { kind: 'tote_not_found' };
  if (place.kind === 'taken') return { kind: 'tote_code_taken', code: place.barcode };
  if (place.locationId === Number(shelf.id)) return { kind: 'location_not_found' };
  // A tote's stock place retired by a location cleanup would hide what lands in it.
  await db.query(
    `UPDATE locations SET is_active = true, updated_at = NOW() WHERE organization_id = $1 AND id = $2 AND is_active = false`,
    [orgId, place.locationId],
  );

  let moved: LoadToteLine[] = [];
  let ledger: LoadToteLedgerRow[] = [];
  if (lines.length > 0) {
    // ONE data-modifying statement: the source UPDATE's `qty >= requested`
    // guard is re-checked under each row lock, so a concurrent take can never
    // leave the shelf negative. A line missing from `moved` is short.
    const row = (await db.query<{
      moved: Array<{ sku: string; qty: number }> | null;
      ledger: LoadToteLedgerRow[] | null;
    }>(
      `WITH req AS (
         SELECT r.sku, r.qty FROM unnest($4::text[], $5::int[]) AS r(sku, qty)
       ),
       moved AS (
         UPDATE bin_contents bc
            SET qty = bc.qty - req.qty, updated_at = NOW()
           FROM req
          WHERE bc.organization_id = $1 AND bc.location_id = $2 AND bc.sku = req.sku AND bc.qty >= req.qty
         RETURNING bc.sku, req.qty
       ),
       landed AS (
         INSERT INTO bin_contents (organization_id, location_id, sku, qty)
         SELECT $1::uuid, $3::bigint, m.sku, m.qty FROM moved m
         ON CONFLICT (location_id, sku)
         DO UPDATE SET qty = bin_contents.qty + EXCLUDED.qty, updated_at = NOW()
         RETURNING sku
       ),
       ledger AS (
         INSERT INTO sku_stock_ledger (organization_id, sku, delta, reason, dimension, staff_id, notes)
         SELECT $1::uuid, m.sku, leg.sign * m.qty, leg.reason, 'WAREHOUSE', $6::int, $7::text
           FROM moved m
          CROSS JOIN (VALUES (-1, 'TRANSFER_OUT'), (1, 'TRANSFER_IN')) AS leg(sign, reason)
         RETURNING id, sku, delta, reason
       )
       SELECT (SELECT json_agg(json_build_object('sku', sku, 'qty', qty)) FROM moved) AS moved,
              (SELECT json_agg(json_build_object('id', id, 'sku', sku, 'delta', delta, 'reason', reason)) FROM ledger) AS ledger,
              (SELECT COUNT(*) FROM landed) AS landed`,
      [
        orgId,
        Number(shelf.id),
        place.locationId,
        lines.map((line) => line.sku),
        lines.map((line) => line.qty),
        input.staffId,
        `load into tote ${place.code} from ${shelf.barcode}`,
      ],
    )).rows[0];
    moved = (row?.moved ?? []).map((line) => ({ sku: line.sku, qty: Number(line.qty) }));
    ledger = (row?.ledger ?? []).map((entry) => ({ ...entry, id: Number(entry.id), delta: Number(entry.delta) }));

    if (moved.length !== lines.length) {
      const got = new Set(moved.map((line) => line.sku));
      const missing = lines.filter((line) => !got.has(line.sku));
      const available = await db.query<{ sku: string; qty: number }>(
        `SELECT sku, qty FROM bin_contents
          WHERE organization_id = $1 AND location_id = $2 AND sku = ANY($3::text[])`,
        [orgId, Number(shelf.id), missing.map((line) => line.sku)],
      );
      const on = new Map(available.rows.map((r) => [r.sku, Number(r.qty)]));
      throw new ShortStock(missing.map((line) => ({ sku: line.sku, requested: line.qty, available: on.get(line.sku) ?? 0 })));
    }
  }

  const previousLocationId = tote.location_id == null ? null : Number(tote.location_id);
  const parked = input.park && previousLocationId !== Number(shelf.id);
  if (parked) {
    await db.query(
      `UPDATE handling_units SET location_id = $1 WHERE organization_id = $2 AND id = $3`,
      [Number(shelf.id), orgId, input.toteId],
    );
  }

  return {
    kind: 'ok',
    tote: { id: Number(tote.id), code: place.code, stockLocationId: place.locationId },
    location: { id: Number(shelf.id), code: shelf.barcode, name: shelf.name },
    moved,
    units: moved.reduce((sum, line) => sum + line.qty, 0),
    parked,
    previousLocationId,
    ledger,
  };
}

/** {@link loadLocationIntoToteTx} in its own tenant transaction; a short line rolls the whole load back. */
export async function loadLocationIntoTote(orgId: OrgId, input: LoadToteInput): Promise<LoadToteResult> {
  try {
    return await withTenantTransaction(orgId, (db) => loadLocationIntoToteTx(db, orgId, input));
  } catch (error) {
    if (error instanceof ShortStock) return { kind: 'short', short: error.short };
    throw error;
  }
}
