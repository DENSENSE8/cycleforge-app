import {
  inferMarketplaceFromOrderId,
  normalizeMarketplaceOrderId,
} from '@/lib/marketplace-order-id';
import { sourcePlatformMeta, sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export function getOrderPlatformLabel(orderId: string | null | undefined, accountSource: string | null | undefined): string {
  const oid = normalizeMarketplaceOrderId(orderId);
  if (oid === 'Not available' || oid === 'N/A') return ''; // ds-allow-na: legacy protocol empty reader

  /** Pack/tech rows often lack a linked marketplace order id; still show channel from account_source. */
  if (!oid) {
    const src = String(accountSource || '').trim().toLowerCase();
    if (!src) return '';
    if (src === 'fba') return 'FBA';
    if (src === 'ecwid') return sourcePlatformMeta('ecwid').label;
    return String(accountSource || '').trim();
  }

  // Exact marketplace shapes win over account_source / listing — a Zoho-imported
  // eBay 2-5-5 or Amazon 3-7-7 is still that marketplace's order number.
  const inferred = inferMarketplaceFromOrderId(oid);
  if (inferred) return sourcePlatformMeta(inferred).label;

  if (isFbaOrder(oid, accountSource)) {
    return 'FBA';
  }

  // An imported channel (ShipStation store → platform, marketplace sync) names
  // the platform outright. Shape guesses below only fill in for a row with no
  // recognised source — a 4-digit Shopify order is not an Ecwid order.
  const known = sourcePlatformMetaFromLabel(accountSource);
  if (known.value) return known.label;

  if (/^\d{15}$/.test(oid)) {
    return 'Walmart';
  }

  if (/^\d{4}$/.test(oid) && !String(accountSource || '').trim()) {
    return sourcePlatformMeta('ecwid').label;
  }

  return accountSource || '';
}

export function isFbaOrder(orderId: string | null | undefined, accountSource: string | null | undefined): boolean {
  const normalizedOrderId = String(orderId || '').trim().toUpperCase();
  const normalizedAccountSource = String(accountSource || '').trim().toLowerCase();
  return normalizedOrderId.includes('FBA') || normalizedAccountSource === 'fba';
}

/**
 * Order-channel tones converge on the source-platform SoT
 * (`src/lib/source-platform.ts`) so a platform can never present two hues.
 */
const DEFAULT_PLATFORM_COLOR = { text: 'text-text-faint', border: 'border-border-emphasis' };

function orderPlatformTone(label: string): { text: string; border: string } {
  const key = label.toLowerCase().split(/\s*-\s*/)[0].trim();
  const meta = sourcePlatformMetaFromLabel(key);
  if (meta.value) return { text: meta.text, border: meta.border };
  return DEFAULT_PLATFORM_COLOR;
}

export function getOrderPlatformColor(label: string): string {
  return orderPlatformTone(label).text;
}

export function getOrderPlatformBorderColor(label: string): string {
  return orderPlatformTone(label).border;
}

export function getOrderSourceTag(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
): 'FBA' | 'Orders' {
  return isFbaOrder(orderId, accountSource) ? 'FBA' : 'Orders';
}

/**
 * Marketplace order detail URL for "Open on {platform}" from identity chips.
 * Returns null when the channel/id shape is unknown (menu row stays hidden).
 */
export function marketplaceOrderUrl(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
): string | null {
  const oid = normalizeMarketplaceOrderId(orderId);
  if (!oid || oid === 'Not available' || oid === 'N/A') return null; // ds-allow-na: legacy protocol empty reader
  if (isFbaOrder(oid, accountSource)) return null;

  const inferred = inferMarketplaceFromOrderId(oid);
  if (inferred === 'amazon') {
    return `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(oid)}`;
  }
  if (inferred === 'ebay') {
    return `https://www.ebay.com/mesh/ord/details?orderid=${encodeURIComponent(oid)}`;
  }

  // Past the exact shapes, the platform is whatever getOrderPlatformLabel
  // resolved — the imported source first, the numeric guesses only without one.
  switch (sourcePlatformMetaFromLabel(getOrderPlatformLabel(oid, accountSource)).value) {
    case 'amazon':
      return `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(oid)}`;
    case 'ebay':
      return `https://www.ebay.com/mesh/ord/details?orderid=${encodeURIComponent(oid)}`;
    case 'walmart':
      return `https://seller.walmart.com/orders/manage-orders?orderId=${encodeURIComponent(oid)}`;
    case 'ecwid': {
      // Store id reaches the client as NEXT_PUBLIC_ECWID_STORE_ID (next.config.ts).
      const storeId = process.env.NEXT_PUBLIC_ECWID_STORE_ID;
      return storeId
        ? `https://my.ecwid.com/store/${encodeURIComponent(storeId)}#order:id=${encodeURIComponent(oid)}&return=orders`
        : null;
    }
    case 'shopify': {
      // Search the admin by order number. admin.shopify.com resolves the store
      // from the session when the path has no handle; SHOPIFY_STORE_HANDLE pins it.
      const handle = process.env.NEXT_PUBLIC_SHOPIFY_STORE_HANDLE;
      const admin = handle ? `https://admin.shopify.com/store/${encodeURIComponent(handle)}` : 'https://admin.shopify.com';
      return `${admin}/orders?query=${encodeURIComponent(oid)}`;
    }
    default:
      return null;
  }
}

/**
 * The order's admin page: the operator-set link (`orders.admin_url`) when one
 * is stored, else the URL derived from the order number + platform.
 */
export function orderAdminUrl(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
  storedUrl: string | null | undefined,
): string | null {
  return String(storedUrl ?? '').trim() || marketplaceOrderUrl(orderId, accountSource);
}

