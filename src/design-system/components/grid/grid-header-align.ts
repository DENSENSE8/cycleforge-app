/**
 * Grid column justification SoT — **one decision per column, read by both the
 * header and the cell.**
 *
 * Alignment used to be decided twice per column, in two files, in two
 * vocabularies: a `column.key === 'qty' ? 'end' : 'start'` ternary in each
 * surface's header, and a hand-typed `justify-end` on each surface's cell. That
 * split is what let Catalog and Repair drift into left-aligned headers sitting
 * over right-aligned numbers, and left Pending's `qty` — declared
 * `type: 'number'` in its own column SoT — aligned as prose in both.
 *
 * **The column's data TYPE already knows the answer**, so derive it:
 * {@link resolveGridColumnAlign}. A column that genuinely needs to disagree
 * sets `align` on its model — once, where the column is declared, never per
 * surface.
 *
 * **A header always aligns with the data it names** — including when the track
 * is too narrow for a label and only the type glyph renders. Centering a
 * glyph-only header was tried and reverted: it breaks the column's vertical
 * alignment axis, so the header floats off the values beneath it and the
 * operator loses the line tying a mark to its column — worst on a narrow track,
 * which is exactly when the label drops. A glyph is a label; it belongs over
 * its data like any other.
 *
 * Guard: `grid-column-align.guard.test.ts`.
 */

import type { ColumnType } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type GridColumnAlign = 'start' | 'end';

/** @deprecated Name kept for existing imports; prefer {@link GridColumnAlign}. */
export type GridHeaderAlign = GridColumnAlign;

/**
 * Data type → justification. The full ruling, so no surface has to guess:
 *
 * | Type | Align | Why |
 * |---|---|---|
 * | `number` | `end` | Magnitudes compare down a column by their ones place; right-aligning is what makes a column of figures scannable (and `role-data` already binds `tabular-nums`, so the digits form a true grid). |
 * | `id` | `start` | An identifier is a LABEL that happens to be digits — an order number or a last-4 chip is never summed or compared for magnitude. Right-aligning it implies an arithmetic relationship that does not exist. |
 * | `location` | `start` | A tracking number is an identifier with a destination, same reasoning as `id`. |
 * | `text` · `longtext` | `start` | Prose reads from the left edge; a ragged left edge destroys the scan line. |
 * | `tag` · `external` | `start` | A chip or brand mark is a categorical label, not a quantity. |
 * | `date` | `start` | Civil days render as fixed-width compact labels (`Jul 21`), so the left edge is already the alignment axis; right-aligning them would fight the adjacent text columns for no gain. |
 *
 * Deliberately NOT a `center` case. Centering breaks the vertical alignment
 * axis every other column establishes, and the house one-row anatomy has no
 * centered content.
 */
const ALIGN_BY_TYPE: Record<ColumnType, GridColumnAlign> = {
  number: 'end',
  id: 'start',
  location: 'start',
  text: 'start',
  longtext: 'start',
  tag: 'start',
  external: 'start',
  date: 'start',
};

/**
 * The column's justification — explicit `align` wins, else derived from `type`,
 * else `start` (an untyped column is structural chrome, e.g. the select gutter).
 *
 * **Header and cell must both call this.** Passing a different alignment to one
 * of them is the exact drift this module exists to prevent.
 */
export function resolveGridColumnAlign(
  column: Pick<LedgerGridColumnModel, 'type' | 'align'>,
): GridColumnAlign {
  if (column.align) return column.align;
  return column.type ? ALIGN_BY_TYPE[column.type] : 'start';
}

/** Flex justification class for a header cell or a value cell. */
export function gridColumnAlignClass(align: GridColumnAlign = 'start'): string {
  return align === 'end' ? 'justify-end' : 'justify-start';
}

/**
 * Header justification. Kept as a named export because every `*GridColumnHeader`
 * composes it; it is now a thin alias so header and cell cannot diverge.
 */
export function gridHeaderCellAlignClass(align: GridColumnAlign = 'start'): string {
  return gridColumnAlignClass(align);
}

/** Value-cell justification for a column — the cell half of the same decision. */
export function gridCellAlignClass(
  column: Pick<LedgerGridColumnModel, 'type' | 'align'>,
): string {
  return gridColumnAlignClass(resolveGridColumnAlign(column));
}
