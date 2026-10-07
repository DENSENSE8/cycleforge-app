/** External marketplace / listing URL builders — the SINGLE source of truth for turning an order's item number (or an explicit platform +… */

import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import { normalizeListingHref } from '@/lib/receiving/listing-href';

export function getExternalUrlByItemNumber(itemNumber: string | null | undefined): string | null {
  const item = String(itemNumber || '').trim();
  if (!item) return null;
  if (/^B0/i.test(item)) return `https://www.amazon.com/dp/${item}`;
  if (/^\d{12}$/.test(item)) return `https://www.ebay.com/itm/${item}`;
  if (item.length < 12) return `https://usavshop.com/products/search?keyword=${encodeURIComponent(item)}`;
  return `https://usavshop.com/products/search?keyword=${encodeURIComponent(item)}`;
}

/** Compact listing-URL face for diagnostics / non-table chrome — host + path, no scheme, no `www.`. */
export function listingChipDisplay(href: string | null | undefined): string {
  const raw = String(href ?? '').trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname.replace(/\/$/, '');
    return path && path !== '/' ? `${host}${path}` : host;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  }
}

/** Infer platform label from an item number / platform SKU pattern. */
export function getPlatformLabelByItemNumber(itemNumber: string | null | undefined): string {
  const item = String(itemNumber || '').trim();
  if (!item) return 'Unknown';
  if (/^B0[A-Z0-9]{8}$/i.test(item)) return 'Amazon';
  if (/^X0[A-Z0-9]{8}$/i.test(item)) return 'Amazon FBA';
  if (/^\d{15}$/.test(item)) return 'Walmart';
  if (/^\d{12}$/.test(item)) return 'eBay';
  // Fallback: anything else (shorter/different pattern) is assumed to be Ecwid
  return 'Ecwid';
}

/** Infer the canonical platform key (lowercase, for DB writes) from an item number. */
export function getPlatformKeyByItemNumber(itemNumber: string | null | undefined): string {
  const label = getPlatformLabelByItemNumber(itemNumber);
  const map: Record<string, string> = {
    'Amazon': 'amazon',
    'Amazon FBA': 'amazon_fba',
    'Walmart': 'walmart',
    'eBay': 'ebay',
    'Ecwid': 'ecwid',
  };
  return map[label] || 'ecwid';
}

/** The storefronts a listing URL can land on, by the key {@link getPlatformKeyByItemNumber} returns (FBA lists on Amazon). */
const LISTING_STOREFRONT: Readonly<Record<string, ListingStorefront>> = {
  amazon: 'amazon',
  amazon_fba: 'amazon',
  ebay: 'ebay',
  walmart: 'walmart',
  ecwid: 'ecwid',
};

/**
 * Does the item-number listing ({@link getExternalUrlByItemNumber}) open on the ORDER's own
 * platform? `orderPlatformLabel` is `getOrderPlatformLabel(...)` ("eBay", "Amazon", "FBA",
 * "Walmart", "Ecwid", a store name…). An eBay order whose item number resolves to the Ecwid
 * storefront would open the wrong listing → false (owner 2026-09-29: grey it out). A platform
 * with no storefront rule (Shopify, manual, blank) → true: nothing to contradict.
 */
export function listingMatchesOrderPlatform(
  itemNumber: string | null | undefined,
  orderPlatformLabel: string | null | undefined,
): boolean {
  const order = listingStorefront(orderPlatformLabel);
  if (!order || !String(itemNumber || '').trim()) return true;
  return LISTING_STOREFRONT[getPlatformKeyByItemNumber(itemNumber)] === order;
}

// ── The listing on the platform (docs popover, operator 2026-10-06) ─────────

/** Where a marketplace listing lives. */
export type ListingStorefront = 'ebay' | 'amazon' | 'walmart' | 'ecwid';

const STOREFRONT_NAME: Readonly<Record<ListingStorefront, string>> = {
  ebay: 'eBay',
  amazon: 'Amazon',
  walmart: 'Walmart',
  ecwid: 'Ecwid',
};

/** eBay item ids are 12 digits; an ASIN is `B0` + 8. */
const EBAY_ITEM_ID_RE = /^\d{12}$/;
const ASIN_RE = /^B0[A-Z0-9]{8}$/i;

/**
 * The storefront a platform names — a catalog slug, an `account_source`, a
 * `sku_platform_ids.platform` or a display label ("eBay", "ebay purchasing",
 * "fba", "amazon_fba", "Ecwid"). Null for a platform with no storefront rule.
 */
export function listingStorefront(platform: string | null | undefined): ListingStorefront | null {
  const p = String(platform ?? '').trim().toLowerCase();
  if (!p) return null;
  if (p.startsWith('ebay')) return 'ebay';
  if (p === 'fba' || p.startsWith('amazon')) return 'amazon';
  if (p.startsWith('walmart')) return 'walmart';
  if (p.startsWith('ecwid')) return 'ecwid';
  return null;
}

/**
 * The storefront an ORDER sells on: its number's own shape (eBay 2-5-5,
 * Amazon 3-7-7) wins, then its platform — the catalog slug its
 * `account_source` resolves to, else the `account_source` itself.
 */
export function orderStorefront(orderRef: string | null | undefined, platform: string | null | undefined): ListingStorefront | null {
  return listingStorefront(inferMarketplaceFromOrderId(orderRef) ?? platform);
}

/** The storefront a stored listing URL opens on, by its host; null for a store's own domain. */
function storefrontOfUrl(href: string): ListingStorefront | null {
  try {
    const host = new URL(href).hostname.toLowerCase();
    if (/(^|\.)ebay\./.test(host)) return 'ebay';
    if (/(^|\.)amazon\./.test(host)) return 'amazon';
    if (/(^|\.)walmart\./.test(host)) return 'walmart';
  } catch {
    // `normalizeListingHref` already proved it parses.
  }
  return null;
}

/**
 * The listing an item number builds on its storefront: eBay `/itm/<id>`,
 * Amazon `/dp/<ASIN>`. Ecwid (and Walmart) have no global pattern → null.
 * With no storefront the item number's own shape decides.
 */
export function buildListingUrl(storefront: ListingStorefront | null, itemNumber: string | null | undefined): string | null {
  const item = String(itemNumber ?? '').trim();
  if (!item) return null;
  const on = storefront ?? (EBAY_ITEM_ID_RE.test(item) ? 'ebay' : ASIN_RE.test(item) ? 'amazon' : null);
  if (on === 'ebay' && EBAY_ITEM_ID_RE.test(item)) return `https://www.ebay.com/itm/${item}`;
  if (on === 'amazon' && ASIN_RE.test(item)) return `https://www.amazon.com/dp/${item.toUpperCase()}`;
  return null;
}

/** One `sku_platform_ids` row as the listing resolver reads it. */
export interface StoredListing {
  platform: string | null;
  itemId: string | null;
  url: string | null;
}

/** The external-link button's answer: where it opens, or why it is hidden. */
export interface ListingLink {
  href: string | null;
  /** `stored` = `sku_platform_ids.listing_url`; `built` = from an item number. */
  source: 'stored' | 'built' | null;
  storefront: ListingStorefront | null;
  /** Why there is no link (the hidden button's title text); null when `href` is set. */
  missing: string | null;
}

/** Display name of a storefront ("eBay"), for a link's title. */
export function storefrontName(storefront: ListingStorefront | null): string | null {
  return storefront ? STOREFRONT_NAME[storefront] : null;
}

/**
 * The listing on the ORDER's platform, by precedence:
 *   1. the stored `listing_url` of the row for this exact item number;
 *   2. a stored `listing_url` on the order's storefront (any, when the storefront is unknown);
 *   3. built from the item number ({@link buildListingUrl});
 *   4. built from a stored row's item id on the order's storefront;
 *   else no link, and `missing` says why. A listing on another storefront is never offered.
 */
export function resolveListingLink(input: {
  storefront: ListingStorefront | null;
  itemNumber?: string | null;
  stored?: readonly StoredListing[];
}): ListingLink {
  const { storefront } = input;
  const item = String(input.itemNumber ?? '').trim().toUpperCase();
  const rows = (input.stored ?? []).map((row) => {
    const href = normalizeListingHref(row.url);
    return { itemId: String(row.itemId ?? '').trim().toUpperCase(), href, on: listingStorefront(row.platform) ?? (href ? storefrontOfUrl(href) : null) };
  });
  // Another storefront's row never answers for this order; a row of no known
  // storefront (an account slug, the store's own domain) only by its exact item number.
  const exactItem = (row: (typeof rows)[number]) => item !== '' && row.itemId === item;
  const usable = rows.filter((row) => (storefront ? row.on === storefront : true) || (row.on == null && exactItem(row)));

  const exact = usable.find((row) => row.href && exactItem(row)) ?? usable.find((row) => row.href);
  if (exact?.href) return { href: exact.href, source: 'stored', storefront: exact.on ?? storefront, missing: null };
  for (const [on, itemId] of [[storefront, item], ...usable.map((row) => [storefront ?? row.on, row.itemId] as const)] as const) {
    const href = buildListingUrl(on, itemId);
    if (href) return { href, source: 'built', storefront: storefrontOfUrl(href), missing: null };
  }

  const name = storefrontName(storefront);
  const missing =
    storefront === 'ecwid'
      ? 'Ecwid has no listing-link pattern, and no listing URL is stored for this item yet.'
      : !item
        ? 'No item number and no stored listing URL.'
        : name
          ? `No listing URL stored, and ${name} item # ${String(input.itemNumber).trim()} does not build one.`
          : 'No listing URL stored, and this platform has no listing-link pattern.';
  return { href: null, source: null, storefront, missing };
}

/**
 * Platform-aware external URL.
 * Uses the known platform to construct the correct marketplace/admin URL.
 */
export function getExternalUrlByPlatform(
  platform: string,
  identifier: string | null | undefined,
): string | null {
  const id = String(identifier || '').trim();
  if (!id) return null;
  const p = platform.toLowerCase();

  // Zoho is inventory identity, not a storefront — never invent a usavshop URL.
  if (p === 'zoho') return null;
  if (p === 'ecwid') return `https://usavshop.com/products/search?keyword=${encodeURIComponent(id)}`;
  if (p.startsWith('ebay')) return `https://www.ebay.com/itm/${id}`;
  if (p === 'amazon' || p === 'amazon_fba') return `https://www.amazon.com/dp/${id}`;
  if (p === 'walmart') return `https://www.walmart.com/ip/${id}`;

  // Fallback: infer from identifier pattern
  return getExternalUrlByItemNumber(id);
}

/** `SKU:qty` scans — substring before `:` (catalog SKU / item keyword for usavshop). */
export function skuScanPrefixBeforeColon(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  if (!s.includes(':')) return '';
  return s.split(':')[0]?.trim() ?? '';
}
