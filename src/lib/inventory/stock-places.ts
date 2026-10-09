/**
 * Stock places — where a SKU can be put, counted and paired (home): every
 * barcoded `locations` row (shelf bins, desks …) AND every open house tote
 * (`handling_units`, `H-{id}` plates).
 *
 * Stock lives in `bin_contents`, keyed by a `locations` row, so a tote holds
 * a SKU through a `locations` row of its own: `barcode = name = the tote's
 * code` (what its plate scans as), `location_kind = 'OTHER'` — the kind's
 * CHECK allows no TOTE value, and the tote is identified by its code, never
 * the kind. That row is created on first use ({@link ensureToteStockLocation});
 * from then on every stock verb — put / take / count
 * (`PATCH /api/locations/[barcode]`), Pair tote
 * (`POST /api/update-sku-location`) — works on the tote unchanged, and a SKU
 * sits in many totes and bins at once (one `bin_contents` row each).
 *
 * `handling_units.location_id` is untouched: that is where the TOTE sits, not
 * the tote as a place stock sits in.
 */

import type { PoolClient } from 'pg';

/** `locations_location_kind_check` allows ROOM/DESK/RACK/SHELF/POSITION/BIN/STAGING/OTHER. */
export const TOTE_LOCATION_KIND = 'OTHER';

export interface StockTote {
  id: number;
  code: string;
  status: string | null;
  /** The tote's stock location barcode once it has one (it has held stock). */
  locationBarcode: string | null;
  /** The warehouse address where the physical tote is currently parked. */
  physicalLocationId: number | null;
  physicalLocationName: string | null;
  /** The parked address's barcode — what a SKU pairs to when it is paired by tote. */
  physicalLocationBarcode: string | null;
}

type Db = Pick<PoolClient, 'query'>;

/** Every open tote of the org, with its stock location when it has one. */
export async function listStockTotes(db: Db, orgId: string): Promise<StockTote[]> {
  const res = await db.query<{
    id: string | number;
    code: string;
    status: string | null;
    barcode: string | null;
    physical_location_id: string | number | null;
    physical_location_name: string | null;
    physical_location_barcode: string | null;
  }>(
    `SELECT hu.id, hu.code, hu.status, stock_place.barcode,
            parked.id AS physical_location_id,
            COALESCE(parked.display_name, parked.name, parked.barcode) AS physical_location_name,
            parked.barcode AS physical_location_barcode
       FROM handling_units hu
       LEFT JOIN locations stock_place
         ON stock_place.organization_id = hu.organization_id
        AND stock_place.barcode = hu.code
       LEFT JOIN locations parked
         ON parked.organization_id = hu.organization_id
        AND parked.id = hu.location_id
      WHERE hu.organization_id = $1
        AND hu.closed_at IS NULL
        AND NULLIF(TRIM(hu.code), '') IS NOT NULL
      ORDER BY hu.id`,
    [orgId],
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    status: row.status,
    locationBarcode: row.barcode,
    physicalLocationId: row.physical_location_id == null ? null : Number(row.physical_location_id),
    physicalLocationName: row.physical_location_name,
    physicalLocationBarcode: row.physical_location_barcode,
  }));
}

/** `H-12`, `h12`, `12` or an external tote code → the tote reference the lookup takes. */
export function parseToteRef(raw: string): { id: number } | { code: string } | null {
  const value = raw.trim();
  if (!value) return null;
  const house = /^H-?(\d+)$/i.exec(value);
  if (house) return { id: Number(house[1]) };
  if (/^\d+$/.test(value)) return { id: Number(value) };
  return { code: value };
}

export type EnsureToteStockLocationResult =
  | { kind: 'ok'; created: boolean; locationId: number; barcode: string; toteId: number; code: string }
  | { kind: 'not_found' }
  | { kind: 'taken'; barcode: string };

/**
 * The tote's stock location, created on first use. Idempotent: a second call
 * returns the same row. `taken` = another location (another org — the
 * barcode/name indexes are global) already owns the tote's code.
 */
export async function ensureToteStockLocation(db: Db, orgId: string, toteRef: string): Promise<EnsureToteStockLocationResult> {
  const ref = parseToteRef(toteRef);
  if (!ref) return { kind: 'not_found' };
  const tote = await db.query<{ id: string | number; code: string }>(
    'id' in ref
      ? `SELECT id, code FROM handling_units WHERE organization_id = $1 AND id = $2 LIMIT 1`
      : `SELECT id, code FROM handling_units WHERE organization_id = $1 AND UPPER(code) = UPPER($2) LIMIT 1`,
    [orgId, 'id' in ref ? ref.id : ref.code],
  );
  const row = tote.rows[0];
  if (!row || !row.code?.trim()) return { kind: 'not_found' };
  const code = row.code.trim();
  const toteId = Number(row.id);

  const existing = await db.query<{ id: string | number; organization_id: string; location_kind: string }>(
    `SELECT id, organization_id, location_kind FROM locations WHERE barcode = $1 OR name = $1 LIMIT 1`,
    [code],
  );
  const found = existing.rows[0];
  if (found) {
    if (found.organization_id !== orgId) return { kind: 'taken', barcode: code };
    return { kind: 'ok', created: false, locationId: Number(found.id), barcode: code, toteId, code };
  }

  const inserted = await db.query<{ id: string | number }>(
    `INSERT INTO locations (name, barcode, display_name, location_kind, organization_id)
     VALUES ($1, $1, $1, $2, $3)
     RETURNING id`,
    [code, TOTE_LOCATION_KIND, orgId],
  );
  return { kind: 'ok', created: true, locationId: Number(inserted.rows[0]!.id), barcode: code, toteId, code };
}
