/**
 * Single-order Amazon SP-API refresh — pull getOrderItems and stamp ASIN onto
 * `orders.item_number` (plus title/SKU when still empty). Used by the Product
 * tab when listing identity is missing; not the bulk watermark sync.
 */
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrderItems, type AmazonAccount, type AmazonOrderItem } from './client';
import { loadActiveAmazonAccounts, loadAmazonCreds } from './accounts';
import {
  asinFromOrderItems,
  isAmazonOrderForItemRefresh,
  skuFromOrderItems,
  titleFromOrderItems,
} from './order-item-refresh-shared';

type AmazonOrderItemRefreshResult =
  | {
      ok: true;
      orderDbId: number;
      amazonOrderId: string;
      itemNumber: string;
      productTitle: string | null;
      sku: string | null;
      updated: { itemNumber: boolean; productTitle: boolean; sku: boolean };
    }
  | {
      ok: false;
      error: string;
      code: 'not_found' | 'not_amazon' | 'no_account' | 'no_asin' | 'sp_api' | 'no_order_id';
    };

function rankAccounts(
  accounts: AmazonAccount[],
  accountSource: string | null,
): AmazonAccount[] {
  const src = String(accountSource || '').trim().toLowerCase();
  if (!src || accounts.length <= 1) return accounts;
  return [...accounts].sort((a, b) => {
    const aName = a.accountName.toLowerCase();
    const bName = b.accountName.toLowerCase();
    const aExact = aName === src ? 0 : src.includes(aName) || aName.includes(src) ? 1 : 2;
    const bExact = bName === src ? 0 : src.includes(bName) || bName.includes(src) ? 1 : 2;
    return aExact - bExact;
  });
}

/**
 * Re-fetch Amazon order line items and fill missing local listing identity.
 * Only writes empty fields (never overwrites a non-empty item_number/title/sku).
 */
export async function refreshAmazonOrderItemFacts(
  orgId: OrgId,
  orderDbId: number,
): Promise<AmazonOrderItemRefreshResult> {
  const row = await withTenantConnection(orgId, async (client) => {
    const res = await client.query<{
      id: number;
      order_id: string | null;
      account_source: string | null;
      item_number: string | null;
      product_title: string | null;
      sku: string | null;
    }>(
      `SELECT id, order_id, account_source, item_number, product_title, sku
         FROM orders
        WHERE id = $1 AND organization_id = $2
        LIMIT 1`,
      [orderDbId, orgId],
    );
    return res.rows[0] ?? null;
  });

  if (!row) {
    return { ok: false, error: 'Order not found', code: 'not_found' };
  }

  const amazonOrderId = String(row.order_id || '').trim();
  if (!amazonOrderId) {
    return { ok: false, error: 'Order has no marketplace order id', code: 'no_order_id' };
  }
  if (!isAmazonOrderForItemRefresh(amazonOrderId, row.account_source)) {
    return { ok: false, error: 'Not an Amazon order', code: 'not_amazon' };
  }

  const accounts = rankAccounts(await loadActiveAmazonAccounts(orgId), row.account_source);
  if (accounts.length === 0) {
    return { ok: false, error: 'No connected Amazon account', code: 'no_account' };
  }

  let items: AmazonOrderItem[] | null = null;
  let lastError = '';
  for (const account of accounts) {
    const creds = await loadAmazonCreds(orgId, account);
    if (!creds?.refreshToken) continue;
    try {
      items = await getOrderItems(account, creds, amazonOrderId);
      if (items.length > 0) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!items || items.length === 0) {
    return {
      ok: false,
      error: lastError || 'Amazon returned no line items for this order',
      code: 'sp_api',
    };
  }

  const asin = asinFromOrderItems(items);
  if (!asin) {
    return { ok: false, error: 'Amazon line items have no ASIN', code: 'no_asin' };
  }

  const nextTitle = titleFromOrderItems(items);
  const nextSku = skuFromOrderItems(items);
  const hadItemNumber = Boolean(String(row.item_number || '').trim());
  const hadTitle = Boolean(String(row.product_title || '').trim());
  const hadSku = Boolean(String(row.sku || '').trim());

  await withTenantConnection(orgId, async (client) => {
    await client.query(
      `UPDATE orders SET
         item_number   = CASE WHEN item_number IS NULL OR TRIM(item_number) = '' THEN $2 ELSE item_number END,
         product_title = CASE
           WHEN (product_title IS NULL OR TRIM(product_title) = '' OR product_title = 'No title')
                AND $3::text IS NOT NULL AND TRIM($3) <> ''
             THEN $3
           ELSE product_title
         END,
         sku           = CASE WHEN sku IS NULL OR TRIM(sku) = '' THEN COALESCE(NULLIF(TRIM($4), ''), sku) ELSE sku END
       WHERE id = $1 AND organization_id = $5`,
      [orderDbId, asin, nextTitle, nextSku, orgId],
    );
  });

  return {
    ok: true,
    orderDbId,
    amazonOrderId,
    itemNumber: hadItemNumber ? String(row.item_number).trim().toUpperCase() : asin,
    productTitle: hadTitle ? row.product_title : nextTitle,
    sku: hadSku ? row.sku : nextSku,
    updated: {
      itemNumber: !hadItemNumber,
      productTitle: !hadTitle && Boolean(nextTitle),
      sku: !hadSku && Boolean(nextSku),
    },
  };
}
