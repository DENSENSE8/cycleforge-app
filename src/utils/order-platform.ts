import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';

export function getOrderPlatformLabel(orderId: string | null | undefined, accountSource: string | null | undefined): string {
  const oid = String(orderId ?? '').trim();
  if (oid === 'Not available' || oid === 'N/A') return ''; // ds-allow-na: legacy protocol empty reader

  /** Pack/tech rows often lack a linked marketplace order id; still show channel from account_source. */
  if (!oid) {
    const src = String(accountSource || '').trim().toLowerCase();
    if (!src) return '';
    if (src === 'fba') return 'FBA';
    if (src === 'ecwid') return 'ECWID';
    return String(accountSource || '').trim();
  }

  if (isFbaOrder(oid, accountSource)) {
    return 'FBA';
  }

  if (/^\d{3}-\d+-\d+$/.test(oid)) {
    return 'Amazon';
  }

  if (/^\d{2}-\d+-\d+$/.test(oid)) {
    return 'ebay';
  }

  if (/^\d{15}$/.test(oid)) {
    return 'Walmart';
  }

  if (/^\d{4}$/.test(oid)) {
    return 'ECWID';
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
  const oid = String(orderId ?? '').trim();
  if (!oid || oid === 'Not available' || oid === 'N/A') return null; // ds-allow-na: legacy protocol empty reader
  if (isFbaOrder(oid, accountSource)) return null;

  const label = getOrderPlatformLabel(oid, accountSource).toLowerCase();
  const src = String(accountSource || '').trim().toLowerCase();

  // Amazon MFN order id shape 123-1234567-1234567
  if (label === 'amazon' || /^\d{3}-\d+-\d+$/.test(oid)) {
    return `https://sellercentral.amazon.com/orders-v3/order/${encodeURIComponent(oid)}`;
  }
  // eBay order id 12-12345-12345 (or longer legacy forms)
  if (label === 'ebay' || src === 'ebay' || /^\d{2}-\d+-\d+$/.test(oid)) {
    return `https://www.ebay.com/mesh/ord/details?orderid=${encodeURIComponent(oid)}`;
  }
  // Walmart 15-digit
  if (label === 'walmart' || src === 'walmart' || /^\d{15}$/.test(oid)) {
    return `https://seller.walmart.com/orders/manage-orders?orderId=${encodeURIComponent(oid)}`;
  }
  // Ecwid storefront admin — best-effort; tenant store id is not always known client-side
  if (label === 'ecwid' || src === 'ecwid') {
    return null;
  }

  return null;
}

