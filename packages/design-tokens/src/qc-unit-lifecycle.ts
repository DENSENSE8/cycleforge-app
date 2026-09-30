import type { OperationalStateSpec } from './state';

/**
 * A serial unit through quality control — Received → Graded → Testing →
 * Verdict → Labeled → Put away | Ticket — one meaning, code, word and colour
 * per state on the desk record and the phone (owner 2026-09-29). The Verdict
 * step wears its outcome: Passed carries on to the label and the shelf;
 * Failed forks to the vendor Ticket. A sibling of `INBOUND_LIFECYCLE`, never
 * an alias of it: a unit's QC state must not widen the carton's ladder.
 */
export const QC_UNIT_LIFECYCLE = {
  // On the line, counted in — the first-action blue, like inbound "Unboxed".
  received: { tone: 'info', code: 'RCV', label: 'Received', icon: 'package-open' },
  // Condition graded — inspection, the QC ink.
  graded: { tone: 'warning', code: 'GRD', label: 'Graded', icon: 'star' },
  testing: { tone: 'warning', code: 'TST', label: 'Testing', icon: 'rotate-ccw' },
  passed: { tone: 'success', code: 'PAS', label: 'Passed', icon: 'circle-check' },
  failed: { tone: 'danger', code: 'FAL', label: 'Failed', icon: 'circle-x', hatched: true },
  // The QC sticker is on the unit.
  labeled: { tone: 'success', code: 'LBL', label: 'Labeled', icon: 'tag' },
  // On a shelf and sellable — the pass path's terminal.
  putAway: { tone: 'success', code: 'PUT', label: 'Put away', icon: 'warehouse' },
  // The fail path's terminal: the vendor claim is filed.
  ticket: { tone: 'danger', code: 'TKT', label: 'Ticket', icon: 'ticket', hatched: true },
  // Beyond the bench (on an order, shipped, in repair) — QC has nothing to do.
  past: { tone: 'neutral', code: 'OUT', label: 'Past QC', icon: 'package' },
} as const satisfies Record<string, OperationalStateSpec>;

export type QcUnitLifecycleState = keyof typeof QC_UNIT_LIFECYCLE;
