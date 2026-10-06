/**
 * The Purchases enumeration — ONE statement over our tables that lists every
 * inbound purchase of the org with what its identity and its window need.
 *
 * A purchase is a NUMBER the pasted list resolves (`/search/list`, the
 * inbound locator):
 * - a Zoho PO: `zoho_po_mirror` ∪ the `inbound_order` Zoho headers ∪ the POs
 *   `receiving_line_zoho` names (a PO the mirror has not synced yet), not
 *   cancelled. Number = the PO# (`zoho_purchaseorder_number`).
 * - an eBay / Amazon / manual order: an `inbound_order` header with
 *   `receiving_type = 'PO'` (returns, pickups and repairs are not purchases),
 *   not cancelled. Number = its order id (`external_order_id`).
 * Twins of one physical purchase are folded in `foldPurchases` (the eBay ↔
 * Zoho rule needs `matchZohoPo`), so the window and the Find text are flags,
 * not a cut: the read returns the rows they keep, plus every row a fold may
 * need — each non-Zoho order and each PO one may fold into (a key superset of
 * `matchZohoPo`'s, so the rule itself still decides). Only those rows carry
 * the twin signals (id, Reference#, trackings, equivalences); the rest stay
 * narrow, because the wire is the cost of an all-time read.
 *
 * Window, per axis: `ordered` = the PO / order date (else the PT day its first
 * line, else its header, landed); `delivered` = the latest carrier delivery
 * of its shipments (line or carton); `unboxed` = the latest unbox of its
 * cartons. Bounds arrive as PT civil days (`ordered`) and their UTC instants
 * (`delivered` / `unboxed`, upper bound exclusive) — computed once in
 * `purchasesWindow`. Every predicate names the org: the owner role bypasses
 * RLS, so the predicate is the scope.
 */

import type { InboundSourceType } from '@/lib/inbound/source-registry';
import type { PurchasesAxis } from '@/lib/receiving/purchases-params';
import type { OrgId } from '@/lib/tenancy/constants';

/** The window on one axis: civil days for `ordered`, instants for the stamped axes; null = unbounded. */
export interface PurchasesWindow {
  axis: PurchasesAxis;
  fromDay: string | null;
  toDay: string | null;
  /** Start of `fromDay` in PT, as UTC ISO. */
  fromAt: string | null;
  /** Start of the day AFTER `toDay` in PT, as UTC ISO (exclusive). */
  toBefore: string | null;
}

/** One purchase-number row, before twins fold. */
export interface PurchaseRow {
  source: InboundSourceType;
  /** The number a paste resolves: PO# / order id. */
  ref: string;
  vendor: string | null;
  /** YYYY-MM-DD. */
  orderedOn: string | null;
  inWindow: boolean;
  matchesFind: boolean;
  // Twin signals: set on the rows a fold may read (module doc), null / empty on the rest.
  /** Zoho PO id, or the order's `external_order_id`. With `source`, the `inbound_purchase_order_equivalence` key. */
  purchaseId: string | null;
  /** Zoho Reference# — the inbound tracking in this org. */
  referenceNumber: string | null;
  /** Canonical tracking numbers of its shipments. */
  trackings: string[];
  /** `<source>:<purchaseId>` of the orders recorded as the same purchase. */
  equivalents: string[];
}

/** `%text%` for ILIKE, the operator's text taken literally. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function buildPurchasesSql(
  orgId: OrgId,
  window: PurchasesWindow,
  find: { text: string; key: string } | null,
): { sql: string; params: unknown[] } {
  const sql = `
WITH zoho_ids AS (
  SELECT m.zoho_purchaseorder_id AS po_id FROM zoho_po_mirror m WHERE m.organization_id = $1
  UNION
  SELECT io.external_order_id FROM inbound_order io
   WHERE io.organization_id = $1 AND io.source_type = 'zoho' AND io.receiving_type = 'PO'
  UNION
  SELECT z.zoho_purchaseorder_id FROM receiving_line_zoho z
   WHERE z.organization_id = $1 AND z.zoho_purchaseorder_id IS NOT NULL
),
purchase AS (
  SELECT 'zoho'::text AS source,
         z.po_id AS purchase_id,
         COALESCE(NULLIF(btrim(m.zoho_purchaseorder_number), ''), NULLIF(btrim(io.order_number), ''),
                  (SELECT btrim(z2.zoho_purchaseorder_number) FROM receiving_line_zoho z2
                    WHERE z2.organization_id = $1 AND z2.zoho_purchaseorder_id = z.po_id
                      AND NULLIF(btrim(z2.zoho_purchaseorder_number), '') IS NOT NULL
                    LIMIT 1)) AS ref,
         COALESCE(NULLIF(btrim(m.vendor_name), ''), NULLIF(btrim(io.vendor_name), '')) AS vendor,
         COALESCE(m.po_date, io.order_date) AS ordered_on,
         NULLIF(btrim(m.reference_number), '') AS reference_number,
         io.created_at AS header_at,
         NULL::bigint AS inbound_order_id
    FROM zoho_ids z
    LEFT JOIN zoho_po_mirror m ON m.organization_id = $1 AND m.zoho_purchaseorder_id = z.po_id
    LEFT JOIN inbound_order io ON io.organization_id = $1 AND io.source_type = 'zoho' AND io.external_order_id = z.po_id
   WHERE COALESCE(m.status, '') <> 'cancelled' AND COALESCE(io.status, '') <> 'cancelled'
  UNION ALL
  SELECT io.source_type, io.external_order_id, btrim(io.external_order_id),
         NULLIF(btrim(io.vendor_name), ''), io.order_date, NULL, io.created_at, io.id
    FROM inbound_order io
   WHERE io.organization_id = $1 AND io.source_type <> 'zoho' AND io.receiving_type = 'PO' AND io.status <> 'cancelled'
),
pline AS (
  SELECT p.source, p.purchase_id, rl.receiving_id, rl.shipment_id, rl.item_name, rl.sku, rl.platform_account_id, rl.created_at
    FROM purchase p
    JOIN receiving_line_zoho z ON z.organization_id = $1 AND z.zoho_purchaseorder_id = p.purchase_id
    JOIN receiving_line rl ON rl.organization_id = $1 AND rl.id = z.receiving_line_id
   WHERE p.source = 'zoho'
  UNION ALL
  SELECT p.source, p.purchase_id, rl.receiving_id, rl.shipment_id, rl.item_name, rl.sku, rl.platform_account_id, rl.created_at
    FROM purchase p
    JOIN receiving_line rl ON rl.organization_id = $1 AND rl.inbound_order_id = p.inbound_order_id
   WHERE p.source <> 'zoho'
),
pcarton AS (
  SELECT source, purchase_id, receiving_id FROM pline WHERE receiving_id IS NOT NULL
  UNION
  SELECT p.source, p.purchase_id, r.id FROM purchase p
    JOIN receiving_carton r ON r.organization_id = $1 AND r.zoho_purchaseorder_id = p.purchase_id
   WHERE p.source = 'zoho'
  UNION
  SELECT p.source, p.purchase_id, r.id FROM purchase p
    JOIN receiving_carton r ON r.organization_id = $1 AND r.source_order_id = p.ref
     AND r.source IN ('ebay', 'amazon', 'manual')
   WHERE p.source <> 'zoho'
),
pship AS (
  SELECT source, purchase_id, shipment_id FROM pline WHERE shipment_id IS NOT NULL
  UNION
  SELECT c.source, c.purchase_id, r.shipment_id FROM pcarton c
    JOIN receiving_carton r ON r.organization_id = $1 AND r.id = c.receiving_id
   WHERE r.shipment_id IS NOT NULL
),
ship_agg AS (
  SELECT s.source, s.purchase_id,
         MAX(stn.delivered_at) FILTER (WHERE stn.is_delivered) AS delivered_at,
         array_agg(DISTINCT stn.tracking_number_normalized)
           FILTER (WHERE COALESCE(stn.tracking_number_normalized, '') <> '') AS trackings,
         COALESCE(bool_or(stn.tracking_number_normalized LIKE '%' || $8::text || '%'), false) AS tracking_hit
    FROM pship s
    JOIN shipping_tracking_numbers stn ON stn.id = s.shipment_id
   GROUP BY 1, 2
),
unbox_agg AS (
  SELECT c.source, c.purchase_id, MAX(ru.unboxed_at) AS unboxed_at
    FROM pcarton c
    JOIN receiving_unbox ru ON ru.organization_id = $1 AND ru.receiving_id = c.receiving_id
   GROUP BY 1, 2
),
line_agg AS (
  SELECT l.source, l.purchase_id, MIN(l.created_at) AS first_line_at,
         COALESCE(bool_or(l.item_name ILIKE $7::text OR l.sku ILIKE $7::text
                          OR COALESCE(pa.label, pa.integration_scope) ILIKE $7::text), false) AS text_hit
    FROM pline l
    LEFT JOIN platform_accounts pa ON pa.organization_id = $1 AND pa.id = l.platform_account_id
   GROUP BY 1, 2
),
equivalent AS (
  SELECT e.source_type_a AS source, e.source_order_id_a AS purchase_id, e.source_type_b || ':' || e.source_order_id_b AS other
    FROM inbound_purchase_order_equivalence e WHERE e.organization_id = $1
  UNION
  SELECT e.source_type_b, e.source_order_id_b, e.source_type_a || ':' || e.source_order_id_a
    FROM inbound_purchase_order_equivalence e WHERE e.organization_id = $1
),
equivalent_agg AS (
  SELECT source, purchase_id, array_agg(other) AS equivalents FROM equivalent GROUP BY 1, 2
),
dated AS (
  SELECT p.source, p.purchase_id, p.ref, p.vendor, p.reference_number,
         COALESCE(s.trackings, '{}') AS trackings,
         COALESCE(e.equivalents, '{}') AS equivalents,
         COALESCE(p.ordered_on, (COALESCE(l.first_line_at, p.header_at) AT TIME ZONE 'America/Los_Angeles')::date) AS ordered_on,
         s.delivered_at, u.unboxed_at,
         COALESCE(s.tracking_hit, false) OR COALESCE(l.text_hit, false) AS line_hit
    FROM purchase p
    LEFT JOIN ship_agg s USING (source, purchase_id)
    LEFT JOIN unbox_agg u USING (source, purchase_id)
    LEFT JOIN line_agg l USING (source, purchase_id)
    LEFT JOIN equivalent_agg e USING (source, purchase_id)
   WHERE p.ref IS NOT NULL
),
flagged AS (
  SELECT d.*,
         CASE $2::text
           WHEN 'delivered' THEN COALESCE(d.delivered_at >= $5::timestamptz, $5::timestamptz IS NULL)
                             AND COALESCE(d.delivered_at < $6::timestamptz, $6::timestamptz IS NULL)
           WHEN 'unboxed' THEN COALESCE(d.unboxed_at >= $5::timestamptz, $5::timestamptz IS NULL)
                           AND COALESCE(d.unboxed_at < $6::timestamptz, $6::timestamptz IS NULL)
           ELSE COALESCE(d.ordered_on >= $3::date, $3::date IS NULL)
            AND COALESCE(d.ordered_on <= $4::date, $4::date IS NULL)
         END AS in_window,
         ($7::text IS NULL
           OR d.ref ILIKE $7::text
           OR d.vendor ILIKE $7::text
           OR d.line_hit
           OR ($8::text <> '' AND (upper(regexp_replace(d.ref, '[^A-Za-z0-9]', '', 'g')) LIKE '%' || $8::text || '%'
                                   OR upper(regexp_replace(COALESCE(d.reference_number, ''), '[^A-Za-z0-9]', '', 'g'))
                                        LIKE '%' || $8::text || '%'))) AS matches_find,
         upper(regexp_replace(d.ref, '[^A-Za-z0-9]', '', 'g')) AS ref_key,
         upper(regexp_replace(COALESCE(d.reference_number, ''), '[^A-Za-z0-9]', '', 'g')) AS reference_key,
         -- normalizeTrackingLast8: the last 8 digits, else the string itself.
         ARRAY(SELECT CASE WHEN length(regexp_replace(t, '[^0-9]', '', 'g')) >= 8
                           THEN right(regexp_replace(t, '[^0-9]', '', 'g'), 8) ELSE t END
                 FROM unnest(d.trackings || ARRAY_REMOVE(ARRAY[d.reference_number], NULL)) t) AS last8s
    FROM dated d
),
-- Every key a non-Zoho order may pair with a Zoho PO by (its number, its trackings' last 8).
order_key AS (
  SELECT f.ref_key AS k FROM flagged f WHERE f.source <> 'zoho'
  UNION
  SELECT unnest(f.last8s) FROM flagged f WHERE f.source <> 'zoho'
),
-- The rows the fold reads twin signals off: every order, and every PO an order
-- may fold into (a superset — \`matchZohoPo\` decides in foldPurchases).
signaled AS (
  SELECT f.*,
         f.source <> 'zoho'
           OR cardinality(f.equivalents) > 0
           OR f.ref_key IN (SELECT k FROM order_key)
           OR f.reference_key IN (SELECT k FROM order_key)
           OR f.last8s && ARRAY(SELECT k FROM order_key) AS twin_signals
    FROM flagged f
)
SELECT s.source, s.ref, s.vendor, s.ordered_on::text AS ordered_on, s.in_window, s.matches_find,
       CASE WHEN s.twin_signals THEN s.purchase_id END AS purchase_id,
       CASE WHEN s.twin_signals THEN s.reference_number END AS reference_number,
       CASE WHEN s.twin_signals THEN s.trackings END AS trackings,
       CASE WHEN s.twin_signals THEN s.equivalents END AS equivalents
  FROM signaled s
 WHERE (s.in_window AND s.matches_find) OR s.twin_signals
 ORDER BY s.ordered_on DESC NULLS LAST, s.ref, s.source, s.purchase_id`;
  return {
    sql,
    params: [
      orgId,
      window.axis,
      window.fromDay,
      window.toDay,
      window.fromAt,
      window.toBefore,
      find ? containsPattern(find.text) : null,
      // An empty key would match every tracking (`LIKE '%%'`).
      find?.key || null,
    ],
  };
}

/** A statement row → {@link PurchaseRow}. */
export function purchaseRowOf(row: Record<string, unknown>): PurchaseRow {
  const text = (value: unknown) => (value == null ? null : String(value));
  return {
    source: String(row.source) as InboundSourceType,
    purchaseId: text(row.purchase_id),
    ref: String(row.ref),
    vendor: text(row.vendor),
    referenceNumber: text(row.reference_number),
    trackings: Array.isArray(row.trackings) ? row.trackings.map(String) : [],
    equivalents: Array.isArray(row.equivalents) ? row.equivalents.map(String) : [],
    orderedOn: text(row.ordered_on),
    inWindow: row.in_window === true,
    matchesFind: row.matches_find === true,
  };
}
