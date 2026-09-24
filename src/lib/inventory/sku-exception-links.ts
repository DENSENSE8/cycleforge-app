import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';

/**
 * Addresses of a SKU exception (on-hold placeholder product).
 *
 * The SHARE link is the desk URL. On a phone the proxy rewrites
 * `/inventory/sku-exceptions` to `/m/on-hold` (query kept), and that page
 * redirects `?sku=` to the phone record — so one link works on both.
 */

export const SKU_EXCEPTIONS_PATH = '/inventory/sku-exceptions';

export function skuExceptionHref(sku: string): string {
  return `${SKU_EXCEPTIONS_PATH}?sku=${encodeURIComponent(sku)}`;
}

export function skuExceptionShareUrl(sku: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${skuExceptionHref(sku)}`;
}

export function mobileSkuExceptionHref(sku: string): string {
  return `/m/on-hold/${encodeURIComponent(sku)}`;
}

/** One screen of the phone record (`/m/on-hold/[sku]/<screen>`). */
export function mobileSkuExceptionScreenHref(
  sku: string,
  screen: 'info' | 'photos' | 'locations' | 'pair',
): string {
  return `${mobileSkuExceptionHref(sku)}/${screen}`;
}

/** A location barcode in its segmented face (`C0409200` → `C-04-09-2-00`), else as scanned. */
export function skuExceptionLocationFace(barcode: string): string {
  const segments = parseLocationCodeFlat(barcode);
  return segments ? locationCode(segments) : barcode;
}
