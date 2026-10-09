/** Pure string helpers for the id-chip family (`@/components/ui/CopyChip`). */
import { isEmptyDisplayValue } from '@/utils/empty-display-value';

/** Trailing preview length for all typed id chips (serial, tracking, order, …). */
export const CHIP_DISPLAY_LEN = 8 as const;

/**
 * Legacy 8-char width-matching empty face — **non-grid only**. Prefer
 * {@link QUIET_CHIP_EMPTY} / `GridCellDash` on LedgerGrid tracks (2B).
 */
export const EMPTY_CHIP_DISPLAY = '--------';

/** House empty-chip face on LedgerGrid / queue sheets — quiet em dash (2B). */
export const QUIET_CHIP_EMPTY = '—' as const;

export function normalizeCopyText(value: string | null | undefined): string {
  if (isEmptyDisplayValue(value)) return '';
  return String(value || '').trim();
}

/**
 * Identifier delimiters. An id that carries one of these is a COMPOSED id —
 * marketplace prefix, account segment, then the part that actually varies.
 */
const IDENTIFIER_DELIMITERS = /[-_/.:]+/;

/**
 * Shortest trailing segment worth showing on its own. Below this a segment is
 * a check digit or a line suffix, not an identity, so the last-8 window reads
 * better than `-2`.
 */
const MIN_SEGMENT_LEN = 4;

/** Leading punctuation left behind by a blind window cut (`-0292212`). */
const LEADING_NON_ALNUM = /^[^0-9a-z]+/i;

/** The abbreviation SoT for every typed id chip. */
export function abbreviateIdentifier(value: string | null | undefined): string {
  const raw = normalizeCopyText(value);
  if (!raw) return '';
  const segments = raw.split(IDENTIFIER_DELIMITERS).filter(Boolean);
  const last = segments.length > 0 ? segments[segments.length - 1]! : '';
  let candidate =
    segments.length > 1 && last.length >= MIN_SEGMENT_LEN
      ? last
      : raw.length > CHIP_DISPLAY_LEN
        ? raw.slice(-CHIP_DISPLAY_LEN)
        : raw;
  // Hard cap (operator 2026-09-14): the FACE never exceeds CHIP_DISPLAY_LEN —
  // a delimiter's final segment can itself be longer than eight (a prefixed
  // `po:10084000397923` used to render all fourteen digits).
  if (candidate.length > CHIP_DISPLAY_LEN) candidate = candidate.slice(-CHIP_DISPLAY_LEN);
  // An id of pure punctuation has nothing to strip down to — keep the cut.
  return candidate.replace(LEADING_NON_ALNUM, '') || candidate;
}
/** Abbreviated identifier — display SoT for every typed id chip. */
export function getLast8(value: string | null | undefined): string {
  return abbreviateIdentifier(value) || '---';
}

/**
 * The visible order-number face used by dense operational surfaces.
 * The stored/copied value remains complete; only the face is abbreviated.
 */
export function formatOrderIdDisplay(value: string | null | undefined): string {
  const raw = normalizeCopyText(value);
  if (!raw) return '';
  if (raw.length <= CHIP_DISPLAY_LEN) return raw.replace(LEADING_NON_ALNUM, '') || raw;
  return abbreviateIdentifier(raw);
}

/**
 * serial_number may be a CSV string aggregated via STRING_AGG (e.g. "SN1, SN2").
 * Parses it, takes the last individual serial, then abbreviates that one.
 */
export function getLast8Serial(value: string | null | undefined): string {
  const raw = normalizeCopyText(value);
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1] : '';
  return abbreviateIdentifier(last) || '---';
}

/**
 * A hand-typed serial tail → the one full serial it names (the phone pick's "Last 8 of the serial
 * number", owner 2026-10-08). `typed` up to {@link CHIP_DISPLAY_LEN} chars matches a candidate that
 * ends with it or whose last-8 face is it; only a unique match expands — an ambiguous or unknown tail
 * comes back unchanged for the server to judge.
 */
export function expandSerialTail(typed: string, candidates: readonly string[]): string {
  const tail = normalizeCopyText(typed).toUpperCase();
  if (!tail || tail.length > CHIP_DISPLAY_LEN) return typed;
  const serials = candidates.map((c) => normalizeCopyText(c)).filter(Boolean);
  if (serials.some((s) => s.toUpperCase() === tail)) return typed;
  const matches = serials.filter((s) => s.toUpperCase().endsWith(tail) || abbreviateIdentifier(s).toUpperCase() === tail);
  return matches.length === 1 ? matches[0]! : typed;
}

/**
 * Pack/tech "tracking" fields sometimes hold a static SKU code (`PROD:qty`, `:tag`) rather than a carrier number.
 * Those must use the SKU chip, not TrackingChip.
 */
export function isSkuFormattedScanRef(value: string | null | undefined): boolean {
  const raw = normalizeCopyText(value);
  return raw.includes(':');
}

/** True when a chip label is one of the "no value" spellings. */
export function isEmptyChipDisplay(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  return (
    isEmptyDisplayValue(value) ||
    trimmed === '---' ||
    trimmed === EMPTY_CHIP_DISPLAY ||
    trimmed === QUIET_CHIP_EMPTY ||
    trimmed === '----' // legacy 4-dash empty face
  );
}

/**
 * The shared empty-state fallback for id-chip labels: collapses every "no
 * value" spelling to the quiet em dash {@link QUIET_CHIP_EMPTY} (2B); otherwise
 * returns the label unchanged.
 */
export function resolveChipDisplay(display: string | null | undefined): string {
  return isEmptyChipDisplay(display) ? QUIET_CHIP_EMPTY : String(display);
}

/** The single source of truth for a serial chip's label. */
export function resolveSerialDisplay(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (isEmptyDisplayValue(raw) || raw === '---' || raw.toUpperCase() === 'SERIAL') {
    return QUIET_CHIP_EMPTY;
  }
  return getLast8Serial(raw);
}

/** Shortest unique trailing previews for a set of serials. */
export function disambiguateSerialDisplays(serials: readonly string[]): string[] {
  const cleaned = serials.map((s) => String(s || '').trim());
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return [resolveSerialDisplay(cleaned[0])];

  const abbreviated = cleaned.map((s) => resolveSerialDisplay(s));
  if (new Set(abbreviated).size === abbreviated.length) return abbreviated;
  const maxLen = Math.max(0, ...cleaned.map((s) => s.length));
  let len = CHIP_DISPLAY_LEN;
  while (len <= maxLen) {
    const suffixes = cleaned.map((s) => {
      if (!s) return resolveSerialDisplay(s);
      return s.length > len ? s.slice(-len) : s;
    });
    if (new Set(suffixes).size === suffixes.length) return suffixes;
    len += 1;
  }
  return cleaned.map((s) =>
    resolveSerialDisplay(s) === QUIET_CHIP_EMPTY ? QUIET_CHIP_EMPTY : s,
  );
}
