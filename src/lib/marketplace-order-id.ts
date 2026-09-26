/** Marketplace order-number shapes that are unique enough to identify the channel from the string alone — no listing URL, no `account_source`. */

import {
  UNKNOWN_PLATFORM,
  platformMetaIconTone,
  sourcePlatformMeta,
  sourcePlatformMetaFromLabel,
  type SourcePlatformMeta,
} from '@/lib/source-platform';

/** Unicode hyphen / minus variants that paste as "dashes" from emails / PDFs. */
const UNICODE_DASHES = /[\u2010-\u2015\u2212]/g;

/** Amazon SP-API AmazonOrderId — official 3-7-7 (e.g. `111-1234567-1234567`). */
export const AMAZON_ORDER_ID_RE = /^\d{3}-\d{7}-\d{7}$/;

/** eBay Seller Hub / receipt order number — 2-5-5 (e.g. `03-15100-78272`). */
export const EBAY_ORDER_ID_RE = /^\d{2}-\d{5}-\d{5}$/;

export type MarketplaceOrderPlatform = 'ebay' | 'amazon';

export function normalizeMarketplaceOrderId(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .replace(UNICODE_DASHES, '-');
}

/**
 * Channel implied by the order-number shape itself. `null` when the string is
 * not an Amazon 3-7-7 or eBay 2-5-5 id (Walmart / Ecwid / internal / …).
 */
export function inferMarketplaceFromOrderId(
  raw: string | null | undefined,
): MarketplaceOrderPlatform | null {
  const q = normalizeMarketplaceOrderId(raw);
  if (!q) return null;
  if (AMAZON_ORDER_ID_RE.test(q)) return 'amazon';
  if (EBAY_ORDER_ID_RE.test(q)) return 'ebay';
  return null;
}

/**
 * First matching eBay 2-5-5 / Amazon 3-7-7 among identity fields (PO #,
 * order #, source order id). Same SoT the `#` chip uses — the number itself
 * names the platform when the stored slug is empty.
 */
export function platformFromOrderIdentityFields(
  ...values: Array<string | null | undefined>
): MarketplaceOrderPlatform | null {
  for (const value of values) {
    const inferred = inferMarketplaceFromOrderId(value);
    if (inferred) return inferred;
  }
  return null;
}

/**
 * Carton classify slug: a stored `source_platform` wins (operator choice).
 * When that column is empty, the order-number shape fills it — same SoT as
 * the `#` chip. Listing-URL detect stays a caller-side fallback.
 */
export function storedOrInferredSourcePlatform(
  stored: string | null | undefined,
  ...identityFields: Array<string | null | undefined>
): string {
  const existing = String(stored ?? '').trim().toLowerCase();
  if (existing) return existing;
  return platformFromOrderIdentityFields(...identityFields) ?? '';
}

/**
 * Read-only classify slug (orders / pack / ship): format wins over a stale
 * `account_source` / listing-derived key, matching {@link resolveMarketplaceChipIdentity}.
 */
export function displayPlatformSlugFromOrderId(
  orderId: string | null | undefined,
  fallback?: string | null | undefined,
): string {
  return resolveMarketplacePlatformMeta(orderId, fallback).value;
}

/**
 * Platform meta for an order-id chip / brand-identity dot.
 * Format (eBay 2-5-5 / Amazon 3-7-7) wins over listing-link / account_source
 * fallbacks; catalog `accentHex` is kept when the fallback is the same channel.
 */
export function resolveMarketplacePlatformMeta(
  orderId: string | null | undefined,
  fallback?: SourcePlatformMeta | string | null,
): SourcePlatformMeta {
  const inferred = inferMarketplaceFromOrderId(orderId);
  if (inferred) {
    const inferredMeta = sourcePlatformMeta(inferred);
    if (fallback && typeof fallback === 'object' && fallback.value === inferred) {
      return fallback;
    }
    return inferredMeta;
  }
  if (fallback && typeof fallback === 'object') {
    return fallback.value ? fallback : UNKNOWN_PLATFORM;
  }
  return sourcePlatformMetaFromLabel(fallback);
}

export function resolveMarketplaceChipIdentity(
  orderId: string | null | undefined,
  platformLabel?: string | null,
): {
  platformLabel: string | null;
  fromFormat: boolean;
  iconClass?: string;
  iconStyle?: { color: string };
  meta: SourcePlatformMeta;
} {
  const fromFormat = inferMarketplaceFromOrderId(orderId) != null;
  const meta = resolveMarketplacePlatformMeta(orderId, platformLabel);
  const known = Boolean(meta.value);
  const tone = known ? platformMetaIconTone(meta) : {};
  return {
    platformLabel: known ? meta.label : null,
    fromFormat,
    iconClass: tone.className,
    iconStyle: tone.style,
    meta,
  };
}
