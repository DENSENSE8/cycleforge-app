/** Warehouse-wide stock-by-location read — the feed behind Inventory › Stock. */

import { tenantQuery } from '../tenancy/db';
import { derivedRoomLabelSql, derivedRoomSetJoinSql, rackWalkOrderSql } from '../locations/derived-room';
import type { OrgId } from '../tenancy/constants';
import { productImageUrl } from '../photos/product-image-url';
import { resolveSkuIdentityTitle } from '../sku/sku-identity-law';
import { photoContentUrl } from '../photos/display-url';
import {
  locationStockRoomId,
  parseLocationStockAisles,
  parseLocationStockRoomIds,
  type LocationStockRoomFacet,
  type LocationStockTableRow,
} from '../inventory/location-stock-row';
import { escapeLike } from '../sql-like';

/**
 * Hard ceiling on one page of pairs. Location-scoped walks rank one row from
 * every location ahead of duplicate SKU/source pairs, so the cap cannot hide
 * later locations behind a dense early bin.
 */
export const LOCATION_STOCK_ROW_CAP = 5000;

/** The unit status that means "gone": its last placement is history, not stock. */
const DEPARTED_UNIT_STATUS = 'SHIPPED';

/**
 * A ROOM or RACK row is the container places hang under, never an empty place
 * of its own — even before anything hangs under it (`Zone 5` with no aisles,
 * a rack with no shelves yet) — and never home to a zero-count placeholder.
 * Real stock written onto one still shows.
 */
const CONTAINER_KIND_SQL = `('ROOM', 'RACK')`;

interface StockByLocationDbRow {
  location_id: number | null;
  location_name: string | null;
  location_barcode: string | null;
  room: string | null;
  row_label: string | null;
  col_label: string | null;
  sku: string;
  stock_id: number | string | null;
  home_location: string | null;
  title_override: string | null;
  catalog_title: string | null;
  zoho_title: string | null;
  stock_title: string | null;
  is_provisional: boolean | null;
  cover_photo_id: number | string | null;
  catalog_image_url: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  source: 'bin' | 'unit' | 'exception' | 'empty';
  qty: number;
  min_qty: number | null;
  last_moved: Date | string | null;
  last_counted: Date | string | null;
  total_count: number;
  in_stock_pairs: number;
  in_stock_products: number;
  in_stock_units: number;
  on_hold_pairs: number;
  low_stock_pairs: number;
  out_pairs: number;
}

/** Scoped health counts for the pills and the tally — server truth, uncapped. */
export interface StockScopeCounts {
  inStockPairs: number;
  inStockProducts: number;
  inStockUnits: number;
  onHoldPairs: number;
  lowStockPairs: number;
  outPairs: number;
}

interface StockByLocationPage {
  rows: LocationStockTableRow[];
  /** Pairs with stock MATCHING `query` across the whole org, before the cap. */
  totalCount: number;
  /** Health counts over the SAME matched set (room/aisle/query scoped). */
  counts: StockScopeCounts;
}

interface StockRoomFacetDbRow {
  id: string;
  count: number;
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
  /** The contextual room/zone filter, applied before the cap. */
  room?: string | null;
  /** Numeric aisle multi-select from the contextual sidebar. */
  aisle?: string | null;
}): Promise<StockByLocationPage> {
  const limit = Math.max(1, Math.min(args.limit ?? LOCATION_STOCK_ROW_CAP, LOCATION_STOCK_ROW_CAP));

  const needle = (args.query ?? '').trim();
  const like = needle ? `%${escapeLike(needle)}%` : null;
  // The punctuation-blind twin. A needle that is ONLY punctuation flattens to
  // '' and `%%` would match every row, so that leg goes NULL instead.
  const rooms = parseLocationStockRoomIds(args.room);
  const roomFilter = rooms.length ? rooms : null;
  const parsedAisles = parseLocationStockAisles(args.aisle);
  const aisles = parsedAisles.length ? parsedAisles : null;
  const locationWalk = Boolean(roomFilter?.length || aisles?.length);
  const flattened = needle.replace(/[^A-Za-z0-9]/g, '');
  const flatLike = needle && flattened ? `%${flattened}%` : null;

  const sql = `
    WITH placed_bins AS NOT MATERIALIZED (
      -- A below-threshold row remains operational stock even at zero: it must
      -- be reachable from Low stock / Out of stock. A zero-count TMP row is
      -- also a deliberate placement (empty-location photo capture) while its
      -- location is a live place; one left at a deleted location or on a room
      -- / rack container is neither, and surfaces as an unlocated placeholder.
      SELECT bc.*
      FROM bin_contents bc
      WHERE bc.organization_id = $1
        AND (
          bc.qty <> 0
          OR (bc.min_qty IS NOT NULL AND bc.qty <= bc.min_qty)
          OR (
            EXISTS (
              SELECT 1 FROM sku_stock ps
              WHERE ps.organization_id = bc.organization_id
                AND ps.sku = bc.sku
                AND ps.is_provisional = true
            )
            AND EXISTS (
              SELECT 1 FROM locations pl
              WHERE pl.organization_id = bc.organization_id
                AND pl.id = bc.location_id
                AND pl.is_active = true
                AND pl.location_kind NOT IN ${CONTAINER_KIND_SQL}
            )
          )
        )
    ),
    bin_pairs AS (
      SELECT
        bc.location_id                         AS location_id,
        NULL::text                             AS written_location,
        bc.sku                                 AS sku,
        'bin'::text                            AS source,
        bc.qty::int                            AS qty,
        bc.min_qty::int                        AS min_qty,
        bc.updated_at                          AS last_moved,
        bc.last_counted                        AS last_counted
      FROM placed_bins bc
    ),
    unit_pairs AS (
      SELECT
        l.id                                   AS location_id,
        CASE WHEN l.id IS NULL THEN su.current_location ELSE NULL END AS written_location,
        su.sku                                 AS sku,
        'unit'::text                           AS source,
        COUNT(*)::int                          AS qty,
        NULL::int                              AS min_qty,
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
    -- An on-hold product can exist before it has been counted into a bin.
    -- Keep that work visible in the SAME ledger instead of a second queue.
    unlocated_provisional_pairs AS (
      SELECT
        NULL::int                              AS location_id,
        NULL::text                             AS written_location,
        ss.sku                                 AS sku,
        'exception'::text                      AS source,
        COALESCE(ss.stock, 0)::int             AS qty,
        NULL::int                              AS min_qty,
        ss.updated_at                          AS last_moved,
        NULL::timestamptz                      AS last_counted
      FROM sku_stock ss
      WHERE ss.organization_id = $1
        AND ss.is_provisional = true
        AND NOT EXISTS (
          SELECT 1 FROM placed_bins bc
          WHERE bc.sku = ss.sku
        )
    ),
    empty_locations AS (
      SELECT
        l.id                                   AS location_id,
        NULL::text                             AS written_location,
        ''::text                               AS sku,
        'empty'::text                          AS source,
        0::int                                 AS qty,
        NULL::int                              AS min_qty,
        NULL::timestamptz                      AS last_moved,
        NULL::timestamptz                      AS last_counted
      FROM locations l
      WHERE l.organization_id = $1
        AND l.is_active = true
        AND NULLIF(TRIM(l.barcode), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM placed_bins bc
          WHERE bc.location_id = l.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM serial_units su
          WHERE su.organization_id = l.organization_id
            AND COALESCE(su.current_status::text, '') <> $3
            AND su.current_location IN (l.barcode, l.name, l.display_name)
        )
        -- A location other locations hang under (a room node such as Zone 3's
        -- "RECEIVING", a movable rack) is the container, not an empty place.
        AND l.location_kind NOT IN ${CONTAINER_KIND_SQL}
        AND NOT EXISTS (
          SELECT 1 FROM locations child
          WHERE child.organization_id = l.organization_id
            AND child.parent_id = l.id
            AND child.is_active = true
        )
    ),
    pairs AS (
      SELECT * FROM bin_pairs
      UNION ALL
      SELECT * FROM unit_pairs
      UNION ALL
      SELECT * FROM unlocated_provisional_pairs
      UNION ALL
      SELECT * FROM empty_locations
    ),
    joined AS (
      SELECT
        p.location_id,
        COALESCE(l.name, p.written_location)   AS location_name,
        l.barcode                              AS location_barcode,
        -- The room is DERIVED up parent_id (a movable rack's shelves group,
        -- filter and facet under the room the rack stands in now).
        ${derivedRoomLabelSql('l', 'droom')}   AS room,
        l.row_label,
        l.col_label,
        p.sku,
        ss.id                                  AS stock_id,
        NULLIF(TRIM(ss.location), '')          AS home_location,
        NULLIF(ss.display_name_override, '')   AS title_override,
        NULLIF(sc.product_title, '')           AS catalog_title,
        NULLIF(zi.name, '')                    AS zoho_title,
        NULLIF(ss.product_title, '')           AS stock_title,
        COALESCE(ss.is_provisional, false)     AS is_provisional,
        ph.cover_photo_id,
        NULLIF(sc.image_url, '')               AS catalog_image_url,
        zi.zoho_item_id                        AS zoho_item_id,
        zi.image_document_id                   AS zoho_image_document_id,
        p.source,
        p.qty,
        p.min_qty,
        p.last_moved,
        p.last_counted,
        l.sort_order                           AS location_sort_order
      FROM pairs p
      LEFT JOIN locations l
        ON l.id = p.location_id
       AND l.organization_id = $1
      ${derivedRoomSetJoinSql('l', 'droom', '$1')}
      LEFT JOIN sku_stock ss
        ON ss.sku = p.sku
       AND p.sku <> ''
       AND ss.organization_id = $1
      LEFT JOIN sku_catalog sc
        ON sc.sku = p.sku
       AND p.sku <> ''
       AND sc.organization_id = $1
      LEFT JOIN items zi
        ON zi.sku = p.sku
       AND p.sku <> ''
       AND zi.organization_id = $1
      -- The SKU's own cover: the main SKU_STOCK photo on its sku_stock row
      -- (first by sort_order NULLS LAST, photo_id) — a placeholder's, or one
      -- uploaded from the stock record (it wins over the catalog / Zoho
      -- image, the "our cover first" precedence).
      LEFT JOIN LATERAL (
        SELECT pel.photo_id AS cover_photo_id
          FROM photo_entity_links pel
         WHERE pel.organization_id = $1
           AND pel.entity_type = 'SKU_STOCK'
           AND pel.entity_id = ss.id
           AND pel.link_role = 'primary'
         ORDER BY pel.sort_order ASC NULLS LAST, pel.photo_id ASC
         LIMIT 1
      ) ph ON true
      -- A soft-deleted bin keeps its bin_contents rows; those are not shelf
      -- stock. An UNRESOLVED unit placement has no locations row at all and
      -- must survive, which is the NULL leg.
      WHERE (p.location_id IS NULL OR l.id IS NOT NULL)
    ),
    scoped_matches AS (
      SELECT j.*
      FROM joined j
      WHERE (
        ($4::text IS NOT NULL OR $6::text[] IS NOT NULL OR $7::int[] IS NOT NULL) OR j.source <> 'empty'
      )
      AND (
        $6::text[] IS NULL
        OR j.room = ANY($6::text[])
        OR ('(none)' = ANY($6::text[]) AND NULLIF(TRIM(j.room), '') IS NULL)
      )
      AND ($6::text[] IS NULL OR j.location_id IS NOT NULL)
      AND ($7::int[] IS NULL OR (
        CASE
          WHEN j.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(j.row_label, '-', 1)::int
          ELSE NULL
        END = ANY($7::int[])
      ))
      AND ($4::text IS NULL OR (
            COALESCE(j.title_override, '')     ILIKE $4
         OR COALESCE(j.catalog_title, '')      ILIKE $4
         OR COALESCE(j.zoho_title, '')         ILIKE $4
         OR COALESCE(j.stock_title, '')        ILIKE $4
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
    ),
    -- The bullet train: ONE uncapped aggregate over the same matched set —
    -- the pills and the tally read exact numbers even when the row page is
    -- capped. Physical stock and exception health intentionally overlap: an
    -- on-hold/TMP pair remains in its quantity state as well as On hold.
    counts AS (
      SELECT
        COUNT(*) FILTER (WHERE m.qty > 0)::int                                                          AS in_stock_pairs,
        COUNT(DISTINCT m.sku) FILTER (WHERE m.qty > 0)::int                                             AS in_stock_products,
        COALESCE(SUM(m.qty) FILTER (WHERE m.qty > 0), 0)::int                                           AS in_stock_units,
        COUNT(*) FILTER (WHERE COALESCE(m.is_provisional, false))::int                                   AS on_hold_pairs,
        COUNT(*) FILTER (WHERE m.min_qty IS NOT NULL AND m.qty <= m.min_qty)::int                         AS low_stock_pairs,
        COUNT(*) FILTER (WHERE m.qty <= 0 AND m.source <> 'empty')::int                                  AS out_pairs
      FROM scoped_matches m
    )
    SELECT
      m.location_id,
      m.location_name,
      m.location_barcode,
      m.room,
      m.row_label,
      m.col_label,
      m.sku,
      m.stock_id,
      m.home_location,
      m.title_override,
      m.catalog_title,
      m.zoho_title,
      m.stock_title,
      m.is_provisional,
      m.cover_photo_id,
      m.catalog_image_url,
      m.zoho_item_id,
      m.zoho_image_document_id,
      m.source,
      m.qty,
      m.min_qty,
      m.last_moved,
      m.last_counted,
      c.in_stock_pairs,
      c.in_stock_products,
      c.in_stock_units,
      c.on_hold_pairs,
      c.low_stock_pairs,
      c.out_pairs,
      COUNT(*) OVER ()::int                    AS total_count
    FROM scoped_matches m
    CROSS JOIN counts c
    ORDER BY
      CASE WHEN $4::text IS NULL AND $6::text[] IS NULL AND $7::int[] IS NULL AND m.source = 'empty' THEN 1 ELSE 0 END ASC,
      CASE
        WHEN $8::boolean THEN ROW_NUMBER() OVER (
          PARTITION BY m.location_id
          ORDER BY m.source ASC, m.sku ASC, m.qty DESC
        )
        ELSE 1
      END ASC,
      m.room NULLS LAST,
      ${rackWalkOrderSql('m.location_barcode')},
      CASE
        WHEN m.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(m.row_label, '-', 1)::int
        ELSE NULL
      END NULLS LAST,
      CASE
        WHEN m.row_label ~ '^[0-9]+-[0-9]+$' THEN split_part(m.row_label, '-', 2)::int
        ELSE NULL
      END NULLS LAST,
      CASE
        WHEN m.col_label ~ '^[0-9]+-[0-9]+$' THEN split_part(m.col_label, '-', 1)::int
        ELSE NULL
      END NULLS LAST,
      CASE
        WHEN m.col_label ~ '^[0-9]+-[0-9]+$' THEN split_part(m.col_label, '-', 2)::int
        ELSE NULL
      END NULLS LAST,
      m.location_sort_order ASC NULLS LAST,
      m.qty DESC,
      m.sku ASC,
      m.source ASC
    LIMIT $2
  `;

  const result = await tenantQuery<StockByLocationDbRow>(args.orgId, sql, [
    args.orgId,
    limit,
    DEPARTED_UNIT_STATUS,
    like,
    flatLike,
    roomFilter,
    aisles?.length ? aisles : null,
    locationWalk,
  ]);

  return {
    rows: result.rows.map((row) => {
      const rowParts = row.row_label?.match(/^(\d+)-(\d+)$/);
      const colParts = row.col_label?.match(/^(\d+)-(\d+)$/);
      return {
        location_id: row.location_id == null ? null : Number(row.location_id),
        location_name: row.location_name,
        location_barcode: row.location_barcode,
        room: row.room?.trim() || null,
        aisle: rowParts ? Number(rowParts[1]) : null,
        bay: rowParts ? Number(rowParts[2]) : null,
        level: colParts ? Number(colParts[1]) : null,
        position: colParts ? Number(colParts[2]) : null,
        sku: row.sku,
        stock_id: row.stock_id == null ? null : Number(row.stock_id),
        home_location: row.home_location,
        // An operator's explicit override wins; else the SKU identity law
        // (catalog → Zoho item name), then the sku_stock title — where a TMP
        // placeholder's operator-typed title lives (it has no catalog row).
        product_title:
        row.title_override ??
        (resolveSkuIdentityTitle({
          catalog_product_title: row.catalog_title,
          zoho_item_title: row.zoho_title,
          item_name: row.stock_title,
        }) ||
          null),
      is_provisional: Boolean(row.is_provisional),
      image_url:
        row.cover_photo_id != null
          ? photoContentUrl(Number(row.cover_photo_id), 'thumb')
          : productImageUrl({
              zohoItemId: row.zoho_item_id,
              zohoImageDocumentId: row.zoho_image_document_id,
              catalogImageUrl: row.catalog_image_url,
            }),
      cover_photo_url:
        row.cover_photo_id != null ? photoContentUrl(Number(row.cover_photo_id)) : null,
      source: row.source,
      qty: Number(row.qty) || 0,
      min_qty: row.min_qty == null ? null : Number(row.min_qty),
      last_moved: isoOrNull(row.last_moved),
      last_counted: isoOrNull(row.last_counted),
      };
    }),
    totalCount: result.rows[0]?.total_count ?? 0,
    counts: {
      inStockPairs: Number(result.rows[0]?.in_stock_pairs) || 0,
      inStockProducts: Number(result.rows[0]?.in_stock_products) || 0,
      inStockUnits: Number(result.rows[0]?.in_stock_units) || 0,
      onHoldPairs: Number(result.rows[0]?.on_hold_pairs) || 0,
      lowStockPairs: Number(result.rows[0]?.low_stock_pairs) || 0,
      outPairs: Number(result.rows[0]?.out_pairs) || 0,
    },
  };
}

/** Every active warehouse room (DERIVED up parent_id), independent of the pair cap and current cut. */
export async function getStockRoomFacets(orgId: OrgId): Promise<LocationStockRoomFacet[]> {
  const result = await tenantQuery<StockRoomFacetDbRow>(
    orgId,
    `
      SELECT
        COALESCE(${derivedRoomLabelSql('l', 'droom')}, '(none)') AS id,
        -- Count places, not the container nodes they hang under (same rule as empty_locations).
        (COUNT(*) FILTER (WHERE l.location_kind NOT IN ${CONTAINER_KIND_SQL} AND NOT EXISTS (
          SELECT 1 FROM locations child
          WHERE child.organization_id = l.organization_id AND child.parent_id = l.id AND child.is_active = true
        )))::int                                     AS count
      FROM locations l
      ${derivedRoomSetJoinSql('l', 'droom', '$1')}
      WHERE l.organization_id = $1
        AND l.is_active = true
        AND NULLIF(TRIM(l.barcode), '') IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `,
    [orgId],
  );
  return result.rows.map((row) => {
    const room = row.id === '(none)' ? null : row.id;
    return {
      id: locationStockRoomId({ room }),
      label: room ?? 'No room',
      count: Number(row.count) || 0,
    };
  });
}
