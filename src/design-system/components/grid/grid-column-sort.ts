import type { GridSortDir } from './grid-sort-dir';

/**
 * Value-level sort semantics, keyed by the column's `type`.
 *
 * ## Why this is the engine's job
 *
 * `type` already resolves alignment (`resolveGridColumnAlign`), the header
 * glyph (`ColumnTypeGlyph`) and the body cell shell (`gridDataCellClass`).
 * Sort was the one axis it did not own, so six families hand-wrote comparators
 * and answered the same question differently — and the disagreement was
 * user-visible, not cosmetic:
 *
 *   • Orders sent a missing deadline to `±Infinity` **flipped by direction**,
 *     so blanks sank to the bottom under BOTH asc and desc.
 *   • Receiving sent a missing date to `+Infinity` **unflipped**, so undated
 *     rows floated to the TOP under desc.
 *
 * Sort by date descending on the two grids and the empty rows were at opposite
 * ends. Each file documented its choice as deliberate; neither knew the other
 * existed. That is what a shared axis with no shared owner produces.
 *
 * ## The blank ruling
 *
 * **Blanks sort LAST in both directions, for every type.** The comparison
 * deliberately escapes `sign` — this is the spreadsheet convention (Sheets and
 * Airtable both do it) and the one Receiving already applied to CUSTOM columns
 * while exempting its own `date`. Its own note conceded the top-float was
 * merely "tolerable"; a blank is an absence of data, and an absence should not
 * outrank real values just because the operator reversed the arrow.
 *
 * Families keep the EXTRACTOR — pulling a comparable value off a domain row is
 * domain knowledge. The engine owns the comparison and the blank rule.
 */

/** What a family's extractor hands back for one row + column. */
export type GridSortValue = string | number | null | undefined;

/** Natural ordering for id-shaped tracks: `PO-9` before `PO-10`, case-blind. */
const NATURAL: Intl.CollatorOptions = { numeric: true, sensitivity: 'base' };
/** Plain lexical for prose: case-blind, NOT digit-aware. */
const LEXICAL: Intl.CollatorOptions = { sensitivity: 'base' };

/**
 * Column types compared as NUMBERS. `date` belongs here because a family's
 * extractor resolves it to epoch ms — the engine never parses a date string.
 */
const NUMERIC_TYPES = new Set(['number', 'price', 'date']);

/**
 * Column types compared with DIGIT-AWARE collation — identifiers, locations and
 * codes, where `A-2` must precede `A-10`.
 */
const NATURAL_TYPES = new Set(['id', 'tracking', 'location', 'external']);

function isBlank(value: GridSortValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return value.trim() === '';
}

/**
 * Compare one column's extracted values. Returns the SIGNED primary result —
 * `0` means "tie, fall through to your stable key" (an id, never a second
 * fuzzy field).
 *
 * `dir` is applied here rather than by the caller because the blank rule has to
 * escape it; a caller that multiplied the result by its own sign afterwards
 * would re-invert blanks and undo the ruling.
 */
export function compareGridValues(
  a: GridSortValue,
  b: GridSortValue,
  opts: { type?: string; dir: GridSortDir },
): number {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);
  // Escapes `sign` on purpose — see the blank ruling above.
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0;
    return aBlank ? 1 : -1;
  }

  const sign = opts.dir === 'asc' ? 1 : -1;
  const type = opts.type ?? 'text';

  if (NUMERIC_TYPES.has(type) || (typeof a === 'number' && typeof b === 'number')) {
    return sign * (Number(a) - Number(b));
  }

  const collation = NATURAL_TYPES.has(type) ? NATURAL : LEXICAL;
  return sign * String(a).localeCompare(String(b), undefined, collation);
}
