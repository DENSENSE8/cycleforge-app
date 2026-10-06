/** Which of the SKUs at an open location a scanned item barcode identifies — the adjust strip's "scan the item" step. Client-safe. */

import { isMarketplaceOrderNumber, routeScan } from '@/lib/barcode-routing';
import { hasValidGs1CheckDigit } from '@/lib/interop/gs1-keys';

/** How the server should look a scanned item up (`GET /api/sku-catalog/scanned-item`). */
export type ScannedItemKeyKind =
  /** Amazon FBA unit label → `fba_fnskus`. */
  | 'fnsku'
  /** House unit label handle (`/m/u/{key}`) → `serial_units` by id, serial or unit_uid. */
  | 'unit'
  /** Anything else product-shaped → catalog UPC/EAN/GTIN/on-hold barcode, or a unit's serial. */
  | 'barcode';

const SCANNED_ITEM_KEY_KINDS: Record<ScannedItemKeyKind, true> = {
  fnsku: true,
  unit: true,
  barcode: true,
};

export function isScannedItemKeyKind(value: string): value is ScannedItemKeyKind {
  return Object.hasOwn(SCANNED_ITEM_KEY_KINDS, value);
}

export interface ScannedItemKey {
  kind: ScannedItemKeyKind;
  value: string;
}

/** Shape of the route's 200 body this module reads. */
interface ScannedItemResponse {
  skus?: unknown;
}

/** UPC-A / EAN-8 / EAN-13 / GTIN-14 with a self-consistent check digit. */
const RETAIL_BARCODE_RE = /^(?:\d{8}|\d{12,14})$/;

const GS1_PRODUCT_REDIRECT_RE = /^\/01\/(\d{8,14})$/;
const GS1_UNIT_REDIRECT_RE = /^\/01\/\d+\/21\/(.+)$/;
const UNIT_LABEL_REDIRECT_RE = /^\/m\/u\/(.+)$/;

/**
 * The server key for a scanned item, or null when the scan cannot name a
 * product (a location label, carrier tracking, order number, carton, LPN…).
 * Those return null without a request: on the adjust screen a location label
 * means "go there", and the caller handles it before asking.
 */
export function scannedItemKey(raw: string): ScannedItemKey | null {
  const value = raw.trim();
  if (!value || isMarketplaceOrderNumber(value)) return null;

  // Ahead of routeScan: a 12-digit UPC-A shares FedEx's tracking shape and
  // would route as carrier-tracking. A valid GS1 check digit says product.
  if (RETAIL_BARCODE_RE.test(value) && hasValidGs1CheckDigit(value)) {
    return { kind: 'barcode', value };
  }

  const route = routeScan(value);
  if (!route) return null;
  const redirect = route.redirect ?? '';

  switch (route.type) {
    case 'fnsku':
      return { kind: 'fnsku', value: route.value };
    case 'serial-unit': {
      const label = UNIT_LABEL_REDIRECT_RE.exec(redirect);
      if (label) return { kind: 'unit', value: decodeURIComponent(label[1]) };
      const gs1Serial = GS1_UNIT_REDIRECT_RE.exec(redirect);
      return gs1Serial ? { kind: 'barcode', value: decodeURIComponent(gs1Serial[1]) } : null;
    }
    case 'sku':
      return { kind: 'barcode', value: GS1_PRODUCT_REDIRECT_RE.exec(redirect)?.[1] ?? route.value };
    case 'bin':
      // A structured location label carries a redirect; the letter-led legacy
      // fallback does not, and is as likely a serial or alias as a bin.
      return redirect ? null : { kind: 'barcode', value: route.value };
    default:
      return null;
  }
}

function findSku(skus: readonly string[], candidate: string): string | null {
  const exact = skus.find((sku) => sku === candidate);
  if (exact !== undefined) return exact;
  const upper = candidate.toUpperCase();
  return skus.find((sku) => sku.toUpperCase() === upper) ?? null;
}

/**
 * Which of `skus` (the rows at the open location) the scanned item barcode
 * identifies, or null. A SKU read matches locally with no request; any other
 * product barcode costs one GET. Network failure → null ("not at this location").
 */
export async function resolveScannedItemSku(
  raw: string,
  skus: readonly string[],
): Promise<string | null> {
  const value = raw.trim();
  if (!value || skus.length === 0) return null;

  const local = findSku(skus, value);
  if (local !== null) return local;

  const key = scannedItemKey(value);
  if (!key) return null;

  try {
    const params = new URLSearchParams({ kind: key.kind, value: key.value });
    const res = await fetch(`/api/sku-catalog/scanned-item?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as ScannedItemResponse;
    if (!Array.isArray(body.skus)) return null;
    for (const sku of body.skus) {
      if (typeof sku !== 'string') continue;
      const hit = findSku(skus, sku);
      if (hit !== null) return hit;
    }
    return null;
  } catch {
    return null;
  }
}
