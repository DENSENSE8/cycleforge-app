/**
 * Review · Catalog link chores — enqueue on sheet-import catalog miss,
 * list/ignore/link for `/review?mode=catalog-link`.
 *
 * Only rows explicitly upserted here appear in the queue (no historical orphan scan).
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { batchPair } from '@/lib/neon/pairing-queries';
import { invalidateCacheTags } from '@/lib/cache/upstash-cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import {
  detectListingPlatform,
} from '@/lib/inventory/order-catalog-link-chore-gates';
import type {
  CatalogLinkChoreRow,
  CatalogLinkChoreStatus,
} from '@/features/review/catalog-link/types';

export type EnqueueCatalogLinkChoreInput = {
  itemNumber: string;
  accountSource?: string | null;
  productTitle?: string | null;
  sku?: string | null;
  /** How many orders in this import touch this listing (default 1). */
  bumpBy?: number;
};

async function ensureUnpairedPlatformListing(
  orgId: OrgId,
  params: {
    itemNumber: string;
    accountSource?: string | null;
    orderId?: string | null;
    productTitle?: string | null;
    sku?: string | null;
  },
): Promise<void> {
  const itemNumber = params.itemNumber.trim();
  if (!itemNumber) return;

  const platform = detectListingPlatform(params.accountSource, params.orderId);
  const accountName = (params.accountSource || '').trim() || null;
  const listingTitle = (params.productTitle || '').trim() || null;
  const platformSku = (params.sku || '').trim() || null;

  const existing = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT id FROM sku_platform_ids
     WHERE organization_id = $1
       AND platform = $2
       AND platform_item_id = $3
       AND COALESCE(account_name, '') = COALESCE($4, '')
     LIMIT 1`,
    [orgId, platform, itemNumber, accountName],
  );

  if (existing.rows[0]) {
    // platform_sku is a resolution hint, not listing identity. The tenant-blind
    // ux_sku_platform_ids_platform_sku unique index that forbade multi-list fills
    // was dropped in 2026-07-29f_sku_platform_ids_tenant_contract.sql.
    await tenantQuery(
      orgId,
      `UPDATE sku_platform_ids t
       SET listing_title = COALESCE(NULLIF($1, ''), listing_title),
           platform_sku = COALESCE(t.platform_sku, $2),
           is_active = true,
           display_name = COALESCE(NULLIF($1, ''), display_name)
       WHERE t.id = $3 AND t.organization_id = $4`,
      [listingTitle, platformSku, existing.rows[0].id, orgId],
    );
    return;
  }

  // DO NOTHING matches every sibling writer (pairing-queries, sync-ecwid-products).
  await tenantQuery(
    orgId,
    `INSERT INTO sku_platform_ids
       (sku_catalog_id, platform, platform_sku, platform_item_id, account_name,
        listing_title, display_name, is_active, organization_id)
     VALUES (NULL, $1, $2, $3, $4, $5, $5, true, $6)
     ON CONFLICT DO NOTHING`,
    [platform, platformSku, itemNumber, accountName, listingTitle, orgId],
  );
}

/**
 * Upsert an open chore for this listing. Re-imports bump order_count / last_seen
 * and re-open ignored chores when the listing appears again unmatched.
 */
async function upsertCatalogLinkChore(
  orgId: OrgId,
  input: EnqueueCatalogLinkChoreInput,
): Promise<void> {
  const itemNumber = input.itemNumber.trim();
  if (!itemNumber) return;

  const accountSource = (input.accountSource || '').trim();
  const productTitle = (input.productTitle || '').trim() || null;
  const sku = (input.sku || '').trim() || null;
  const bumpBy = Math.max(1, Math.floor(input.bumpBy ?? 1));

  await tenantQuery(
    orgId,
    `INSERT INTO order_catalog_link_chores
       (organization_id, item_number, account_source, product_title, sku,
        status, order_count, first_seen_at, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'open', $6, now(), now(), now())
     ON CONFLICT (organization_id, item_number, account_source)
     DO UPDATE SET
       product_title = COALESCE(EXCLUDED.product_title, order_catalog_link_chores.product_title),
       sku = COALESCE(EXCLUDED.sku, order_catalog_link_chores.sku),
       status = 'open',
       order_count = order_catalog_link_chores.order_count + EXCLUDED.order_count,
       last_seen_at = now(),
       ignored_at = NULL,
       updated_at = now()`,
    [orgId, itemNumber, accountSource, productTitle, sku, bumpBy],
  );
}

/** Batch enqueue: unpaired platform row + chore per distinct listing. */
export async function enqueueCatalogLinkChoresForImport(
  orgId: OrgId,
  chores: EnqueueCatalogLinkChoreInput[],
): Promise<number> {
  if (chores.length === 0) return 0;

  const merged = new Map<string, EnqueueCatalogLinkChoreInput>();
  for (const chore of chores) {
    const itemNumber = chore.itemNumber.trim();
    if (!itemNumber) continue;
    const accountSource = (chore.accountSource || '').trim();
    const key = `${accountSource}::${itemNumber}`;
    const prev = merged.get(key);
    if (prev) {
      prev.bumpBy = (prev.bumpBy ?? 1) + (chore.bumpBy ?? 1);
      prev.productTitle = prev.productTitle || chore.productTitle;
      prev.sku = prev.sku || chore.sku;
    } else {
      merged.set(key, {
        itemNumber,
        accountSource,
        productTitle: chore.productTitle,
        sku: chore.sku,
        bumpBy: chore.bumpBy ?? 1,
      });
    }
  }

  for (const chore of merged.values()) {
    await ensureUnpairedPlatformListing(orgId, {
      itemNumber: chore.itemNumber,
      accountSource: chore.accountSource,
      productTitle: chore.productTitle,
      sku: chore.sku,
    });
    await upsertCatalogLinkChore(orgId, chore);
  }

  return merged.size;
}

export async function listOpenCatalogLinkChores(
  orgId: OrgId,
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<{ rows: CatalogLinkChoreRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const q = (opts.q || '').trim();

  const params: (string | number)[] = [orgId, limit, offset];
  let searchClause = '';
  if (q) {
    params.push(`%${q}%`);
    searchClause = `AND (item_number ILIKE $4 OR product_title ILIKE $4 OR sku ILIKE $4 OR account_source ILIKE $4)`;
  }

  const result = await tenantQuery<{
    id: number;
    item_number: string;
    account_source: string;
    product_title: string | null;
    sku: string | null;
    status: string;
    sku_catalog_id: number | null;
    order_count: number;
    first_seen_at: Date;
    last_seen_at: Date;
  }>(
    orgId,
    `SELECT id, item_number, account_source, product_title, sku, status,
            sku_catalog_id, order_count, first_seen_at, last_seen_at
       FROM order_catalog_link_chores
      WHERE organization_id = $1
        AND status = 'open'
        ${searchClause}
      ORDER BY order_count DESC, last_seen_at DESC
      LIMIT $2 OFFSET $3`,
    params,
  );

  const countParams: (string | number)[] = [orgId];
  let countSearch = '';
  if (q) {
    countParams.push(`%${q}%`);
    countSearch = `AND (item_number ILIKE $2 OR product_title ILIKE $2 OR sku ILIKE $2 OR account_source ILIKE $2)`;
  }
  const countResult = await tenantQuery<{ total: number }>(
    orgId,
    `SELECT COUNT(*)::int AS total
       FROM order_catalog_link_chores
      WHERE organization_id = $1 AND status = 'open' ${countSearch}`,
    countParams,
  );

  return {
    rows: result.rows.map((r) => ({
      id: Number(r.id),
      itemNumber: r.item_number,
      accountSource: r.account_source,
      productTitle: r.product_title,
      sku: r.sku,
      status: r.status as CatalogLinkChoreStatus,
      skuCatalogId: r.sku_catalog_id,
      orderCount: Number(r.order_count),
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    })),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

export async function ignoreCatalogLinkChore(
  orgId: OrgId,
  choreId: number,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const result = await tenantQuery(
    orgId,
    `UPDATE order_catalog_link_chores
        SET status = 'ignored',
            ignored_at = now(),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND status = 'open'
      RETURNING id`,
    [choreId, orgId],
  );
  if (!result.rows[0]) {
    return { ok: false, error: 'Chore not found or not open', status: 404 };
  }
  return { ok: true };
}

export async function linkCatalogLinkChore(
  orgId: OrgId,
  params: {
    choreId: number;
    skuCatalogId: number;
    staffId: number | null;
  },
): Promise<
  | { ok: true; ordersBackfilled: number; manualsBackfilled: number }
  | { ok: false; error: string; status: number }
> {
  const choreResult = await tenantQuery<{
    id: number;
    item_number: string;
    account_source: string;
    status: string;
  }>(
    orgId,
    `SELECT id, item_number, account_source, status
       FROM order_catalog_link_chores
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [params.choreId, orgId],
  );
  const chore = choreResult.rows[0];
  if (!chore) return { ok: false, error: 'Chore not found', status: 404 };
  if (chore.status !== 'open') {
    return { ok: false, error: 'Chore is not open', status: 409 };
  }

  const platform = detectListingPlatform(chore.account_source);
  const accountName = chore.account_source.trim() || null;

  const pairResult = await batchPair({
    skuCatalogId: params.skuCatalogId,
    organizationId: orgId,
    actorId: params.staffId ?? 0,
    actorKind: 'user',
    accept: [
      {
        platform,
        platformItemId: chore.item_number,
        accountName,
        reason: 'review_catalog_link',
      },
    ],
    reject: [],
  });

  await withTenantTransaction(orgId, async (client) => {
    await client.query(
      `UPDATE order_catalog_link_chores
          SET status = 'linked',
              sku_catalog_id = $1,
              linked_at = now(),
              updated_at = now()
        WHERE id = $2
          AND organization_id = $3`,
      [params.skuCatalogId, params.choreId, orgId],
    );
  });

  await invalidateCacheTags(orgId, [CACHE_TAGS.orders, CACHE_TAGS.skuCatalog]).catch(() => {});

  return {
    ok: true,
    ordersBackfilled: pairResult.ordersBackfilled,
    manualsBackfilled: pairResult.manualsBackfilled,
  };
}
