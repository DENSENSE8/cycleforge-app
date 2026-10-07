/**
 * Marketplace media backfill — an Amazon/eBay picture for every product on a recent order that has NO photo under `productImageUrl`.
 * Owner TODO 2026-09-24: "Backfill Amazon/eBay images for the past week … Add
 */
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { loadActiveAmazonAccounts, loadAmazonCreds } from '@/lib/amazon/accounts';
import { getCatalogItemImages, pickAmazonCatalogMainImage } from '@/lib/amazon/client';
import { getBrowseAppToken, getEbayItemImageUrl } from '@/lib/ebay/browse-client';
import { amazonValidate } from '@/lib/integrations/connectors/amazon';
import { getShopifyVariantImageUrl, shopifyValidate } from '@/lib/integrations/connectors/shopify';
import { fetchEcwidProductImageUrl, resolveEcwidCreds } from '@/lib/ecwid/client';
import { listConnections } from '@/lib/integrations/connectors/connections';
import { productImageUrl } from './product-image-url';
import { addPhotosToListingInTx } from './listing-photos';
import { attachPhotoWithLegacyUrlInTx } from './service';
import { placedElseImportedSql } from '@/lib/orders/order-dates';

export type MarketplaceProvider = 'amazon' | 'ebay' | 'shopify' | 'ecwid';

const MARKETPLACE_PROVIDERS: readonly MarketplaceProvider[] = ['amazon', 'ebay', 'shopify', 'ecwid'];

/**
 * A listing identifier a provider can answer an image for: Amazon ASIN, eBay
 * legacy item id, Shopify variant SKU, Ecwid product id.
 */
export interface MarketplaceRef {
  provider: MarketplaceProvider;
  id: string;
}

/** The seeded system image type for marketplace gallery photos (2026-06-26b). */
const LISTING_PHOTO_TYPE = 'listing';

/** Amazon standard ASIN (non-book): `B` + 9 alphanumerics. */
const ASIN_RE = /^B[0-9A-Z]{9}$/;
/**
 * eBay legacy ItemID. eBay defines this as a decimal string that callers must
 * be prepared to store at up to 19 digits; older listings can be shorter than
 * today's common 12-digit face. Nine digits avoids mistaking local short refs
 * for listings while retaining legacy inventory.
 */
const EBAY_ITEM_ID_RE = /^\d{9,19}$/;
/** Ecwid product id — a positive integer. */
const ECWID_PRODUCT_ID_RE = /^\d{1,19}$/;
/** Order-number shapes, for ShipStation rows whose account_source names no channel. */
const AMAZON_ORDER_RE = /^\d{3}-\d{7}-\d{7}$/;
const EBAY_ORDER_RE = /^\d{2}-\d{5}-\d{5}$/;

const MARKETPLACE_REPAIR: Record<MarketplaceProvider, string> = {
  amazon:
    'Settings → Integrations → Amazon → Connect: authorize in Seller Central (OAuth) or paste a self-authorized SP-API refresh token + Seller ID. The server must carry the SP-API app LWA credentials (AMAZON_LWA_CLIENT_ID / AMAZON_LWA_CLIENT_SECRET).',
  ebay:
    'The eBay app keyset (App ID / Cert ID — the unscoped eBay vault row, else EBAY_APP_ID / EBAY_CERT_ID) must be accepted by eBay; then Settings → Integrations → eBay → reconnect the account marked Needs attention.',
  shopify: 'Settings → Integrations → Shopify → Connect (Nango), or paste the shop domain + Admin API access token.',
  ecwid: 'Settings → Integrations → Ecwid → paste the store id + API token (or set ECWID_STORE_ID / ECWID_API_TOKEN).',
};

// ─── Rows ────────────────────────────────────────────────────────────────────

/** One recent order with everything the precedence needs about its product. */
export interface OrderImageRow {
  orderId: number;
  orderRef: string | null;
  accountSource: string | null;
  sku: string | null;
  itemNumber: string | null;
  /** Resolved catalog row: the paired FK, else the exact SKU, else the platform-id crosswalk. */
  skuCatalogId: number | null;
  catalogImageUrl: string | null;
  /** Active Zoho item for the SKU, when one exists. */
  zohoItemId: string | null;
  zohoImageDocumentId: string | null;
  zohoImageUrl: string | null;
  /** Photos already in the SKU's listing gallery. */
  galleryCount: number;
  /** Marketplace fallback already linked directly to this order. */
  orderPhotoCount?: number;
  /** Exact line image already persisted by the ShipStation order sync. */
  sourceImageUrl?: string | null;
  /** The catalog row's Amazon/eBay listing ids (`sku_platform_ids`). */
  catalogRefs: MarketplaceRef[];
}

type OrderImageState =
  | 'zoho'
  | 'catalog'
  | 'listing_gallery'
  | 'order_photo'
  | 'zoho_owned_no_photo'
  | 'no_product'
  | 'missing';

/**
 * Where an order's product photo comes from today, or why it has none.
 * Only `missing` is eligible for marketplace media.
 */
function orderImageState(row: OrderImageRow): OrderImageState {
  if (row.zohoItemId) {
    const zohoPhoto =
      productImageUrl({ zohoItemId: row.zohoItemId, zohoImageDocumentId: row.zohoImageDocumentId }) ??
      (String(row.zohoImageUrl ?? '').trim() || null);
    return zohoPhoto ? 'zoho' : 'zoho_owned_no_photo';
  }
  if (row.skuCatalogId == null) return (row.orderPhotoCount ?? 0) > 0 ? 'order_photo' : 'no_product';
  if (String(row.catalogImageUrl ?? '').trim()) return 'catalog';
  // A gallery with any photo is curated (or already backfilled) — never add to it.
  if (row.galleryCount > 0) return 'listing_gallery';
  return 'missing';
}

/** The channel an order came from, by account source, else by order-number shape. */
function orderChannel(accountSource: string | null, orderRef: string | null): MarketplaceProvider | null {
  const source = String(accountSource ?? '').trim().toLowerCase();
  if (source.startsWith('amazon')) return 'amazon';
  if (source.startsWith('ebay')) return 'ebay';
  if (source.startsWith('shopify')) return 'shopify';
  if (source.startsWith('ecwid')) return 'ecwid';
  const ref = String(orderRef ?? '').trim();
  if (AMAZON_ORDER_RE.test(ref)) return 'amazon';
  if (EBAY_ORDER_RE.test(ref)) return 'ebay';
  return null;
}

/** A well-formed ref for `provider`, or null — ids are shape-checked before any API call. */
function toRef(provider: string, rawId: string | null | undefined): MarketplaceRef | null {
  const raw = String(rawId ?? '').trim();
  const id = raw.toUpperCase();
  if (provider === 'amazon' && ASIN_RE.test(id)) return { provider, id };
  if (provider === 'ebay' && EBAY_ITEM_ID_RE.test(id)) return { provider, id };
  // Shopify is asked by variant SKU, as written (SKU search is exact text).
  if (provider === 'shopify' && raw) return { provider, id: raw };
  if (provider === 'ecwid' && ECWID_PRODUCT_ID_RE.test(raw)) return { provider, id: raw };
  return null;
}

/**
 * The listing ids to ask for this order's product, best first: the order's own
 * listing (on its own channel first), then the catalog row's platform ids.
 */
export function marketplaceRefsFor(row: OrderImageRow): MarketplaceRef[] {
  const channel = orderChannel(row.accountSource, row.orderRef);
  const own = [
    toRef('amazon', row.itemNumber),
    toRef('amazon', row.sku),
    toRef('ebay', row.itemNumber),
    // A storefront order's own SKU is its listing key on that storefront.
    channel === 'shopify' ? toRef('shopify', row.sku) : null,
  ];
  const ordered = [
    ...own.filter((ref) => ref?.provider === channel),
    ...own.filter((ref) => ref?.provider !== channel),
    ...row.catalogRefs.map((ref) => toRef(ref.provider, ref.id)),
  ];
  const seen = new Set<string>();
  const out: MarketplaceRef[] = [];
  for (const ref of ordered) {
    if (!ref) continue;
    const key = `${ref.provider}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

// ─── Plan ────────────────────────────────────────────────────────────────────

/** One catalog product with no photo anywhere, and the listings that could supply one. */
interface MissingProduct {
  skuCatalogId: number;
  sku: string | null;
  orderIds: number[];
  refs: MarketplaceRef[];
  sourceImageUrl: string | null;
}

/** One marketplace listing shared by one or more still-unpaired order lines. */
interface MissingOrderImage {
  orderIds: number[];
  refs: MarketplaceRef[];
  sourceImageUrl: string | null;
}

interface BackfillPlan {
  ordersScanned: number;
  orders: Record<OrderImageState, number>;
  /** Orders with no catalog row that DO carry a marketplace id (fetchable once paired). */
  noProductWithMarketplaceId: number;
  products: MissingProduct[];
  orderImages: MissingOrderImage[];
}

function planMarketplaceMediaBackfill(
  rows: readonly OrderImageRow[],
  options: { includeZohoLinked: boolean },
): BackfillPlan {
  const orders: Record<OrderImageState, number> = {
    zoho: 0,
    catalog: 0,
    listing_gallery: 0,
    order_photo: 0,
    zoho_owned_no_photo: 0,
    no_product: 0,
    missing: 0,
  };
  let noProductWithMarketplaceId = 0;
  const products = new Map<number, MissingProduct>();
  const orderImages = new Map<string, MissingOrderImage>();

  for (const row of rows) {
    const state = orderImageState(row);
    orders[state] += 1;
    const rowRefs = marketplaceRefsFor(row);
    const sourceImageUrl = String(row.sourceImageUrl ?? '').trim() || null;
    if (state === 'no_product' && (rowRefs.length > 0 || sourceImageUrl)) {
      if (rowRefs.length > 0) noProductWithMarketplaceId += 1;
      // Group repeated orders for the same listing so the provider is queried
      // once and the same photo row can be linked to every order atomically.
      const first = rowRefs[0];
      const key = first ? `${first.provider}:${first.id}` : `source:${sourceImageUrl}`;
      const image = orderImages.get(key) ?? { orderIds: [], refs: [], sourceImageUrl };
      image.orderIds.push(row.orderId);
      image.sourceImageUrl ||= sourceImageUrl;
      for (const ref of rowRefs) {
        if (!image.refs.some((candidate) => candidate.provider === ref.provider && candidate.id === ref.id)) {
          image.refs.push(ref);
        }
      }
      orderImages.set(key, image);
    }
    // The order record paints the exact marketplace listing image. A targeted
    // marketplace repair may therefore seed a gallery fallback even when a
    // Zoho image exists; it never overwrites the catalog/Zoho source itself.
    const eligibleState =
      state === 'missing' ||
      state === 'zoho_owned_no_photo' ||
      (options.includeZohoLinked && state === 'zoho');
    // A gallery means this exact catalog product has already been curated or
    // backfilled. Zoho remains the display winner, but do not re-fetch the
    // marketplace image merely because that higher-precedence source exists.
    if (!eligibleState || row.galleryCount > 0 || row.skuCatalogId == null) continue;

    const product = products.get(row.skuCatalogId) ?? {
      skuCatalogId: row.skuCatalogId,
      sku: row.sku,
      orderIds: [],
      refs: [],
      sourceImageUrl: null,
    };
    product.orderIds.push(row.orderId);
    product.sourceImageUrl ||= sourceImageUrl;
    for (const ref of marketplaceRefsFor(row)) {
      if (!product.refs.some((r) => r.provider === ref.provider && r.id === ref.id)) product.refs.push(ref);
    }
    products.set(row.skuCatalogId, product);
  }

  return {
    ordersScanned: rows.length,
    orders,
    noProductWithMarketplaceId,
    products: [...products.values()],
    orderImages: [...orderImages.values()],
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export type ProviderGate =
  | { ok: true; notes: string[] }
  | { ok: false; reason: string; repair: string };

export type StoreOutcome = { status: 'stored'; photoId: number } | { status: 'skipped'; reason: string };
export interface OrderStoreOutcome {
  stored: number;
  skipped: number;
}

export interface MarketplaceMediaDeps {
  loadOrderRows(orgId: OrgId, since: Date): Promise<OrderImageRow[]>;
  checkProvider(orgId: OrgId, provider: MarketplaceProvider): Promise<ProviderGate>;
  /** The listing's primary image URL; null when the listing has none. Throws on API failure. */
  fetchImageUrl(orgId: OrgId, ref: MarketplaceRef): Promise<string | null>;
  /**
   * Write the image as the SKU's gallery cover in ONE transaction —
   * re-checking eligibility at write time. A throw means nothing was written.
   */
  storeListingImage(orgId: OrgId, skuCatalogId: number, imageUrl: string): Promise<StoreOutcome>;
  /** Link one fetched listing image to still-unpaired order lines. */
  storeOrderListingImage(
    orgId: OrgId,
    orderIds: readonly number[],
    imageUrl: string,
  ): Promise<OrderStoreOutcome>;
}

interface ProviderReport {
  gate: ProviderGate;
  /** Missing products with at least one listing id on this provider. */
  products: number;
  fetchable: number;
  blocked: number;
}

interface BackfillReport {
  orgId: OrgId;
  since: string;
  apply: boolean;
  ordersScanned: number;
  orders: Record<OrderImageState, number>;
  noProductWithMarketplaceId: number;
  productsMissingImages: number;
  orderImagesMissing: number;
  noMarketplaceId: number;
  fetchableProducts: number;
  blockedProducts: number;
  providers: Record<MarketplaceProvider, ProviderReport>;
  imagesFound: number;
  noImageAtSource: number;
  fetchErrors: Array<{ skuCatalogId: number; ref: MarketplaceRef; error: string }>;
  /** Dry run: products that would get a cover. Apply: products that got one. */
  stored: number;
  skipped: Array<{ skuCatalogId: number; reason: string }>;
  /** Apply: stores that threw (their transaction rolled back; the run went on). */
  storeErrors: Array<{ skuCatalogId: number; error: string }>;
  samples: Array<{ skuCatalogId: number; sku: string | null; ref: MarketplaceRef | null; imageUrl: string }>;
  orderImagesFound: number;
  orderImagesStored: number;
  orderImagesSkipped: number;
  orderFetchErrors: Array<{ orderIds: number[]; ref: MarketplaceRef; error: string }>;
  orderStoreErrors: Array<{ orderIds: number[]; error: string }>;
  orderSamples: Array<{ orderIds: number[]; ref: MarketplaceRef | null; imageUrl: string }>;
}

interface BackfillOptions {
  /** Write covers. Default false: plan, gate and fetch (read-only) only. */
  apply?: boolean;
  since: Date;
  /** Limit provider calls for a targeted repair. Default: every marketplace. */
  providers?: readonly MarketplaceProvider[];
  /** Seed marketplace gallery covers even when a Zoho image exists. */
  includeZohoLinked?: boolean;
}

export async function runMarketplaceMediaBackfill(
  orgId: OrgId,
  options: BackfillOptions,
  deps: MarketplaceMediaDeps = defaultDeps,
): Promise<BackfillReport> {
  const apply = options.apply === true;
  const selectedProviders = new Set(options.providers ?? MARKETPLACE_PROVIDERS);
  const plan = planMarketplaceMediaBackfill(await deps.loadOrderRows(orgId, options.since), {
    includeZohoLinked: options.includeZohoLinked === true,
  });

  const providers = {} as Record<MarketplaceProvider, ProviderReport>;
  for (const provider of MARKETPLACE_PROVIDERS) {
    providers[provider] = {
      gate: selectedProviders.has(provider)
        ? await deps.checkProvider(orgId, provider)
        : { ok: false, reason: 'Provider not selected for this run', repair: '' },
      products: 0,
      fetchable: 0,
      blocked: 0,
    };
  }

  const report: BackfillReport = {
    orgId,
    since: options.since.toISOString(),
    apply,
    ordersScanned: plan.ordersScanned,
    orders: plan.orders,
    noProductWithMarketplaceId: plan.noProductWithMarketplaceId,
    productsMissingImages: plan.products.length,
    orderImagesMissing: plan.orderImages.length,
    noMarketplaceId: 0,
    fetchableProducts: 0,
    blockedProducts: 0,
    providers,
    imagesFound: 0,
    noImageAtSource: 0,
    fetchErrors: [],
    stored: 0,
    skipped: [],
    storeErrors: [],
    samples: [],
    orderImagesFound: 0,
    orderImagesStored: 0,
    orderImagesSkipped: 0,
    orderFetchErrors: [],
    orderStoreErrors: [],
    orderSamples: [],
  };

  // One marketplace listing can appear on many unpaired orders. Cache both
  // successful and empty provider answers for this run.
  const fetchCache = new Map<string, Promise<string | null>>();
  const fetchRef = (ref: MarketplaceRef) => {
    const key = `${ref.provider}:${ref.id}`;
    const cached = fetchCache.get(key);
    if (cached) return cached;
    const pending = deps.fetchImageUrl(orgId, ref);
    fetchCache.set(key, pending);
    return pending;
  };

  for (const product of plan.products) {
    if (product.refs.length === 0 && !product.sourceImageUrl) {
      report.noMarketplaceId += 1;
      continue;
    }
    for (const provider of new Set(product.refs.map((ref) => ref.provider))) {
      const entry = providers[provider];
      entry.products += 1;
      if (entry.gate.ok) entry.fetchable += 1;
      else entry.blocked += 1;
    }
    const usable = product.refs.filter((ref) => selectedProviders.has(ref.provider) && providers[ref.provider].gate.ok);
    if (usable.length === 0 && !product.sourceImageUrl) {
      report.blockedProducts += 1;
      continue;
    }
    report.fetchableProducts += 1;

    let found: { ref: MarketplaceRef | null; imageUrl: string } | null = product.sourceImageUrl
      ? { ref: null, imageUrl: product.sourceImageUrl }
      : null;
    for (const ref of found ? [] : usable) {
      try {
        const imageUrl = await fetchRef(ref);
        if (imageUrl) {
          found = { ref, imageUrl };
          break;
        }
      } catch (err) {
        report.fetchErrors.push({
          skuCatalogId: product.skuCatalogId,
          ref,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!found) {
      report.noImageAtSource += 1;
      continue;
    }
    report.imagesFound += 1;
    report.samples.push({ skuCatalogId: product.skuCatalogId, sku: product.sku, ...found });

    if (!apply) {
      report.stored += 1;
      continue;
    }
    try {
      const outcome = await deps.storeListingImage(orgId, product.skuCatalogId, found.imageUrl);
      if (outcome.status === 'stored') report.stored += 1;
      else report.skipped.push({ skuCatalogId: product.skuCatalogId, reason: outcome.reason });
    } catch (err) {
      report.storeErrors.push({
        skuCatalogId: product.skuCatalogId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  for (const image of plan.orderImages) {
    for (const provider of new Set(image.refs.map((ref) => ref.provider))) {
      const entry = providers[provider];
      entry.products += 1;
      if (entry.gate.ok) entry.fetchable += 1;
      else entry.blocked += 1;
    }
    const usable = image.refs.filter((ref) => selectedProviders.has(ref.provider) && providers[ref.provider].gate.ok);
    if (usable.length === 0 && !image.sourceImageUrl) continue;

    let found: { ref: MarketplaceRef | null; imageUrl: string } | null = image.sourceImageUrl
      ? { ref: null, imageUrl: image.sourceImageUrl }
      : null;
    for (const ref of found ? [] : usable) {
      try {
        const imageUrl = await fetchRef(ref);
        if (imageUrl) {
          found = { ref, imageUrl };
          break;
        }
      } catch (err) {
        report.orderFetchErrors.push({
          orderIds: image.orderIds,
          ref,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (!found) continue;
    report.orderImagesFound += image.orderIds.length;
    report.orderSamples.push({ orderIds: image.orderIds, ...found });

    if (!apply) {
      report.orderImagesStored += image.orderIds.length;
      continue;
    }
    try {
      const outcome = await deps.storeOrderListingImage(orgId, image.orderIds, found.imageUrl);
      report.orderImagesStored += outcome.stored;
      report.orderImagesSkipped += outcome.skipped;
    } catch (err) {
      report.orderStoreErrors.push({
        orderIds: image.orderIds,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}

// ─── Default (live) deps ─────────────────────────────────────────────────────

interface RawOrderImageRow {
  order_id: number;
  order_ref: string | null;
  account_source: string | null;
  sku: string | null;
  item_number: string | null;
  sku_catalog_id: number | null;
  catalog_image_url: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  zoho_image_url: string | null;
  gallery_count: number;
  order_photo_count: number;
  source_image_url: string | null;
  catalog_refs: Array<{ provider: string; id: string }> | null;
}

/**
 * Read-only. Catalog resolution: the paired FK, else the EXACT org-scoped SKU
 * (SKU identity law rule 1), else the `sku_platform_ids` crosswalk on the
 * order's listing id (the `resolveSkuCatalogByPlatformId` mapping).
 */
const ORDER_IMAGE_ROWS_SQL = `
  SELECT o.id AS order_id,
         o.order_id AS order_ref,
         COALESCE(NULLIF(BTRIM(ss_ref.marketplace), ''), o.account_source) AS account_source,
         NULLIF(BTRIM(o.sku), '') AS sku,
         NULLIF(BTRIM(o.item_number), '') AS item_number,
         sc.id AS sku_catalog_id,
         sc.image_url AS catalog_image_url,
         zi.zoho_item_id,
         zi.image_document_id AS zoho_image_document_id,
         zi.image_url AS zoho_image_url,
         COALESCE(gallery.n, 0) AS gallery_count,
         COALESCE(order_photo.n, 0) AS order_photo_count,
         source_image.image_url AS source_image_url,
         refs.list AS catalog_refs
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT ssr.marketplace, ssr.line_items
        FROM shipstation_order_refs ssr
       WHERE ssr.organization_id = o.organization_id
         AND ssr.order_row_id = o.id
       ORDER BY ssr.last_seen_at DESC NULLS LAST, ssr.id DESC
       LIMIT 1
    ) ss_ref ON TRUE
    LEFT JOIN LATERAL (
      SELECT NULLIF(BTRIM(line.item->>'imageUrl'), '') AS image_url
        FROM jsonb_array_elements(COALESCE(ss_ref.line_items, '[]'::jsonb))
             WITH ORDINALITY AS line(item, ordinal)
       WHERE COALESCE(line.item->>'adjustment', 'false') <> 'true'
         AND NULLIF(BTRIM(line.item->>'imageUrl'), '') IS NOT NULL
       ORDER BY CASE
                  WHEN NULLIF(BTRIM(o.sku), '') IS NOT NULL
                   AND UPPER(BTRIM(line.item->>'sku')) = UPPER(BTRIM(o.sku)) THEN 0
                  ELSE 1
                END,
                line.ordinal
       LIMIT 1
    ) source_image ON TRUE
    LEFT JOIN LATERAL (
      SELECT c.id, c.sku, c.image_url
        FROM sku_catalog c
       WHERE c.organization_id = o.organization_id
         AND (c.id = o.sku_catalog_id
              OR c.sku = o.sku
              OR c.id IN (SELECT spi.sku_catalog_id
                            FROM sku_platform_ids spi
                           WHERE spi.organization_id = o.organization_id
                             AND NULLIF(BTRIM(o.item_number), '') IS NOT NULL
                             AND UPPER(BTRIM(spi.platform_item_id)) = UPPER(BTRIM(o.item_number))))
       ORDER BY COALESCE(c.id = o.sku_catalog_id, FALSE) DESC,
                COALESCE(c.sku = o.sku, FALSE) DESC,
                c.id
       LIMIT 1
    ) sc ON TRUE
    LEFT JOIN LATERAL (
      SELECT i.zoho_item_id, i.image_document_id, i.image_url
        FROM items i
       WHERE i.organization_id = o.organization_id
         AND i.sku = COALESCE(sc.sku, o.sku)
         AND i.status = 'active'
       ORDER BY i.updated_at DESC, i.id
       LIMIT 1
    ) zi ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n
        FROM listing_photos lp
       WHERE lp.organization_id = o.organization_id
         AND lp.sku_catalog_id = sc.id
    ) gallery ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS n
        FROM photo_entity_links pel
        JOIN photos p
          ON p.id = pel.photo_id
         AND p.organization_id = pel.organization_id
       WHERE pel.organization_id = o.organization_id
         AND pel.entity_type = 'ORDER'
         AND pel.entity_id = o.id
         AND p.photo_type = '${LISTING_PHOTO_TYPE}'
    ) order_photo ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
                 'provider', spi.platform,
                 -- Shopify is keyed by variant SKU; every other platform by its listing id.
                 'id', CASE WHEN spi.platform = 'shopify'
                            THEN COALESCE(NULLIF(BTRIM(spi.platform_sku), ''), BTRIM(spi.platform_item_id))
                            ELSE BTRIM(spi.platform_item_id) END)
                       ORDER BY spi.is_active DESC, spi.id) AS list
        FROM sku_platform_ids spi
       WHERE spi.organization_id = o.organization_id
         AND spi.sku_catalog_id = sc.id
         AND spi.platform IN ('amazon', 'ebay', 'shopify', 'ecwid')
         AND NULLIF(BTRIM(spi.platform_item_id), '') IS NOT NULL
    ) refs ON TRUE
   WHERE o.organization_id = $1
     AND ${placedElseImportedSql('o')} >= $2
   ORDER BY o.id`;

async function loadOrderRows(orgId: OrgId, since: Date): Promise<OrderImageRow[]> {
  const res = await tenantQuery<RawOrderImageRow>(orgId, ORDER_IMAGE_ROWS_SQL, [orgId, since]);
  return res.rows.map((r) => ({
    orderId: Number(r.order_id),
    orderRef: r.order_ref,
    accountSource: r.account_source,
    sku: r.sku,
    itemNumber: r.item_number,
    skuCatalogId: r.sku_catalog_id == null ? null : Number(r.sku_catalog_id),
    catalogImageUrl: r.catalog_image_url,
    zohoItemId: r.zoho_item_id,
    zohoImageDocumentId: r.zoho_image_document_id,
    zohoImageUrl: r.zoho_image_url,
    galleryCount: Number(r.gallery_count) || 0,
    orderPhotoCount: Number(r.order_photo_count) || 0,
    sourceImageUrl: r.source_image_url,
    catalogRefs: (r.catalog_refs ?? []).flatMap((ref) => {
      const valid = toRef(ref.provider, ref.id);
      return valid ? [valid] : [];
    }),
  }));
}

async function checkProvider(orgId: OrgId, provider: MarketplaceProvider): Promise<ProviderGate> {
  if (provider === 'amazon') {
    const health = await amazonValidate(orgId);
    return health.ok
      ? { ok: true, notes: [] }
      : { ok: false, reason: health.error ?? 'Amazon validation failed', repair: MARKETPLACE_REPAIR.amazon };
  }
  if (provider === 'shopify') {
    const health = await shopifyValidate(orgId);
    return health.ok
      ? { ok: true, notes: [] }
      : { ok: false, reason: health.error ?? 'Shopify validation failed', repair: MARKETPLACE_REPAIR.shopify };
  }
  if (provider === 'ecwid') {
    // The product sync already mirrors each product's image onto `sku_platform_ids`;
    // the API is only the fallback for a product the mirror has no image for.
    const creds = await resolveEcwidCreds(orgId);
    return { ok: true, notes: creds ? [] : ['No Ecwid API credentials — mirrored images only'] };
  }

  // Listing pictures come from the Browse API, which needs only the app keyset
  // (client-credentials) — so the app token is the gate. A seller/buyer
  // connection in `error` is reported alongside: it usually shares the cause.
  const errored = (await listConnections(orgId))
    .filter((c) => c.provider === 'ebay' && c.state === 'error')
    .map((c) => `${c.scope ?? 'ebay'}: ${c.lastError ?? 'error'}`);
  try {
    await getBrowseAppToken(orgId);
    return { ok: true, notes: errored };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: [message, ...errored].join(' | '), repair: MARKETPLACE_REPAIR.ebay };
  }
}

async function fetchImageUrl(orgId: OrgId, ref: MarketplaceRef): Promise<string | null> {
  if (ref.provider === 'ebay') return getEbayItemImageUrl(ref.id, orgId);
  if (ref.provider === 'shopify') return getShopifyVariantImageUrl(orgId, ref.id);
  if (ref.provider === 'ecwid') return getEcwidProductImageUrl(orgId, ref.id);
  for (const account of await loadActiveAmazonAccounts(orgId)) {
    const creds = await loadAmazonCreds(orgId, account);
    if (!creds?.refreshToken) continue;
    return pickAmazonCatalogMainImage(await getCatalogItemImages(account, creds, ref.id), account.marketplaceIds);
  }
  throw new Error('No active Amazon account with stored credentials');
}

/** Ecwid: the product sync's mirrored image, else the product's own image from the API. */
async function getEcwidProductImageUrl(orgId: OrgId, productId: string): Promise<string | null> {
  const mirrored = await tenantQuery<{ image_url: string | null }>(
    orgId,
    `SELECT NULLIF(BTRIM(image_url), '') AS image_url
       FROM sku_platform_ids
      WHERE organization_id = $1 AND platform = 'ecwid' AND BTRIM(platform_item_id) = $2
        AND NULLIF(BTRIM(image_url), '') IS NOT NULL
      ORDER BY is_active DESC, id
      LIMIT 1`,
    [orgId, productId],
  );
  if (mirrored.rows[0]?.image_url) return mirrored.rows[0].image_url;
  return fetchEcwidProductImageUrl(orgId, productId);
}

/** Thrown inside the store transaction to roll it back when the cover did not land. */
class CoverNotSetError extends Error {}

async function storeListingImage(orgId: OrgId, skuCatalogId: number, imageUrl: string): Promise<StoreOutcome> {
  try {
    return await withTenantTransaction(orgId, async (client): Promise<StoreOutcome> => {
      // The plan is seconds old; re-assert every "missing" condition at write
      // time, locking the catalog row so two runs cannot both see an empty gallery.
      const eligible = await client.query<{ ok: boolean }>(
        `SELECT TRUE AS ok
           FROM sku_catalog sc
          WHERE sc.id = $2
            AND sc.organization_id = $1
            AND NULLIF(BTRIM(sc.image_url), '') IS NULL
            AND NOT EXISTS (SELECT 1 FROM listing_photos lp
                             WHERE lp.organization_id = sc.organization_id
                               AND lp.sku_catalog_id = sc.id)
          FOR UPDATE OF sc`,
        [orgId, skuCatalogId],
      );
      if (!eligible.rows[0]?.ok) {
        return { status: 'skipped', reason: 'product gained a photo (catalog or gallery) since planning' };
      }
      // photo + link + storage + gallery row commit together or not at all.
      const photo = await attachPhotoWithLegacyUrlInTx(client, {
        organizationId: orgId,
        staffId: null,
        entityType: 'SKU',
        entityId: skuCatalogId,
        legacyUrl: imageUrl,
        photoType: LISTING_PHOTO_TYPE,
        idempotent: true,
      });
      const gallery = await addPhotosToListingInTx(client, orgId, { kind: 'sku', id: skuCatalogId }, [photo.id]);
      if (!gallery.some((item) => item.photoId === photo.id && item.isCover)) throw new CoverNotSetError();
      return { status: 'stored', photoId: photo.id };
    });
  } catch (err) {
    if (err instanceof CoverNotSetError) return { status: 'skipped', reason: 'gallery gained another cover concurrently' };
    throw err;
  }
}

async function storeOrderListingImage(
  orgId: OrgId,
  orderIds: readonly number[],
  imageUrl: string,
): Promise<OrderStoreOutcome> {
  return withTenantTransaction(orgId, async (client) => {
    const eligible = await client.query<{ id: string }>(
      `SELECT o.id
         FROM orders o
        WHERE o.organization_id = $1
          AND o.id = ANY($2::bigint[])
          AND NOT EXISTS (
            SELECT 1
              FROM photo_entity_links pel
              JOIN photos p
                ON p.id = pel.photo_id
               AND p.organization_id = pel.organization_id
             WHERE pel.organization_id = o.organization_id
               AND pel.entity_type = 'ORDER'
               AND pel.entity_id = o.id
               AND p.photo_type = $3
          )
        FOR UPDATE OF o`,
      [orgId, orderIds, LISTING_PHOTO_TYPE],
    );
    for (const candidate of eligible.rows) {
      const orderId = Number(candidate.id);
      await attachPhotoWithLegacyUrlInTx(client, {
        organizationId: orgId,
        staffId: null,
        entityType: 'ORDER',
        entityId: orderId,
        legacyUrl: imageUrl,
        photoType: LISTING_PHOTO_TYPE,
        poRef: `ORDER_${orderId}`,
        idempotent: true,
      });
    }
    return { stored: eligible.rows.length, skipped: orderIds.length - eligible.rows.length };
  });
}

const defaultDeps: MarketplaceMediaDeps = {
  loadOrderRows,
  checkProvider,
  fetchImageUrl,
  storeListingImage,
  storeOrderListingImage,
};
