/**
 * A serial unit's QC state (`QC_UNIT_LIFECYCLE`), read from its lifecycle
 * status as `recordTestVerdict` writes it (PASS → TESTED, TEST_AGAIN →
 * IN_TEST, TESTING_FAILED → ON_HOLD). Client-safe: the desk record, the phone
 * record and the verdict panel read the same answer.
 */

import type { QcUnitLifecycleState } from '@cycleforge/design-tokens';

export type QcUnitStage = QcUnitLifecycleState;

const STAGE_BY_STATUS: Readonly<Record<string, QcUnitStage>> = {
  RECEIVED: 'received',
  TRIAGED: 'received',
  // Graded without a pass yet — `GRADED → TESTED` is the PASS edge.
  GRADED: 'graded',
  IN_TEST: 'testing',
  TESTED: 'passed',
  ON_HOLD: 'failed',
  LABELED: 'labeled',
  STAGED: 'putAway',
  STOCKED: 'putAway',
};

/**
 * Unknown / blank status has not been through QC; anything beyond the shelf
 * (on an order, shipped, repair) is past it. A failed unit whose line already
 * carries the vendor ticket has reached the fail path's end.
 */
export function qcUnitStage(status: string | null | undefined, facts: { ticket?: boolean } = {}): QcUnitStage {
  const key = String(status ?? '').trim().toUpperCase();
  if (!key || key === 'UNKNOWN') return 'received';
  const stage = STAGE_BY_STATUS[key] ?? 'past';
  return stage === 'failed' && facts.ticket ? 'ticket' : stage;
}

/** The record's `→ next`: what the tech does with a unit at this stage. */
export const QC_UNIT_NEXT: Readonly<Record<QcUnitStage, string | null>> = {
  received: 'Test',
  graded: 'Test',
  testing: 'Verdict',
  passed: 'QC label',
  failed: 'Ticket',
  labeled: 'Put away',
  putAway: null,
  ticket: null,
  past: null,
};
