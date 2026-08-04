/**
 * Grid column justification SoT — **one decision per column, read by both the
 * header and the cell.**
 *
 * ## Hard rule (also in `AGENTS.md` + `source-of-truth.md`)
 *
 * - **Magnitudes end-align** — `number` (qty, price), `id` (SKU, serial, ticket),
 *   and `date` (civil days, stamps, durations): things you compare down a column
 *   by their ones place / soonest edge.
 * - **Labels start-align** — `text` · `longtext` · `tag` (condition, status) ·
 *   `external` (platform) · `location` (bin codes) · `tracking` (carrier #). A label is read
 *   from its left edge; only a magnitude is scanned from its right.
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
 * Data type → justification. The full ruling, so no surface has to guess.
 *
 * **The question a type answers is "is this a MAGNITUDE or a LABEL".** A
 * magnitude is compared down the column — the eye reads the ones place, so the
 * right edge has to stack. A label is *read*, one row at a time, and reading
 * starts at the left edge. Nothing else decides this; digit-ness in particular
 * does not.
 *
 * | Type | Align | Why |
 * |---|---|---|
 * | `number` | `end` | Magnitude. Qty / price compare down the column by their ones place, and `role-data` binds `tabular-nums`, so the digits form a true grid. |
 * | `id` | `end` | A SKU / serial / ticket is a fixed-width reference attribute *of* the row — it sits in the same numeric fact cluster as qty, and a column of last-8s scans as one right edge. (`order` overrides — see below.) |
 * | `date` | `end` | Magnitude (ruled 2026-08-03). A civil day, stamp, or duration — `Aug 3` / `12d` — is compared down the column (“which line is sooner / overdue?”), so the right edge stacks with qty. |
 * | `location` | `start` | **Label** (ruled 2026-08-02). A bin / staging code is an identifier you read and retype. |
 * | `tracking` | `start` | **Label** — carrier tracking last-8; same start rule as `location`, distinct glyph (MapPin). |
 * | `text` · `longtext` | `start` | Prose reads from the left edge; a ragged left edge destroys the scan line. |
 * | `tag` · `external` | `start` | A chip or brand mark is a categorical label, not a quantity. |
 *
 * **`location` / `tracking` stayed start on 2026-08-02; `date` flipped back to end on
 * 2026-08-03.** Tracking last-8s in an 8rem track left ~3rem of empty track on
 * the LEFT of every row when end-aligned, so the eye could not run a straight
 * line down the identifiers — that bench finding still holds for both. Civil
 * days and durations are the opposite: operators compare them down the column
 * the same way they compare qty, so `date` rejoins the magnitude cluster.
 * (An earlier 2026-08-02 pass had moved `date` to start with `location`; the
 * operator re-adjudicated dates alone. 2026-08-04 split `tracking` off
 * `location` for header glyph only — MapPin vs folded map — same align.)
 *
 * Deliberately NOT a `center` case. Centering breaks the vertical alignment
 * axis every other column establishes, and the house one-row anatomy has no
 * centered content.
 *
 * A column whose *type* disagrees with its *content* sets `align` on the model —
 * once, where the column is declared. One live case:
 *
 * - **`order` → `start`** (ruled + shipped 2026-08-02). An identifier that is
 *   the row's own **transaction identity** — a PO number, a sales-order number —
 *   is a name you read, and on an order-anchored surface it is the first thing
 *   scanned. A catalog SKU / serial / ticket is the opposite, an attribute *of*
 *   a row whose identity is its title, so it stays `end`. Same `type: 'id'`,
 *   different role — which is exactly why this is an `align` override on those
 *   column models and **never** a change to `ALIGN_BY_TYPE.id`, which would
 *   drag SKU and serial left with it.
 */
const ALIGN_BY_TYPE: Record<ColumnType, GridColumnAlign> = {
  number: 'end',
  id: 'end',
  date: 'end',
  location: 'start',
  tracking: 'start',
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
