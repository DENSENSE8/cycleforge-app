/** internal-gtin-format.ts ──────────────────────────────────────────────────────────────────── Pure (client-safe) internal pseudo-GTIN formatter for USAV unit labels. */

/** GS1-internal indicator + prefix. Real GS1 prefixes start at 03+, so
 *  values starting with `02` cannot collide with real public GTINs. */
const INTERNAL_GTIN_PREFIX = '02';

/**
 * GS1 mod-10 check-digit algorithm. The body is the 13-digit prefix
 * (everything before the check digit). Multipliers alternate 3,1 from
 * the rightmost body digit leftward.
 */
function gs1CheckDigit(body13: string): string {
  if (body13.length !== 13 || !/^\d{13}$/.test(body13)) {
    throw new Error(`gs1CheckDigit: body must be exactly 13 digits, got "${body13}"`);
  }
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = Number(body13[12 - i]); // rightmost first
    const multiplier = i % 2 === 0 ? 3 : 1;
    sum += digit * multiplier;
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Deterministic 14-digit GTIN for a given sku_catalog.id. Does not
 * touch the DB.
 */
export function generateInternalGtin(skuCatalogId: number): string {
  if (!Number.isInteger(skuCatalogId) || skuCatalogId < 0 || skuCatalogId > 9_999_999_999_99) {
    throw new Error(`generateInternalGtin: invalid sku_catalog id ${skuCatalogId}`);
  }
  const idPart = String(skuCatalogId).padStart(11, '0');
  const body = INTERNAL_GTIN_PREFIX + idPart;
  return body + gs1CheckDigit(body);
}
