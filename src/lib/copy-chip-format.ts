/**
 * Pure string helpers for the id-chip family (`@/components/ui/CopyChip`).
 *
 * Split out of the `'use client'` component module (same pattern as
 * `inventory/unit-id-format.ts`) so server code and tests can use them
 * without pulling in React/client-only imports. `CopyChip.tsx` re-exports
 * these, so existing importers keep working.
 *
 * Display SoT: {@link abbreviateIdentifier} — the last delimiter-bounded
 * segment, or the trailing {@link CHIP_DISPLAY_LEN} characters when the id
 * carries no delimiter, with leading punctuation stripped and NO padding ever.
 * The face is CAPPED at {@link CHIP_DISPLAY_LEN} no matter what (operator
 * 2026-09-14: "must always display the last 8 of the digits no matter what
 * for the copy chip component for the order number, no matter what
 * platform"): a long final segment (e.g. `po:10084000397923`) is cut to its
 * trailing 8, never shown whole. Empty faces on LedgerGrid / queue sheets
 * use the quiet em dash {@link QUIET_CHIP_EMPTY} (2B) — never loud
 * `--------`. Non-grid layouts that still need an 8-char width-matching
 * placeholder may pass {@link EMPTY_CHIP_DISPLAY} explicitly.
 */
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

/**
 * The abbreviation SoT for every typed id chip.
 *
 * Cut on a DELIMITER, never at a blind offset. `raw.slice(-8)` turns
 * `113-1397006-0292212` into `-0292212`: a leading dash reads as a negative
 * number or a system error to someone scanning a column at speed, and a
 * separator carries different visual weight than a digit, so the column edge
 * goes jagged. Prefer the last delimiter-bounded segment; fall back to the
 * last {@link CHIP_DISPLAY_LEN} characters ONLY when the id has no delimiter
 * (or when the trailing segment is too short to identify anything); then strip
 * any leading non-alphanumerics off the result.
 *
 * NEVER pads. `5034` stays `5034`, not `00005034` — staff read these aloud and
 * key them into an RF scanner, and a padded id is a WRONG id. Uniformity comes
 * from right-alignment plus `font-mono tabular-nums` (the right edge is the
 * scanning line), never from falsifying the value.
 *
 * A leading `#` on an order chip is the HashIcon GLYPH — an identifier-class
 * marker painted beside this string, not part of it. This never sees it.
 *
 * Returns `''` for an empty / sentinel input; chip-facing callers map that to
 * their own empty face.
 */
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

/**
 * The single source of truth for a serial chip's label. Derives the last-8
 * preview from the raw serial (or CSV of serials), and collapses every "no
 * serial" spelling callers used to pass — `''`/`null`, the literal sentinel
 * `'SERIAL'`, or `'---'` — to {@link QUIET_CHIP_EMPTY}.
 */
export function resolveSerialDisplay(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (isEmptyDisplayValue(raw) || raw === '---' || raw.toUpperCase() === 'SERIAL') {
    return QUIET_CHIP_EMPTY;
  }
  return getLast8Serial(raw);
}

/**
 * Shortest unique trailing previews for a set of serials.
 *
 * The floor is the house abbreviation ({@link abbreviateIdentifier}), so a
 * batch of one and a batch of many cut the same serial the same way. Sibling
 * units on one carton often collapse to the same preview; only then does this
 * grow a raw trailing window until every label is distinct, because the
 * growth axis has to be LENGTH and a delimiter cut is not monotonic in length.
 * Empty / sentinel inputs collapse via {@link resolveSerialDisplay}.
 */
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
