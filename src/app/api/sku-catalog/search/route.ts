import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { escapeLike } from '@/lib/sql-like';
import { getOrSet, createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';
import { skuCatalogImageUrlSql } from '@/lib/photos/sku-catalog-image-sql';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  const ecwidOnly = searchParams.get('ecwidOnly') === 'true';
  const hasQc = searchParams.get('hasQc') === 'true';
  const excludeSkuSuffix = (searchParams.get('excludeSkuSuffix') || '').trim();
  const searchField = (searchParams.get('searchField') || 'ecwid_sku') as
    | 'ecwid_sku'
    | 'zoho_sku'
    | 'title'
    | 'zoho_catalog'
    | 'catalog';
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 20), 1), 100);

  // Reference catalog search → org-scoped cache.
  const orgId = ctx.organizationId;
  const cacheKey = createCacheLookupKey({ q, category, ecwidOnly, hasQc, excludeSkuSuffix, searchField, limit });
  const tags = hasQc ? [CACHE_TAGS.skuCatalog, CACHE_TAGS.qcChecks] : [CACHE_TAGS.skuCatalog];

  const payload = await getOrSet(
    CACHE_NS.skuCatalogSearch,
    orgId,
    cacheKey,
    CACHE_TTL.rollup,
    tags,
    async () => {
      // QC view: restrict to SKUs that have QC checklist items directly linked
      // (qc_check_templates.sku_catalog_id). Searches sku + title regardless of
      // searchField so the QC picker only ever shows products with a checklist.
      if (hasQc) {
        return searchSkusWithQcChecks(q, limit, orgId);
      }

      if (searchField === 'ecwid_sku' || searchField === 'title') {
        return searchFromPlatform(q, searchField, excludeSkuSuffix, limit, orgId);
      }

      // `zoho_catalog`:
      if (searchField === 'zoho_catalog') {
        return searchFromZohoCatalog(q, excludeSkuSuffix, limit, orgId);
      }

      // `catalog`: the internal item master — SKU, title, UPC / EAN / GTIN / MPN,
      // platform ids and external ids (ASIN, FNSKU, …); no external mirror rows.
      return searchFromCatalog(q, category, ecwidOnly, excludeSkuSuffix, limit, orgId, searchField === 'catalog');
    },
  );

  return NextResponse.json(payload);
}, { permission: 'sku_stock.view' });

async function searchFromPlatform(
  q: string,
  searchField: 'ecwid_sku' | 'title',
  excludeSkuSuffix: string,
  limit: number,
  orgId?: OrgId,
) {
  const filterClauses: string[] = [
    "sp.platform = 'ecwid'",
    'sp.is_active = true',
  ];
  const params: unknown[] = [];

  if (orgId) {
    params.push(orgId);
    filterClauses.push(`sp.organization_id = $${params.length}`);
  }

  if (excludeSkuSuffix) {
    params.push(`%${escapeLike(excludeSkuSuffix)}`);
    filterClauses.push(`sp.platform_sku NOT ILIKE $${params.length}`);
  }

  if (q) {
    params.push(`%${escapeLike(q)}%`);
    const likeIdx = params.length;
    if (searchField === 'title') {
      filterClauses.push(`sp.display_name ILIKE $${likeIdx}`);
    } else {
      filterClauses.push(
        `(sp.platform_sku ILIKE $${likeIdx} OR sp.platform_item_id ILIKE $${likeIdx})`,
      );
    }
  }

  params.push(limit);
  const limitIdx = params.length;

  const orderBy =
    searchField === 'title'
      ? 'sp.display_name ASC NULLS LAST'
      : q
        ? `CASE WHEN UPPER(sp.platform_sku) = UPPER($${params.length + 1}) THEN 0 ELSE 1 END, sp.display_name ASC NULLS LAST`
        : 'sp.display_name ASC NULLS LAST';

  if (searchField === 'ecwid_sku' && q) {
    params.push(q);
  }

  const sql = `SELECT
       sp.id,
       sp.platform_sku AS sku,
       sc.sku AS zoho_sku,
       COALESCE(sp.display_name, sp.platform_sku) AS product_title,
       sc.category,
       sc.upc,
       sp.image_url,
       true AS is_active,
       json_build_array(
         json_build_object(
           'platform', sp.platform,
           'platform_sku', sp.platform_sku,
           'platform_item_id', sp.platform_item_id,
           'account_name', sp.account_name
         )
       ) AS platform_ids
     FROM sku_platform_ids sp
     LEFT JOIN sku_catalog sc
       ON (sc.id = sp.sku_catalog_id OR sc.sku = sp.platform_sku)${orgId ? ' AND sc.organization_id = sp.organization_id' : ''}
     WHERE ${filterClauses.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${limitIdx}`;
  const result = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);

  return {
    success: true,
    items: result.rows.map((r) => ({
      ...r,
      platform_ids:
        typeof r.platform_ids === 'string'
          ? JSON.parse(r.platform_ids)
          : r.platform_ids,
    })),
  };
}

/** Zoho-only catalog search sourced straight from the Zoho `items` mirror — the authoritative Zoho Inventory table (synced from /api/v1/items). */
async function searchFromZohoCatalog(
  q: string,
  excludeSkuSuffix: string,
  limit: number,
  orgId?: OrgId,
) {
  // INNER JOIN sku_catalog only to borrow its numeric id (the popover keys on a
  // numeric id); titles/SKUs/item_id come from `items` (Zoho source of truth).
  const filterClauses: string[] = [
    "i.status = 'active'",
    "i.sku IS NOT NULL",
    "BTRIM(i.sku) <> ''",
  ];
  const params: unknown[] = [];

  if (orgId) {
    params.push(orgId);
    filterClauses.push(`sc.organization_id = $${params.length}`);
  }

  if (excludeSkuSuffix) {
    params.push(`%${escapeLike(excludeSkuSuffix)}`);
    filterClauses.push(`BTRIM(i.sku) NOT ILIKE $${params.length}`);
  }

  let exactIdx: number | null = null;
  if (q) {
    // escapeLike, like every other branch in this file: an operator pasting a
    // SKU that contains `_` or `%` was silently searching a wildcard.
    params.push(`%${escapeLike(q)}%`);
    const likeIdx = params.length;
    params.push(q);
    exactIdx = params.length;
    filterClauses.push(`(i.sku ILIKE $${likeIdx} OR i.name ILIKE $${likeIdx})`);
  }

  params.push(limit);
  const limitIdx = params.length;

  const orderBy = exactIdx
    ? `CASE WHEN UPPER(MAX(BTRIM(i.sku))) = UPPER($${exactIdx}) THEN 0 ELSE 1 END, MAX(i.name) ASC`
    : 'MAX(i.name) ASC';

  const sql = `SELECT
       sc.id,
       MAX(BTRIM(i.sku))      AS sku,
       MAX(BTRIM(i.sku))      AS zoho_sku,
       MAX(i.name)            AS product_title,
       MAX(i.zoho_item_id)    AS zoho_item_id,
       bool_or(sc.provider_item_id IS NOT NULL) AS provider_linked,
       MAX(sc.category)       AS category,
       MAX(i.upc)             AS upc,
       -- Zoho item photo only, served through our proxy when the Zoho item has an
       -- image_document_id. Do NOT fall back to sc.image_url: sku_catalog uses an
       -- independent SKU numbering, so its image belongs to a DIFFERENT product
       -- that merely shares the SKU string (and is usually the Ecwid image). A
       -- missing Zoho photo shows the placeholder, never the wrong product's.
       CASE
         WHEN NULLIF(MAX(i.image_document_id), '') IS NOT NULL
           THEN '/api/zoho/items/' || MAX(i.zoho_item_id) || '/image'
         ELSE NULLIF(MAX(i.image_url), '')
       END AS image_url,
       bool_or(sc.is_active)  AS is_active
     FROM items i
     JOIN sku_catalog sc
       ON (
            sc.provider_item_id = i.zoho_item_id
            OR (sc.provider_item_id IS NULL AND sc.sku = BTRIM(i.sku))
          )${orgId ? '\n        AND sc.organization_id = i.organization_id' : ''}
     WHERE ${filterClauses.join(' AND ')}
     GROUP BY sc.id
     ORDER BY ${orderBy}
     LIMIT $${limitIdx}`;
  const result = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);

  return {
    success: true,
    items: result.rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      zoho_sku: r.zoho_sku,
      product_title: r.product_title,
      zoho_item_id: r.zoho_item_id,
      provider_linked: r.provider_linked,
      category: r.category,
      upc: r.upc,
      image_url: r.image_url,
      is_active: r.is_active,
      // Tag with the Zoho platform only — these come from the Zoho items mirror.
      platform_ids: [
        {
          platform: 'zoho',
          platform_sku: r.sku,
          platform_item_id: r.zoho_item_id,
          account_name: null,
        },
      ],
    })),
  };
}

/** SKUs that have at least one QC check step directly linked (qc_check_templates.sku_catalog_id = sc.id). */
async function searchSkusWithQcChecks(q: string, limit: number, orgId?: OrgId) {
  const params: unknown[] = [];
  // No is_active filter here:
  const filterClauses: string[] = [
    'EXISTS (SELECT 1 FROM qc_check_templates qc WHERE qc.sku_catalog_id = sc.id)',
  ];

  if (orgId) {
    params.push(orgId);
    filterClauses.push(`sc.organization_id = $${params.length}`);
  }

  let exactIdx: number | null = null;
  if (q) {
    params.push(`%${q}%`);
    const likeIdx = params.length;
    params.push(q);
    exactIdx = params.length;
    filterClauses.push(`(sc.sku ILIKE $${likeIdx} OR sc.product_title ILIKE $${likeIdx})`);
  }

  params.push(limit);
  const limitIdx = params.length;

  const orderBy = exactIdx
    ? `CASE WHEN UPPER(sc.sku) = UPPER($${exactIdx}) THEN 0 ELSE 1 END, sc.product_title ASC`
    : 'sc.product_title ASC';

  const sql = `SELECT
       sc.id,
       sc.sku,
       sc.sku AS zoho_sku,
       COALESCE(sp_ecwid.display_name, sc.product_title) AS product_title,
       sc.category,
       sc.upc,
       COALESCE(sp_ecwid.image_url, sc.image_url) AS image_url,
       sc.is_active
     FROM sku_catalog sc
     LEFT JOIN LATERAL (
       SELECT image_url, display_name
       FROM sku_platform_ids
       WHERE (sku_catalog_id = sc.id OR platform_sku = sc.sku)
         AND platform = 'ecwid'
         AND is_active = true${orgId ? '\n         AND organization_id = sc.organization_id' : ''}
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1
     ) sp_ecwid ON TRUE
     WHERE ${filterClauses.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${limitIdx}`;
  const result = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);

  return { success: true, items: result.rows };
}

async function searchFromCatalog(
  q: string,
  category: string,
  ecwidOnly: boolean,
  excludeSkuSuffix: string,
  limit: number,
  orgId?: OrgId,
  matchTitle = false,
) {
  const filterClauses: string[] = ['sc.is_active = true'];
  const params: unknown[] = [];

  if (orgId) {
    params.push(orgId);
    filterClauses.push(`sc.organization_id = $${params.length}`);
  }

  if (ecwidOnly) {
    filterClauses.push(
      `EXISTS (
         SELECT 1 FROM sku_platform_ids spx
         WHERE (spx.sku_catalog_id = sc.id OR spx.platform_sku = sc.sku)
           AND spx.platform = 'ecwid'
           AND spx.is_active = true
       )`,
    );
  }

  if (excludeSkuSuffix) {
    params.push(`%${escapeLike(excludeSkuSuffix)}`);
    filterClauses.push(`sc.sku NOT ILIKE $${params.length}`);
  }

  // Rank: exact SKU, then an exact identifier (UPC / EAN / GTIN / MPN /
  // platform id / external id such as ASIN or FNSKU), then the rest by title.
  let rankSql = '0';
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    const likeIdx = params.length;
    params.push(q);
    const exactIdx = params.length;
    const like = `$${likeIdx}`;
    const exact = `UPPER($${exactIdx})`;
    filterClauses.push(
      matchTitle
        ? `(sc.sku ILIKE ${like}
            OR sc.product_title ILIKE ${like}
            OR sc.upc ILIKE ${like}
            OR sc.ean ILIKE ${like}
            OR sc.gtin ILIKE ${like}
            OR sc.mpn ILIKE ${like}
            OR EXISTS (
              SELECT 1 FROM sku_platform_ids spi_search
               WHERE spi_search.organization_id = sc.organization_id
                 AND (spi_search.sku_catalog_id = sc.id OR spi_search.platform_sku = sc.sku)
                 AND (spi_search.platform_item_id ILIKE ${like} OR spi_search.platform_sku ILIKE ${like})
            )
            OR EXISTS (
              SELECT 1 FROM catalog_external_ids external_id
               WHERE external_id.organization_id = sc.organization_id
                 AND external_id.sku_catalog_id = sc.id
                 AND (
                   external_id.external_id ILIKE ${like}
                   OR external_id.external_sku ILIKE ${like}
                   OR external_id.external_name ILIKE ${like}
                 )
            ))`
        : `sc.sku ILIKE ${like}`,
    );
    rankSql = matchTitle
      ? `CASE
           WHEN UPPER(BTRIM(sc.sku)) = ${exact} THEN 0
           WHEN UPPER(BTRIM(sc.upc)) = ${exact}
             OR UPPER(BTRIM(sc.ean)) = ${exact}
             OR UPPER(BTRIM(sc.gtin)) = ${exact}
             OR UPPER(BTRIM(sc.mpn)) = ${exact}
             OR EXISTS (
               SELECT 1 FROM sku_platform_ids spi_exact
                WHERE spi_exact.organization_id = sc.organization_id
                  AND (spi_exact.sku_catalog_id = sc.id OR spi_exact.platform_sku = sc.sku)
                  AND (UPPER(BTRIM(spi_exact.platform_item_id)) = ${exact}
                       OR UPPER(BTRIM(spi_exact.platform_sku)) = ${exact})
             )
             OR EXISTS (
               SELECT 1 FROM catalog_external_ids external_exact
                WHERE external_exact.organization_id = sc.organization_id
                  AND external_exact.sku_catalog_id = sc.id
                  AND (UPPER(BTRIM(external_exact.external_id)) = ${exact}
                       OR UPPER(BTRIM(external_exact.external_sku)) = ${exact})
             ) THEN 1
           ELSE 2
         END`
      : `CASE WHEN UPPER(sc.sku) = ${exact} THEN 0 ELSE 1 END`;
  }

  if (category) {
    params.push(category);
    filterClauses.push(`sc.category = $${params.length}`);
  }

  params.push(limit);
  const limitIdx = params.length;

  // Rank + LIMIT first; the photo, the ecwid row and the platform ids are
  // resolved only for the returned rows.
  const sql = `WITH hits AS (
       SELECT sc.id, ${rankSql} AS match_rank
         FROM sku_catalog sc
        WHERE ${filterClauses.join(' AND ')}
        ORDER BY match_rank, sc.product_title ASC
        LIMIT $${limitIdx}
     )
     SELECT
       sc.id,
       sc.sku,
       sc.sku AS zoho_sku,
       COALESCE(sp_ecwid.display_name, sc.product_title) AS product_title,
       sc.category,
       sc.upc,
       COALESCE(${skuCatalogImageUrlSql('sc')}, sp_ecwid.image_url) AS image_url,
       sc.is_active,
       COALESCE(platforms.platform_ids, '[]'::json) AS platform_ids
     FROM hits
     JOIN sku_catalog sc ON sc.id = hits.id${orgId ? ' AND sc.organization_id = $1' : ''}
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'platform', sp.platform,
                  'platform_sku', sp.platform_sku,
                  'platform_item_id', sp.platform_item_id,
                  'account_name', sp.account_name
                )
              ) AS platform_ids
         FROM sku_platform_ids sp
        WHERE (sp.sku_catalog_id = sc.id OR sp.platform_sku = sc.sku)
          AND sp.is_active = true${orgId ? '\n          AND sp.organization_id = sc.organization_id' : ''}
     ) platforms ON TRUE
     LEFT JOIN LATERAL (
       SELECT image_url, display_name
       FROM sku_platform_ids
       WHERE (sku_catalog_id = sc.id OR platform_sku = sc.sku)
         AND platform = 'ecwid'
         AND is_active = true${orgId ? '\n         AND organization_id = sc.organization_id' : ''}
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1
     ) sp_ecwid ON TRUE
     ORDER BY hits.match_rank, sc.product_title ASC`;
  const result = orgId
    ? await tenantQuery(orgId, sql, params)
    : await pool.query(sql, params);

  return {
    success: true,
    items: result.rows.map((r) => ({
      ...r,
      platform_ids:
        typeof r.platform_ids === 'string'
          ? JSON.parse(r.platform_ids)
          : r.platform_ids,
    })),
  };
}
