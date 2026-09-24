/**
 * Warehouse-wide stock-by-location read — the feed behind Inventory › Stock.
 *
 * ## Both pairings, because the warehouse has two
 *
 * - **`bin_contents`** — LOOSE stock counted into a bin (the scan gun, the
 *   counts, `/api/locations/[barcode]` put/take). Carries a count stamp.
 * - **`serial_units.current_location`** — SERIALIZED units standing at a
 *   location. The qty is a COUNT of units.
 *
 * They stay SEPARATE rows keyed by `source` (see `location-stock-row.ts`).
 * `current_location` is FREE TEXT, so it is resolved against `locations` by the
 * three handles an operator could have written (barcode, name, nickname); an
 * unresolved one keeps its written handle as its face and a `NULL` id — hiding
 * it would hide real stock. Bin pairs at `qty = 0` and `SHIPPED` units are
 * excluded: a Stock list is a list of what is on a shelf.
 *
 * ## The find box is answered HERE
 *
 * `query` is applied in SQL, above the {@link LOCATION_STOCK_ROW_CAP} window,
 * over the facts a record paints: title, SKU, location (all four handles),
 * room, qty — plus a punctuation-blind leg, because the desk paints a
 * structured bin code segmented (`C0409200` → `C-04-09-2-00`) and that dashed
 * form is what an operator reads back into the box. `COUNT(*) OVER ()` rides
 * the same scan AFTER that predicate, so "shown of total" counts the matched set.
 *
 * ## Photos
 *
 * A real SKU's photo is Zoho first, catalog second (`productImageUrl`). A
 * floor-minted placeholder (`sku_stock.is_provisional`, `TMP-…`) has neither;
 * its photo is the first `SKU_STOCK` photo the phone linked to its `sku_stock`
 * row — the same cover the SKU Exceptions desk paints.
 *
 * Tenancy: `orgId` is REQUIRED. `sku`, `barcode` and `room` are tenant-scoped
 * string keys that collide across orgs, and RLS does not bite on the owner
 * pool, so the read goes through `tenantQuery` with an explicit predicate on
 * every table.
 */

import { tenantQuery } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import { productImageUrl } from '../photos/product-image-url';
import { photoContentUrl } from '../photos/display-url';
import type { LocationStockTableRow } from '../inventory/location-stock-row';
import { escapeLike } from '../sql-like';

/**
 * Hard ceiling on one page of pairs. The room funnel filters rows the loader
 * already holds; the find box does NOT rely on the window — it is answered in
 * SQL, above the cap.
 */
export const LOCATION_STOCK_ROW_CAP = 5000;

/** The unit status that means "gone": its last placement is history, not stock. */
const DEPARTED_UNIT_STATUS = 'SHIPPED';

interface StockByLocationDbRow {
  location_id: number | null;
  location_name: string | null;
  location_barcode: string | null;
  room: string | null;
  sku: string;
  product_title: string | null;
  is_provisional: boolean | null;
  cover_photo_id: number | string | null;
  catalog_image_url: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  source: 'bin' | 'unit';
  qty: number;
  last_moved: Date | string | null;
  last_counted: Date | string | null;
  total_count: number;
}

export interface StockByLocationPage {
  rows: LocationStockTableRow[];
  /** Pairs with stock MATCHING `query` across the whole org, before the cap. */
  totalCount: number;
}

/** pg hands back `Date`; the wire carries an ISO string. */
function isoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/**
 * Every (location, sku, source) pairing holding stock, in warehouse walking
 * order: location sort → room → row → column → biggest qty first.
 */
export async function getStockByLocation(args: {
  orgId: OrgId;
  limit?: number;
  /** The desk's find box, verbatim. Whitespace-only is NO query. */
  query?: string | null;
}): Promise<StockByLocationPage> {
  const limit = Math.max(1, Math.min(args.limit ?? LOCATION_STOCK_ROW_CAP, LOCATION_STOCK_ROW_CAP));

  const needle = (args.query ?? '').trim();
  const like = needle ? `%${escapeLike(needle)}%` : null;
  // The punctuation-blind twin. A needle that is ONLY punctuation flattens to
  // '' and `%%` would match every row, so that leg goes NULL instead.
  const flattened = needle.replace(/[^A-Za-z0-9]/g, '');
  const flatLike = needle && flattened ? `%${flattened}%` : null;

  const sql = `
    WITH bin_pairs AS (
      SELECT
        bc.location_id                         AS location_id,
        NULL::text                             AS written_location,
        bc.sku                                 AS sku,
        'bin'::text                            AS source,
        bc.qty::int                            AS qty,
        bc.updated_at                          AS last_moved,
        bc.last_counted                        AS last_counted
      FROM bin_contents bc
      WHERE bc.organization_id = $1
        AND bc.qty <> 0
    ),
    unit_pairs AS (
      SELECT
        l.id                                   AS location_id,
        CASE WHEN l.id IS NULL THEN su.current_location ELSE NULL END AS written_location,
        su.sku                                 AS sku,
        'unit'::text                           AS source,
        COUNT(*)::int                          AS qty,
        MAX(su.updated_at)                     AS last_moved,
        NULL::timestamptz                      AS last_counted
      FROM serial_units su
      LEFT JOIN locations l
             ON l.organization_id = su.organization_id
            AND l.is_active = true
            AND (
              l.barcode = su.current_location
              OR l.name = su.current_location
              OR l.display_name = su.current_location
            )
      WHERE su.organization_id = $1
        AND NULLIF(TRIM(su.current_location), '') IS NOT NULL
        -- current_status is an enum: compare as text so the parameter is not
        -- coerced to the enum.
        AND COALESCE(su.current_status::text, '') <> $3
        AND NULLIF(TRIM(su.sku), '') IS NOT NULL
      GROUP BY l.id, CASE WHEN l.id IS NULL THEN su.current_location ELSE NULL END, su.sku
    ),
    pairs AS (
      SELECT * FROM bin_pairs
      UNION ALL
      SELECT * FROM unit_pairs
    ),
    joined AS (
      SELECT
        p.location_id,
        COALESCE(l.name, p.written_location)   AS location_name,
        l.barcode                              AS location_barcode,
        l.room,
        l.row_label,
        l.col_label,
        p.sku,
        COALESCE(
          NULLIF(ss.display_name_override, ''),
          NULLIF(ss.product_title, ''),
          NULLIF(sc.product_title, '')
        )                                      AS product_title,
        COALESCE(ss.is_provisional, false)     AS is_provisional,
        ph.cover_photo_id,
        NULLIF(sc.image_url, '')               AS catalog_image_url,
        zi.zoho_item_id                        AS zoho_item_id,
        zi.image_document_id                   AS zoho_image_document_id,
        p.source,
        p.qty,
        p.last_moved,
        p.last_counted,
        l.sort_order                           AS location_sort_order
      FROM pairs p
      LEFT JOIN locations l
        ON l.id = p.location_id
       AND l.organization_id = $1
      LEFT JOIN sku_stock ss
        ON ss.sku = p.sku
       AND ss.organization_id = $1
      LEFT JOIN sku_catalog sc
        ON sc.sku = p.sku
       AND sc.organization_id = $1
      LEFT JOIN items zi
        ON zi.sku = p.sku
       AND zi.organization_id = $1
      -- A placeholder's cover: the first SKU_STOCK photo on its sku_stock row.
      LEFT JOIN LATERAL (
        SELECT MIN(pel.photo_id) AS cover_photo_id
          FROM photo_entity_links pel
         WHERE ss.is_provisional = true
           AND pel.organization_id = $1
           AND pel.entity_type = 'SKU_STOCK'
           AND pel.entity_id = ss.id
           AND pel.link_role = 'primary'
      ) ph ON true
      -- A soft-deleted bin keeps its bin_contents rows; those are not shelf
      -- stock. An UNRESOLVED unit placement has no locations row at all and
      -- must survive, which is the NULL leg.
      WHERE (p.location_id IS NULL OR l.id IS NOT NULL)
    )
    SELECT
      j.location_id,
      j.location_name,
      j.location_barcode,
      j.room,
      j.sku,
      j.product_title,
      j.is_provisional,
      j.cover_photo_id,
      j.catalog_image_url,
      j.zoho_item_id,
      j.zoho_image_document_id,
      j.source,
      j.qty,
      j.last_moved,
      j.last_counted,
      COUNT(*) OVER ()::int                    AS total_count
    FROM joined j
    WHERE ($4::text IS NULL OR (
            COALESCE(j.product_title, '')      ILIKE $4
         OR j.sku                              ILIKE $4
         OR COALESCE(j.location_name, '')      ILIKE $4
         OR COALESCE(j.location_barcode, '')   ILIKE $4
         OR COALESCE(j.room, '')               ILIKE $4
         OR COALESCE(j.row_label, '')          ILIKE $4
         OR COALESCE(j.col_label, '')          ILIKE $4
         OR j.qty::text                        ILIKE $4
         OR ($5::text IS NOT NULL AND (
               regexp_replace(COALESCE(j.location_barcode, ''), '[^A-Za-z0-9]', '', 'g') ILIKE $5
            OR regexp_replace(COALESCE(j.location_name, ''), '[^A-Za-z0-9]', '', 'g')    ILIKE $5
            OR regexp_replace(j.sku, '[^A-Za-z0-9]', '', 'g')                            ILIKE $5
         ))
       ))
    ORDER BY
      j.location_sort_order ASC NULLS LAST,
      j.room NULLS LAST,
      j.row_label NULLS LAST,
      j.col_label NULLS LAST,
      j.qty DESC,
      j.sku ASC,
      j.source ASC
    LIMIT $2
  `;

  const result = await tenantQuery<StockByLocationDbRow>(args.orgId, sql, [
    args.orgId,
    limit,
    DEPARTED_UNIT_STATUS,
    like,
    flatLike,
  ]);

  return {
    rows: result.rows.map((row) => ({
      location_id: row.location_id == null ? null : Number(row.location_id),
      location_name: row.location_name,
      location_barcode: row.location_barcode,
      room: row.room,
      sku: row.sku,
      product_title: row.product_title,
      is_provisional: Boolean(row.is_provisional),
      image_url:
        row.cover_photo_id != null
          ? photoContentUrl(Number(row.cover_photo_id), 'thumb')
          : productImageUrl({
              zohoItemId: row.zoho_item_id,
              zohoImageDocumentId: row.zoho_image_document_id,
              catalogImageUrl: row.catalog_image_url,
            }),
      source: row.source,
      qty: Number(row.qty) || 0,
      last_moved: isoOrNull(row.last_moved),
      last_counted: isoOrNull(row.last_counted),
    })),
    totalCount: result.rows[0]?.total_count ?? 0,
  };
}
