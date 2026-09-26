/**
 * What the SELECT gutter says about a row when nobody is pointing at it.
 * Operator 2026-09-15: "if it is out of stock and urgent, it should flash
 * "ordinary" would rebuild exactly what the operator deleted on 2026-09-04: a
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

/** Every resting mark this row earns, hottest first. */
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
