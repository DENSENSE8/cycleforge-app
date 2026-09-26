/** Line-scoped condition write that stamps the Condition procedure gate. */

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { persistGateWrite } from './receiving-gate-write';

/** The prior durable values, needed to put the step back if the write fails. */
type PreviousLineCondition = {
  condition_grade: string | null;
  condition_graded_at: string | null;
};

export function patchReceivingLineCondition(
  lineId: number,
  next: string,
  previous: PreviousLineCondition,
): void {
  const cleared = !String(next || '').trim();
  persistGateWrite({
    fact: 'Condition grade',
    apply: () =>
      dispatchLineUpdated({
        id: lineId,
        condition_grade: cleared ? '' : next,
        // Optimistic stamp so `derive-capture-step-states` advances before the
        // network round-trip; reopen clears the act without inventing a null grade.
        condition_graded_at: cleared ? null : new Date().toISOString(),
      }),
    revert: () =>
      dispatchLineUpdated({
        id: lineId,
        condition_grade: previous.condition_grade ?? '',
        condition_graded_at: previous.condition_graded_at,
      }),
    url: `/api/receiving/lines/${lineId}/condition`,
    init: {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleared ? { reopen: true } : { condition_grade: next }),
    },
  });
}
