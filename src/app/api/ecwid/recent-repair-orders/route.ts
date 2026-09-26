/** GET /api/ecwid/recent-repair-orders */

import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
// The storefront-link rule is shared with the counter tablet's History face
// (operator 2026-09-23: "full reversibility … a link to the Ecwid website
// via the SKU"). One rule, one module, two callers.
import { repairStorefrontUrl } from '@/lib/repair/repair-storefront-url';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';
const PAGE_LIMIT = 100;
const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_LIMIT = 30;
const REPAIR_SUFFIX = '-RS';

interface EcwidOrderItem {
  productId?: number | string | null;
  sku?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  smallThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  /** Some Ecwid payloads include a permalink to the product page on the storefront. */
  url?: string | null;
  productLink?: string | null;
}

interface EcwidOrder {
  id?: number | string;
  orderNumber?: number | string;
  vendorOrderNumber?: string;
  createDate?: string;
  created?: string;
  date?: string;
  items?: EcwidOrderItem[];
}

interface RepairCandidate {
  /** sku_platform_ids.id — falls back to negative hash of SKU when no catalog row exists. */
  id: number;
  sku: string;
  zoho_sku: string | null;
  product_title: string;
  image_url: string | null;
  platform_ids: Array<{
    platform: string;
    platform_sku: string;
    platform_item_id: string | null;
    account_name: string | null;
  }>;
  order_id: string;
  order_date: string;
  /** Ecwid product page URL, when derivable. Saved as the carton's listing_url when linking. */
  product_url: string | null;
  is_repair_service: boolean;
}


function requiredEnv(primary: string, aliases: string[] = []): string {
  for (const key of [primary, ...aliases]) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  throw new Error(`Missing required environment variable: ${primary}`);
}

function isRepairServiceSku(value: unknown): boolean {
  return String(value || '').trim().toUpperCase().endsWith(REPAIR_SUFFIX);
}

async function fetchEcwidOrdersByKeywords(
  storeId: string,
  token: string,
  keywords: string,
  limit: number,
): Promise<EcwidOrder[]> {
  const url = new URL(`${ECWID_BASE_URL}/${storeId}/orders`);
  url.searchParams.set('keywords', keywords);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), PAGE_LIMIT)));

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ecwid orders API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { items?: EcwidOrder[] };
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchRecentEcwidOrders(
  storeId: string,
  token: string,
  lookbackDays: number,
): Promise<EcwidOrder[]> {
  const createdFrom = new Date(
    Date.now() - lookbackDays * 86_400_000,
  ).toISOString();
  const orders: EcwidOrder[] = [];
  let offset = 0;

  for (let page = 0; page < 20; page++) {
    const url = new URL(`${ECWID_BASE_URL}/${storeId}/orders`);
    url.searchParams.set('createdFrom', createdFrom);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(PAGE_LIMIT));

    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ecwid orders API ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { items?: EcwidOrder[] };
    const items = Array.isArray(data.items) ? data.items : [];
    orders.push(...items);

    if (items.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  return orders;
}

export const GET = withAuth(async (request: NextRequest, ctx) => {
  const url = new URL(request.url);
  const lookbackDays = Math.max(
    1,
    Math.min(
      90,
      Number(url.searchParams.get('lookback_days')) || DEFAULT_LOOKBACK_DAYS,
    ),
  );
  const limit = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get('limit')) || DEFAULT_LIMIT),
  );
  // When set, RELAX the -RS-only filter to also include normal orders, so a carton can be linked to any recent Ecwid order — not just…
  const includeNormal = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('include_normal') ?? '').toLowerCase(),
  );
  const keywords = (url.searchParams.get('q') ?? '').trim().replace(/^#/, '');

  let storeId: string;
  let token: string;
  storeId = requiredEnv('ECWID_STORE_ID', [
    'ECWID_STOREID',
    'ECWID_STORE',
    'NEXT_PUBLIC_ECWID_STORE_ID',
  ]);
  token = requiredEnv('ECWID_API_TOKEN', [
    'ECWID_TOKEN',
    'ECWID_ACCESS_TOKEN',
    'NEXT_PUBLIC_ECWID_API_TOKEN',
  ]);

  let ecwidOrders: EcwidOrder[];
  try {
    // Typed order # / keyword: search Ecwid live (no 30-day window) so an
    // older repair like #4996 is still pairable. Empty q keeps the recent list.
    ecwidOrders =
      keywords.length >= 2
        ? await fetchEcwidOrdersByKeywords(storeId, token, keywords, limit)
        : await fetchRecentEcwidOrders(storeId, token, lookbackDays);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Ecwid orders fetch failed',
      },
      { status: 502 },
    );
  }

  // Walk newest-first; first time we see a SKU wins (= most recent order).
  // Typed `q` floats an exact order-number hit to the top and keys buckets
  // per order so #4996 is not dropped because a newer order shares its SKU.
  const wantOrder = keywords.replace(/^#/, '').toLowerCase();
  ecwidOrders.sort((a, b) => {
    if (wantOrder.length >= 2) {
      const aId = String(a.orderNumber ?? a.id ?? '')
        .trim()
        .replace(/^#/, '')
        .toLowerCase();
      const bId = String(b.orderNumber ?? b.id ?? '')
        .trim()
        .replace(/^#/, '')
        .toLowerCase();
      const aExact = aId === wantOrder ? 0 : 1;
      const bExact = bId === wantOrder ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
    }
    const ad = String(a.createDate ?? a.created ?? a.date ?? '');
    const bd = String(b.createDate ?? b.created ?? b.date ?? '');
    return bd.localeCompare(ad);
  });

  type Bucket = {
    sku: string;
    sku_upper: string;
    name: string;
    image_url: string | null;
    order_id: string;
    order_date: string;
    product_url: string | null;
  };
  const bySku = new Map<string, Bucket>();
  for (const order of ecwidOrders) {
    const orderId = String(order.orderNumber ?? order.id ?? '').trim();
    const orderDate = String(
      order.createDate ?? order.created ?? order.date ?? '',
    );
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const sku = String(item.sku || '').trim();
      if (!sku) continue;
      const orderIsExact =
        wantOrder.length >= 2 &&
        orderId.replace(/^#/, '').toLowerCase() === wantOrder;
      // -RS-only by default; typed exact order # includes every line on that
      // order so a repair without a -RS SKU is still pairable.
      if (!includeNormal && !isRepairServiceSku(sku) && !orderIsExact) continue;
      const upper = sku.toUpperCase();
      const bucketKey = wantOrder.length >= 2 ? `${orderId}::${upper}` : upper;
      if (bySku.has(bucketKey)) continue;
      bySku.set(bucketKey, {
        sku,
        sku_upper: upper,
        name: String(item.name || '').trim() || sku,
        image_url:
          item.imageUrl ||
          item.smallThumbnailUrl ||
          item.thumbnailUrl ||
          null,
        order_id: orderId,
        order_date: orderDate,
        product_url: repairStorefrontUrl(item.sku),
      });
      if (bySku.size >= limit * 3) break; // soft cap: catalog join filters further
    }
    if (bySku.size >= limit * 3) break;
  }

  const skuList = Array.from(bySku.values()).map((b) => b.sku);
  if (skuList.length === 0) {
    return NextResponse.json({ success: true, items: [] });
  }

  // Join into the platform/catalog tables so the response carries the same identifiers the add-unmatched-line endpoint needs…
  const catalogRes = await tenantQuery(
    ctx.organizationId,
    `SELECT
       sp.id,
       sp.platform_sku AS sku,
       sc.sku AS zoho_sku,
       COALESCE(sp.display_name, sp.platform_sku) AS product_title,
       sp.image_url,
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
       ON (sc.id = sp.sku_catalog_id
           OR (sc.sku = sp.platform_sku AND sc.organization_id = sp.organization_id))
     WHERE UPPER(sp.platform_sku) = ANY($1::text[])
       AND sp.organization_id = $2`,
    [skuList.map((s) => s.toUpperCase()), ctx.organizationId],
  );

  const platformRowsBySku = new Map<string, typeof catalogRes.rows[number]>();
  for (const row of catalogRes.rows) {
    const upper = String(row.sku || '').toUpperCase();
    if (!platformRowsBySku.has(upper)) platformRowsBySku.set(upper, row);
  }

  const items: RepairCandidate[] = [];
  for (const bucket of bySku.values()) {
    if (items.length >= limit) break;
    const catalogRow = platformRowsBySku.get(bucket.sku_upper);
    if (catalogRow) {
      items.push({
        id: Number(catalogRow.id),
        sku: String(catalogRow.sku),
        zoho_sku: catalogRow.zoho_sku ?? null,
        product_title:
          String(catalogRow.product_title || bucket.name).trim() || bucket.sku,
        image_url: catalogRow.image_url ?? bucket.image_url,
        platform_ids:
          typeof catalogRow.platform_ids === 'string'
            ? JSON.parse(catalogRow.platform_ids)
            : catalogRow.platform_ids,
        order_id: bucket.order_id,
        order_date: bucket.order_date,
        product_url: bucket.product_url,
        is_repair_service: isRepairServiceSku(bucket.sku),
      });
    } else {
      // SKU exists in Ecwid orders but has no sku_platform_ids row — surface it anyway with a synthetic negative id so the operator can still…
      items.push({
        id: -Math.abs(
          [...bucket.sku_upper].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7),
        ),
        sku: bucket.sku,
        zoho_sku: null,
        product_title: bucket.name,
        image_url: bucket.image_url,
        platform_ids: [],
        order_id: bucket.order_id,
        order_date: bucket.order_date,
        product_url: bucket.product_url,
        is_repair_service: isRepairServiceSku(bucket.sku),
      });
    }
  }

  return NextResponse.json(
    { success: true, items },
    {
      headers: {
        // 60s shared cache — Ecwid orders shift slowly and the operator
        // doesn't need realtime accuracy.
        'Cache-Control': 'private, max-age=60',
      },
    },
  );
});
