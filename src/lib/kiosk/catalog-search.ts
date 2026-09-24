/**
 * The kiosk product searcher — one SQL read over the local catalog projection.
 *
 * ## Why this exists
 * The kiosk is the in-person sales contact. A walk-in asks "do you have this",
 * and the staffer must answer three things at once: what it costs, whether we
 * have it, and which bin to walk to. Nothing served that:
 *
 *   - The retail rail SELECTed every active listing for the org on every
 *     request, then filtered and sliced in JS (the loader this replaced).
 *   - The picker's search was a lie: it fetched `mode=all&limit=100` once and
 *     filtered those 100 rows client-side, so typing a product that sorted
 *     101st alphabetically found nothing.
 *   - On-hand and bin location were never joined at all, even though
 *     `bin_contents` + `locations` have held them since 2026-04-09.
 *
 * This module is the replacement: filter, rank, page, and join availability in
 * ONE round trip, in the database.
 *
 * ## Source of truth
 * `platform_listings` — the local Ecwid mirror written by `projectEcwidCatalog`
 * and refreshed hourly by `/api/cron/catalog-projection`. The vendor API is
 * never on this path; a counter search must not wait on a 25-page storefront
 * walk. Rows are mapped back through `fromProjectedListing` so every existing
 * `EcwidProduct` consumer (`ProductSelector`) is unchanged.
 *
 * ## Ranking
 * Reuses the house builders (`buildTextSearchVariants` / `buildRankedSearchSql`,
 * as `orders-queries.ts` does) rather than hand-rolling a CASE ladder. SKU beats
 * name at equal strength because a staffer who types a SKU knows exactly what
 * they want. Fuzzy is name-only and off below 4 characters — `word_similarity`
 * on a 2-character query matches most of the catalog.
 *
 * The fuzzy arm is a DELIBERATE sequential scan. `buildTextSearchVariants`
 * emits `word_similarity($q, LOWER(BTRIM(expr))) >= t`, and pg_trgm's GIN
 * opclass accelerates the `<%` operator rather than that function form — so no
 * trigram index can serve it (measured: 12.4ms over 1,557 active listings,
 * against a ~330ms Neon round trip). A name trigram index was created for this
 * and dropped once EXPLAIN proved 0 scans; see
 * `migrations/2026-09-13a_drop_unused_listing_name_trgm.sql` for the numbers,
 * and `search/hybrid-retrieval.ts:111-119` for the `<%` rewrite to reach for if
 * the catalog ever grows enough to care.
 *
 * ## Paging before the join
 * The availability LATERAL runs against `page`, not `matched`, so the bin
 * aggregate is evaluated for at most `limit` rows instead of the whole result
 * set. `COUNT(*) OVER ()` inside `page` is still computed over `matched`, so
 * `total` stays honest.
 */

import 'server-only';

import { tenantQuery } from '@/lib/tenancy/db';
import { escapeLike } from '@/lib/sql-like';
import {
  buildRankedSearchSql,
  buildTextSearchVariants,
  type RankedSearchVariant,
} from '@/lib/search/sql-ranked-search';
import type { OrgId } from '@/lib/tenancy/constants';
import type { EcwidProduct } from '@/lib/repair/ecwid-repair-catalog';
import { fromProjectedListing } from '@/lib/repair/catalog-projection';
import {
  normalizeCatalogQuery,
  summarizeAvailability,
  type CatalogAvailability,
} from './catalog-search-pure';
import type { FavoriteWorkspaceKey } from '@/lib/favorites/favorite-sku-key';

/** The one platform the projection serves today (mirrors catalog-projection). */
const PROJECTION_PLATFORM = 'ecwid';

/**
 * The SQL twin of `isRepairSku` (`src/utils/sku.ts`) — `…-RS` or `…-RS-12`.
 * Kept as a bound parameter rather than an inlined literal so the two halves of
 * the retail/service split can never drift into different patterns.
 */
const REPAIR_SKU_PATTERN = '(-RS|-RS-[0-9]+)$';

/** Fuzzy name matching below this query length matches most of the catalog. */
const FUZZY_MIN_QUERY_CHARS = 4;

/**
 * The SQL twin of `normalizeFavoriteSku` (`favorite-sku-key.ts`) — case-folded,
 * separator-stripped SKU, i.e. exactly what `favorite_skus.sku_normalized`
 * holds. Stripping is case-insensitive over `[A-Za-z0-9]`, so strip-then-lower
 * here and lower-then-strip in TypeScript cannot disagree.
 * `favorite-sku-key.test.ts` pins that folding: fold the case and drop every
 * separator, or a starred SKU stops matching its own tile.
 */
export const FAVORITE_SKU_KEY_SQL =
  "LOWER(REGEXP_REPLACE(COALESCE(pl.merchant_sku, ''), '[^A-Za-z0-9]+', '', 'g'))";

/**
 * Which half of the catalog to search.
 *
 * `service` is the kiosk repair rail (`-RS` SKUs only — the repair root also
 * holds shipping fees and warranty add-ons that are not bookable services).
 * `retail` is its exact complement, so no listing is reachable from both rails
 * and none is orphaned by the split.
 */
export type KioskCatalogSegment = 'retail' | 'service';

export interface KioskCatalogSearchOptions {
  segment: KioskCatalogSegment;
  /** Free-text over SKU, name, and UPC. Blank ⇒ browse, ordered by name. */
  query?: string | null;
  /** Provider category id to narrow to. Ignored when `mode=all`. */
  categoryId?: string | null;
  /** Scanned barcode — exact identity, bypasses text ranking entirely. */
  barcode?: string | null;
  /**
   * Narrow the browse to this workspace's curated favorites, in `sort_order`.
   *
   * The favorites list is a SCOPE of the same catalog, not a second data
   * source: the tiles carry the same photo, price, stock and bin as any other
   * browse page because they ARE the same rows. Discarded by a `barcode` or a
   * `query` for the same reason `categoryId` is — a walk-in asking for a
   * product does not care what the counter pinned.
   */
  favoritesWorkspace?: FavoriteWorkspaceKey | null;
  limit: number;
  offset: number;
}

/** One catalog row plus the answer to "have we got it, and where". */
export interface KioskCatalogHit {
  product: EcwidProduct;
  availability: CatalogAvailability;
}

export interface KioskCatalogPage {
  hits: KioskCatalogHit[];
  /** Matches across the whole query, not just this page. */
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface SearchRow {
  external_ref_id: string;
  merchant_sku: string | null;
  listed_name: string | null;
  listing_price_cents: number | null;
  thumbnail_url: string | null;
  in_stock: boolean;
  is_active: boolean;
  category_external_ids: string[] | null;
  total_count: number | string;
  on_hand: number | null;
  bin_count: number | null;
  bin_name: string | null;
  bin_barcode: string | null;
  bin_qty: number | null;
}

/**
 * Availability for the paged rows: on-hand across every bin, plus the single
 * bin to walk to first (the one holding the most of this SKU).
 *
 * `bin_contents.sku` is a tenant-scoped TEXT key that collides across orgs, so
 * it is org-filtered directly AND the `locations` join is org-aligned — the
 * same defense-in-depth posture as `getBinLocationsBySku`.
 *
 * Aggregate-only and therefore always one row: zero matching bins yields
 * `on_hand = NULL` (untracked, NOT zero) with `bin_count = 0`.
 */
const AVAILABILITY_LATERAL = `
    SELECT SUM(bc.qty)::int AS on_hand,
           COUNT(*)::int    AS bin_count,
           (ARRAY_AGG(l.name    ORDER BY bc.qty DESC, l.sort_order, l.id))[1] AS bin_name,
           (ARRAY_AGG(l.barcode ORDER BY bc.qty DESC, l.sort_order, l.id))[1] AS bin_barcode,
           (ARRAY_AGG(bc.qty    ORDER BY bc.qty DESC, l.sort_order, l.id))[1] AS bin_qty
      FROM bin_contents bc
      JOIN locations    l ON l.id = bc.location_id
                         AND l.organization_id = bc.organization_id
     WHERE bc.organization_id = $1
       AND p.merchant_sku IS NOT NULL
       AND bc.sku = p.merchant_sku
       AND l.is_active`;

/**
 * Search (or browse) this org's projected catalog, with availability.
 *
 * Precedence: a `barcode` is an identity lookup and wins over everything; a
 * `query` searches the whole segment and ignores `categoryId` (a walk-in asking
 * for a product does not care which category the staffer happens to be in —
 * that was the defect behind the 100-row client pool); then a
 * `favoritesWorkspace` browse (curated order); otherwise a category or
 * all-products browse ordered by name.
 */
export async function searchKioskCatalog(
  orgId: OrgId,
  options: KioskCatalogSearchOptions,
): Promise<KioskCatalogPage> {
  const params: unknown[] = [orgId, PROJECTION_PLATFORM];
  /** Bind a value and return its positional placeholder. */
  const push = (value: unknown): string => `$${params.push(value)}`;

  const filters: string[] = [
    options.segment === 'service'
      ? `pl.merchant_sku ~* ${push(REPAIR_SKU_PATTERN)}`
      : `(pl.merchant_sku IS NULL OR pl.merchant_sku !~* ${push(REPAIR_SKU_PATTERN)})`,
  ];

  const barcode = String(options.barcode ?? '').trim();
  const query = normalizeCatalogQuery(options.query);
  let rankClause = '0';

  if (barcode) {
    // Digits-only so a scanned EAN-13 still matches a SKU stored with
    // separators. The >= 8 guard keeps the trailing-match arm (kept from the
    // previous JS `endsWith` behavior) from matching broadly on short noise.
    const digits = barcode.replace(/\D/g, '');
    const upcParam = push(barcode);
    const upperParam = push(barcode.toUpperCase());
    const digitsParam = push(digits);
    filters.push(`(
         pl.upc = ${upcParam}
      OR UPPER(BTRIM(COALESCE(pl.merchant_sku, ''))) = ${upperParam}
      OR regexp_replace(COALESCE(pl.merchant_sku, ''), '\\D', '', 'g') = ${digitsParam}
      OR (
           LENGTH(${digitsParam}) >= 8
       AND regexp_replace(COALESCE(pl.merchant_sku, ''), '\\D', '', 'g') LIKE '%' || ${digitsParam}
         )
    )`);
  } else if (query) {
    const exactParam = push(query);
    const prefixParam = push(`${escapeLike(query)}%`);
    const likeParam = push(`%${escapeLike(query)}%`);
    const fuzzyParam = push(query);
    const allowFuzzy = query.length >= FUZZY_MIN_QUERY_CHARS;

    const variants: RankedSearchVariant[] = [
      // A typed SKU is an intent, not a guess — it outranks every name match.
      ...buildTextSearchVariants({
        expression: 'pl.merchant_sku',
        exactParam,
        prefixParam,
        likeParam,
        enableFuzzy: false,
        exactScore: 1000,
        prefixScore: 820,
        containsScore: 640,
      }),
      ...buildTextSearchVariants({
        expression: 'pl.listed_name',
        exactParam,
        prefixParam,
        likeParam,
        fuzzyParam,
        enableFuzzy: allowFuzzy,
        exactScore: 900,
        prefixScore: 760,
        containsScore: 560,
        fuzzyBaseScore: 200,
        fuzzyScale: 200,
        fuzzyThreshold: 0.3,
      }),
      // UPC is an identity: exact or nothing. A partial barcode is noise.
      ...buildTextSearchVariants({
        expression: 'pl.upc',
        exactParam,
        enablePrefix: false,
        enableContains: false,
        enableFuzzy: false,
        exactScore: 1000,
      }),
    ];

    const ranked = buildRankedSearchSql(variants);
    filters.push(`(${ranked.whereClause})`);
    rankClause = ranked.rankClause;
  } else if (options.favoritesWorkspace) {
    // Curated list — membership in this workspace, painted in its `sort_order`.
    //
    // The order rides `rank` rather than a second ORDER BY branch: the page CTE
    // already sorts `rank DESC, listed_name`, so `1000 - sort_order` puts the
    // first pinned favorite first and keeps the rest ascending, while every
    // other scope leaves rank at 0 and sorts by name exactly as before.
    const workspaceParam = push(options.favoritesWorkspace);
    const membership = `
           FROM favorite_skus f
           INNER JOIN favorite_sku_workspaces w
             ON w.favorite_id = f.id
            AND w.organization_id = f.organization_id
          WHERE f.organization_id = $1
            AND w.workspace_key = ${workspaceParam}
            AND w.is_active
            AND f.sku_normalized <> ''
            AND f.sku_normalized = ${FAVORITE_SKU_KEY_SQL}`;
    filters.push(`EXISTS (SELECT 1${membership})`);
    rankClause = `COALESCE((SELECT 1000 - w.sort_order${membership} LIMIT 1), 0)`;
  } else if (options.categoryId) {
    // GIN-indexed array overlap (category_external_ids), not a JSONB probe.
    filters.push(`pl.category_external_ids && ARRAY[${push(options.categoryId)}]::text[]`);
  }

  const limitParam = push(options.limit);
  const offsetParam = push(options.offset);

  const sql = `
    WITH matched AS (
      SELECT pl.external_ref_id, pl.merchant_sku, pl.listed_name,
             pl.listing_price_cents, pl.thumbnail_url, pl.in_stock,
             pl.is_active, pl.category_external_ids,
             ${rankClause} AS rank
        FROM platform_listings pl
       WHERE pl.organization_id = $1
         AND pl.platform = $2
         AND pl.is_active
         AND pl.external_ref_id IS NOT NULL
         AND ${filters.join('\n         AND ')}
    ),
    page AS (
      SELECT m.*, COUNT(*) OVER () AS total_count
        FROM matched m
       ORDER BY m.rank DESC, m.listed_name ASC NULLS LAST, m.external_ref_id
       LIMIT ${limitParam} OFFSET ${offsetParam}
    )
    SELECT p.external_ref_id, p.merchant_sku, p.listed_name,
           p.listing_price_cents, p.thumbnail_url, p.in_stock,
           p.is_active, p.category_external_ids, p.total_count,
           bins.on_hand, bins.bin_count, bins.bin_name,
           bins.bin_barcode, bins.bin_qty
      FROM page p
      LEFT JOIN LATERAL (${AVAILABILITY_LATERAL}
      ) bins ON TRUE
     ORDER BY p.rank DESC, p.listed_name ASC NULLS LAST, p.external_ref_id`;

  const res = await tenantQuery<SearchRow>(orgId, sql, params);

  const hits = res.rows.map((row) => ({
    product: fromProjectedListing(row),
    availability: summarizeAvailability(row),
  }));
  const total = res.rows.length > 0 ? Number(res.rows[0].total_count) : 0;

  return {
    hits,
    total,
    limit: options.limit,
    offset: options.offset,
    hasMore: options.offset + hits.length < total,
  };
}

/**
 * The catalog unit price (cents) of each listing id — the price a counter
 * tile charged when it put the item on the cart. `/api/kiosk/intake` holds a
 * submitted sale line to it unless the line carries a manager approval. An id
 * with no row, or no price, is absent.
 */
export async function catalogUnitPrices(
  orgId: OrgId,
  listingIds: readonly string[],
): Promise<Map<string, number>> {
  if (listingIds.length === 0) return new Map();
  const res = await tenantQuery<{ external_ref_id: string; listing_price_cents: number }>(
    orgId,
    `SELECT external_ref_id, listing_price_cents
       FROM platform_listings
      WHERE organization_id = $1
        AND platform = $2
        AND external_ref_id = ANY($3::text[])
        AND listing_price_cents IS NOT NULL`,
    [orgId, PROJECTION_PLATFORM, [...listingIds]],
  );
  return new Map(res.rows.map((r) => [String(r.external_ref_id), Number(r.listing_price_cents)]));
}
