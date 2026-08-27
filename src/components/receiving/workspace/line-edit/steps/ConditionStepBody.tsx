'use client';

/**
 * `condition` — the grade, as an explicit ACT.
 *
 * The step is gated on `condition_graded_at`, never on the grade itself:
 * `condition_grade` is NOT NULL with a default, so a grade exists on a carton
 * nobody has touched and "graded" would be indistinguishable from "never looked
 * at".
 *
 * ## The card READS the grade; the chips are in the dock
 *
 * Ruled 2026-08-02: a step card carries no action button. `ConditionPills` — the
 * control that sets the grade — renders in the bottom dock
 * ({@link ConditionDockControl}), where the operator's hand already is. The card
 * states what the line currently carries and whether anyone has actually said
 * so, which is the fact the gate turns on and the one thing the chips alone
 * cannot show.
 */

import { conditionLabel } from '@/lib/conditions';
import { useConditionGradeStyle } from '@/hooks/useConditionGradeStyle';
import { cn } from '@/utils/_cn';
import type { UnboxStepBodyContext } from './types';

export function ConditionStepBody({ row }: UnboxStepBodyContext) {
  const grade = row.condition_grade ?? '';
  const graded = !!row.condition_graded_at;
  const { textClass } = useConditionGradeStyle(grade);

  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={cn('truncate text-role-caption font-semibold', textClass)}>
        {conditionLabel(grade, 'full')}
      </span>
      <span className="truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
        {/* The stored default pre-selects a chip, so the difference between
            "graded" and "never touched" is the ACT, not the value. Saying only
            the grade here would report every untouched carton as answered. */}
        {graded ? 'Graded' : 'Not graded yet — chips are in the dock below'}
      </span>
    </div>
  );
}
