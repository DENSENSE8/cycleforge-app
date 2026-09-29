/** External marketplace / listing URL builders — the SINGLE source of truth for turning an order's item number (or an explicit platform +… */

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
const LISTING_STOREFRONT: Readonly<Record<string, string>> = {
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
  const label = String(orderPlatformLabel || '').trim().toLowerCase();
  const order = label.startsWith('ebay')
    ? 'ebay'
    : label === 'fba' || label.startsWith('amazon')
      ? 'amazon'
      : label.startsWith('walmart')
        ? 'walmart'
        : label.startsWith('ecwid')
          ? 'ecwid'
          : null;
  if (!order || !String(itemNumber || '').trim()) return true;
  return LISTING_STOREFRONT[getPlatformKeyByItemNumber(itemNumber)] === order;
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
