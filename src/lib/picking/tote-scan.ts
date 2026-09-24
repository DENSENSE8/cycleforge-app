/**
 * Tote (handling unit) scans on the pick → pack loop.
 *
 * Pick side: confirm-pick binds each picked unit into the tote the picker
 * armed and stamps `handling_units.paired_order_id` (sessions.ts
 * `readToteForOrder` / `bindToteForPick`). One tote carries one order.
 *
 * Pack side: scanning that tote at the pack station resolves to its paired
 * order ({@link resolveToteScan}) and the pack routes then proceed exactly as
 * if the order's tracking label had been scanned. Pack completion releases
 * the tote ({@link releasePackedTotes}) so it can carry the next order.
 */

import { routeScan } from '@/lib/barcode-routing';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { Queryable } from '@/lib/neon/serial-units-queries';

/** A decoded tote reference: the house plate id, or an external tote barcode. */
export type ToteRef = { id: number } | { code: string };

const HU_REDIRECT_RE = /^\/m\/h\/(\d+)$/;

/**
 * Decode a scan into a tote reference. House plates arrive as bare `H-12`,
 * as the QR redirect path `/m/h/12`, or as the absolute QR URL — all decode
 * to `{ id: 12 }`. Anything else is only a candidate external barcode
 * (`handling_units.code`); the bytes alone cannot say whether it is a tote,
 * so the lookup decides. `null` only for an empty scan.
 */
export function parseToteScan(raw: string): ToteRef | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  const route = routeScan(value);
  if (route?.type === 'handling-unit') {
    const m = HU_REDIRECT_RE.exec(route.redirect ?? '');
    const id = m ? Number(m[1]) : NaN;
    if (Number.isSafeInteger(id) && id > 0) return { id };
  }
  return { code: value };
}

export interface ToteBindState {
  code: string;
  status: string;
  pairedOrderId: number | null;
}

/**
 * The bind rule — may this tote take a unit picked for `orderId`? `null` =
 * yes. Only an OPEN or STAGED tote takes picks (IN_TEST belongs to the
 * testing side, CLOSED is done), and one tote carries one order: a tote
 * already paired to a different order refuses instead of silently merging
 * two orders' units into one box.
 */
export function toteBindRefusal(
  tote: ToteBindState,
  orderId: number,
): { status: 409; error: string } | null {
  if (tote.status !== 'OPEN' && tote.status !== 'STAGED') {
    return { status: 409, error: `tote ${tote.code} is ${tote.status} — use an open tote` };
  }
  if (tote.pairedOrderId != null && tote.pairedOrderId !== orderId) {
    return { status: 409, error: `tote ${tote.code} already carries another order — use a fresh tote` };
  }
  return null;
}

export interface ResolvedToteScan {
  toteId: number;
  code: string;
  /** `orders.id` the tote carries; null = an unpaired (empty) tote. */
  orderId: number | null;
  /** The paired order's carrier tracking, null until its label is bought. */
  tracking: string | null;
}

/**
 * Resolve a pack-station scan to a tote and the order it carries. `null` when
 * the scan names no tote in this org — the caller treats it as an ordinary
 * tracking / SKU scan.
 */
export async function resolveToteScan(
  orgId: OrgId,
  raw: string,
  client?: Queryable,
): Promise<ResolvedToteScan | null> {
  const ref = parseToteScan(raw);
  if (!ref) return null;
  const text = `SELECT hu.id, hu.code, hu.paired_order_id, stn.tracking_number_raw
       FROM handling_units hu
  LEFT JOIN orders o
         ON o.id = hu.paired_order_id
        AND o.organization_id = hu.organization_id
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      WHERE hu.organization_id = $1
        AND ${'id' in ref ? 'hu.id = $2' : 'hu.code = $2'}
      LIMIT 1`;
  const params = [orgId, 'id' in ref ? ref.id : ref.code];
  type Row = {
    id: number;
    code: string;
    paired_order_id: number | null;
    tracking_number_raw: string | null;
  };
  const res = client
    ? await client.query<Row>(text, params)
    : await tenantQuery<Row>(orgId, text, params);
  const row = res.rows[0];
  if (!row) return null;
  return {
    toteId: Number(row.id),
    code: row.code,
    orderId: row.paired_order_id == null ? null : Number(row.paired_order_id),
    tracking: row.tracking_number_raw?.trim() || null,
  };
}

/**
 * Why a resolved tote cannot be packed from, or `null` when it can: the tote
 * must carry an order, and that order must have a label (the pack routes key
 * the pack on its tracking).
 */
export function toteScanRefusal(tote: ResolvedToteScan): string | null {
  if (tote.orderId == null) return `tote ${tote.code} is not carrying an order`;
  if (!tote.tracking) return `tote ${tote.code}'s order has no shipping label yet — buy the label first`;
  return null;
}

/**
 * Pack completion closes the loop: every tote paired to the packed order (by
 * `orders.id`, or every order on the packed shipment) is unpaired and back to
 * OPEN, and the order's units leave it — they are in the shipping box now.
 * Idempotent; returns the released tote codes.
 */
export async function releasePackedTotes(
  orgId: OrgId,
  packed: { orderId?: number | null; shipmentId?: number | null },
  client?: Queryable,
): Promise<string[]> {
  const orderId = packed.orderId ?? null;
  const shipmentId = packed.shipmentId ?? null;
  if (orderId == null && shipmentId == null) return [];
  const text = `WITH target AS (
         SELECT hu.id, hu.paired_order_id AS order_id
           FROM handling_units hu
           JOIN orders o
             ON o.id = hu.paired_order_id
            AND o.organization_id = hu.organization_id
          WHERE hu.organization_id = $1
            AND (o.id = $2::bigint OR o.shipment_id = $3::bigint)
            FOR UPDATE OF hu
       ), emptied AS (
         UPDATE serial_units su
            SET handling_unit_id = NULL, updated_at = NOW()
           FROM target t, order_unit_allocations oua
          WHERE su.handling_unit_id = t.id
            AND su.organization_id = $1
            AND oua.serial_unit_id = su.id
            AND oua.order_id = t.order_id
            AND oua.organization_id = $1
         RETURNING su.id
       ), released AS (
         UPDATE handling_units hu
            SET paired_order_id = NULL,
                paired_at = NULL,
                paired_by_staff_id = NULL,
                status = CASE WHEN hu.status IN ('OPEN', 'STAGED') THEN 'OPEN' ELSE hu.status END
           FROM target t
          WHERE hu.id = t.id
         RETURNING hu.code
       )
       SELECT code FROM released ORDER BY code`;
  const params = [orgId, orderId, shipmentId];
  const res = client
    ? await client.query<{ code: string }>(text, params)
    : await tenantQuery<{ code: string }>(orgId, text, params);
  return res.rows.map((r) => r.code);
}
