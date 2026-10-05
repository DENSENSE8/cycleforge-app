/** Marketplace order # and unit serial matching for Find. */

import { abbreviateIdentifier } from '@/lib/copy-chip-format';
import { trackingDigitsLast8Strict, trackingRawTail8 } from '@/lib/tracking-format';

export { looksLikeMarketplaceOrderNumber } from './looks-like-marketplace-order-number';

function compactIdentifier(raw: string): string {
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
  return compact.length >= 8 ? trackingRawTail8(compact) : '';
}

export function identifierLast8Digits(raw: string): string {
  return trackingDigitsLast8Strict(raw);
}

/** Trailing 8 raw characters — the id chips' face before it became segment-aware — then compacted. */
export function identifierChipLast8Compact(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  return compactIdentifier(trackingRawTail8(s));
}

/**
 * The id chip's face (`abbreviateIdentifier`: the last delimiter segment of a
 * composed id, else the last 8), compacted — what an operator reads off a row
 * and pastes back (`113-6729910-1909809` → `1909809`, `02-14684-13689` → `13689`).
 */
export function identifierFaceCompact(raw: string | null | undefined): string {
  return compactIdentifier(abbreviateIdentifier(raw));
}

export function orderNumberLast8Digits(raw: string): string {
  return identifierLast8Digits(raw);
}

/**
 * True when `query` is this order # or serial — full equality, exact last-8,
 * or the id chip's face — dashed and undashed treated the same.
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
  if (q.length === 8 && id.length >= 8 && trackingRawTail8(id) === q) return true;

  const qDigits = String(query ?? '').replace(/\D/g, '');
  if (qDigits.length === 8 && trackingDigitsLast8Strict(stored) === qDigits) return true;

  if (trimmed.length === 8) {
    const chip = identifierChipLast8Compact(stored ?? '');
    if (chip && chip === q) return true;
  }

  return identifierFaceCompact(stored) === q;
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

/** Id-chip delimiters (`copy-chip-format` `IDENTIFIER_DELIMITERS`) as a bracket expression. */
const DELIMS = `-_/.:`;

/**
 * SQL twin of {@link identifierFaceCompact}: the last delimiter segment when
 * the id has two or more and it is at least 4 long, else the raw tail; at
 * most 8 characters; compacted.
 */
export function sqlIdentifierFaceCompact(column: string): string {
  const raw = `BTRIM(COALESCE(${column}, ''))`;
  const lastSegment = `substring(${raw} from '([^${DELIMS}]+)[${DELIMS}]*$')`;
  const composed = `${raw} ~ '[^${DELIMS}][${DELIMS}]+[^${DELIMS}]'`;
  const face = `CASE WHEN ${composed} AND length(${lastSegment}) >= 4 THEN ${lastSegment} ELSE ${raw} END`;
  return `regexp_replace(LOWER(RIGHT(${face}, 8)), '[^a-z0-9]', '', 'g')`;
}

/**
 * SQL predicate: `column` equals `:queryParam` with the same last-8 / dash /
 * chip-face rules as {@link identifierEqualsQuery}. `column` and `queryParam`
 * are trusted identifiers / `$n` placeholders — never operator text.
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
         OR (${compactQ} <> '' AND ${sqlIdentifierFaceCompact(column)} = ${compactQ})
  )`;
}
