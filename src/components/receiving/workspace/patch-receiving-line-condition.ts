/**
 * Line-scoped condition write that stamps the Condition procedure gate.
 *
 * Only `PATCH /api/receiving/lines/[id]/condition` writes
 * `receiving_line_testing.condition_graded_at`. Generic receiving-line PATCH
 * updates `condition_grade` alone and leaves the step stuck — dock pills and
 * ledger siblings must share this helper so they cannot drift.
 *
 * The write goes through {@link persistGateWrite}: the optimistic stamp is
 * reverted and the operator told why if it does not land, so the Condition step
 * can never sit settled on a value the database rejected.
 */

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { persistGateWrite } from './receiving-gate-write';

/**
 * The prior durable values, needed to put the step back if the write fails.
 *
 * **Required, with no default, on purpose.** A defaulted snapshot is a silent
 * opt-out that every call site nobody visited takes automatically — the exact
 * trap `.claude/rules/backend-patterns.md` names under *"a safety
 * classification is a REQUIRED parameter"*. Making it required turns a missed
 * call site into a compile error instead of a silent regression.
 */
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
