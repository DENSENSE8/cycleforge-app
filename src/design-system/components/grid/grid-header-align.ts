/**
 * Grid column justification SoT — **one decision per column, read by both the
 * header and the cell.**
 *
 * ## Hard rule (also in `AGENTS.md` + `source-of-truth.md`)
 *
 * - **Digit tracks end-align** — `number` · `id` (order ID, SKU, serial, ticket) ·
 *   `location` (tracking) · `date` (ship-by, age, civil day).
 * - **Word tracks start-align** — `text` · `longtext` · `tag` (condition, status) ·
 *   `external` (platform).
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
 * Guard: `grid-column-display.guard.test.ts` · `grid-header-align.test.ts`.
 */

import type { ColumnType } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

export type GridColumnAlign = 'start' | 'end';


/**
 * Data type → justification. The full ruling, so no surface has to guess:
 *
 * | Type | Align | Why |
 * |---|---|---|
 * | `number` | `end` | Magnitudes compare down a column by their ones place; right-aligning is what makes a column of figures scannable (and `role-data` already binds `tabular-nums`, so the digits form a true grid). |
 * | `id` | `end` | Order / ticket / SKU / serial tracks are fixed-width digit (or digit-led) labels — end-align keeps the ones place stacked the same way as qty and price, so a column of last-8s scans as one vertical edge. |
 * | `location` | `end` | Tracking last-8s are the same class of digit label as `id`; they share the right edge with Order beside them. |
 * | `date` | `end` | Civil days, SLA (`Jul 21 · 42d`), and age tracks are compact numeral runs — end-align stacks the day / duration edge for scan, matching the numeric fact cluster. |
 * | `text` · `longtext` | `start` | Prose reads from the left edge; a ragged left edge destroys the scan line. |
 * | `tag` · `external` | `start` | A chip or brand mark is a categorical label, not a quantity. |
 *
 * Deliberately NOT a `center` case. Centering breaks the vertical alignment
 * axis every other column establishes, and the house one-row anatomy has no
 * centered content.
 *
 * A column whose *type* is numeric-looking but whose *content* is prose (e.g.
 * receiving `stage`, typed `date` only for the clock glyph) sets
 * `align: 'start'` on the model — once, where the column is declared.
 */
const ALIGN_BY_TYPE: Record<ColumnType, GridColumnAlign> = {
  number: 'end',
  id: 'end',
  location: 'end',
  date: 'end',
  text: 'start',
  longtext: 'start',
  tag: 'start',
  external: 'start',
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

/**
 * Flex justification class. Module-private on purpose: exporting THREE names for
 * one decision ("which do I call?") is how the header and cell halves drifted
 * apart in the first place. Callers take one of the two below — a header passes
 * a resolved align, a cell passes the column.
 */
function alignClass(align: GridColumnAlign): string {
  return align === 'end' ? 'justify-end' : 'justify-start';
}

/** Header justification — pass `resolveGridColumnAlign(column)`, never a literal. */
export function gridHeaderCellAlignClass(align: GridColumnAlign = 'start'): string {
  return alignClass(align);
}

/** Value-cell justification for a column — the cell half of the same decision. */
export function gridCellAlignClass(
  column: Pick<LedgerGridColumnModel, 'type' | 'align'>,
): string {
  return alignClass(resolveGridColumnAlign(column));
}
