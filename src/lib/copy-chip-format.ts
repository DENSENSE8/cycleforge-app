/**
 * Pure string helpers for the id-chip family (`@/components/ui/CopyChip`).
 *
 * Split out of the `'use client'` component module (same pattern as
 * `inventory/unit-id-format.ts`) so server code and tests can use them
 * without pulling in React/client-only imports. `CopyChip.tsx` re-exports
 * these, so existing importers keep working.
 *
 * Display SoT: trailing **8** characters (dock match + fewer collisions than
 * last-8). Empty faces use the 8-char `'--------'` placeholder so empty
 * columns line up with filled last-8 chips.
 */
import { isEmptyDisplayValue } from '@/utils/empty-display-value';

/** Trailing preview length for all typed id chips (serial, tracking, order, …). */
export const CHIP_DISPLAY_LEN = 8 as const;

/** Empty-state face — same width as a filled last-8 mono label. */
export const EMPTY_CHIP_DISPLAY = '--------';

export function normalizeCopyText(value: string | null | undefined): string {
  if (isEmptyDisplayValue(value)) return '';
  return String(value || '').trim();
}

/** Last 8 chars — display SoT for every typed id chip. */
export function getLast8(value: string | null | undefined): string {
  const raw = normalizeCopyText(value);
  return raw.length > CHIP_DISPLAY_LEN ? raw.slice(-CHIP_DISPLAY_LEN) : raw || '---';
}

/**
 * serial_number may be a CSV string aggregated via STRING_AGG (e.g. "SN1, SN2").
 * Parses it, takes the last individual serial, then returns its last 8 chars.
 */
export function getLast8Serial(value: string | null | undefined): string {
  const raw = normalizeCopyText(value);
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1] : '';
  return last.length > CHIP_DISPLAY_LEN
    ? last.slice(-CHIP_DISPLAY_LEN)
    : last || '---';
}

/**
 * Pack/tech "tracking" fields sometimes hold a static SKU code (`PROD:qty`, `:tag`) rather than a carrier number.
 * Those must use the SKU chip, not TrackingChip.
 */
export function isSkuFormattedScanRef(value: string | null | undefined): boolean {
  const raw = normalizeCopyText(value);
  return raw.includes(':');
}

/** True when a chip label is one of the "no value" spellings (`''`/null/`'---'`/`'--------'`). */
export function isEmptyChipDisplay(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  return (
    isEmptyDisplayValue(value) ||
    trimmed === '---' ||
    trimmed === EMPTY_CHIP_DISPLAY ||
    trimmed === '----' // legacy 4-dash empty face
  );
}

/**
 * The shared empty-state fallback for id-chip labels: collapses every "no
 * value" spelling to the 8-char {@link EMPTY_CHIP_DISPLAY} placeholder so empty
 * columns line up with filled rows; otherwise returns the label unchanged.
 */
export function resolveChipDisplay(display: string | null | undefined): string {
  return isEmptyChipDisplay(display) ? EMPTY_CHIP_DISPLAY : String(display);
}

/**
 * The single source of truth for a serial chip's label. Derives the last-8
 * preview from the raw serial (or CSV of serials), and collapses every "no
 * serial" spelling callers used to pass — `''`/`null`, the literal sentinel
 * `'SERIAL'`, or `'---'` — to one {@link EMPTY_CHIP_DISPLAY} placeholder that
 * matches the empty state of the other id chips (OrderIdChip/TrackingChip), so
 * an empty serial column reads like an 8-char value and lines up with filled
 * rows instead of showing the wider `SERIAL` word.
 */
export function resolveSerialDisplay(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (isEmptyDisplayValue(raw) || raw === '---' || raw.toUpperCase() === 'SERIAL') {
    return EMPTY_CHIP_DISPLAY;
  }
  return getLast8Serial(raw);
}

/**
 * Shortest unique trailing suffixes for a set of serials (floor = last-8).
 * Sibling units on one carton often share a last-8; grow the preview until
 * each label is distinct so a multi-chip batch row does not look duplicated.
 * Empty / sentinel inputs collapse via {@link resolveSerialDisplay}.
 */
export function disambiguateSerialDisplays(serials: readonly string[]): string[] {
  const cleaned = serials.map((s) => String(s || '').trim());
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) return [resolveSerialDisplay(cleaned[0])];

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
    resolveSerialDisplay(s) === EMPTY_CHIP_DISPLAY ? EMPTY_CHIP_DISPLAY : s,
  );
}
