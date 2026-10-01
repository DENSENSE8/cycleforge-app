import { locationCode, parseLocationCodeFlat, rackCode } from '@/lib/barcode-routing';
import { EXCEPTION_RECORD_PARAM, exceptionRowKey } from '@/lib/exceptions/types';

/**
 * Addresses of a SKU exception (on-hold placeholder product).
 *
 * The SHARE link is the desk URL.
 */

export const SKU_EXCEPTIONS_PATH = '/inventory/sku-exceptions';

export function skuExceptionHref(sku: string): string {
  const params = new URLSearchParams({ [EXCEPTION_RECORD_PARAM]: exceptionRowKey('pairs', sku) });
  return `${SKU_EXCEPTIONS_PATH}?${params}`;
}

export function skuExceptionShareUrl(sku: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${skuExceptionHref(sku)}`;
}

/**
 * A location barcode in its segmented face (`C0409200` → `C-04-09-2-00`), else
 * as scanned. A `00` position is the rack sentinel, not a slot — the face
 * drops it (`C0409200` → `C-04-09-2`) instead of showing an empty zero.
 */
export function skuExceptionLocationFace(barcode: string): string {
  const segments = parseLocationCodeFlat(barcode);
  if (!segments) return barcode;
  return Number(segments.position) === 0 ? rackCode(segments) : locationCode(segments);
}
