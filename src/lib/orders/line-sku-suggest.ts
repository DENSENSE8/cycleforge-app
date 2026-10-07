import 'server-only';

/**
 * Catalog SKUs an order line with no `sku_catalog_id` most likely is — the
 * docs popover's "Is this SKU 00822?" (operator 2026-10-06: always suggest,
 * the operator confirms; nothing links on its own).
 *
 * Ranking: a part number in the line's title (`360148-0010`) found in a
 * catalog SKU / title / MPN first, then title similarity (pg_trgm). Confirming
 * goes through {@link confirmLineSku}: the line gets the SKU, and a line with
 * an item number teaches `sku_platform_ids` (`batchPair`) so the next order of
 * that listing resolves on ingest.
 */

import { batchPair } from '@/lib/neon/pairing-queries';
import { accountSourceFromOrderId } from '@/lib/orders/account-source';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { orderStorefront, resolveListingLink } from '@/utils/external-item-url';
import { orderPlatformSlugSql, storedListingsSql, toStoredListings } from './line-listing-sql';
import { titlePartNumbers, type LineSkuSuggestion, type LineSkuSuggestions } from './line-sku-suggest-contracts';

export const MAX_LINE_SKU_SUGGESTIONS = 5;

/** Title similarity below this is noise, not a suggestion. */
const MIN_TITLE_SIMILARITY = 0.3;

interface LineFacts {
  id: number;
  order_ref: string;
  title: string;
  item_number: string | null;
  account_source: string | null;
  platform_slug: string | null;
  sku_catalog_id: number | null;
}

async function readLine(orgId: OrgId, lineId: number): Promise<LineFacts | null> {
  const { rows } = await tenantQuery<LineFacts>(
    orgId,
    `SELECT o.id, o.order_id AS order_ref, COALESCE(NULLIF(BTRIM(o.product_title), ''), '') AS title,
            NULLIF(BTRIM(o.item_number), '') AS item_number, NULLIF(BTRIM(o.account_source), '') AS account_source,
            ${orderPlatformSlugSql('o', '$1')} AS platform_slug, o.sku_catalog_id
       FROM orders o
      WHERE o.organization_id = $1 AND o.id = $2`,
    [orgId, lineId],
  );
  return rows[0] ?? null;
}

export async function suggestLineSkus(orgId: OrgId, lineId: number): Promise<LineSkuSuggestions | null> {
  const line = await readLine(orgId, lineId);
  if (!line) return null;
  const storefront = orderStorefront(line.order_ref, line.platform_slug ?? line.account_source);
  const parts = titlePartNumbers(line.title);
  if (!line.title && parts.length === 0) return { lineId, linkedSkuCatalogId: line.sku_catalog_id, storefront, suggestions: [] };

  const { rows } = await tenantQuery<{ id: number; sku: string; title: string; image_url: string | null; part: string | null; sim: number; stored: unknown }>(
    orgId,
    `WITH cand AS (
       SELECT sc.id, sc.sku, sc.product_title AS title, NULLIF(BTRIM(sc.image_url), '') AS image_url,
              (SELECT p FROM unnest($3::text[]) p
                WHERE UPPER(sc.sku) = p OR UPPER(COALESCE(sc.mpn, '')) = p OR UPPER(COALESCE(sc.product_title, '')) LIKE '%' || p || '%'
                LIMIT 1) AS part,
              similarity(LOWER(COALESCE(sc.product_title, '')), LOWER($2)) AS sim
         FROM sku_catalog sc
        WHERE sc.organization_id = $1
          AND COALESCE(sc.is_active, true)
          AND NULLIF(BTRIM(sc.sku), '') IS NOT NULL
          AND (
            EXISTS (SELECT 1 FROM unnest($3::text[]) p
                     WHERE UPPER(sc.sku) = p OR UPPER(COALESCE(sc.mpn, '')) = p OR UPPER(COALESCE(sc.product_title, '')) LIKE '%' || p || '%')
            OR ($2 <> '' AND similarity(LOWER(COALESCE(sc.product_title, '')), LOWER($2)) >= $4)
          )
     )
     SELECT cand.*, ${storedListingsSql('$1', { itemNumber: 'NULL::text', skuCatalogId: 'cand.id', sku: 'cand.sku' })} AS stored
       FROM cand ORDER BY (part IS NOT NULL) DESC, sim DESC, id LIMIT $5`,
    [orgId, line.title, parts, MIN_TITLE_SIMILARITY, MAX_LINE_SKU_SUGGESTIONS],
  );

  const suggestions: LineSkuSuggestion[] = rows.map((row) => ({
    skuCatalogId: Number(row.id),
    sku: row.sku,
    title: row.title ?? '',
    imageUrl: row.image_url,
    reason: row.part ? { kind: 'part_number', value: row.part } : { kind: 'title', value: `${Math.round(Number(row.sim) * 100)}%` },
    listing: resolveListingLink({ storefront, stored: toStoredListings(row.stored) }),
  }));
  return { lineId, linkedSkuCatalogId: line.sku_catalog_id, storefront, suggestions };
}

export class LineSkuConfirmError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Give the line its catalog SKU; a line carrying a marketplace item number
 * also teaches the listing → SKU mapping (and `batchPair` backfills every
 * other order of that listing).
 */
export async function confirmLineSku(
  orgId: OrgId,
  input: { lineId: number; skuCatalogId: number; staffId: number | null },
): Promise<{ sku: string; learned: boolean; ordersBackfilled: number }> {
  const line = await readLine(orgId, input.lineId);
  if (!line) throw new LineSkuConfirmError('Order line not found', 404);

  const sku = await withTenantTransaction(orgId, async (client) => {
    const catalog = await client.query<{ sku: string }>(
      `SELECT sku FROM sku_catalog WHERE organization_id = $1 AND id = $2`,
      [orgId, input.skuCatalogId],
    );
    const row = catalog.rows[0];
    if (!row) throw new LineSkuConfirmError('That SKU is not in the catalog', 404);
    await client.query(
      `UPDATE orders SET sku = $3, sku_catalog_id = $2 WHERE organization_id = $1 AND id = $4`,
      [orgId, input.skuCatalogId, row.sku, input.lineId],
    );
    return row.sku;
  });

  if (!line.item_number || input.staffId == null) return { sku, learned: false, ordersBackfilled: 0 };
  const platform = accountSourceFromOrderId(line.order_ref) ?? line.account_source ?? 'unknown';
  const result = await batchPair({
    skuCatalogId: input.skuCatalogId,
    organizationId: orgId,
    actorId: input.staffId,
    actorKind: 'user',
    accept: [
      {
        platform,
        platformItemId: line.item_number,
        listingTitle: line.title || null,
        // The listing the item number builds (eBay /itm, Amazon /dp) — never overwrites a stored one.
        listingUrl: resolveListingLink({ storefront: orderStorefront(line.order_ref, line.platform_slug ?? line.account_source), itemNumber: line.item_number }).href,
        reason: 'docs_popover_confirm',
      },
    ],
    reject: [],
  });
  return { sku, learned: true, ordersBackfilled: result.ordersBackfilled };
}
