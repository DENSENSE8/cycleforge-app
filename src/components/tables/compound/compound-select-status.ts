/**
 * What the SELECT gutter says about a row when nobody is pointing at it.
 *
 * The leftmost track used to have one job (membership) and one resting face
 * (nothing, since the faded check was retired on 2026-09-04). Operator
 * 2026-09-15 gave the same 16px box a second altitude: at rest it reports the
 * row's STATUS — an urgent order flashes a lightning bolt — and the selection
 * square only arrives when a pointer does. Two facts, one box, no new column:
 * the gutter is the one place an operator's eye already runs down.
 *
 * ## The resting face is a MARK, never a state pill
 *
 * Only facts that already earn a mark on this row resolve here, in HEAT order:
 *
 * 1. **urgent** — the order-level expedite (`edgeMark.kind === 'urgent'`). The
 *    bolt, in warning ink.
 * 2. **attention** — this line cannot ship: a shortage or an exception, from an
 *    `attention` rail or, on a family whose rail is unwired, from `itemStatus`.
 *    The triangle, in danger ink. A family is not allowed to be quieter about a
 *    shortage just because it paints no rail for one.
 * 3. **imported** — a newly imported order, carrying elapsed import time in its
 *    blue rail tooltip. This is freshness, not triage heat, so it follows the
 *    shipping facts.
 *
 * Both flash on the shared edge-mark clock, so a row reads as one pulse rather
 * than as several things blinking at each other.
 *
 * ## A row can be BOTH, and then the box takes turns
 *
 * Operator 2026-09-15: "if it is out of stock and urgent, it should flash
 * between out of stock Alert icon and the is-urgent lightning bolt". So this
 * returns a LIST, heat-ordered, and the face rotates through it on the shared
 * clock (`edgeMarkFlashOpacity` with `index` / `count`) — one glyph visible at
 * a time, in the same 16px box, with no second column and no stacked glyphs.
 * An urgent order that is also short is the most consequential row on the desk
 * and used to report only its expedite.
 *
 * An empty list is the ordinary row and the gutter stays blank. A glyph for
 * "ordinary" would rebuild exactly what the operator deleted on 2026-09-04: a
 * column of forty identical marks answering a question nobody asked. The STATUS
 * column already names the stage of every row, in words.
 *
 * Pure on purpose — the paint (`CompoundSelectStatusFace`) reads this, and this
 * reads nothing but the row view, so the ordering above is testable without a
 * DOM.
 */

import type { CompoundRowView } from './compound-row-model';

/**
 * Which mark the gutter is reporting. Drives the glyph and the ink, not the
 * word. Derived from the rail's own vocabulary so the two cannot drift.
 */
export type CompoundSelectStatusKind =
  | NonNullable<CompoundRowView['edgeMark']>['kind']
  | 'imported';

export interface CompoundSelectStatus {
  kind: CompoundSelectStatusKind;
  /** Operator word — the fact ("Urgent", "Out of stock"). Never the paint. */
  label: string;
  /** Breathe on the shared edge-mark clock. Set by the family's `edgeMark.pulse`. */
  flash: boolean;
}

/**
 * Every resting mark this row earns, hottest first. Empty ⇒ the gutter stays
 * blank.
 *
 * The rail and the product flag are DIFFERENT altitudes (order vs line), so a
 * row can hold one of each — that is the both-case the rotation exists for. Two
 * marks of the same kind are not: an `attention` rail and an `itemStatus` are
 * the same fact said twice (the rail is derived from it), so the rail wins and
 * the list stays one long.
 */
export function compoundSelectStatusMarks(
  view: Pick<CompoundRowView, 'edgeMark' | 'importMark' | 'itemStatus'>,
): readonly CompoundSelectStatus[] {
  const marks: CompoundSelectStatus[] = [];
  const edgeMark = view.edgeMark;
  if (edgeMark) {
    marks.push({ kind: edgeMark.kind, label: edgeMark.label, flash: Boolean(edgeMark.pulse) });
  }
  const itemStatus = view.itemStatus;
  if (itemStatus && !marks.some((mark) => mark.kind === 'attention')) {
    marks.push({ kind: 'attention', label: itemStatus.label, flash: true });
  }
  const importMark = view.importMark;
  if (importMark) {
    marks.push({ kind: 'imported', label: importMark.label, flash: false });
  }
  return marks;
}
