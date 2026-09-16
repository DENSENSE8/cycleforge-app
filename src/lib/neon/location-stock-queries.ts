/**
 * Warehouse-wide stock-by-location read — the feed behind Inventory › Stock.
 *
 * ## Why this is not a `location-queries.ts` export
 *
 * That module is the LOCATION registry: create / rename / print / soft-delete a
 * bin, plus the two aggregate reads the map and the bins overview want. This
 * reads the junction from the other direction AND unions a second pairing, and
 * that file is already the longest in `src/lib/neon`. A leaf module beside it
 * keeps both under the maintainability ceiling and keeps the desk's import
 * surface one function wide.
 *
 * ## Both pairings, because the warehouse has two
 *
 * A SKU is paired to a location in two places, and reading only the first
 * showed four rows on a floor holding dozens (operator 2026-09-15: *"reach into
 * the data layer more, there are a lot more SKU that are paired to a location
 * id"*):
 *
 * - **`bin_contents`** — LOOSE stock counted into a bin. Written by the scan
 *   gun and the counts (`/api/locations/[barcode]` put/take, `/api/transfers`,
 *   `adjustBinQty`). Carries min/max bounds and a count stamp.
 * - **`serial_units.current_location`** — SERIALIZED units standing at a
 *   location, written by the floor routing that places a unit after unbox and
 *   test. The qty is a COUNT of units; there are no bounds and no count stamp,
 *   because a serial is either there or it is not.
 *
 * They stay SEPARATE rows keyed by `source`. Summing them would add a counted
 * quantity to a unit count and hide which half a picker can actually scan.
 *
 * `current_location` is FREE TEXT, so it is resolved against `locations` by the
 * three handles an operator could have typed (barcode, name, nickname). The
 * ones that resolve inherit the real room and bin code — which is what puts
 * them in the room funnel. The ones that do not keep their written handle as
 * their face and carry a `NULL` id: hiding them would hide real stock.
 *
 * ## Shape
 *
 * One row per `(location, sku, source)` holding stock. Bin pairs at `qty = 0`
 * are excluded — a Stock list is a list of stock, and an emptied pair is a row
 * `bin_contents` keeps for its bounds, not something sitting on a shelf. That
 * is also why the family's level vocabulary has no `Empty` word (see
 * `location-stock-resolve.ts`). `SHIPPED` units are excluded for the same
 * reason: a unit that left the building is not on a shelf, whatever its last
 * placement said.
 *
 * `COUNT(*) OVER ()` rides the same scan, so the desk can say "shown of total"
 * honestly when the cap trims the tail instead of implying the warehouse is
 * exactly as big as the page it got.
 *
 * Tenancy: `orgId` is REQUIRED. `sku`, `barcode` and `room` are tenant-scoped
 * string keys that collide across orgs, and RLS does not bite on the owner
 * pool, so every read goes through `tenantQuery` with an explicit predicate.
 */

import { tenantQuery } from '../tenancy/db';
import type { OrgId } from '../tenancy/constants';
import { productImageUrl } from '../photos/product-image-url';
import type { LocationStockTableRow } from '../inventory/location-stock-row';

/**
 * Hard ceiling on one page of pairs.
 *
 * The desk filters and searches in the browser (one funnel, one search box over
 * the resolved facts — the slot-table chrome), which is what makes it feel
 * instant on a bench; that only holds while the list fits in memory. Five
 * thousand is the same order `getBinsOverview` documents as its comfortable
 * range, and the total beside it tells the operator when they are past it.
 */
export const LOCATION_STOCK_ROW_CAP = 5000;

/**
 * The unit status that means "gone". A `SHIPPED` unit's last placement is
 * history, not stock; every other status in `unit-status.ts` is a unit still in
 * the building at some stage of its life.
 */
const DEPARTED_UNIT_STATUS = 'SHIPPED';

/**
 * The wire row as `pg` returns it.
 *
 * `image_url` is ABSENT and the three image inputs arrive instead: the rule
 * that turns them into one URL is {@link productImageUrl}, and it runs in TS
 * beside the station that already uses it rather than being re-stated as a
 * `CASE` here.
 */
interface StockByLocationDbRow
  extends Omit<LocationStockTableRow, 'last_counted' | 'image_url'> {
  last_counted: Date | string | null;
  catalog_image_url: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  total_count: number;
}

export interface StockByLocationPage {
  rows: LocationStockTableRow[];
  /** Pairs with stock across the whole org, before {@link LOCATION_STOCK_ROW_CAP}. */
  totalCount: number;
}

/** pg hands back `Date`; every slot resolver reads an ISO string. */
function isoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/**
 * Every (location, sku, source) pairing holding stock, in warehouse walking
 * order.
 *
 * Order is room → row → column → biggest qty first, which is the order a
 * picker walks the floor in and the order the bins overview already publishes.
 * A header click re-sorts in the browser; this is only the arrival order.
 */
export async function getStockByLocation(args: {
  orgId: OrgId;
  limit?: number;
}): Promise<StockByLocationPage> {
  const limit = Math.max(1, Math.min(args.limit ?? LOCATION_STOCK_ROW_CAP, LOCATION_STOCK_ROW_CAP));

  const sql = `
    WITH bin_pairs AS (
      SELECT
        bc.location_id                         AS location_id,
        NULL::text                             AS written_location,
        bc.sku                                 AS sku,
        'bin'::text                            AS source,
        bc.qty::int                            AS qty,
        bc.min_qty                             AS min_qty,
        bc.max_qty                             AS max_qty,
        bc.last_counted                        AS last_counted
      FROM bin_contents bc
      WHERE bc.organization_id = $1
        AND bc.qty <> 0
    ),
    unit_pairs AS (
      -- Serialized units standing at a location. current_location is free text,
      -- so it is matched against the three handles an operator could have
      -- written; an unmatched handle keeps its text and carries a NULL id.
      -- Grouped by BOTH the resolved id and the written text so two unregistered
      -- places do not collapse into one bucket.
      SELECT
        l.id                                   AS location_id,
        CASE WHEN l.id IS NULL THEN su.current_location ELSE NULL END AS written_location,
        su.sku                                 AS sku,
        'unit'::text                           AS source,
        COUNT(*)::int                          AS qty,
        NULL::int                              AS min_qty,
        NULL::int                              AS max_qty,
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
        -- Cast to text: current_status is serial_status_enum, so comparing it
        -- to a plain parameter makes pg coerce the PARAMETER to the enum, and
        -- COALESCE(enum, '') then fails outright on the empty string.
        -- NB: no backticks in SQL comments — this is a JS template literal.
        AND COALESCE(su.current_status::text, '') <> $3
        AND NULLIF(TRIM(su.sku), '') IS NOT NULL
      GROUP BY l.id, CASE WHEN l.id IS NULL THEN su.current_location ELSE NULL END, su.sku
    ),
    pairs AS (
      SELECT * FROM bin_pairs
      UNION ALL
      SELECT * FROM unit_pairs
    )
    SELECT
      p.location_id,
      -- The bin's registered name, or the handle the floor actually wrote when
      -- this warehouse has no row for the place.
      COALESCE(l.name, p.written_location)     AS location_name,
      l.barcode                                AS location_barcode,
      l.room,
      l.row_label,
      l.col_label,
      p.sku,
      -- The house title coalesce, all THREE legs -- pair-candidates-queries.ts
      -- is the same expression. sku_stock carries a title only when an operator
      -- or an import filled one in, so the two stock columns alone titled live
      -- rows by their bare SKU while sku_catalog next door held the real name.
      COALESCE(
        NULLIF(ss.display_name_override, ''),
        NULLIF(ss.product_title, ''),
        NULLIF(sc.product_title, '')
      )                                        AS product_title,
      -- The product photo, Zoho first: productImageUrl owns the rule and this
      -- query only supplies its three inputs.
      -- NB: no backticks in SQL comments — this is a JS template literal.
      NULLIF(sc.image_url, '')                 AS catalog_image_url,
      zi.zoho_item_id                          AS zoho_item_id,
      zi.image_document_id                     AS zoho_image_document_id,
      p.source,
      p.qty,
      p.min_qty,
      p.max_qty,
      p.last_counted,
      COUNT(*) OVER ()::int                    AS total_count
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
    -- Zoho is the SoT for what a unit looks like (operator 2026-09-05); the
    -- items table is the local Zoho mirror, keyed by SKU.
    LEFT JOIN items zi
      ON zi.sku = p.sku
     AND zi.organization_id = $1
    -- A bin that was soft-deleted keeps its bin_contents rows; those are not
    -- shelf stock any more. An UNRESOLVED unit placement has no locations row
    -- at all and must survive this predicate, which is what the NULL leg is.
    WHERE (p.location_id IS NULL OR l.id IS NOT NULL)
    ORDER BY
      l.sort_order ASC NULLS LAST,
      l.room NULLS LAST,
      l.row_label NULLS LAST,
      l.col_label NULLS LAST,
      p.qty DESC,
      p.sku ASC,
      p.source ASC
    LIMIT $2
  `;

  const result = await tenantQuery<StockByLocationDbRow>(args.orgId, sql, [
    args.orgId,
    limit,
    DEPARTED_UNIT_STATUS,
  ]);

  return {
    rows: result.rows.map(
      ({
        total_count: _total,
        last_counted,
        catalog_image_url,
        zoho_item_id,
        zoho_image_document_id,
        ...row
      }) => ({
        ...row,
        last_counted: isoOrNull(last_counted),
        image_url: productImageUrl({
          zohoItemId: zoho_item_id,
          zohoImageDocumentId: zoho_image_document_id,
          catalogImageUrl: catalog_image_url,
        }),
      }),
    ),
    // `COUNT(*) OVER ()` is absent when the scan matched nothing.
    totalCount: result.rows[0]?.total_count ?? 0,
  };
}
