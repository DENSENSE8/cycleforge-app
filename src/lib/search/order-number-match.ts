/**
 * Marketplace order # and unit serial matching for Find.
 *
 * Identifier queries equal the stored value (dash / separator insensitive).
 * They must not substring-match a longer id, and they must not treat a
 * numeric query as `orders.id` (that is Internal ID).
 *
 * Last-8 is exact: the paste is the trailing 8 alphanumerics, the trailing
 * 8 digits, or the trailing 8 raw characters (chip face, dashes included).
 */

export { looksLikeMarketplaceOrderNumber } from './looks-like-marketplace-order-number';

export function compactIdentifier(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** @deprecated use {@link compactIdentifier} */
export function compactOrderNumber(raw: string): string {
  return compactIdentifier(raw);
}

export function identifierLast8Compact(raw: string): string {
  const compact = compactIdentifier(raw);
  return compact.length >= 8 ? compact.slice(-8) : '';
}

export function identifierLast8Digits(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : '';
}

/** Trailing 8 raw characters — same face as id chips — then compacted. */
export function identifierChipLast8Compact(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return compactIdentifier(s.length > 8 ? s.slice(-8) : s);
}

export function orderNumberLast8Digits(raw: string): string {
  return identifierLast8Digits(raw);
}

/**
 * True when `query` is this order # or serial — full equality or exact last-8,
 * dashed and undashed treated the same.
 */
export function identifierEqualsQuery(
  stored: string | null | undefined,
  query: string,
): boolean {
  const q = compactIdentifier(query);
  const id = compactIdentifier(stored ?? '');
  if (!q || !id) return false;
  if (id === q) return true;

  const trimmed = String(query ?? '').trim();
  if (q.length === 8 && id.length >= 8 && id.slice(-8) === q) return true;

  const qDigits = String(query ?? '').replace(/\D/g, '');
  if (qDigits.length === 8) {
    const idDigits = String(stored ?? '').replace(/\D/g, '');
    if (idDigits.length >= 8 && idDigits.slice(-8) === qDigits) return true;
  }

  if (trimmed.length === 8) {
    const chip = identifierChipLast8Compact(stored ?? '');
    if (chip && chip === q) return true;
  }

  return false;
}

export function orderNumberEqualsQuery(
  orderId: string | null | undefined,
  query: string,
): boolean {
  return identifierEqualsQuery(orderId, query);
}

export function serialNumberEqualsQuery(
  serial: string | null | undefined,
  query: string,
): boolean {
  return identifierEqualsQuery(serial, query);
}

/**
 * SQL predicate: `column` equals `:queryParam` with the same last-8 / dash
 * rules as {@link identifierEqualsQuery}. `column` and `queryParam` are
 * trusted identifiers / `$n` placeholders — never operator text.
 */
export function sqlIdentifierEqualsQuery(column: string, queryParam: string): string {
  const compactCol = `regexp_replace(LOWER(COALESCE(${column}, '')), '[^a-z0-9]', '', 'g')`;
  const compactQ = `regexp_replace(LOWER(${queryParam}), '[^a-z0-9]', '', 'g')`;
  const digitsCol = `regexp_replace(COALESCE(${column}, ''), '[^0-9]', '', 'g')`;
  const digitsQ = `regexp_replace(${queryParam}, '[^0-9]', '', 'g')`;
  const chipCol = `regexp_replace(LOWER(RIGHT(COALESCE(${column}, ''), 8)), '[^a-z0-9]', '', 'g')`;
  return `(
            LOWER(BTRIM(${column})) = LOWER(BTRIM(${queryParam}))
         OR ${compactCol} = ${compactQ}
         OR (length(${compactQ}) = 8 AND RIGHT(${compactCol}, 8) = ${compactQ})
         OR (length(${digitsQ}) = 8 AND RIGHT(${digitsCol}, 8) = ${digitsQ})
         OR (length(BTRIM(${queryParam})) = 8 AND ${chipCol} = ${compactQ})
  )`;
}
