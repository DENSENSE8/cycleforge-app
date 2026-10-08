import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import type { QcFnskuCandidate } from '@/lib/qc/fnsku-pairing';

/** Words a title search keeps: ≥ 3 chars, at most this many (the distinctive head of a title). */
const TITLE_WORDS_MAX = 5;

/**
 * GET /api/qc/fnsku-candidates — the /test dock's FNSKU resolution.
 *
 * - `sku_catalog_id` alone: every active FNSKU paired to the inventory SKU
 *   (indexed), with the house grade each is paired at — the Pass path.
 * - `q`: free search over FNSKU / ASIN / SKU prefixes and title text.
 * - `title`: the line's product title, split into words that must ALL appear
 *   in `product_title` — the popover's automatic search when nothing is
 *   paired yet.
 * With a search term the SKU's own rows still ride along (a UNION, never an
 * intersection), ranked first.
 */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const params = request.nextUrl.searchParams;
  const skuCatalogIdRaw = params.get('sku_catalog_id');
  const skuCatalogId = skuCatalogIdRaw != null && skuCatalogIdRaw !== '' ? Number(skuCatalogIdRaw) : null;
  if (skuCatalogId != null && (!Number.isInteger(skuCatalogId) || skuCatalogId <= 0)) {
    return NextResponse.json({ ok: false, error: 'invalid sku_catalog_id' }, { status: 400 });
  }
  const q = (params.get('q') ?? '').trim() || null;
  const titleWords = (params.get('title') ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3)
    .slice(0, TITLE_WORDS_MAX);
  const searching = q != null || titleWords.length > 0;
  if (skuCatalogId == null && !searching) {
    return NextResponse.json({ ok: true, candidates: [] });
  }

  const rows = await tenantQuery<QcFnskuCandidate>(
    ctx.organizationId,
    `SELECT fnsku, product_title, asin, sku, condition, label_mark,
            sku_catalog_id AS paired_to,
            paired_condition_grade::text AS paired_grade
       FROM fba_fnskus
      WHERE organization_id = $1
        AND is_active
        AND (
          ($2::int IS NOT NULL AND sku_catalog_id = $2)
          OR ($3::text IS NOT NULL AND (
                fnsku ILIKE $3 || '%'
             OR asin ILIKE $3 || '%'
             OR sku ILIKE '%' || $3 || '%'
             OR product_title ILIKE '%' || $3 || '%'))
          OR (cardinality($4::text[]) > 0 AND NOT EXISTS (
                SELECT 1 FROM unnest($4::text[]) AS w
                 WHERE product_title NOT ILIKE '%' || w || '%'))
        )
      ORDER BY (sku_catalog_id = $2) DESC NULLS LAST, updated_at DESC
      LIMIT 40`,
    [ctx.organizationId, skuCatalogId, q, titleWords],
  );

  return NextResponse.json({ ok: true, candidates: rows.rows });
}, { permission: 'tech.qc_pass' });
