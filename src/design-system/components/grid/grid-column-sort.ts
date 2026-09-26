import type { GridSortDir } from './grid-sort-dir';

/** Value-level sort semantics, keyed by the column's `type`. */

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

/** Compare one column's extracted values. */
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
