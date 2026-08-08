/**
 * Line-scoped condition write that stamps the Condition procedure gate.
 *
 * Only `PATCH /api/receiving/lines/[id]/condition` writes
 * `receiving_line_testing.condition_graded_at`. Generic receiving-line PATCH
 * updates `condition_grade` alone and leaves the step stuck — dock pills and
 * ledger siblings must share this helper so they cannot drift.
 */

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';

export function patchReceivingLineCondition(lineId: number, next: string): void {
  const cleared = !String(next || '').trim();
  dispatchLineUpdated({
    id: lineId,
    condition_grade: cleared ? '' : next,
    // Optimistic stamp so `derive-capture-step-states` advances before the
    // network round-trip; reopen clears the act without inventing a null grade.
    condition_graded_at: cleared ? null : new Date().toISOString(),
  });
  void fetch(`/api/receiving/lines/${lineId}/condition`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cleared ? { reopen: true } : { condition_grade: next }),
  }).catch(() => {});
}
