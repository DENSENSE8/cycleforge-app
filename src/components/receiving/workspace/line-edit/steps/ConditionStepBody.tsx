'use client';

/**
 * `condition` — the grade, as an explicit ACT.
 *
 * The step is gated on `condition_graded_at`, never on the grade itself:
 * `condition_grade` is NOT NULL with a default, so a grade exists on a carton
 * nobody has touched and "graded" would be indistinguishable from "never looked
 * at". The stored default still pre-selects the chip, so satisfying the step is
 * one tap — a confirmation, not a decision from scratch. That pre-selection is
 * what keeps gating the step from stalling the floor.
 *
 * Rendered un-collapsed: the step card has the width the meta row did not, and a
 * collapsed picker would cost a click to open before the one that answers it.
 */

import { ConditionPills } from '../../ConditionPills';
import type { UnboxStepBodyContext } from './types';

export function ConditionStepBody({
  condition,
}: UnboxStepBodyContext & {
  condition?: { value: string; onChange: (next: string) => void };
}) {
  if (!condition) {
    return <p className="text-role-caption text-text-soft">No grade to set on this line.</p>;
  }
  return (
    <ConditionPills
      value={condition.value}
      onChange={condition.onChange}
      collapsible={false}
    />
  );
}
